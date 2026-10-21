-- 00065_billing_entitlements.sql
-- Phase 57: server-authoritative entitlements (provisional local; purchases gated off).

CREATE TABLE IF NOT EXISTS app.billing_products (
  product_id text PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('fake_play', 'google_play', 'web_unsupported')),
  plan_id text NOT NULL CHECK (plan_id IN ('free', 'plus_synthetic')),
  title text NOT NULL,
  description text NOT NULL,
  period text NOT NULL,
  synthetic_price_label text NOT NULL,
  storage_bytes bigint NOT NULL CHECK (storage_bytes > 0),
  ai_monthly_tokens integer NOT NULL CHECK (ai_monthly_tokens >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app.billing_products (
  product_id, provider, plan_id, title, description, period,
  synthetic_price_label, storage_bytes, ai_monthly_tokens
) VALUES (
  'daynori.plus.monthly.synthetic',
  'fake_play',
  'plus_synthetic',
  'Daynori Plus (synthetic)',
  'Labeled local fixture — not a store offer.',
  'P1M',
  'SYNTHETIC $0.00 / month (local fixture)',
  5368709120,
  500000
) ON CONFLICT (product_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS app.billing_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('fake_play', 'google_play')),
  product_id text NOT NULL REFERENCES app.billing_products(product_id),
  purchase_token_hash text NOT NULL,
  provider_purchase_token_prefix text NOT NULL,
  obfuscated_account_id text,
  order_id text,
  subscription_state text NOT NULL,
  acknowledgement_state text NOT NULL DEFAULT 'pending',
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  auto_renewing boolean NOT NULL DEFAULT true,
  linked_purchase_token_hash text,
  raw_verified_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, purchase_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_billing_purchases_user
  ON app.billing_purchases (user_id, valid_until DESC);

CREATE TABLE IF NOT EXISTS app.billing_entitlements (
  user_id uuid PRIMARY KEY REFERENCES app.profiles(id) ON DELETE CASCADE,
  plan_id text NOT NULL CHECK (plan_id IN ('free', 'plus_synthetic')),
  source_purchase_id uuid REFERENCES app.billing_purchases(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('active', 'grace', 'hold', 'expired', 'revoked')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  storage_bytes bigint NOT NULL,
  ai_monthly_tokens integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  message_id text NOT NULL,
  event_type text NOT NULL,
  purchase_token_hash text,
  payload jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'succeeded', 'failed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0,
  lease_until timestamptz,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, message_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_events_pending
  ON app.billing_events (processing_status, received_at)
  WHERE processing_status IN ('pending', 'failed');

-- RLS: ordinary runtime users may read own entitlement/purchase summaries; writes via SECURITY DEFINER.
ALTER TABLE app.billing_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.billing_products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_billing_products_read ON app.billing_products;
CREATE POLICY p_billing_products_read ON app.billing_products
  FOR SELECT TO daynori_runtime USING (active = true);
GRANT SELECT ON app.billing_products TO daynori_runtime;

ALTER TABLE app.billing_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.billing_purchases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_billing_purchases_select ON app.billing_purchases;
CREATE POLICY p_billing_purchases_select ON app.billing_purchases
  FOR SELECT TO daynori_runtime
  USING (user_id = app.current_user_id());
-- No INSERT/UPDATE/DELETE grants to daynori_runtime — service role / SECURITY DEFINER only.
GRANT SELECT ON app.billing_purchases TO daynori_runtime;

ALTER TABLE app.billing_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.billing_entitlements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_billing_entitlements_select ON app.billing_entitlements;
CREATE POLICY p_billing_entitlements_select ON app.billing_entitlements
  FOR SELECT TO daynori_runtime
  USING (user_id = app.current_user_id());
GRANT SELECT ON app.billing_entitlements TO daynori_runtime;

ALTER TABLE app.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.billing_events FORCE ROW LEVEL SECURITY;
-- Events are operator/worker only — no ordinary user policies.
REVOKE ALL ON app.billing_events FROM daynori_runtime;

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

  -- Apply storage quota without deleting existing content.
  UPDATE app.workspace_storage_usage u
  SET max_storage_bytes = p_storage_bytes, updated_at = now()
  FROM app.workspaces w
  WHERE w.id = u.workspace_id
    AND w.owner_id = p_user_id
    AND w.kind = 'personal';
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
BEGIN
  INSERT INTO app.billing_purchases (
    user_id, provider, product_id, purchase_token_hash, provider_purchase_token_prefix,
    obfuscated_account_id, order_id, subscription_state, acknowledgement_state,
    valid_from, valid_until, auto_renewing, linked_purchase_token_hash, raw_verified_snapshot
  ) VALUES (
    p_user_id, p_provider, p_product_id, p_purchase_token_hash, p_token_prefix,
    p_obfuscated_account_id, p_order_id, p_subscription_state, p_acknowledgement_state,
    p_valid_from, p_valid_until, p_auto_renewing, p_linked_hash, p_snapshot
  )
  ON CONFLICT (provider, purchase_token_hash) DO UPDATE SET
    subscription_state = EXCLUDED.subscription_state,
    acknowledgement_state = EXCLUDED.acknowledgement_state,
    valid_from = EXCLUDED.valid_from,
    valid_until = EXCLUDED.valid_until,
    auto_renewing = EXCLUDED.auto_renewing,
    linked_purchase_token_hash = EXCLUDED.linked_purchase_token_hash,
    raw_verified_snapshot = EXCLUDED.raw_verified_snapshot,
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION app.billing_insert_purchase(
  uuid, text, text, text, text, text, text, text, text, timestamptz, timestamptz, boolean, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_insert_purchase(
  uuid, text, text, text, text, text, text, text, text, timestamptz, timestamptz, boolean, text, jsonb
) TO daynori_runtime;

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

REVOKE ALL ON FUNCTION app.billing_ingest_event(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_ingest_event(text, text, text, text, jsonb) TO daynori_runtime;

CREATE OR REPLACE FUNCTION app.billing_claim_event(p_event_id uuid, p_lease_seconds integer DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  UPDATE app.billing_events
  SET processing_status = 'processing',
      lease_until = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1
  WHERE id = p_event_id
    AND (
      processing_status IN ('pending', 'failed')
      OR (processing_status = 'processing' AND lease_until < now())
    );
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION app.billing_claim_event(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_claim_event(uuid, integer) TO daynori_runtime;

CREATE OR REPLACE FUNCTION app.billing_complete_event(
  p_event_id uuid,
  p_status text,
  p_error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  UPDATE app.billing_events
  SET processing_status = p_status,
      last_error = p_error,
      processed_at = CASE WHEN p_status = 'succeeded' THEN now() ELSE processed_at END,
      lease_until = NULL
  WHERE id = p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION app.billing_complete_event(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_complete_event(uuid, text, text) TO daynori_runtime;
