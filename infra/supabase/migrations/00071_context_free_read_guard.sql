-- Evaluate identity once per statement, avoiding a per-row membership check
-- when no user context exists. Existing membership policies still authorize
-- every visible row; these restrictive policies cannot grant new access.
CREATE POLICY items_require_identity ON app.items
  AS RESTRICTIVE FOR SELECT TO daynori_runtime
  USING ((SELECT app.current_user_id()) IS NOT NULL);

CREATE POLICY workspaces_require_identity ON app.workspaces
  AS RESTRICTIVE FOR SELECT TO daynori_runtime
  USING ((SELECT app.current_user_id()) IS NOT NULL);
