-- Migration: 00027_web_push_account_binding_and_durable_retry
-- Description: Enforce at most one active account binding per push endpoint and durable retry coordination
-- Search Path: app, pg_temp

-- Ensure at most one active subscription exists per endpoint across all accounts
CREATE UNIQUE INDEX IF NOT EXISTS uq_web_push_active_endpoint
    ON app.web_push_subscriptions (endpoint)
    WHERE is_active = true;

-- Function to safely deactivate any previous account binding for this endpoint
CREATE OR REPLACE FUNCTION app.rebind_web_push_endpoint(p_endpoint text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
    UPDATE app.web_push_subscriptions
    SET is_active = false, updated_at = now()
    WHERE endpoint = p_endpoint AND user_id != p_user_id AND is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION app.rebind_web_push_endpoint(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION app.rebind_web_push_endpoint(text, uuid) TO daynori_runtime;
