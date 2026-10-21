-- 00067_billing_authority_and_lifecycle_repair.sql
-- Phase 57 repair: protected billing service authority, lease ownership,
-- entitlement recompute from purchases, expire-status check expansion.

-- Service token hash (local synthetic default). Production sets via admin + DAYNORI_BILLING_SERVICE_TOKEN.
CREATE TABLE IF NOT EXISTS app.billing_service_secrets (
  id integer PRIMARY KEY CHECK (id = 1),
  token_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.billing_service_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.billing_service_secrets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.billing_service_secrets FROM PUBLIC;
REVOKE ALL ON TABLE app.billing_service_secrets FROM daynori_runtime;

-- sha256('daynori-local-billing-service-token-v1-not-production')
INSERT INTO app.billing_service_secrets (id, token_hash)
VALUES (
  1,
  encode(
    sha256(convert_to('daynori-local-billing-service-token-v1-not-production', 'UTF8')),
    'hex'
  )
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION app.billing_activate_service_session(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_hash text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'BILLING_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF NOT EXISTS (
    SELECT 1 FROM app.billing_service_secrets s WHERE s.id = 1 AND s.token_hash = v_hash
  ) THEN
    RAISE EXCEPTION 'BILLING_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.billing_service_ok', '1', true);
END;
$$;

REVOKE ALL ON FUNCTION app.billing_activate_service_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_activate_service_session(text) TO daynori_runtime;

CREATE OR REPLACE FUNCTION app.billing_assert_service_authority()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  IF current_setting('app.billing_service_ok', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'BILLING_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app.billing_assert_service_authority() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_assert_service_authority() TO daynori_runtime;

ALTER TABLE app.billing_entitlements
  DROP CONSTRAINT IF EXISTS billing_entitlements_status_check;
ALTER TABLE app.billing_entitlements
  ADD CONSTRAINT billing_entitlements_status_check
  CHECK (status IN ('pending', 'active', 'grace', 'hold', 'canceled', 'expired', 'revoked'));

ALTER TABLE app.billing_events
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 8;

CREATE OR REPLACE FUNCTION app.billing_insert_purchase(
  p_user_id uuid,
  p_provider text,
  p_product_id text,
  p_purchase_token_hash text,
  p_token_prefix text,
  p_obfuscated_account_id text,
  p_order_id text,
  p_subscription_state text,
  p_acknowledgement_state text,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_auto_renewing boolean,
  p_linked_hash text,
  p_snapshot jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_owner uuid;
BEGIN
  PERFORM app.billing_assert_service_authority();

  SELECT id, user_id INTO v_id, v_owner
  FROM app.billing_purchases
  WHERE provider = p_provider AND purchase_token_hash = p_purchase_token_hash
  FOR UPDATE;

  IF FOUND THEN
    IF v_owner IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'purchase token bound to another account'
        USING ERRCODE = 'P0001';
    END IF;
    UPDATE app.billing_purchases SET
      product_id = p_product_id,
      subscription_state = p_subscription_state,
      acknowledgement_state = p_acknowledgement_state,
      valid_from = p_valid_from,
      valid_until = p_valid_until,
      auto_renewing = p_auto_renewing,
      linked_purchase_token_hash = p_linked_hash,
      raw_verified_snapshot = p_snapshot,
      obfuscated_account_id = COALESCE(p_obfuscated_account_id, obfuscated_account_id),
      order_id = COALESCE(p_order_id, order_id),
      updated_at = now()
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO app.billing_purchases (
    user_id, provider, product_id, purchase_token_hash, provider_purchase_token_prefix,
    obfuscated_account_id, order_id, subscription_state, acknowledgement_state,
    valid_from, valid_until, auto_renewing, linked_purchase_token_hash, raw_verified_snapshot
  ) VALUES (
    p_user_id, p_provider, p_product_id, p_purchase_token_hash, p_token_prefix,
    p_obfuscated_account_id, p_order_id, p_subscription_state, p_acknowledgement_state,
    p_valid_from, p_valid_until, p_auto_renewing, p_linked_hash, p_snapshot
  )
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT id, user_id INTO v_id, v_owner
    FROM app.billing_purchases
    WHERE provider = p_provider AND purchase_token_hash = p_purchase_token_hash
    FOR UPDATE;
    IF v_owner IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'purchase token bound to another account'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.billing_upsert_entitlement_from_purchase(
  p_user_id uuid,
  p_purchase_id uuid,
  p_plan_id text,
  p_status text,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_storage_bytes bigint,
  p_ai_monthly_tokens integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  PERFORM app.billing_assert_service_authority();

  INSERT INTO app.billing_entitlements (
    user_id, plan_id, source_purchase_id, status, valid_from, valid_until,
    storage_bytes, ai_monthly_tokens, updated_at
  ) VALUES (
    p_user_id, p_plan_id, p_purchase_id, p_status, p_valid_from, p_valid_until,
    p_storage_bytes, p_ai_monthly_tokens, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    source_purchase_id = EXCLUDED.source_purchase_id,
    status = EXCLUDED.status,
    valid_from = EXCLUDED.valid_from,
    valid_until = EXCLUDED.valid_until,
    storage_bytes = EXCLUDED.storage_bytes,
    ai_monthly_tokens = EXCLUDED.ai_monthly_tokens,
    updated_at = now();

  INSERT INTO app.workspace_storage_usage (workspace_id, max_storage_bytes)
  SELECT w.id, p_storage_bytes
  FROM app.workspaces w
  WHERE w.owner_id = p_user_id AND w.kind = 'personal'
  ON CONFLICT (workspace_id) DO UPDATE
    SET max_storage_bytes = EXCLUDED.max_storage_bytes, updated_at = now();
END;
$$;

-- Recompute from all purchases: best paid grant wins; never let an expired purchase clobber another valid one.
CREATE OR REPLACE FUNCTION app.billing_recompute_entitlement(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_best RECORD;
  v_free_storage bigint := 104857600;
  v_free_ai integer := 50000;
BEGIN
  PERFORM app.billing_assert_service_authority();

  SELECT
    p.id AS purchase_id,
    pr.plan_id,
    pr.storage_bytes,
    pr.ai_monthly_tokens,
    p.subscription_state,
    p.valid_from,
    p.valid_until
  INTO v_best
  FROM app.billing_purchases p
  JOIN app.billing_products pr ON pr.product_id = p.product_id
  WHERE p.user_id = p_user_id
    AND p.valid_until > now()
    AND p.subscription_state IN (
      'SUBSCRIPTION_STATE_ACTIVE',
      'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
      'SUBSCRIPTION_STATE_CANCELED'
    )
  ORDER BY
    CASE p.subscription_state
      WHEN 'SUBSCRIPTION_STATE_ACTIVE' THEN 0
      WHEN 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' THEN 1
      WHEN 'SUBSCRIPTION_STATE_CANCELED' THEN 2
      ELSE 9
    END,
    p.valid_until DESC
  LIMIT 1;

  IF v_best IS NULL THEN
    PERFORM app.billing_upsert_entitlement_from_purchase(
      p_user_id,
      NULL,
      'free',
      'expired',
      now(),
      now(),
      v_free_storage,
      v_free_ai
    );
    RETURN;
  END IF;

  PERFORM app.billing_upsert_entitlement_from_purchase(
    p_user_id,
    v_best.purchase_id,
    v_best.plan_id,
    CASE v_best.subscription_state
      WHEN 'SUBSCRIPTION_STATE_ACTIVE' THEN 'active'
      WHEN 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' THEN 'grace'
      WHEN 'SUBSCRIPTION_STATE_CANCELED' THEN 'canceled'
      ELSE 'expired'
    END,
    v_best.valid_from,
    v_best.valid_until,
    v_best.storage_bytes,
    v_best.ai_monthly_tokens
  );
END;
$$;

REVOKE ALL ON FUNCTION app.billing_recompute_entitlement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_recompute_entitlement(uuid) TO daynori_runtime;

CREATE OR REPLACE FUNCTION app.billing_ingest_event(
  p_provider text,
  p_message_id text,
  p_event_type text,
  p_purchase_token_hash text,
  p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM app.billing_assert_service_authority();
  INSERT INTO app.billing_events (
    provider, message_id, event_type, purchase_token_hash, payload, processing_status
  ) VALUES (
    p_provider, p_message_id, p_event_type, p_purchase_token_hash, p_payload, 'pending'
  )
  ON CONFLICT (provider, message_id) DO UPDATE SET
    payload = EXCLUDED.payload
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS app.billing_claim_event(uuid, integer);
DROP FUNCTION IF EXISTS app.billing_claim_event(uuid, integer, text);
CREATE OR REPLACE FUNCTION app.billing_claim_event(
  p_event_id uuid,
  p_lease_seconds integer DEFAULT 60,
  p_lease_owner text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_owner text := COALESCE(NULLIF(p_lease_owner, ''), current_setting('app.billing_lease_owner', true), 'anonymous');
BEGIN
  PERFORM app.billing_assert_service_authority();
  UPDATE app.billing_events
  SET processing_status = 'processing',
      lease_until = now() + make_interval(secs => GREATEST(5, LEAST(COALESCE(p_lease_seconds, 60), 300))),
      lease_owner = v_owner,
      attempt_count = attempt_count + 1
  WHERE id = p_event_id
    AND attempt_count < max_attempts
    AND (
      processing_status IN ('pending', 'failed')
      OR (processing_status = 'processing' AND (lease_until IS NULL OR lease_until < now()))
    );
  RETURN FOUND;
END;
$$;

DROP FUNCTION IF EXISTS app.billing_complete_event(uuid, text, text);
DROP FUNCTION IF EXISTS app.billing_complete_event(uuid, text, text, text);
CREATE OR REPLACE FUNCTION app.billing_complete_event(
  p_event_id uuid,
  p_status text,
  p_error text DEFAULT NULL,
  p_lease_owner text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_owner text := COALESCE(NULLIF(p_lease_owner, ''), current_setting('app.billing_lease_owner', true));
BEGIN
  PERFORM app.billing_assert_service_authority();
  IF p_status NOT IN ('succeeded', 'failed', 'dead_letter') THEN
    RAISE EXCEPTION 'BILLING_EVENT_STATUS_INVALID' USING ERRCODE = '22023';
  END IF;
  UPDATE app.billing_events
  SET processing_status = CASE
        WHEN p_status = 'failed' AND attempt_count >= max_attempts THEN 'dead_letter'
        ELSE p_status
      END,
      last_error = p_error,
      processed_at = CASE WHEN p_status = 'succeeded' THEN now() ELSE processed_at END,
      lease_until = NULL,
      lease_owner = NULL
  WHERE id = p_event_id
    AND (
      v_owner IS NULL
      OR lease_owner IS NULL
      OR lease_owner = v_owner
      OR lease_until IS NULL
      OR lease_until < now()
    );
END;
$$;

CREATE OR REPLACE FUNCTION app.billing_load_event(p_event_id uuid)
RETURNS TABLE (
  id uuid,
  provider text,
  event_type text,
  payload jsonb,
  processing_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  PERFORM app.billing_assert_service_authority();
  RETURN QUERY
  SELECT e.id, e.provider, e.event_type, e.payload, e.processing_status
  FROM app.billing_events e
  WHERE e.id = p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.billing_find_event(p_provider text, p_message_id text)
RETURNS TABLE (id uuid, processing_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  PERFORM app.billing_assert_service_authority();
  RETURN QUERY
  SELECT e.id, e.processing_status
  FROM app.billing_events e
  WHERE e.provider = p_provider AND e.message_id = p_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.billing_list_pending_events(p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  PERFORM app.billing_assert_service_authority();
  RETURN QUERY
  SELECT e.id
  FROM app.billing_events e
  WHERE e.processing_status IN ('pending', 'failed')
     OR (e.processing_status = 'processing' AND e.lease_until < now())
  ORDER BY e.received_at ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
END;
$$;

-- Expire paid entitlements past valid_until and sync storage ceilings (missed RTDN safety net).
CREATE OR REPLACE FUNCTION app.billing_expire_stale_entitlements(p_limit integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  r RECORD;
  n integer := 0;
BEGIN
  PERFORM app.billing_assert_service_authority();
  FOR r IN
    SELECT user_id
    FROM app.billing_entitlements
    WHERE status IN ('active', 'grace', 'canceled', 'hold', 'pending')
      AND valid_until <= now()
    ORDER BY valid_until ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
  LOOP
    PERFORM app.billing_recompute_entitlement(r.user_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION app.billing_expire_stale_entitlements(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_expire_stale_entitlements(integer) TO daynori_runtime;

-- Re-grant EXECUTE on replaced signatures (PostgreSQL may create overloads).
REVOKE ALL ON FUNCTION app.billing_insert_purchase(
  uuid, text, text, text, text, text, text, text, text, timestamptz, timestamptz, boolean, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_insert_purchase(
  uuid, text, text, text, text, text, text, text, text, timestamptz, timestamptz, boolean, text, jsonb
) TO daynori_runtime;

REVOKE ALL ON FUNCTION app.billing_upsert_entitlement_from_purchase(
  uuid, uuid, text, text, timestamptz, timestamptz, bigint, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_upsert_entitlement_from_purchase(
  uuid, uuid, text, text, timestamptz, timestamptz, bigint, integer
) TO daynori_runtime;

REVOKE ALL ON FUNCTION app.billing_ingest_event(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_ingest_event(text, text, text, text, jsonb) TO daynori_runtime;

REVOKE ALL ON FUNCTION app.billing_claim_event(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_claim_event(uuid, integer, text) TO daynori_runtime;

REVOKE ALL ON FUNCTION app.billing_complete_event(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_complete_event(uuid, text, text, text) TO daynori_runtime;

REVOKE ALL ON FUNCTION app.billing_load_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_load_event(uuid) TO daynori_runtime;
REVOKE ALL ON FUNCTION app.billing_find_event(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_find_event(text, text) TO daynori_runtime;
REVOKE ALL ON FUNCTION app.billing_list_pending_events(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_list_pending_events(integer) TO daynori_runtime;
