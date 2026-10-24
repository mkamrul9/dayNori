-- Migration: 00017_routines_and_occurrences
-- Description: Daily routine schedule templates, date-scoped occurrences, uniqueness constraints, and tenant RLS
-- Search Path: app, pg_temp

-- 1. Routines table (typed schedule templates for kind = 'routine' items)
CREATE TABLE IF NOT EXISTS app.routines (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    folder_id uuid,
    title text NOT NULL,
    details text,
    frequency text NOT NULL CHECK (frequency IN ('daily', 'weekdays')),
    weekdays integer[] NOT NULL DEFAULT '{}',
    timezone text NOT NULL,
    scheduled_time text CHECK (scheduled_time IS NULL OR scheduled_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    active_from date NOT NULL DEFAULT CURRENT_DATE,
    active_to date,
    is_paused boolean NOT NULL DEFAULT false,
    is_archived boolean NOT NULL DEFAULT false,
    is_pinned boolean NOT NULL DEFAULT false,
    schedule_revision integer NOT NULL DEFAULT 1,
    effective_date date NOT NULL DEFAULT CURRENT_DATE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id),
    CONSTRAINT fk_routines_item FOREIGN KEY (workspace_id, id)
        REFERENCES app.items (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_routines_folder FOREIGN KEY (workspace_id, folder_id)
        REFERENCES app.items (workspace_id, id) ON DELETE SET NULL,
    CONSTRAINT chk_active_period CHECK (active_to IS NULL OR active_to >= active_from)
);

-- Indices for routine template lookup
CREATE INDEX IF NOT EXISTS idx_routines_workspace ON app.routines (workspace_id, is_archived, is_paused);
CREATE INDEX IF NOT EXISTS idx_routines_id ON app.routines (id);
CREATE INDEX IF NOT EXISTS idx_routines_folder ON app.routines (workspace_id, folder_id);

-- 2. Routine Occurrences table (date-scoped daily records)
CREATE TABLE IF NOT EXISTS app.routine_occurrences (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    routine_id uuid NOT NULL,
    scheduled_date date NOT NULL,
    schedule_revision integer NOT NULL DEFAULT 1,
    planned_instant timestamptz,
    timezone text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped')),
    completed_at timestamptz,
    completed_by uuid REFERENCES app.profiles(id) ON DELETE SET NULL,
    history jsonb NOT NULL DEFAULT '[]'::jsonb,
    server_revision bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id),
    CONSTRAINT fk_occurrences_routine FOREIGN KEY (workspace_id, routine_id)
        REFERENCES app.routines (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_routine_occurrence_date UNIQUE (workspace_id, routine_id, scheduled_date)
);

-- Indices for date queries and daily agenda projections
CREATE INDEX IF NOT EXISTS idx_occurrences_routine_date
    ON app.routine_occurrences (workspace_id, routine_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_occurrences_date_status
    ON app.routine_occurrences (workspace_id, scheduled_date, status);

CREATE INDEX IF NOT EXISTS idx_occurrences_id
    ON app.routine_occurrences (id);

-- 3. Trigger for cascading item envelope deletion on hard-delete of routine
CREATE OR REPLACE FUNCTION app.cascade_delete_routine_item()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM app.items
    WHERE workspace_id = OLD.workspace_id AND id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_delete_routine_item ON app.routines;
CREATE TRIGGER trg_cascade_delete_routine_item
AFTER DELETE ON app.routines
FOR EACH ROW
EXECUTE FUNCTION app.cascade_delete_routine_item();

-- 4. Enable Row Level Security and Grants
ALTER TABLE app.routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.routine_occurrences ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.routines TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.routine_occurrences TO daynori_runtime;

-- RLS Policies for app.routines
DROP POLICY IF EXISTS p_routines_select ON app.routines;
CREATE POLICY p_routines_select ON app.routines
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_routines_insert ON app.routines;
CREATE POLICY p_routines_insert ON app.routines
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_routines_update ON app.routines;
CREATE POLICY p_routines_update ON app.routines
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_routines_delete ON app.routines;
CREATE POLICY p_routines_delete ON app.routines
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

-- RLS Policies for app.routine_occurrences
DROP POLICY IF EXISTS p_occurrences_select ON app.routine_occurrences;
CREATE POLICY p_occurrences_select ON app.routine_occurrences
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_occurrences_insert ON app.routine_occurrences;
CREATE POLICY p_occurrences_insert ON app.routine_occurrences
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_occurrences_update ON app.routine_occurrences;
CREATE POLICY p_occurrences_update ON app.routine_occurrences
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_occurrences_delete ON app.routine_occurrences;
CREATE POLICY p_occurrences_delete ON app.routine_occurrences
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));
