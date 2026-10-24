-- 00066_billing_event_access_and_binding.sql
-- Phase 57 repair: runtime-safe event accessors; purchase account binding; storage upsert.

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

REVOKE ALL ON FUNCTION app.billing_upsert_entitlement_from_purchase(
  uuid, uuid, text, text, timestamptz, timestamptz, bigint, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_upsert_entitlement_from_purchase(
  uuid, uuid, text, text, timestamptz, timestamptz, bigint, integer
) TO daynori_runtime;

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
      subscription_state = p_subscription_state,
      acknowledgement_state = p_acknowledgement_state,
      valid_from = p_valid_from,
      valid_until = p_valid_until,
      auto_renewing = p_auto_renewing,
      linked_purchase_token_hash = p_linked_hash,
      raw_verified_snapshot = p_snapshot,
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
    UPDATE app.billing_purchases SET
      subscription_state = p_subscription_state,
      acknowledgement_state = p_acknowledgement_state,
      valid_from = p_valid_from,
      valid_until = p_valid_until,
      auto_renewing = p_auto_renewing,
      linked_purchase_token_hash = p_linked_hash,
      raw_verified_snapshot = p_snapshot,
      updated_at = now()
    WHERE id = v_id;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION app.billing_insert_purchase(
  uuid, text, text, text, text, text, text, text, text, timestamptz, timestamptz, boolean, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_insert_purchase(
  uuid, text, text, text, text, text, text, text, text, timestamptz, timestamptz, boolean, text, jsonb
) TO daynori_runtime;

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
  RETURN QUERY
  SELECT e.id, e.provider, e.event_type, e.payload, e.processing_status
  FROM app.billing_events e
  WHERE e.id = p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION app.billing_load_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_load_event(uuid) TO daynori_runtime;

CREATE OR REPLACE FUNCTION app.billing_find_event(p_provider text, p_message_id text)
RETURNS TABLE (id uuid, processing_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.processing_status
  FROM app.billing_events e
  WHERE e.provider = p_provider AND e.message_id = p_message_id;
END;
$$;

REVOKE ALL ON FUNCTION app.billing_find_event(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_find_event(text, text) TO daynori_runtime;

CREATE OR REPLACE FUNCTION app.billing_list_pending_events(p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id
  FROM app.billing_events e
  WHERE e.processing_status IN ('pending', 'failed')
     OR (e.processing_status = 'processing' AND e.lease_until < now())
  ORDER BY e.received_at ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
END;
$$;

REVOKE ALL ON FUNCTION app.billing_list_pending_events(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_list_pending_events(integer) TO daynori_runtime;
