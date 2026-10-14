-- 00004_fix_workspace_owner_select.sql
-- Allow workspace creator/owner to SELECT workspace (required for INSERT ... RETURNING and initial bootstrap)

DROP POLICY IF EXISTS workspaces_select ON app.workspaces;
CREATE POLICY workspaces_select ON app.workspaces
    FOR SELECT
    USING (
        owner_id = app.current_user_id()
        OR app.user_has_workspace_role(id, 'viewer')
    );
