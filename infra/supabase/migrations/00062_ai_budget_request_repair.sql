-- 00062_ai_budget_request_repair.sql
-- Fix settle ambiguity + allow runtime DELETE of own budget request rows (test reset / cleanup).

GRANT SELECT, INSERT, UPDATE, DELETE ON app.ai_budget_requests TO daynori_runtime;

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
    RETURN QUERY SELECT
      true,
      COALESCE(v_req.settled_tokens, 0),
      v_req.reserved_tokens,
      v_req.status;
    RETURN;
  END IF;

  v_status := p_status;
  IF p_actual IS NULL THEN
    v_actual := v_req.reserved_tokens;
    v_status := 'unknown_usage';
  ELSE
    v_actual := GREATEST(0, p_actual);
  END IF;

  UPDATE app.ai_budget_windows w
  SET reserved_tokens = GREATEST(0, w.reserved_tokens - v_req.reserved_tokens),
      spent_tokens = w.spent_tokens + v_actual
  WHERE w.user_id = v_req.user_id AND w.window_start = v_req.window_start;

  UPDATE app.ai_budget_requests r
  SET settled_tokens = v_actual,
      status = v_status,
      settled_at = now()
  WHERE r.id = p_request
  RETURNING * INTO v_req;

  RETURN QUERY SELECT
    false,
    v_req.settled_tokens,
    v_req.reserved_tokens,
    v_req.status;
END;
$$;

REVOKE ALL ON FUNCTION app.ai_settle_request(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ai_settle_request(uuid, integer, text) TO daynori_runtime;
