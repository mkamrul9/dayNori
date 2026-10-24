-- Disambiguate workspace_id in memberships_insert policy
-- Previous policy in 00003 had `m.workspace_id = workspace_id`, which PostgreSQL resolved
-- to `m.workspace_id = m.workspace_id` (innermost scope), breaking initial workspace bootstrap.

DROP POLICY IF EXISTS memberships_insert ON app.workspace_memberships;
CREATE POLICY memberships_insert ON app.workspace_memberships
    FOR INSERT
    WITH CHECK (
        app.user_has_workspace_role(workspace_id, 'owner')
        OR (
            user_id = app.current_user_id()
            AND role = 'owner'
            AND EXISTS (
                SELECT 1 FROM app.workspaces w
                WHERE w.id = workspace_memberships.workspace_id
                  AND w.owner_id = app.current_user_id()
            )
            AND NOT EXISTS (
                SELECT 1 FROM app.workspace_memberships m
                WHERE m.workspace_id = workspace_memberships.workspace_id
            )
        )
    );
