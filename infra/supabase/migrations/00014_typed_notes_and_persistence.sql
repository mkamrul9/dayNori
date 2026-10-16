-- Migration: 00014_typed_notes_and_persistence
-- Description: Typed note persistence, portable AST document column, plain-text projection, and tenant RLS
-- Search Path: app, pg_temp

CREATE TABLE IF NOT EXISTS app.notes (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    title text NOT NULL,
    document jsonb NOT NULL,
    plain_text text NOT NULL,
    word_count integer NOT NULL DEFAULT 0,
    char_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id),
    CONSTRAINT fk_notes_item FOREIGN KEY (workspace_id, id)
        REFERENCES app.items (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_updated ON app.notes (workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_id ON app.notes (id);
CREATE INDEX IF NOT EXISTS idx_notes_fts ON app.notes USING gin (to_tsvector('simple', title || ' ' || plain_text));

-- Enable Row Level Security and Grants
ALTER TABLE app.notes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.notes TO daynori_runtime;

-- RLS Policies
DROP POLICY IF EXISTS p_notes_select ON app.notes;
CREATE POLICY p_notes_select ON app.notes
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_notes_insert ON app.notes;
CREATE POLICY p_notes_insert ON app.notes
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_notes_update ON app.notes;
CREATE POLICY p_notes_update ON app.notes
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_notes_delete ON app.notes;
CREATE POLICY p_notes_delete ON app.notes
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));
