-- Migration: 00025_repair_reminders_and_notifications
-- Description: Phase 27 repairs (delivery generation, delivery deduplication, unavailable status) and Phase 28 device registration and schedule coordination
-- Search Path: app, pg_temp

-- 1. Phase 27 Repairs: Add delivery_generation to reminder instances
ALTER TABLE app.reminder_instances
    ADD COLUMN IF NOT EXISTS delivery_generation integer NOT NULL DEFAULT 1;

-- 2. Phase 27 Repairs: Add delivery_generation to reminder deliveries
ALTER TABLE app.reminder_deliveries
    ADD COLUMN IF NOT EXISTS delivery_generation integer NOT NULL DEFAULT 1;

-- 3. Update status check to include 'unavailable'
ALTER TABLE app.reminder_deliveries
    DROP CONSTRAINT IF EXISTS reminder_deliveries_status_check;

ALTER TABLE app.reminder_deliveries
    ADD CONSTRAINT reminder_deliveries_status_check
    CHECK (status IN ('pending', 'accepted', 'failed', 'delivered', 'opened', 'dropped_quiet_hours', 'unavailable'));

-- 4. Deduplication unique constraint for reminder deliveries per generation
CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_deliveries_instance_channel_gen
    ON app.reminder_deliveries (workspace_id, instance_id, delivery_generation, channel);

-- 5. Phase 28: Device registration table
CREATE TABLE IF NOT EXISTS app.devices (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
    installation_id text NOT NULL,
    platform text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
    push_token text,
    token_type text NOT NULL DEFAULT 'none' CHECK (token_type IN ('fcm', 'web_push', 'none')),
    capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id),
    CONSTRAINT uq_devices_user_installation UNIQUE (user_id, installation_id)
);

CREATE INDEX IF NOT EXISTS idx_devices_user_active ON app.devices (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_devices_installation ON app.devices (installation_id);
CREATE INDEX IF NOT EXISTS idx_devices_push_token ON app.devices (push_token) WHERE push_token IS NOT NULL;

-- 6. Phase 28: Device reminder schedules coordination table
CREATE TABLE IF NOT EXISTS app.device_reminder_schedules (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    instance_id uuid NOT NULL,
    device_id uuid NOT NULL REFERENCES app.devices(id) ON DELETE CASCADE,
    rule_revision integer NOT NULL,
    delivery_generation integer NOT NULL DEFAULT 1,
    native_notification_id text,
    delivery_mode text NOT NULL CHECK (delivery_mode IN ('local', 'push')),
    acknowledged boolean NOT NULL DEFAULT false,
    acknowledged_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id),
    CONSTRAINT fk_device_schedules_instance FOREIGN KEY (workspace_id, instance_id)
        REFERENCES app.reminder_instances (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_device_reminder_schedules UNIQUE (instance_id, device_id, delivery_generation)
);

CREATE INDEX IF NOT EXISTS idx_device_reminder_schedules_lookup ON app.device_reminder_schedules (workspace_id, instance_id);
CREATE INDEX IF NOT EXISTS idx_device_reminder_schedules_device ON app.device_reminder_schedules (device_id, acknowledged);

-- 7. Row Level Security & Permissions
ALTER TABLE app.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.device_reminder_schedules ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.devices TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.device_reminder_schedules TO daynori_runtime;

-- RLS policies for app.devices: scoped to authenticated user
CREATE POLICY p_devices_select ON app.devices
    FOR SELECT TO daynori_runtime
    USING (user_id = app.current_user_id());

CREATE POLICY p_devices_insert ON app.devices
    FOR INSERT TO daynori_runtime
    WITH CHECK (user_id = app.current_user_id());

CREATE POLICY p_devices_update ON app.devices
    FOR UPDATE TO daynori_runtime
    USING (user_id = app.current_user_id());

CREATE POLICY p_devices_delete ON app.devices
    FOR DELETE TO daynori_runtime
    USING (user_id = app.current_user_id());

-- RLS policies for app.device_reminder_schedules: scoped to personal workspaces
CREATE POLICY p_device_schedules_select ON app.device_reminder_schedules
    FOR SELECT TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'viewer') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

CREATE POLICY p_device_schedules_insert ON app.device_reminder_schedules
    FOR INSERT TO daynori_runtime
    WITH CHECK (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

CREATE POLICY p_device_schedules_update ON app.device_reminder_schedules
    FOR UPDATE TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );

CREATE POLICY p_device_schedules_delete ON app.device_reminder_schedules
    FOR DELETE TO daynori_runtime
    USING (
        app.user_has_workspace_role(workspace_id, 'editor') AND
        EXISTS (SELECT 1 FROM app.workspaces w WHERE w.id = workspace_id AND w.kind = 'personal')
    );
