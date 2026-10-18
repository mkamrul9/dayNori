-- Migration 00029: Note Purpose and Knowledge Classification
-- Adds durable purpose to app.notes and updates app.saved_views with user ownership and revisions.

-- 1. Add purpose to app.notes
ALTER TABLE app.notes
    ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'standard'
    CHECK (purpose IN ('standard', 'guide', 'cheatsheet', 'reference'));

CREATE INDEX IF NOT EXISTS idx_notes_workspace_purpose ON app.notes(workspace_id, purpose) WHERE purpose <> 'standard';

-- 2. Add is_shared and revision to app.saved_views
ALTER TABLE app.saved_views
    ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;

-- 3. Replace RLS policies on app.saved_views to enforce user ownership and prevent cross-member filter modification
DROP POLICY IF EXISTS p_saved_views_select ON app.saved_views;
CREATE POLICY p_saved_views_select ON app.saved_views
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer') AND (user_id = app.current_user_id() OR is_shared = true));

DROP POLICY IF EXISTS p_saved_views_insert ON app.saved_views;
CREATE POLICY p_saved_views_insert ON app.saved_views
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor') AND user_id = app.current_user_id());

DROP POLICY IF EXISTS p_saved_views_update ON app.saved_views;
CREATE POLICY p_saved_views_update ON app.saved_views
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor') AND user_id = app.current_user_id());

DROP POLICY IF EXISTS p_saved_views_delete ON app.saved_views;
CREATE POLICY p_saved_views_delete ON app.saved_views
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor') AND user_id = app.current_user_id());
