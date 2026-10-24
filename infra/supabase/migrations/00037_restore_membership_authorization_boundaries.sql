-- Migration: 00037_restore_membership_authorization_boundaries
-- Description: Restore strict workspace membership and role boundaries on items, tags, and receipts,
--              protect lifecycle tables from unauthorized runtime tampering,
--              and implement dedicated security definer procedures for account and workspace deletion.

-- 1. Restore strict membership RLS policies on app.items
DROP POLICY IF EXISTS items_select ON app.items;
CREATE POLICY items_select ON app.items
    FOR SELECT TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'viewer')
    );

DROP POLICY IF EXISTS items_update ON app.items;
CREATE POLICY items_update ON app.items
    FOR UPDATE TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'editor')
    )
    WITH CHECK (
        app.user_has_workspace_role(workspace_id, 'editor')
    );

DROP POLICY IF EXISTS items_delete ON app.items;
CREATE POLICY items_delete ON app.items
    FOR DELETE TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'editor')
    );

-- 2. Restore strict membership RLS policies on app.tags and app.item_tags
DROP POLICY IF EXISTS p_tags_update ON app.tags;
CREATE POLICY p_tags_update ON app.tags
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_tags_delete ON app.tags;
CREATE POLICY p_tags_delete ON app.tags
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_item_tags_update ON app.item_tags;
CREATE POLICY p_item_tags_update ON app.item_tags
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_item_tags_delete ON app.item_tags;
CREATE POLICY p_item_tags_delete ON app.item_tags
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

-- 3. Protect mutation receipts provenance (immutable historical facts)
DROP POLICY IF EXISTS p_mutation_receipts_update ON app.mutation_receipts;
REVOKE UPDATE ON app.mutation_receipts FROM daynori_runtime;

-- 4. Protect lifecycle and audit tables from arbitrary runtime tampering
ALTER TABLE app.account_deletions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_deletions_user ON app.account_deletions;
CREATE POLICY account_deletions_user ON app.account_deletions
    FOR ALL TO daynori_runtime
    USING (user_id = app.current_user_id())
    WITH CHECK (user_id = app.current_user_id());

ALTER TABLE app.revoked_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS revoked_tokens_select ON app.revoked_tokens;
CREATE POLICY revoked_tokens_select ON app.revoked_tokens
    FOR SELECT TO daynori_runtime
    USING (true);

ALTER TABLE app.deletion_suppression_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deletion_suppression_ledger_select ON app.deletion_suppression_ledger;
CREATE POLICY deletion_suppression_ledger_select ON app.deletion_suppression_ledger
    FOR SELECT TO daynori_runtime
    USING (true);

-- 5. Public deletion requests table for Google Play compliance with abuse controls
CREATE TABLE IF NOT EXISTS app.public_deletion_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    email_hash text NOT NULL,
    verification_token_hash text NOT NULL,
    status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'verified', 'completed', 'expired')),
    reason text,
    attempts int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_public_deletion_requests_email_hash ON app.public_deletion_requests(email_hash, created_at);
ALTER TABLE app.public_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_deletion_requests_runtime ON app.public_deletion_requests;
CREATE POLICY public_deletion_requests_runtime ON app.public_deletion_requests
    FOR ALL TO daynori_runtime
    USING (true)
    WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON app.public_deletion_requests TO daynori_runtime;

-- 6. Narrowly scoped Security Definer procedures for lifecycle operations

-- A. Reassign shared workspace content when an author account is deleted
CREATE OR REPLACE FUNCTION app.reassign_shared_workspace_content(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  -- Reassign items in collaborative workspaces owned by others
  UPDATE app.items i
  SET created_by = w.owner_id,
      updated_by = w.owner_id
  FROM app.workspaces w
  WHERE i.workspace_id = w.id
    AND (i.created_by = p_user_id OR i.updated_by = p_user_id)
    AND w.owner_id != p_user_id;

  -- Reassign tags in collaborative workspaces owned by others
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

REVOKE ALL ON FUNCTION app.reassign_shared_workspace_content(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reassign_shared_workspace_content(uuid) TO daynori_runtime;

-- B. Purge owned workspace data transactionally
CREATE OR REPLACE FUNCTION app.purge_owned_workspace(p_workspace_id uuid, p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_actual_owner uuid;
BEGIN
  SELECT owner_id INTO v_actual_owner FROM app.workspaces WHERE id = p_workspace_id;
  IF v_actual_owner IS NULL THEN
    RETURN;
  END IF;
  IF v_actual_owner != p_owner_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Caller % is not owner of workspace %', p_owner_id, p_workspace_id;
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

REVOKE ALL ON FUNCTION app.purge_owned_workspace(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_owned_workspace(uuid, uuid) TO daynori_runtime;

-- C. Record revoked token in security ledger
CREATE OR REPLACE FUNCTION app.record_revoked_token(p_token_hash text, p_user_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.revoked_tokens WHERE token_hash = p_token_hash) THEN
    INSERT INTO app.revoked_tokens (token_hash, user_id, expires_at, revocation_reason)
    VALUES (p_token_hash, p_user_id, now() + interval '30 days', p_reason);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app.record_revoked_token(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_revoked_token(text, uuid, text) TO daynori_runtime;

-- D. Record tombstone in suppression ledger
CREATE UNIQUE INDEX IF NOT EXISTS uq_deletion_suppression_ledger_entity ON app.deletion_suppression_ledger (entity_type, entity_id);

CREATE OR REPLACE FUNCTION app.record_deletion_tombstone(p_entity_type text, p_entity_id uuid, p_hash text, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.deletion_suppression_ledger
    WHERE entity_type = p_entity_type AND entity_id = p_entity_id
  ) THEN
    INSERT INTO app.deletion_suppression_ledger (entity_type, entity_id, content_free_hash, reason, expires_at)
    VALUES (p_entity_type, p_entity_id, p_hash, p_reason, now() + interval '90 days');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app.record_deletion_tombstone(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_deletion_tombstone(text, uuid, text, text) TO daynori_runtime;

-- E. Purge user profile and user-scoped records safely via Security Definer procedure
CREATE OR REPLACE FUNCTION app.purge_user_profile(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  PERFORM app.reassign_shared_workspace_content(p_user_id);
  DELETE FROM app.workspace_exports WHERE user_id = p_user_id;
  DELETE FROM app.workspace_imports WHERE user_id = p_user_id;
  DELETE FROM app.devices WHERE user_id = p_user_id;
  DELETE FROM app.web_push_subscriptions WHERE user_id = p_user_id;
  DELETE FROM app.workspace_memberships WHERE user_id = p_user_id;
  DELETE FROM app.profiles WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION app.purge_user_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_user_profile(uuid) TO daynori_runtime;


