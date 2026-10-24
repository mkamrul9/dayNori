-- 00068_billing_role_authority.sql
-- Phase 57/59 prerequisite: billing privilege is a protected DB role, not a GUC
-- that ordinary callers can set_config. Local synthetic tokens are not release credentials.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daynori_billing') THEN
    CREATE ROLE daynori_billing WITH LOGIN PASSWORD 'billing_dev_secret_9876'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA app TO daynori_billing;

-- Service role may read/write billing tables under dedicated policies (not via GUC).
GRANT SELECT, INSERT, UPDATE ON TABLE app.billing_products TO daynori_billing;
GRANT SELECT, INSERT, UPDATE ON TABLE app.billing_purchases TO daynori_billing;
GRANT SELECT, INSERT, UPDATE ON TABLE app.billing_entitlements TO daynori_billing;
GRANT SELECT, INSERT, UPDATE ON TABLE app.billing_events TO daynori_billing;
GRANT SELECT ON TABLE app.billing_service_secrets TO daynori_billing;
GRANT SELECT, INSERT, UPDATE ON TABLE app.workspace_storage_usage TO daynori_billing;
GRANT SELECT ON TABLE app.workspaces TO daynori_billing;
GRANT SELECT, INSERT, UPDATE ON TABLE app.background_jobs TO daynori_billing;

ALTER TABLE app.billing_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.billing_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.billing_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_billing_products_service ON app.billing_products;
CREATE POLICY p_billing_products_service ON app.billing_products
  FOR ALL TO daynori_billing USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_billing_purchases_service ON app.billing_purchases;
CREATE POLICY p_billing_purchases_service ON app.billing_purchases
  FOR ALL TO daynori_billing USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_billing_entitlements_service ON app.billing_entitlements;
CREATE POLICY p_billing_entitlements_service ON app.billing_entitlements
  FOR ALL TO daynori_billing USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_billing_events_service ON app.billing_events;
CREATE POLICY p_billing_events_service ON app.billing_events
  FOR ALL TO daynori_billing USING (true) WITH CHECK (true);

-- Authority: invoking session_user must be the billing role (or migration superuser).
-- A GUC flag alone is never sufficient — ordinary callers can set_config arbitrarily.
CREATE OR REPLACE FUNCTION app.billing_assert_service_authority()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  IF session_user = 'daynori_billing' THEN
    RETURN;
  END IF;
  -- Migration / maintenance connections (not ordinary API runtime).
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'BILLING_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION app.billing_assert_service_authority() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.billing_assert_service_authority() FROM daynori_runtime;
GRANT EXECUTE ON FUNCTION app.billing_assert_service_authority() TO daynori_billing;

-- Token activation is admin/billing-role only (secret rotation / local harness).
-- It must not grant ordinary daynori_runtime a privilege it can self-assert via GUC.
CREATE OR REPLACE FUNCTION app.billing_activate_service_session(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_hash text;
BEGIN
  IF session_user IS DISTINCT FROM 'daynori_billing'
     AND session_user IS DISTINCT FROM 'postgres'
     AND session_user IS DISTINCT FROM 'supabase_admin' THEN
    RAISE EXCEPTION 'BILLING_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'BILLING_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF NOT EXISTS (
    SELECT 1 FROM app.billing_service_secrets s WHERE s.id = 1 AND s.token_hash = v_hash
  ) THEN
    RAISE EXCEPTION 'BILLING_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  -- Retained for audit/compatibility; authority itself is the billing role.
  PERFORM set_config('app.billing_service_ok', '1', true);
END;
$$;

REVOKE ALL ON FUNCTION app.billing_activate_service_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.billing_activate_service_session(text) FROM daynori_runtime;
GRANT EXECUTE ON FUNCTION app.billing_activate_service_session(text) TO daynori_billing;

-- Move privileged helper EXECUTE from ordinary runtime to billing role.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app'
      AND p.proname IN (
        'billing_insert_purchase',
        'billing_upsert_entitlement_from_purchase',
        'billing_recompute_entitlement',
        'billing_ingest_event',
        'billing_claim_event',
        'billing_complete_event',
        'billing_load_event',
        'billing_find_event',
        'billing_list_pending_events',
        'billing_expire_stale_entitlements'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM daynori_runtime', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO daynori_billing', r.sig);
  END LOOP;
END
$$;
