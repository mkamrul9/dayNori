-- Migration: 00038_harden_lifecycle_security_definer_procedures
-- Description: Enforce caller identity and authorized deletion lifecycle state checks in
--              all SECURITY DEFINER lifecycle procedures, preventing unauthorized invocation
--              or privilege escalation by daynori_runtime.

-- 1. Add target_user_id, last_error, updated_at, and allow processing/failed statuses on public_deletion_requests
ALTER TABLE app.public_deletion_requests 
ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES app.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_error text,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE app.public_deletion_requests
DROP CONSTRAINT IF EXISTS public_deletion_requests_status_check;

ALTER TABLE app.public_deletion_requests
ADD CONSTRAINT public_deletion_requests_status_check
CHECK (status IN ('pending_verification', 'verified', 'processing', 'completed', 'expired', 'failed'));

-- 2. Harden purge_owned_workspace: validates that caller is actual workspace owner
--    and an authorized deletion state exists in workspace_deletions, account_deletions, or public_deletion_requests
CREATE OR REPLACE FUNCTION app.purge_owned_workspace(p_workspace_id uuid, p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_actual_owner uuid;
  v_caller uuid := app.current_user_id();
BEGIN
  SELECT owner_id INTO v_actual_owner FROM app.workspaces WHERE id = p_workspace_id;
  IF v_actual_owner IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Workspace % does not exist', p_workspace_id;
  END IF;

  -- Verify caller ownership: caller cannot be another user
  IF v_caller IS NOT NULL AND (v_caller != v_actual_owner OR v_caller != p_owner_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Current user % is not authorized to purge workspace % (owner %)', v_caller, p_workspace_id, v_actual_owner;
  END IF;

  IF v_actual_owner != p_owner_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Supplied owner % does not match workspace % owner %', p_owner_id, p_workspace_id, v_actual_owner;
  END IF;

  -- Verify that an authorized deletion request exists
  IF NOT EXISTS (
    SELECT 1 FROM app.workspace_deletions WHERE workspace_id = p_workspace_id AND status IN ('processing', 'completed')
  ) AND NOT EXISTS (
    SELECT 1 FROM app.account_deletions WHERE user_id = v_actual_owner AND status IN ('processing', 'completed')
  ) AND NOT EXISTS (
    SELECT 1 FROM app.public_deletion_requests WHERE target_user_id = v_actual_owner AND status IN ('processing', 'verified', 'completed')
  ) AND NOT EXISTS (
    SELECT 1 FROM app.deletion_suppression_ledger WHERE entity_type = 'workspace' AND entity_id = p_workspace_id
  ) AND NOT EXISTS (
    SELECT 1 FROM app.deletion_suppression_ledger WHERE entity_type = 'account' AND entity_id = v_actual_owner
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Workspace purge requires an active authorized deletion request';
  END IF;

  DELETE FROM app.file_versions WHERE workspace_id = p_workspace_id;
  DELETE FROM app.file_items WHERE workspace_id = p_workspace_id;
  DELETE FROM app.upload_reservations WHERE workspace_id = p_workspace_id;
  DELETE FROM app.workspace_storage_usage WHERE workspace_id = p_workspace_id;
  DELETE FROM app.workspace_exports WHERE workspace_id = p_workspace_id;
  DELETE FROM app.workspace_imports WHERE workspace_id = p_workspace_id;
  DELETE FROM app.item_links WHERE workspace_id = p_workspace_id;
  DELETE FROM app.item_tags WHERE workspace_id = p_workspace_id;
  DELETE FROM app.tags WHERE workspace_id = p_workspace_id;
  DELETE FROM app.routine_occurrences WHERE workspace_id = p_workspace_id;
  DELETE FROM app.routines WHERE workspace_id = p_workspace_id;
  DELETE FROM app.calendar_events WHERE workspace_id = p_workspace_id;
  DELETE FROM app.journal_entries WHERE workspace_id = p_workspace_id;
  DELETE FROM app.tasks WHERE workspace_id = p_workspace_id;
  DELETE FROM app.notes WHERE workspace_id = p_workspace_id;
  DELETE FROM app.saved_views WHERE workspace_id = p_workspace_id;
  DELETE FROM app.reminder_deliveries WHERE workspace_id = p_workspace_id;
  DELETE FROM app.reminder_instances WHERE workspace_id = p_workspace_id;
  DELETE FROM app.reminder_rules WHERE workspace_id = p_workspace_id;
  DELETE FROM app.mutation_receipts WHERE workspace_id = p_workspace_id;
  DELETE FROM app.outbox_intents WHERE workspace_id = p_workspace_id;
  DELETE FROM app.workspace_sync_state WHERE workspace_id = p_workspace_id;
  DELETE FROM app.changes WHERE workspace_id = p_workspace_id;
  DELETE FROM app.items WHERE workspace_id = p_workspace_id;
  DELETE FROM app.folders WHERE workspace_id = p_workspace_id;
  DELETE FROM app.workspaces WHERE id = p_workspace_id;
  DELETE FROM app.workspace_memberships WHERE workspace_id = p_workspace_id;
END;
$$;

-- 3. Harden purge_user_profile: validates that caller is target user and authorized request exists
CREATE OR REPLACE FUNCTION app.purge_user_profile(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_caller uuid := app.current_user_id();
BEGIN
  -- Caller cannot be another user
  IF v_caller IS NOT NULL AND v_caller != p_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Current user % is not authorized to purge user profile %', v_caller, p_user_id;
  END IF;

  -- Verify that an authorized deletion request exists
  IF NOT EXISTS (
    SELECT 1 FROM app.account_deletions WHERE user_id = p_user_id AND status IN ('processing', 'completed')
  ) AND NOT EXISTS (
    SELECT 1 FROM app.public_deletion_requests WHERE target_user_id = p_user_id AND status IN ('processing', 'verified', 'completed')
  ) AND NOT EXISTS (
    SELECT 1 FROM app.deletion_suppression_ledger WHERE entity_type = 'account' AND entity_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Profile purge requires an active authorized deletion request';
  END IF;

  PERFORM app.reassign_shared_workspace_content(p_user_id);
  DELETE FROM app.workspace_exports WHERE user_id = p_user_id;
  DELETE FROM app.workspace_imports WHERE user_id = p_user_id;
  DELETE FROM app.devices WHERE user_id = p_user_id;
  DELETE FROM app.web_push_subscriptions WHERE user_id = p_user_id;
  DELETE FROM app.workspace_memberships WHERE user_id = p_user_id;
  DELETE FROM app.profiles WHERE id = p_user_id;
END;
$$;

-- 4. Harden reassign_shared_workspace_content: validates caller identity and deletion state
CREATE OR REPLACE FUNCTION app.reassign_shared_workspace_content(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_caller uuid := app.current_user_id();
BEGIN
  IF v_caller IS NOT NULL AND v_caller != p_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Current user % cannot reassign content for user %', v_caller, p_user_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app.account_deletions WHERE user_id = p_user_id AND status IN ('processing', 'completed')
  ) AND NOT EXISTS (
    SELECT 1 FROM app.public_deletion_requests WHERE target_user_id = p_user_id AND status IN ('processing', 'verified', 'completed')
  ) AND NOT EXISTS (
    SELECT 1 FROM app.deletion_suppression_ledger WHERE entity_type = 'account' AND entity_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Reassigning shared content requires an active authorized deletion request';
  END IF;

  UPDATE app.items i
  SET created_by = w.owner_id,
      updated_by = w.owner_id
  FROM app.workspaces w
  WHERE i.workspace_id = w.id
    AND (i.created_by = p_user_id OR i.updated_by = p_user_id)
    AND w.owner_id != p_user_id;

  UPDATE app.tags t
  SET created_by = w.owner_id
  FROM app.workspaces w
  WHERE t.workspace_id = w.id
    AND t.created_by = p_user_id
    AND w.owner_id != p_user_id;

  UPDATE app.item_tags it
  SET created_by = w.owner_id
  FROM app.workspaces w
  WHERE it.workspace_id = w.id
    AND it.created_by = p_user_id
    AND w.owner_id != p_user_id;
END;
$$;

-- 5. Harden record_deletion_tombstone: prevents forging tombstones for other accounts
CREATE OR REPLACE FUNCTION app.record_deletion_tombstone(p_entity_type text, p_entity_id uuid, p_hash text, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_caller uuid := app.current_user_id();
  v_owner uuid;
BEGIN
  IF v_caller IS NOT NULL THEN
    IF p_entity_type = 'account' AND v_caller != p_entity_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Current user % cannot record tombstone for account %', v_caller, p_entity_id;
    ELSIF p_entity_type = 'workspace' THEN
      SELECT owner_id INTO v_owner FROM app.workspaces WHERE id = p_entity_id;
      IF v_owner IS NOT NULL AND v_caller != v_owner THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Current user % cannot record tombstone for workspace % owned by %', v_caller, p_entity_id, v_owner;
      END IF;
    END IF;
  ELSE
    -- Unauthenticated caller must have an active authorized deletion operation
    IF NOT EXISTS (
      SELECT 1 FROM app.account_deletions WHERE user_id = p_entity_id AND status IN ('processing', 'completed')
    ) AND NOT EXISTS (
      SELECT 1 FROM app.public_deletion_requests WHERE (target_user_id = p_entity_id OR status IN ('processing', 'verified', 'completed'))
    ) AND NOT EXISTS (
      SELECT 1 FROM app.workspace_deletions WHERE workspace_id = p_entity_id AND status IN ('processing', 'completed')
    ) THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Recording tombstone requires verified caller or active deletion request';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app.deletion_suppression_ledger
    WHERE entity_type = p_entity_type AND entity_id = p_entity_id
  ) THEN
    INSERT INTO app.deletion_suppression_ledger (entity_type, entity_id, content_free_hash, reason, expires_at)
    VALUES (p_entity_type, p_entity_id, p_hash, p_reason, now() + interval '90 days');
  END IF;
END;
$$;

-- 6. Harden record_revoked_token: prevents revoking tokens for other accounts
CREATE OR REPLACE FUNCTION app.record_revoked_token(p_token_hash text, p_user_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_caller uuid := app.current_user_id();
BEGIN
  IF v_caller IS NOT NULL THEN
    IF v_caller != p_user_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Current user % cannot revoke tokens for user %', v_caller, p_user_id;
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM app.account_deletions WHERE user_id = p_user_id AND status IN ('processing', 'completed')
    ) AND NOT EXISTS (
      SELECT 1 FROM app.public_deletion_requests WHERE target_user_id = p_user_id AND status IN ('processing', 'verified', 'completed')
    ) THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Revoking tokens requires verified caller or active deletion request';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM app.revoked_tokens WHERE token_hash = p_token_hash) THEN
    INSERT INTO app.revoked_tokens (token_hash, user_id, expires_at, revocation_reason)
    VALUES (p_token_hash, p_user_id, now() + interval '30 days', p_reason);
  END IF;
END;
$$;

-- 7. Add index for keyset pagination on items table
CREATE INDEX IF NOT EXISTS idx_items_keyset
  ON app.items (workspace_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

