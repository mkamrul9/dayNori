-- Migration: 00024_reminder_rules_instances_and_deliveries
-- Description: Phase 27 - Reminder scheduling, recurrence instances, and durable delivery jobs
-- Search Path: app, pg_temp

CREATE TABLE IF NOT EXISTS app.reminder_rules (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    target_type text NOT NULL CHECK (target_type IN ('task', 'routine', 'calendar_event')),
    target_id uuid NOT NULL,
    rule_revision integer NOT NULL DEFAULT 1,
    offset_minutes integer, -- minutes before due/start (e.g. 15, 60, 1440), null if absolute
    schedule_time text, -- 'HH:mm' for scheduled local time
    timezone text NOT NULL DEFAULT 'UTC',
    recurrence text DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'weekdays')),
    quiet_hours_behavior text NOT NULL DEFAULT 'defer' CHECK (quiet_hours_behavior IN ('defer', 'allow', 'drop')),
    channels text[] NOT NULL DEFAULT ARRAY['in_app', 'push']::text[],
    privacy_level text NOT NULL DEFAULT 'generic' CHECK (privacy_level IN ('generic', 'detailed')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    PRIMARY KEY (workspace_id, id),
    CONSTRAINT fk_reminder_rules_target FOREIGN KEY (workspace_id, target_id)
        REFERENCES app.items (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reminder_rules_target ON app.reminder_rules (workspace_id, target_id)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.reminder_instances (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    rule_id uuid NOT NULL,
    rule_revision integer NOT NULL,
    occurrence_key text NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    scheduled_at timestamptz NOT NULL,
    original_scheduled_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'snoozed', 'processing', 'dispatched', 'invalidated', 'dismissed', 'observed')),
    snooze_until timestamptz,
    invalidated_reason text,
    invalidation_time timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id),
    CONSTRAINT fk_reminder_instances_rule FOREIGN KEY (workspace_id, rule_id)
        REFERENCES app.reminder_rules (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_reminder_instances_occurrence UNIQUE (workspace_id, rule_id, rule_revision, occurrence_key)
);

CREATE INDEX IF NOT EXISTS idx_reminder_instances_scheduled ON app.reminder_instances (workspace_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_reminder_instances_target ON app.reminder_instances (workspace_id, target_id)
    WHERE status IN ('scheduled', 'snoozed');

CREATE TABLE IF NOT EXISTS app.reminder_deliveries (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    instance_id uuid NOT NULL,
    channel text NOT NULL CHECK (channel IN ('in_app', 'push', 'local')),
    recipient_user_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
    provider text NOT NULL DEFAULT 'in_app' CHECK (provider IN ('in_app', 'fcm', 'web_push')),
    provider_message_id text,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'failed', 'delivered', 'opened', 'dropped_quiet_hours')),
    redacted_title text NOT NULL,
    redacted_body text,
    attempt_count integer NOT NULL DEFAULT 0,
    last_attempt_at timestamptz,
    error_message text,
    opened_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id),
    CONSTRAINT fk_reminder_deliveries_instance FOREIGN KEY (workspace_id, instance_id)
        REFERENCES app.reminder_instances (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_recipient ON app.reminder_deliveries (workspace_id, recipient_user_id, status);
CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_instance ON app.reminder_deliveries (workspace_id, instance_id);

-- RLS
ALTER TABLE app.reminder_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.reminder_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.reminder_deliveries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.reminder_rules TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.reminder_instances TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.reminder_deliveries TO daynori_runtime;

-- RLS Policies for Personal Workspaces
CREATE POLICY p_reminder_rules_select ON app.reminder_rules
    FOR SELECT TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'viewer') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

CREATE POLICY p_reminder_rules_insert ON app.reminder_rules
    FOR INSERT TO daynori_runtime
    WITH CHECK (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

CREATE POLICY p_reminder_rules_update ON app.reminder_rules
    FOR UPDATE TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

CREATE POLICY p_reminder_rules_delete ON app.reminder_rules
    FOR DELETE TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

CREATE POLICY p_reminder_instances_select ON app.reminder_instances
    FOR SELECT TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'viewer') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

CREATE POLICY p_reminder_instances_insert ON app.reminder_instances
    FOR INSERT TO daynori_runtime
    WITH CHECK (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

CREATE POLICY p_reminder_instances_update ON app.reminder_instances
    FOR UPDATE TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

CREATE POLICY p_reminder_instances_delete ON app.reminder_instances
    FOR DELETE TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

CREATE POLICY p_reminder_deliveries_select ON app.reminder_deliveries
    FOR SELECT TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'viewer') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

CREATE POLICY p_reminder_deliveries_insert ON app.reminder_deliveries
    FOR INSERT TO daynori_runtime
    WITH CHECK (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

CREATE POLICY p_reminder_deliveries_update ON app.reminder_deliveries
    FOR UPDATE TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

CREATE POLICY p_reminder_deliveries_delete ON app.reminder_deliveries
    FOR DELETE TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );
