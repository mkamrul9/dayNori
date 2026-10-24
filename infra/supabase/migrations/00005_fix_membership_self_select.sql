-- 00005_fix_membership_self_select.sql
-- Allow users to select their own membership rows directly (non-recursive and enables INSERT ... RETURNING)

DROP POLICY IF EXISTS memberships_select ON app.workspace_memberships;
CREATE POLICY memberships_select ON app.workspace_memberships
    FOR SELECT
    USING (
        user_id = app.current_user_id()
        OR app.user_has_workspace_role(workspace_id, 'viewer')
    );
