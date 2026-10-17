-- Migration: 00022_calendar_events_and_projections
-- Description: Standalone personal calendar events, date/instant interval invariants, workspace isolation, and RLS
-- Search Path: app, pg_temp

CREATE TABLE IF NOT EXISTS app.calendar_events (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    folder_id uuid,
    title text NOT NULL,
    details text,
    all_day boolean NOT NULL DEFAULT false,
    start_date date,
    end_date date,
    start_at timestamptz,
    end_at timestamptz,
    timezone text NOT NULL DEFAULT 'UTC',
    is_archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id),
    CONSTRAINT fk_calendar_events_item FOREIGN KEY (workspace_id, id)
        REFERENCES app.items (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_calendar_events_folder FOREIGN KEY (folder_id, workspace_id)
        REFERENCES app.items (id, workspace_id) ON DELETE SET NULL,
    CONSTRAINT chk_calendar_event_dates CHECK (
        (all_day = true AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date > start_date)
        OR
        (all_day = false AND start_at IS NOT NULL AND end_at IS NOT NULL AND end_at > start_at)
    )
);

-- Indices for calendar range queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_workspace_dates
    ON app.calendar_events (workspace_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_calendar_events_workspace_instants
    ON app.calendar_events (workspace_id, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_calendar_events_id
    ON app.calendar_events (id);

CREATE INDEX IF NOT EXISTS idx_calendar_events_fts
    ON app.calendar_events USING gin (to_tsvector('simple', title || ' ' || COALESCE(details, '')));

-- Enable Row Level Security and Grants
ALTER TABLE app.calendar_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.calendar_events TO daynori_runtime;

-- RLS Policies
DROP POLICY IF EXISTS p_calendar_events_select ON app.calendar_events;
CREATE POLICY p_calendar_events_select ON app.calendar_events
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_calendar_events_insert ON app.calendar_events;
CREATE POLICY p_calendar_events_insert ON app.calendar_events
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_calendar_events_update ON app.calendar_events;
CREATE POLICY p_calendar_events_update ON app.calendar_events
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_calendar_events_delete ON app.calendar_events;
CREATE POLICY p_calendar_events_delete ON app.calendar_events
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));
