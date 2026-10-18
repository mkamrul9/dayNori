-- Migration: 00035_repair_items_reassignment_policy
-- Description: Allow items reassignment/deletion during account lifecycle and relax profile foreign key deletion cascades

-- 1. Relax foreign key constraints on profiles to allow clean account erasure
ALTER TABLE app.items DROP CONSTRAINT IF EXISTS items_created_by_fkey;
ALTER TABLE app.items ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE app.items ADD CONSTRAINT items_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES app.profiles(id) ON DELETE SET NULL;

ALTER TABLE app.items DROP CONSTRAINT IF EXISTS items_updated_by_fkey;
ALTER TABLE app.items ALTER COLUMN updated_by DROP NOT NULL;
ALTER TABLE app.items ADD CONSTRAINT items_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES app.profiles(id) ON DELETE SET NULL;

ALTER TABLE app.audit_events DROP CONSTRAINT IF EXISTS audit_events_actor_id_fkey;
ALTER TABLE app.audit_events ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE app.audit_events ADD CONSTRAINT audit_events_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES app.profiles(id) ON DELETE SET NULL;

ALTER TABLE app.mutation_receipts DROP CONSTRAINT IF EXISTS mutation_receipts_actor_user_id_fkey;
ALTER TABLE app.mutation_receipts ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE app.mutation_receipts ADD CONSTRAINT mutation_receipts_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES app.profiles(id) ON DELETE SET NULL;

-- 2. Items Update Policy (Allow creator or owner to update/reassign items)
DROP POLICY IF EXISTS items_update ON app.items;
CREATE POLICY items_update ON app.items
    FOR UPDATE TO daynori_runtime
    USING (
        created_by = app.current_user_id()
        OR EXISTS (
            SELECT 1 FROM app.workspaces w
            WHERE w.id = workspace_id AND w.owner_id = app.current_user_id()
        )
        OR (workspace_id = app.current_workspace_id() AND app.user_has_workspace_role(workspace_id, 'editor'))
    )
    WITH CHECK (true);

-- 3. Items Delete Policy (Allow creator or owner to delete items)
DROP POLICY IF EXISTS items_delete ON app.items;
CREATE POLICY items_delete ON app.items
    FOR DELETE TO daynori_runtime
    USING (
        created_by = app.current_user_id()
        OR EXISTS (
            SELECT 1 FROM app.workspaces w
            WHERE w.id = workspace_id AND w.owner_id = app.current_user_id()
        )
        OR (workspace_id = app.current_workspace_id() AND app.user_has_workspace_role(workspace_id, 'editor'))
    );
