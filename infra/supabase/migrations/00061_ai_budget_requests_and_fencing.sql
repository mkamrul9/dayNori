-- 00061_ai_budget_requests_and_fencing.sql
-- Phase 55 repair: durable per-request budget identity; settlement outside provider I/O.
-- Ordinary runtime users cannot raise budget_limit (server-controlled).

CREATE TABLE IF NOT EXISTS app.ai_budget_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  window_start date NOT NULL,
  reserved_tokens integer NOT NULL CHECK (reserved_tokens > 0),
  settled_tokens integer,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'settled', 'cancelled', 'unknown_usage')),
  consent_generation integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  CONSTRAINT ai_budget_request_settle_consistent CHECK (
    (status = 'reserved' AND settled_tokens IS NULL AND settled_at IS NULL)
    OR (status <> 'reserved' AND settled_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_budget_requests_user_window
  ON app.ai_budget_requests (user_id, window_start, status);

ALTER TABLE app.ai_budget_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_budget_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ai_budget_requests_own ON app.ai_budget_requests;
CREATE POLICY p_ai_budget_requests_own ON app.ai_budget_requests
  FOR ALL
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

GRANT SELECT, INSERT, UPDATE ON app.ai_budget_requests TO daynori_runtime;

-- Create reservation with durable request id. budget_limit is server-supplied only.
CREATE OR REPLACE FUNCTION app.ai_create_reservation(
  p_user uuid,
  p_tokens integer,
  p_consent_generation integer,
  p_limit integer DEFAULT 50000
)
RETURNS TABLE (ok boolean, request_id uuid, reserved integer, spent integer, budget_limit integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', now())::date;
  v_row app.ai_budget_windows%ROWTYPE;
  v_id uuid := gen_random_uuid();
BEGIN
  IF app.current_user_id() IS DISTINCT FROM p_user THEN
    RAISE EXCEPTION 'AI_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_tokens <= 0 OR p_consent_generation < 1 THEN
    RAISE EXCEPTION 'AI_BUDGET_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO app.ai_budget_windows (user_id, window_start, budget_limit)
  VALUES (p_user, v_start, p_limit)
  ON CONFLICT (user_id, window_start) DO NOTHING;

  SELECT * INTO v_row FROM app.ai_budget_windows
  WHERE user_id = p_user AND window_start = v_start
  FOR UPDATE;

  -- Server-controlled limit: never raise via client-supplied p_limit after create.
  IF v_row.spent_tokens + v_row.reserved_tokens + p_tokens > v_row.budget_limit THEN
    RETURN QUERY SELECT false, NULL::uuid, v_row.reserved_tokens, v_row.spent_tokens, v_row.budget_limit;
    RETURN;
  END IF;

  UPDATE app.ai_budget_windows
  SET reserved_tokens = reserved_tokens + p_tokens
  WHERE user_id = p_user AND window_start = v_start
  RETURNING * INTO v_row;

  INSERT INTO app.ai_budget_requests (
    id, user_id, window_start, reserved_tokens, status, consent_generation
  ) VALUES (v_id, p_user, v_start, p_tokens, 'reserved', p_consent_generation);

  RETURN QUERY SELECT true, v_id, v_row.reserved_tokens, v_row.spent_tokens, v_row.budget_limit;
END;
$$;

REVOKE ALL ON FUNCTION app.ai_create_reservation(uuid, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ai_create_reservation(uuid, integer, integer, integer) TO daynori_runtime;

-- Idempotent settle: records actual usage (may exceed reservation); releases reserved tokens once.
CREATE OR REPLACE FUNCTION app.ai_settle_request(
  p_request uuid,
  p_actual integer,
  p_status text DEFAULT 'settled'
)
RETURNS TABLE (
  already_settled boolean,
  settled_tokens integer,
  reserved_tokens integer,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_req app.ai_budget_requests%ROWTYPE;
  v_actual integer;
  v_status text;
BEGIN
  IF p_status NOT IN ('settled', 'cancelled', 'unknown_usage') THEN
    RAISE EXCEPTION 'AI_SETTLE_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req FROM app.ai_budget_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF app.current_user_id() IS DISTINCT FROM v_req.user_id THEN
    RAISE EXCEPTION 'AI_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_req.status <> 'reserved' THEN
    RETURN QUERY SELECT true, COALESCE(v_req.settled_tokens, 0), v_req.reserved_tokens, v_req.status;
    RETURN;
  END IF;

  v_status := p_status;
  IF p_actual IS NULL THEN
    v_actual := v_req.reserved_tokens;
    v_status := 'unknown_usage';
  ELSE
    v_actual := GREATEST(0, p_actual);
  END IF;

  UPDATE app.ai_budget_windows
  SET reserved_tokens = GREATEST(0, reserved_tokens - v_req.reserved_tokens),
      spent_tokens = spent_tokens + v_actual
  WHERE user_id = v_req.user_id AND window_start = v_req.window_start;

  UPDATE app.ai_budget_requests
  SET settled_tokens = v_actual,
      status = v_status,
      settled_at = now()
  WHERE id = p_request
  RETURNING * INTO v_req;

  RETURN QUERY SELECT false, v_req.settled_tokens, v_req.reserved_tokens, v_req.status;
END;
$$;

REVOKE ALL ON FUNCTION app.ai_settle_request(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ai_settle_request(uuid, integer, text) TO daynori_runtime;

-- Keep legacy helpers for older call sites; settle still clips only the release of reserved.
CREATE OR REPLACE FUNCTION app.ai_settle_tokens(
  p_user uuid,
  p_reserved integer,
  p_actual integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', now())::date;
BEGIN
  IF app.current_user_id() IS DISTINCT FROM p_user THEN
    RAISE EXCEPTION 'AI_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  UPDATE app.ai_budget_windows
  SET reserved_tokens = GREATEST(0, reserved_tokens - GREATEST(0, p_reserved)),
      spent_tokens = spent_tokens + GREATEST(0, p_actual)
  WHERE user_id = p_user AND window_start = v_start;
END;
$$;
