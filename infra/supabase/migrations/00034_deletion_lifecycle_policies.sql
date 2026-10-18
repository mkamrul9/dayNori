-- Migration: 00034_deletion_lifecycle_policies
-- Description: Policies for profile, workspace, membership, items, and receipts lifecycle deletion

-- 1. Profiles Delete Policy
DROP POLICY IF EXISTS profiles_delete ON app.profiles;
CREATE POLICY profiles_delete ON app.profiles
    FOR DELETE TO daynori_runtime
    USING (id = app.current_user_id());

-- 2. Workspaces Delete Policy (Allow workspace owner to delete workspace)
DROP POLICY IF EXISTS workspaces_delete ON app.workspaces;
CREATE POLICY workspaces_delete ON app.workspaces
    FOR DELETE TO daynori_runtime
    USING (owner_id = app.current_user_id() OR app.user_has_workspace_role(id, 'owner'));

-- 3. Workspace Memberships Delete Policy (Allow member to delete own membership or owner to delete)
DROP POLICY IF EXISTS memberships_delete ON app.workspace_memberships;
CREATE POLICY memberships_delete ON app.workspace_memberships
    FOR DELETE TO daynori_runtime
    USING (user_id = app.current_user_id() OR app.user_has_workspace_role(workspace_id, 'owner'));

-- 4. Items Update Policy (Allow creator to update created items across workspaces, e.g. reassign on account deletion)
DROP POLICY IF EXISTS items_update ON app.items;
CREATE POLICY items_update ON app.items
    FOR UPDATE TO daynori_runtime
    USING (
        created_by = app.current_user_id()
        OR (workspace_id = app.current_workspace_id() AND app.user_has_workspace_role(workspace_id, 'editor'))
    )
    WITH CHECK (
        created_by = app.current_user_id()
        OR (workspace_id = app.current_workspace_id() AND app.user_has_workspace_role(workspace_id, 'editor'))
        OR EXISTS (
            SELECT 1 FROM app.workspaces w
            WHERE w.id = workspace_id AND w.owner_id = created_by
        )
    );

-- 5. Items Delete Policy (Allow workspace owner to delete items when purging workspace)
DROP POLICY IF EXISTS items_delete ON app.items;
CREATE POLICY items_delete ON app.items
    FOR DELETE TO daynori_runtime
    USING (
        EXISTS (
            SELECT 1 FROM app.workspaces w
            WHERE w.id = workspace_id AND w.owner_id = app.current_user_id()
        )
        OR (workspace_id = app.current_workspace_id() AND app.user_has_workspace_role(workspace_id, 'editor'))
    );

-- 6. Mutation Receipts Update & Delete Policies
DROP POLICY IF EXISTS p_mutation_receipts_update ON app.mutation_receipts;
CREATE POLICY p_mutation_receipts_update ON app.mutation_receipts
    FOR UPDATE TO daynori_runtime
    USING (actor_user_id = app.current_user_id() OR app.user_has_workspace_role(workspace_id, 'owner'));

DROP POLICY IF EXISTS p_mutation_receipts_delete ON app.mutation_receipts;
CREATE POLICY p_mutation_receipts_delete ON app.mutation_receipts
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'owner') OR EXISTS (
        SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.owner_id = app.current_user_id()
    ));

-- 7. Sync State & Changes Delete Policies
DROP POLICY IF EXISTS p_changes_delete ON app.changes;
CREATE POLICY p_changes_delete ON app.changes
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'owner') OR EXISTS (
        SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.owner_id = app.current_user_id()
    ));

DROP POLICY IF EXISTS p_sync_state_delete ON app.workspace_sync_state;
CREATE POLICY p_sync_state_delete ON app.workspace_sync_state
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'owner') OR EXISTS (
        SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.owner_id = app.current_user_id()
    ));

DROP POLICY IF EXISTS p_outbox_intents_delete ON app.outbox_intents;
CREATE POLICY p_outbox_intents_delete ON app.outbox_intents
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'owner') OR EXISTS (
        SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.owner_id = app.current_user_id()
    ));

-- 8. Tags & Item Tags Update Policies (Allow creator to reassign on deletion)
DROP POLICY IF EXISTS p_tags_update ON app.tags;
CREATE POLICY p_tags_update ON app.tags
    FOR UPDATE TO daynori_runtime
    USING (created_by = app.current_user_id() OR app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_item_tags_update ON app.item_tags;
CREATE POLICY p_item_tags_update ON app.item_tags
    FOR UPDATE TO daynori_runtime
    USING (created_by = app.current_user_id() OR app.user_has_workspace_role(workspace_id, 'editor'));
