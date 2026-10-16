-- Migration: 00018_repair_routines_and_occurrences
-- Description: Repair folder composite foreign key, add routine schedule revisions history, and allow cancelled occurrence status

-- 1. Repair composite folder foreign key to preserve workspace_id on delete
ALTER TABLE app.routines
    DROP CONSTRAINT IF EXISTS fk_routines_folder,
    ADD CONSTRAINT fk_routines_folder
    FOREIGN KEY (workspace_id, folder_id)
    REFERENCES app.items (workspace_id, id)
    ON DELETE SET NULL (folder_id);

-- 2. Routine schedule revisions table for historical rule preservation and forward backfill
CREATE TABLE IF NOT EXISTS app.routine_schedule_revisions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    routine_id uuid NOT NULL,
    schedule_revision integer NOT NULL,
    frequency text NOT NULL CHECK (frequency IN ('daily', 'weekdays')),
    weekdays integer[] NOT NULL DEFAULT '{}',
    timezone text NOT NULL,
    scheduled_time text CHECK (scheduled_time IS NULL OR scheduled_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    active_from date NOT NULL,
    active_to date,
    effective_date date NOT NULL,
    is_paused boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id),
    CONSTRAINT fk_schedule_revisions_routine FOREIGN KEY (workspace_id, routine_id)
        REFERENCES app.routines (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_routine_schedule_revision UNIQUE (workspace_id, routine_id, schedule_revision)
);

ALTER TABLE app.routine_schedule_revisions ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_routine_schedule_revisions_lookup
    ON app.routine_schedule_revisions (workspace_id, routine_id, effective_date ASC);

-- 3. Backfill initial revisions for existing routines
INSERT INTO app.routine_schedule_revisions (
    workspace_id, routine_id, schedule_revision, frequency, weekdays,
    timezone, scheduled_time, active_from, active_to, effective_date, created_at
)
SELECT
    r.workspace_id, r.id, r.schedule_revision, r.frequency, r.weekdays,
    r.timezone, r.scheduled_time, r.active_from, r.active_to, r.effective_date, r.created_at
FROM app.routines r
ON CONFLICT (workspace_id, routine_id, schedule_revision) DO NOTHING;

-- 4. Enable Row Level Security and Grants
ALTER TABLE app.routine_schedule_revisions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.routine_schedule_revisions TO daynori_runtime;

DROP POLICY IF EXISTS p_routine_schedule_revisions_select ON app.routine_schedule_revisions;
CREATE POLICY p_routine_schedule_revisions_select ON app.routine_schedule_revisions
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_routine_schedule_revisions_insert ON app.routine_schedule_revisions;
CREATE POLICY p_routine_schedule_revisions_insert ON app.routine_schedule_revisions
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_routine_schedule_revisions_delete ON app.routine_schedule_revisions;
CREATE POLICY p_routine_schedule_revisions_delete ON app.routine_schedule_revisions
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

-- 5. Expand occurrence status to distinguish schedule cancellation from user skip
ALTER TABLE app.routine_occurrences
    DROP CONSTRAINT IF EXISTS routine_occurrences_status_check;

ALTER TABLE app.routine_occurrences
    ADD CONSTRAINT routine_occurrences_status_check
    CHECK (status IN ('pending', 'done', 'skipped', 'cancelled'));
