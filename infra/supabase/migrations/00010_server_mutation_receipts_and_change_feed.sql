-- Migration: 00010_server_mutation_receipts_and_change_feed
-- Description: Commit-safe change sequence, durable mutation receipts, ordered changes, and outbox intents
-- Search Path: app, pg_temp

-- 1. Extend app.items with sync and revision attributes
ALTER TABLE app.items ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1;
ALTER TABLE app.items ADD COLUMN IF NOT EXISTS rank text NOT NULL DEFAULT '0';
ALTER TABLE app.items ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE app.items ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
ALTER TABLE app.items ADD COLUMN IF NOT EXISTS security_scope text NOT NULL DEFAULT 'standard' CHECK (security_scope IN ('standard', 'vault'));
ALTER TABLE app.items DROP CONSTRAINT IF EXISTS items_kind_check;
ALTER TABLE app.items ADD CONSTRAINT items_kind_check CHECK (kind IN ('note', 'todo', 'task', 'routine', 'journal_entry', 'file', 'file_item', 'calendar_event', 'folder'));

-- 2. Workspace Sync State (Row-lock protocol & linear sequence allocator)
CREATE TABLE IF NOT EXISTS app.workspace_sync_state (
    workspace_id uuid PRIMARY KEY REFERENCES app.workspaces(id) ON DELETE CASCADE,
    next_change_seq bigint NOT NULL DEFAULT 1,
    access_epoch text NOT NULL DEFAULT gen_random_uuid()::text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill sync state for existing workspaces
INSERT INTO app.workspace_sync_state (workspace_id, next_change_seq, access_epoch)
SELECT id, 1, gen_random_uuid()::text FROM app.workspaces
ON CONFLICT (workspace_id) DO NOTHING;

-- Trigger to initialize sync state for newly created workspaces
CREATE OR REPLACE FUNCTION app.init_workspace_sync_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
    INSERT INTO app.workspace_sync_state (workspace_id, next_change_seq, access_epoch)
    VALUES (NEW.id, 1, gen_random_uuid()::text)
    ON CONFLICT (workspace_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_workspace_sync_state ON app.workspaces;
CREATE TRIGGER trg_init_workspace_sync_state
    AFTER INSERT ON app.workspaces
    FOR EACH ROW
    EXECUTE FUNCTION app.init_workspace_sync_state();

-- 3. Mutation Receipts (Durable idempotency table)
CREATE TABLE IF NOT EXISTS app.mutation_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    actor_user_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE RESTRICT,
    device_id text NOT NULL,
    operation_id text NOT NULL,
    command text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    schema_version integer NOT NULL DEFAULT 1,
    base_revision bigint NOT NULL DEFAULT 0,
    canonical_payload_hash text NOT NULL,
    status text NOT NULL CHECK (status IN ('accepted', 'conflict', 'rejected')),
    accepted_revision bigint,
    applied_change_seq bigint,
    result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_mutation_receipts_actor_device_op UNIQUE (actor_user_id, device_id, operation_id)
);

CREATE INDEX IF NOT EXISTS idx_mutation_receipts_lookup ON app.mutation_receipts (actor_user_id, device_id, operation_id);
CREATE INDEX IF NOT EXISTS idx_mutation_receipts_workspace_time ON app.mutation_receipts (workspace_id, created_at DESC);

-- 4. Ordered Change Feed (Monotonic sequence per workspace)
CREATE TABLE IF NOT EXISTS app.changes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    seq bigint NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    revision bigint NOT NULL,
    is_tombstone boolean NOT NULL DEFAULT false,
    operation_id text NOT NULL,
    change_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_changes_workspace_seq UNIQUE (workspace_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_changes_workspace_seq ON app.changes (workspace_id, seq ASC);

-- 5. Outbox Intents (Transactional intent table)
CREATE TABLE IF NOT EXISTS app.outbox_intents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_intents_pending ON app.outbox_intents (workspace_id, status) WHERE status = 'pending';

-- 6. Grants & Row Level Security
ALTER TABLE app.workspace_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mutation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.outbox_intents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.workspace_sync_state TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.mutation_receipts TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.changes TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.outbox_intents TO daynori_runtime;

-- RLS Policies
DROP POLICY IF EXISTS p_sync_state_select ON app.workspace_sync_state;
CREATE POLICY p_sync_state_select ON app.workspace_sync_state
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_sync_state_update ON app.workspace_sync_state;
CREATE POLICY p_sync_state_update ON app.workspace_sync_state
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_sync_state_insert ON app.workspace_sync_state;
CREATE POLICY p_sync_state_insert ON app.workspace_sync_state
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_mutation_receipts_select ON app.mutation_receipts;
CREATE POLICY p_mutation_receipts_select ON app.mutation_receipts
    FOR SELECT TO daynori_runtime
    USING (actor_user_id = app.current_user_id() OR app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_mutation_receipts_insert ON app.mutation_receipts;
CREATE POLICY p_mutation_receipts_insert ON app.mutation_receipts
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_changes_select ON app.changes;
CREATE POLICY p_changes_select ON app.changes
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_changes_insert ON app.changes;
CREATE POLICY p_changes_insert ON app.changes
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_outbox_intents_select ON app.outbox_intents;
CREATE POLICY p_outbox_intents_select ON app.outbox_intents
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_outbox_intents_insert ON app.outbox_intents;
CREATE POLICY p_outbox_intents_insert ON app.outbox_intents
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));
