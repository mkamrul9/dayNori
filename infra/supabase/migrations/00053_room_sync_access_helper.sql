-- 00053_room_sync_access_helper.sql
-- Phase 52: allow sync authorization to distinguish room membership revocation
-- from unknown workspaces without relying on RLS-visible joins.

CREATE OR REPLACE FUNCTION app.get_workspace_sync_access(p_workspace_id uuid, p_user_id uuid)
RETURNS TABLE(kind text, status text, user_role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT w.kind::text, w.status::text, m.role::text
  FROM app.workspaces w
  LEFT JOIN app.workspace_memberships m
    ON m.workspace_id = w.id AND m.user_id = p_user_id
  WHERE w.id = p_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION app.get_workspace_sync_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_workspace_sync_access(uuid, uuid) TO daynori_runtime;
