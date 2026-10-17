-- Migration: 00026_notification_delivery_coordination_and_web_push
-- Description: Phase 27/28 foundation repairs (per-device delivery scoping, token alignment, suppression as scheduling decision) and Phase 29 Web Push subscriptions
-- Search Path: app, pg_temp

-- 1. Expand device token_type to support 'expo_push' alongside 'fcm', 'web_push', and 'none'
ALTER TABLE app.devices
    DROP CONSTRAINT IF EXISTS devices_token_type_check;

ALTER TABLE app.devices
    ADD CONSTRAINT devices_token_type_check
    CHECK (token_type IN ('fcm', 'expo_push', 'web_push', 'none'));

-- Invalidate incorrectly labelled registrations (e.g. Expo push tokens labelled as FCM)
UPDATE app.devices
SET token_type = 'expo_push'
WHERE token_type = 'fcm' AND push_token LIKE 'ExponentPushToken%';

-- 2. Phase 29: Web Push Subscriptions Table
CREATE TABLE IF NOT EXISTS app.web_push_subscriptions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    is_active boolean NOT NULL DEFAULT true,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id),
    CONSTRAINT uq_web_push_user_endpoint UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_web_push_user_active ON app.web_push_subscriptions (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_web_push_endpoint ON app.web_push_subscriptions (endpoint);

-- RLS & Grants for web_push_subscriptions
ALTER TABLE app.web_push_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.web_push_subscriptions TO daynori_runtime;

CREATE POLICY p_web_push_select ON app.web_push_subscriptions
    FOR SELECT TO daynori_runtime
    USING (user_id = app.current_user_id());

CREATE POLICY p_web_push_insert ON app.web_push_subscriptions
    FOR INSERT TO daynori_runtime
    WITH CHECK (user_id = app.current_user_id());

CREATE POLICY p_web_push_update ON app.web_push_subscriptions
    FOR UPDATE TO daynori_runtime
    USING (user_id = app.current_user_id());

CREATE POLICY p_web_push_delete ON app.web_push_subscriptions
    FOR DELETE TO daynori_runtime
    USING (user_id = app.current_user_id());

-- 3. Add recipient device and subscription tracking to app.reminder_deliveries
ALTER TABLE app.reminder_deliveries
    ADD COLUMN IF NOT EXISTS recipient_device_id uuid REFERENCES app.devices(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS recipient_subscription_id uuid REFERENCES app.web_push_subscriptions(id) ON DELETE SET NULL;

-- 4. Update reminder delivery status constraint to distinguish suppression as a scheduling decision
ALTER TABLE app.reminder_deliveries
    DROP CONSTRAINT IF EXISTS reminder_deliveries_status_check;

ALTER TABLE app.reminder_deliveries
    ADD CONSTRAINT reminder_deliveries_status_check
    CHECK (status IN (
        'pending',
        'accepted',
        'failed',
        'delivered',
        'opened',
        'dropped_quiet_hours',
        'unavailable',
        'suppressed_local_schedule'
    ));

-- Update provider check to include 'expo_push'
ALTER TABLE app.reminder_deliveries
    DROP CONSTRAINT IF EXISTS reminder_deliveries_provider_check;

ALTER TABLE app.reminder_deliveries
    ADD CONSTRAINT reminder_deliveries_provider_check
    CHECK (provider IN ('in_app', 'fcm', 'expo_push', 'web_push'));

-- 5. Per-device delivery uniqueness index
-- Ensures separate delivery tracking per device and subscription without suppressing other endpoints
DROP INDEX IF EXISTS app.uq_reminder_deliveries_instance_channel_gen;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_deliveries_target
    ON app.reminder_deliveries (
        workspace_id,
        instance_id,
        delivery_generation,
        channel,
        COALESCE(recipient_device_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(recipient_subscription_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );
