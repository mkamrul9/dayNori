-- Migration: 00023_repair_calendar_constraints_and_rls
-- Description: Fix composite foreign-key deletion on calendar events and enforce personal workspace isolation in RLS
-- Search Path: app, pg_temp

-- 1. Correct composite folder foreign key: specify (folder_id) on delete set null to prevent attempting to null workspace_id
ALTER TABLE app.calendar_events DROP CONSTRAINT IF EXISTS fk_calendar_events_folder;
ALTER TABLE app.calendar_events ADD CONSTRAINT fk_calendar_events_folder
    FOREIGN KEY (workspace_id, folder_id)
    REFERENCES app.items (workspace_id, id)
    ON DELETE SET NULL (folder_id);

-- 2. Update Row Level Security Policies: Enforce personal workspace boundary
DROP POLICY IF EXISTS p_calendar_events_select ON app.calendar_events;
CREATE POLICY p_calendar_events_select ON app.calendar_events
    FOR SELECT TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'viewer') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

DROP POLICY IF EXISTS p_calendar_events_insert ON app.calendar_events;
CREATE POLICY p_calendar_events_insert ON app.calendar_events
    FOR INSERT TO daynori_runtime
    WITH CHECK (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

DROP POLICY IF EXISTS p_calendar_events_update ON app.calendar_events;
CREATE POLICY p_calendar_events_update ON app.calendar_events
    FOR UPDATE TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

DROP POLICY IF EXISTS p_calendar_events_delete ON app.calendar_events;
CREATE POLICY p_calendar_events_delete ON app.calendar_events
    FOR DELETE TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );
