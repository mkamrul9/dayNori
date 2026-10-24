-- Migration: 00036_repair_items_select_policy
-- Description: Allow creator and workspace members to select items even when workspace context is unset

DROP POLICY IF EXISTS items_select ON app.items;
CREATE POLICY items_select ON app.items
    FOR SELECT TO daynori_runtime
    USING (
        created_by = app.current_user_id()
        OR app.user_has_workspace_role(workspace_id, 'viewer')
    );
