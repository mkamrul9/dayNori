-- 00080_ai_transcriptions.sql
-- Phase 95: Voice capture, transcription tracking, and transient retention.

CREATE TABLE IF NOT EXISTS app.ai_transcriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  client_operation_id uuid,
  duration_seconds numeric(6, 2) NOT NULL CHECK (duration_seconds > 0 AND duration_seconds <= 600),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400), -- max 25 MiB
  mime_type text NOT NULL,
  transcript text NOT NULL,
  detected_language text NOT NULL DEFAULT 'en',
  confidence numeric(3, 2) NOT NULL DEFAULT 1.00 CHECK (confidence >= 0.00 AND confidence <= 1.00),
  words_count integer NOT NULL DEFAULT 0,
  cost_micro_usd integer NOT NULL DEFAULT 0 CHECK (cost_micro_usd >= 0),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed', 'cancelled')),
  error_code text,
  retention_policy text NOT NULL DEFAULT 'transient_deleted' CHECK (retention_policy IN ('transient_deleted', 'transient_purged')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour'
);

CREATE INDEX IF NOT EXISTS idx_ai_transcriptions_user_ws
  ON app.ai_transcriptions (user_id, workspace_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_transcriptions_client_op
  ON app.ai_transcriptions (user_id, workspace_id, client_operation_id)
  WHERE client_operation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_transcriptions_expiry
  ON app.ai_transcriptions (expires_at)
  WHERE status = 'completed';

ALTER TABLE app.ai_transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_transcriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ai_transcriptions_own ON app.ai_transcriptions;
CREATE POLICY p_ai_transcriptions_own ON app.ai_transcriptions
  FOR ALL
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON app.ai_transcriptions TO daynori_runtime;
