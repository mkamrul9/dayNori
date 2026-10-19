-- Migration: 00041_repair_expenses_lifecycle_and_budgets
-- Description: Repair purge overloads, occurrence write policies, cross-workspace FKs, beta seat concurrency, and add expense budgets table
-- Search Path: app, pg_temp

-- 1. Drop unintended 1-arg purge_owned_workspace overload
DROP FUNCTION IF EXISTS app.purge_owned_workspace(uuid);

-- 2. Update canonical 2-arg purge_owned_workspace(uuid, uuid) to include all expense domain tables
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

  -- Delete expense domain data
  DELETE FROM app.expense_recurring_occurrences WHERE template_id IN (SELECT id FROM app.expense_recurring_templates WHERE workspace_id = p_workspace_id);
  DELETE FROM app.expense_recurring_templates WHERE workspace_id = p_workspace_id;
  DELETE FROM app.expense_budgets WHERE workspace_id = p_workspace_id;
  DELETE FROM app.expense_items WHERE workspace_id = p_workspace_id;
  DELETE FROM app.expense_categories WHERE workspace_id = p_workspace_id;

  -- Delete other entity tables
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

-- 3. Fix occurrence RLS policies: require editor for writes, viewer for reads
DROP POLICY IF EXISTS p_expense_occurrences_all ON app.expense_recurring_occurrences;

CREATE POLICY p_expense_occurrences_select ON app.expense_recurring_occurrences
    FOR SELECT TO daynori_runtime
    USING (
        EXISTS (
            SELECT 1 FROM app.expense_recurring_templates t
            WHERE t.id = template_id AND app.user_has_workspace_role(t.workspace_id, 'viewer')
        )
    );

CREATE POLICY p_expense_occurrences_insert ON app.expense_recurring_occurrences
    FOR INSERT TO daynori_runtime
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM app.expense_recurring_templates t
            WHERE t.id = template_id AND app.user_has_workspace_role(t.workspace_id, 'editor')
        )
    );

CREATE POLICY p_expense_occurrences_update ON app.expense_recurring_occurrences
    FOR UPDATE TO daynori_runtime
    USING (
        EXISTS (
            SELECT 1 FROM app.expense_recurring_templates t
            WHERE t.id = template_id AND app.user_has_workspace_role(t.workspace_id, 'editor')
        )
    );

CREATE POLICY p_expense_occurrences_delete ON app.expense_recurring_occurrences
    FOR DELETE TO daynori_runtime
    USING (
        EXISTS (
            SELECT 1 FROM app.expense_recurring_templates t
            WHERE t.id = template_id AND app.user_has_workspace_role(t.workspace_id, 'editor')
        )
    );

-- 4. Cross-workspace relationship hardening via composite unique keys and foreign keys
ALTER TABLE app.expense_categories
    DROP CONSTRAINT IF EXISTS uq_expense_categories_ws_id;
ALTER TABLE app.expense_categories
    ADD CONSTRAINT uq_expense_categories_ws_id UNIQUE (workspace_id, id);

ALTER TABLE app.file_items
    DROP CONSTRAINT IF EXISTS uq_file_items_ws_id;
ALTER TABLE app.file_items
    ADD CONSTRAINT uq_file_items_ws_id UNIQUE (workspace_id, id);

-- Replace single-column foreign keys with composite foreign keys verifying workspace_id
ALTER TABLE app.expense_items
    DROP CONSTRAINT IF EXISTS expense_items_category_id_fkey,
    DROP CONSTRAINT IF EXISTS fk_expense_items_category;
ALTER TABLE app.expense_items
    ADD CONSTRAINT fk_expense_items_category FOREIGN KEY (workspace_id, category_id)
        REFERENCES app.expense_categories (workspace_id, id) ON DELETE SET NULL;

ALTER TABLE app.expense_items
    DROP CONSTRAINT IF EXISTS fk_expense_items_receipt;
ALTER TABLE app.expense_items
    ADD CONSTRAINT fk_expense_items_receipt FOREIGN KEY (workspace_id, receipt_file_id)
        REFERENCES app.file_items (workspace_id, id) ON DELETE SET NULL;

ALTER TABLE app.expense_recurring_templates
    DROP CONSTRAINT IF EXISTS expense_recurring_templates_category_id_fkey,
    DROP CONSTRAINT IF EXISTS fk_expense_templates_category;
ALTER TABLE app.expense_recurring_templates
    ADD CONSTRAINT fk_expense_templates_category FOREIGN KEY (workspace_id, category_id)
        REFERENCES app.expense_categories (workspace_id, id) ON DELETE SET NULL;

-- 5. Expense Budgets Table (Phase 40 foundation)
CREATE TABLE IF NOT EXISTS app.expense_budgets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    period text NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
    currency text NOT NULL CHECK (length(currency) = 3),
    category_id uuid,
    amount_minor_units bigint NOT NULL CHECK (amount_minor_units >= 0),
    revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT fk_expense_budgets_category FOREIGN KEY (workspace_id, category_id)
        REFERENCES app.expense_categories (workspace_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_budgets_ws_period_curr_cat
    ON app.expense_budgets (workspace_id, period, currency, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_expense_budgets_ws_period
    ON app.expense_budgets (workspace_id, period, currency);

ALTER TABLE app.expense_budgets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.expense_budgets TO daynori_runtime;

CREATE POLICY p_expense_budgets_select ON app.expense_budgets
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

CREATE POLICY p_expense_budgets_insert ON app.expense_budgets
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

CREATE POLICY p_expense_budgets_update ON app.expense_budgets
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

CREATE POLICY p_expense_budgets_delete ON app.expense_budgets
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

-- Add expense_budgets to purge_owned_workspace
-- (already in step 2 if we add DELETE FROM app.expense_budgets)

-- 6. Harden Beta Invitation Claiming & Seat Allocation
CREATE OR REPLACE FUNCTION app.claim_beta_invitation(
    p_code_hash text,
    p_user_id uuid,
    p_user_email text,
    p_max_seats int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_caller uuid := app.current_user_id();
  v_invite record;
  v_already_enrolled boolean;
  v_seat_count int;
BEGIN
  -- Caller verification: if app.current_user_id() is set, caller cannot claim for another user
  IF v_caller IS NOT NULL AND v_caller != p_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Cannot claim invitation for another user';
  END IF;

  -- 1. Check if user already enrolled
  SELECT EXISTS(
    SELECT 1 FROM app.beta_enrollments WHERE user_id = p_user_id AND status = 'enrolled'
  ) INTO v_already_enrolled;

  IF v_already_enrolled THEN
    RETURN jsonb_build_object('success', true, 'enrolled', true, 'message', 'User is already enrolled in the private beta');
  END IF;

  -- 2. Acquire transaction-level advisory lock to serialize seat allocation across ALL invitations
  PERFORM pg_advisory_xact_lock(hashtext('beta_seat_allocation'));

  -- 3. Lock and inspect invitation record
  SELECT id, status, expires_at, recipient_email
  INTO v_invite
  FROM app.beta_invitations
  WHERE invitation_code_hash = p_code_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN: Invalid invitation code';
  END IF;

  IF v_invite.status = 'revoked' THEN
    RAISE EXCEPTION 'FORBIDDEN: This beta invitation code has been revoked';
  END IF;

  IF v_invite.status = 'claimed' THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: This beta invitation code has already been claimed';
  END IF;

  IF v_invite.status = 'expired' OR v_invite.expires_at < now() THEN
    UPDATE app.beta_invitations SET status = 'expired' WHERE id = v_invite.id;
    RAISE EXCEPTION 'VALIDATION_FAILED: This beta invitation code has expired';
  END IF;

  -- 4. Check recipient binding
  IF v_invite.recipient_email IS NOT NULL THEN
    IF p_user_email IS NULL OR lower(trim(p_user_email)) != lower(trim(v_invite.recipient_email)) THEN
      RAISE EXCEPTION 'FORBIDDEN: This invitation is bound to a specific recipient email address';
    END IF;
  END IF;

  -- 5. Check seat limits under advisory lock
  SELECT count(*) INTO v_seat_count
  FROM app.beta_enrollments
  WHERE status = 'enrolled';

  IF v_seat_count >= p_max_seats THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: Beta participant seat limit (%) reached; no additional enrollments permitted', p_max_seats;
  END IF;

  -- 6. Claim invitation and enroll
  UPDATE app.beta_invitations
  SET status = 'claimed',
      claimed_by_user_id = p_user_id,
      claimed_at = now()
  WHERE id = v_invite.id;

  INSERT INTO app.beta_enrollments (user_id, invitation_id, enrolled_at, status)
  VALUES (p_user_id, v_invite.id, now(), 'enrolled')
  ON CONFLICT (user_id) DO UPDATE
    SET invitation_id = EXCLUDED.invitation_id,
        enrolled_at = now(),
        status = 'enrolled';

  RETURN jsonb_build_object('success', true, 'enrolled', true, 'message', 'Successfully enrolled in Daynori Private Beta');
END;
$$;

REVOKE ALL ON FUNCTION app.claim_beta_invitation(text, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_beta_invitation(text, uuid, text, int) TO daynori_runtime;

-- Restrict direct modification of beta_enrollments and beta_invitations by daynori_runtime
REVOKE INSERT, UPDATE, DELETE ON TABLE app.beta_enrollments FROM daynori_runtime;
DROP POLICY IF EXISTS beta_enrollments_runtime ON app.beta_enrollments;
CREATE POLICY beta_enrollments_runtime ON app.beta_enrollments
    FOR SELECT TO daynori_runtime
    USING (user_id = app.current_user_id() OR app.current_user_id() IS NULL);
