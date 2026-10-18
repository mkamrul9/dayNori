-- Migration 00028: Saved Views and Knowledge Organization
-- Enables saving filtered views across guides, cheatsheets, notes, and topics without duplicating content.

CREATE TABLE IF NOT EXISTS app.saved_views (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    icon text,
    color text,
    entity_type text NOT NULL DEFAULT 'knowledge',
    filter jsonb NOT NULL DEFAULT '{}'::jsonb,
    rank text NOT NULL DEFAULT '0',
    is_pinned boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_saved_view_name_len CHECK (char_length(name) >= 1 AND char_length(name) <= 100)
);

CREATE INDEX IF NOT EXISTS idx_saved_views_workspace_user ON app.saved_views(workspace_id, user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_views_workspace_rank ON app.saved_views(workspace_id, rank ASC);

ALTER TABLE app.saved_views ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.saved_views TO daynori_runtime;

DROP POLICY IF EXISTS p_saved_views_select ON app.saved_views;
CREATE POLICY p_saved_views_select ON app.saved_views
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_saved_views_insert ON app.saved_views;
CREATE POLICY p_saved_views_insert ON app.saved_views
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_saved_views_update ON app.saved_views;
CREATE POLICY p_saved_views_update ON app.saved_views
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_saved_views_delete ON app.saved_views;
CREATE POLICY p_saved_views_delete ON app.saved_views
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));
