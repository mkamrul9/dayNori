-- Migration: 00015_tasks_domain_and_deadlines
-- Description: Prioritized tasks domain, explicit deadline semantics, subtask relationships, and tenant RLS
-- Search Path: app, pg_temp

CREATE TABLE IF NOT EXISTS app.tasks (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    title text NOT NULL,
    details text,
    priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed', 'cancelled')),
    deadline_type text NOT NULL DEFAULT 'none' CHECK (deadline_type IN ('none', 'date', 'timed')),
    deadline_date date,
    deadline_time timestamptz,
    deadline_zone text,
    completed_at timestamptz,
    reopened_at timestamptz,
    completion_history jsonb NOT NULL DEFAULT '[]'::jsonb,
    parent_id uuid,
    subtask_order integer NOT NULL DEFAULT 0,
    tags text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id),
    CONSTRAINT fk_tasks_item FOREIGN KEY (workspace_id, id)
        REFERENCES app.items (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_tasks_parent FOREIGN KEY (workspace_id, parent_id)
        REFERENCES app.tasks (workspace_id, id) ON DELETE CASCADE
);

-- Indices for views: Today, Upcoming, Overdue, Completed, and Subtasks
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status_deadline
    ON app.tasks (workspace_id, status, deadline_date, deadline_time);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_parent
    ON app.tasks (workspace_id, parent_id);

CREATE INDEX IF NOT EXISTS idx_tasks_id
    ON app.tasks (id);

CREATE INDEX IF NOT EXISTS idx_tasks_fts
    ON app.tasks USING gin (to_tsvector('simple', title || ' ' || COALESCE(details, '')));

-- Enable Row Level Security and Grants
ALTER TABLE app.tasks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.tasks TO daynori_runtime;

-- RLS Policies
DROP POLICY IF EXISTS p_tasks_select ON app.tasks;
CREATE POLICY p_tasks_select ON app.tasks
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_tasks_insert ON app.tasks;
CREATE POLICY p_tasks_insert ON app.tasks
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_tasks_update ON app.tasks;
CREATE POLICY p_tasks_update ON app.tasks
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_tasks_delete ON app.tasks;
CREATE POLICY p_tasks_delete ON app.tasks
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));
