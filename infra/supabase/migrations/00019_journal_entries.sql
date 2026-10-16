-- Migration: 00019_journal_entries
-- Description: Private dated journal entries, reflection metadata, personal workspace isolation, and RLS
-- Search Path: app, pg_temp

CREATE TABLE IF NOT EXISTS app.journal_entries (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    title text,
    entry_date date NOT NULL,
    timezone text NOT NULL DEFAULT 'UTC',
    document jsonb NOT NULL,
    plain_text text NOT NULL DEFAULT '',
    word_count integer NOT NULL DEFAULT 0,
    char_count integer NOT NULL DEFAULT 0,
    mood text,
    prompts jsonb NOT NULL DEFAULT '[]'::jsonb,
    tags text[] NOT NULL DEFAULT '{}',
    is_draft boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id),
    CONSTRAINT fk_journal_entries_item FOREIGN KEY (workspace_id, id)
        REFERENCES app.items (workspace_id, id) ON DELETE CASCADE
);

-- Indices for timeline, calendar queries, and text search
CREATE INDEX IF NOT EXISTS idx_journal_entries_workspace_date
    ON app.journal_entries (workspace_id, entry_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_workspace_updated
    ON app.journal_entries (workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_id
    ON app.journal_entries (id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_fts
    ON app.journal_entries USING gin (to_tsvector('simple', COALESCE(title, '') || ' ' || plain_text));

-- Enable Row Level Security and Grants
ALTER TABLE app.journal_entries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.journal_entries TO daynori_runtime;

-- RLS Policies: Journal entries are strictly personal workspace isolated
DROP POLICY IF EXISTS p_journal_entries_select ON app.journal_entries;
CREATE POLICY p_journal_entries_select ON app.journal_entries
    FOR SELECT TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'viewer') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

DROP POLICY IF EXISTS p_journal_entries_insert ON app.journal_entries;
CREATE POLICY p_journal_entries_insert ON app.journal_entries
    FOR INSERT TO daynori_runtime
    WITH CHECK (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

DROP POLICY IF EXISTS p_journal_entries_update ON app.journal_entries;
CREATE POLICY p_journal_entries_update ON app.journal_entries
    FOR UPDATE TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

DROP POLICY IF EXISTS p_journal_entries_delete ON app.journal_entries;
CREATE POLICY p_journal_entries_delete ON app.journal_entries
    FOR DELETE TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );
