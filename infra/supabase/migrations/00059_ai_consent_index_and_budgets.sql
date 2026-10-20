-- 00059_ai_consent_index_and_budgets.sql
-- Phase 55: AI consent, derived index chunks, per-user budgets (provisional local).

CREATE TABLE IF NOT EXISTS app.ai_consents (
  user_id uuid PRIMARY KEY REFERENCES app.profiles(id) ON DELETE CASCADE,
  consent_version text NOT NULL,
  provider_disclosure_version text NOT NULL,
  content_scope jsonb NOT NULL DEFAULT '{"notes":true,"tasks":true,"journal":false}'::jsonb,
  consent_generation integer NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT false,
  accepted_at timestamptz,
  disabled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.ai_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_consents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ai_consents_own ON app.ai_consents;
CREATE POLICY p_ai_consents_own ON app.ai_consents
  FOR ALL
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

GRANT SELECT, INSERT, UPDATE ON app.ai_consents TO daynori_runtime;

CREATE TABLE IF NOT EXISTS app.ai_index_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  source_item_id uuid NOT NULL,
  source_kind text NOT NULL,
  source_revision integer NOT NULL,
  consent_generation integer NOT NULL,
  chunk_index integer NOT NULL,
  content_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, source_item_id, chunk_index, consent_generation)
);

CREATE INDEX IF NOT EXISTS idx_ai_index_chunks_owner_ws
  ON app.ai_index_chunks (owner_user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_index_chunks_source
  ON app.ai_index_chunks (workspace_id, source_item_id);
CREATE INDEX IF NOT EXISTS idx_ai_index_chunks_fts
  ON app.ai_index_chunks USING gin (to_tsvector('simple', content_text));

ALTER TABLE app.ai_index_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_index_chunks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ai_index_chunks_own ON app.ai_index_chunks;
CREATE POLICY p_ai_index_chunks_own ON app.ai_index_chunks
  FOR ALL
  USING (owner_user_id = app.current_user_id())
  WITH CHECK (owner_user_id = app.current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON app.ai_index_chunks TO daynori_runtime;

CREATE TABLE IF NOT EXISTS app.ai_budget_windows (
  user_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  window_start date NOT NULL,
  reserved_tokens integer NOT NULL DEFAULT 0,
  spent_tokens integer NOT NULL DEFAULT 0,
  budget_limit integer NOT NULL DEFAULT 50000,
  PRIMARY KEY (user_id, window_start),
  CONSTRAINT ai_budget_nonneg CHECK (
    reserved_tokens >= 0 AND spent_tokens >= 0 AND budget_limit > 0
  )
);

ALTER TABLE app.ai_budget_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_budget_windows FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ai_budget_own ON app.ai_budget_windows;
CREATE POLICY p_ai_budget_own ON app.ai_budget_windows
  FOR ALL
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

GRANT SELECT, INSERT, UPDATE ON app.ai_budget_windows TO daynori_runtime;

-- Atomic budget reservation (caller must be current_user).
CREATE OR REPLACE FUNCTION app.ai_reserve_tokens(p_user uuid, p_tokens integer, p_limit integer DEFAULT 50000)
RETURNS TABLE (ok boolean, reserved integer, spent integer, budget_limit integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', now())::date;
  v_row app.ai_budget_windows%ROWTYPE;
BEGIN
  IF app.current_user_id() IS DISTINCT FROM p_user THEN
    RAISE EXCEPTION 'AI_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_tokens <= 0 THEN
    RAISE EXCEPTION 'AI_BUDGET_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO app.ai_budget_windows (user_id, window_start, budget_limit)
  VALUES (p_user, v_start, p_limit)
  ON CONFLICT (user_id, window_start) DO NOTHING;

  SELECT * INTO v_row FROM app.ai_budget_windows
  WHERE user_id = p_user AND window_start = v_start
  FOR UPDATE;

  IF v_row.spent_tokens + v_row.reserved_tokens + p_tokens > v_row.budget_limit THEN
    RETURN QUERY SELECT false, v_row.reserved_tokens, v_row.spent_tokens, v_row.budget_limit;
    RETURN;
  END IF;

  UPDATE app.ai_budget_windows
  SET reserved_tokens = reserved_tokens + p_tokens
  WHERE user_id = p_user AND window_start = v_start
  RETURNING * INTO v_row;

  RETURN QUERY SELECT true, v_row.reserved_tokens, v_row.spent_tokens, v_row.budget_limit;
END;
$$;

REVOKE ALL ON FUNCTION app.ai_reserve_tokens(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ai_reserve_tokens(uuid, integer, integer) TO daynori_runtime;

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
      spent_tokens = spent_tokens + GREATEST(0, LEAST(p_actual, p_reserved))
  WHERE user_id = p_user AND window_start = v_start;
END;
$$;

REVOKE ALL ON FUNCTION app.ai_settle_tokens(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ai_settle_tokens(uuid, integer, integer) TO daynori_runtime;

CREATE OR REPLACE FUNCTION app.ai_purge_derived_for_user(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF app.current_user_id() IS DISTINCT FROM p_user THEN
    RAISE EXCEPTION 'AI_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  DELETE FROM app.ai_index_chunks WHERE owner_user_id = p_user;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION app.ai_purge_derived_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ai_purge_derived_for_user(uuid) TO daynori_runtime;
