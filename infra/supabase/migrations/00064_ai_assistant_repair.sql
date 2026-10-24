-- 00064_ai_assistant_repair.sql
-- Phase 56 repair: proposal operation identity, review summary, expired cleanup.

ALTER TABLE app.ai_proposals
  ADD COLUMN IF NOT EXISTS operation_id uuid,
  ADD COLUMN IF NOT EXISTS request_hash text,
  ADD COLUMN IF NOT EXISTS review_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE app.ai_proposals
SET operation_id = COALESCE(operation_id, gen_random_uuid()),
    request_hash = COALESCE(
      NULLIF(request_hash, ''),
      encode(sha256(convert_to(id::text || '|' || operation, 'UTF8')), 'hex')
    )
WHERE operation_id IS NULL OR request_hash IS NULL OR request_hash = '';

ALTER TABLE app.ai_proposals
  ALTER COLUMN operation_id SET NOT NULL,
  ALTER COLUMN request_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_proposals_operation_id
  ON app.ai_proposals (operation_id);

-- Physical deletion of expired assistant rows (history filtering alone is insufficient).
CREATE OR REPLACE FUNCTION app.ai_cleanup_expired_assistant_data(p_user_id uuid DEFAULT NULL)
RETURNS TABLE(deleted_turns integer, deleted_proposals integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_turns integer;
  v_proposals integer;
BEGIN
  DELETE FROM app.ai_assistant_turns
  WHERE expires_at <= now()
    AND (p_user_id IS NULL OR user_id = p_user_id);
  GET DIAGNOSTICS v_turns = ROW_COUNT;

  DELETE FROM app.ai_proposals
  WHERE (
      expires_at <= now()
      OR (status IN ('cancelled', 'failed', 'expired', 'confirmed') AND created_at < now() - interval '30 days')
    )
    AND (p_user_id IS NULL OR user_id = p_user_id);
  GET DIAGNOSTICS v_proposals = ROW_COUNT;

  deleted_turns := v_turns;
  deleted_proposals := v_proposals;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION app.ai_cleanup_expired_assistant_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ai_cleanup_expired_assistant_data(uuid) TO daynori_runtime;
