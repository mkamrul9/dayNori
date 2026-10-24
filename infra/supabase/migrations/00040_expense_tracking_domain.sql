-- Migration: 00040_expense_tracking_domain
-- Description: Precise manual expense, income, and refund records, categories, recurring templates, and RLS
-- Search Path: app, pg_temp

-- 0. Extend app.items kind check constraint to include 'expense'
ALTER TABLE app.items DROP CONSTRAINT IF EXISTS items_kind_check;
ALTER TABLE app.items ADD CONSTRAINT items_kind_check CHECK (kind IN ('note', 'todo', 'task', 'routine', 'journal_entry', 'file', 'file_item', 'calendar_event', 'folder', 'expense'));

-- 1. Expense Categories Table
CREATE TABLE IF NOT EXISTS app.expense_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text,
    icon text,
    display_order integer NOT NULL DEFAULT 0,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_categories_workspace_name
    ON app.expense_categories (workspace_id, lower(trim(name)))
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_expense_categories_workspace
    ON app.expense_categories (workspace_id, display_order, name);

-- 2. Expense Items Table (Extends app.items where kind = 'expense')
CREATE TABLE IF NOT EXISTS app.expense_items (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('expense', 'income', 'refund')),
    amount_minor_units bigint NOT NULL CHECK (amount_minor_units >= 0),
    currency text NOT NULL CHECK (length(currency) = 3),
    transaction_date date NOT NULL,
    occurred_at timestamptz,
    timezone text NOT NULL DEFAULT 'UTC',
    category_id uuid REFERENCES app.expense_categories(id) ON DELETE SET NULL,
    payment_label text,
    note text,
    receipt_file_id uuid,
    original_expense_id uuid,
    cumulative_refund_minor_units bigint NOT NULL DEFAULT 0 CHECK (cumulative_refund_minor_units >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id),
    CONSTRAINT fk_expense_items_item FOREIGN KEY (workspace_id, id)
        REFERENCES app.items (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_expense_items_original FOREIGN KEY (workspace_id, original_expense_id)
        REFERENCES app.expense_items (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT chk_refund_original CHECK (
        (kind = 'refund' AND original_expense_id IS NOT NULL) OR
        (kind != 'refund')
    ),
    CONSTRAINT chk_refund_bounds CHECK (
        cumulative_refund_minor_units <= amount_minor_units
    )
);

CREATE INDEX IF NOT EXISTS idx_expense_items_workspace_date
    ON app.expense_items (workspace_id, transaction_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expense_items_category
    ON app.expense_items (workspace_id, category_id);

CREATE INDEX IF NOT EXISTS idx_expense_items_currency_date
    ON app.expense_items (workspace_id, currency, transaction_date);

CREATE INDEX IF NOT EXISTS idx_expense_items_original
    ON app.expense_items (workspace_id, original_expense_id)
    WHERE original_expense_id IS NOT NULL;

-- 3. Recurring Expense Templates Table
CREATE TABLE IF NOT EXISTS app.expense_recurring_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    title text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('expense', 'income')),
    amount_minor_units bigint NOT NULL CHECK (amount_minor_units >= 0),
    currency text NOT NULL CHECK (length(currency) = 3),
    category_id uuid REFERENCES app.expense_categories(id) ON DELETE SET NULL,
    payment_label text,
    note text,
    schedule jsonb NOT NULL,
    timezone text NOT NULL DEFAULT 'UTC',
    start_date date NOT NULL,
    end_date date,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_templates_workspace
    ON app.expense_recurring_templates (workspace_id, is_active, start_date);

-- 4. Recurring Expense Occurrence Deduplication Table
CREATE TABLE IF NOT EXISTS app.expense_recurring_occurrences (
    template_id uuid NOT NULL REFERENCES app.expense_recurring_templates(id) ON DELETE CASCADE,
    occurrence_date date NOT NULL,
    expense_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (template_id, occurrence_date)
);

-- 5. Enable Row Level Security and Grants
ALTER TABLE app.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.expense_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.expense_recurring_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.expense_recurring_occurrences ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.expense_categories TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.expense_items TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.expense_recurring_templates TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.expense_recurring_occurrences TO daynori_runtime;

-- RLS Policies for Categories
DROP POLICY IF EXISTS p_expense_categories_select ON app.expense_categories;
CREATE POLICY p_expense_categories_select ON app.expense_categories
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_expense_categories_insert ON app.expense_categories;
CREATE POLICY p_expense_categories_insert ON app.expense_categories
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_expense_categories_update ON app.expense_categories;
CREATE POLICY p_expense_categories_update ON app.expense_categories
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_expense_categories_delete ON app.expense_categories;
CREATE POLICY p_expense_categories_delete ON app.expense_categories
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

-- RLS Policies for Expense Items
DROP POLICY IF EXISTS p_expense_items_select ON app.expense_items;
CREATE POLICY p_expense_items_select ON app.expense_items
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_expense_items_insert ON app.expense_items;
CREATE POLICY p_expense_items_insert ON app.expense_items
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_expense_items_update ON app.expense_items;
CREATE POLICY p_expense_items_update ON app.expense_items
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_expense_items_delete ON app.expense_items;
CREATE POLICY p_expense_items_delete ON app.expense_items
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

-- RLS Policies for Recurring Templates
DROP POLICY IF EXISTS p_expense_templates_select ON app.expense_recurring_templates;
CREATE POLICY p_expense_templates_select ON app.expense_recurring_templates
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_expense_templates_insert ON app.expense_recurring_templates;
CREATE POLICY p_expense_templates_insert ON app.expense_recurring_templates
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_expense_templates_update ON app.expense_recurring_templates;
CREATE POLICY p_expense_templates_update ON app.expense_recurring_templates
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_expense_templates_delete ON app.expense_recurring_templates;
CREATE POLICY p_expense_templates_delete ON app.expense_recurring_templates
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

-- RLS Policies for Deduplicated Occurrences
DROP POLICY IF EXISTS p_expense_occurrences_all ON app.expense_recurring_occurrences;
CREATE POLICY p_expense_occurrences_all ON app.expense_recurring_occurrences
    FOR ALL TO daynori_runtime
    USING (
        EXISTS (
            SELECT 1 FROM app.expense_recurring_templates t
            WHERE t.id = template_id AND app.user_has_workspace_role(t.workspace_id, 'viewer')
        )
    );

-- 6. Update app.purge_owned_workspace to wipe expense records during workspace deletion
CREATE OR REPLACE FUNCTION app.purge_owned_workspace(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_caller uuid := app.current_user_id();
  v_actual_owner uuid;
BEGIN
  SELECT user_id INTO v_actual_owner
  FROM app.workspace_memberships
  WHERE workspace_id = p_workspace_id AND role = 'owner'
  LIMIT 1;

  IF v_caller IS NOT NULL AND v_caller != v_actual_owner THEN
    RAISE EXCEPTION 'FORBIDDEN: Only the workspace owner can purge this workspace';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app.workspace_deletions WHERE workspace_id = p_workspace_id AND status IN ('processing', 'pending_confirmation', 'completed')
  ) AND NOT EXISTS (
    SELECT 1 FROM app.account_deletions WHERE user_id = v_actual_owner AND status IN ('processing', 'scheduled', 'completed')
  ) AND NOT EXISTS (
    SELECT 1 FROM app.public_deletion_requests WHERE target_user_id = v_actual_owner AND status IN ('processing', 'verified', 'completed')
  ) AND NOT EXISTS (
    SELECT 1 FROM app.deletion_suppression_ledger WHERE entity_type = 'workspace' AND entity_id = p_workspace_id
  ) AND NOT EXISTS (
    SELECT 1 FROM app.deletion_suppression_ledger WHERE entity_type = 'account' AND entity_id = v_actual_owner
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Workspace purge requires an active authorized deletion request';
  END IF;

  DELETE FROM app.expense_recurring_occurrences WHERE template_id IN (SELECT id FROM app.expense_recurring_templates WHERE workspace_id = p_workspace_id);
  DELETE FROM app.expense_recurring_templates WHERE workspace_id = p_workspace_id;
  DELETE FROM app.expense_items WHERE workspace_id = p_workspace_id;
  DELETE FROM app.expense_categories WHERE workspace_id = p_workspace_id;
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
