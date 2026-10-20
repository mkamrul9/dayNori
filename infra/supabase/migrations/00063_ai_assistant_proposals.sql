-- 00063_ai_assistant_proposals.sql
-- Phase 56: assistant turns + durable reviewable proposals (provisional local).

CREATE TABLE IF NOT EXISTS app.ai_assistant_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
  consent_generation integer NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  abstained boolean NOT NULL DEFAULT false,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_mode text NOT NULL,
  draft_question text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_ai_assistant_turns_user
  ON app.ai_assistant_turns (user_id, created_at DESC);

ALTER TABLE app.ai_assistant_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_assistant_turns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_ai_assistant_turns_own ON app.ai_assistant_turns;
CREATE POLICY p_ai_assistant_turns_own ON app.ai_assistant_turns
  FOR ALL
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON app.ai_assistant_turns TO daynori_runtime;

CREATE TABLE IF NOT EXISTS app.ai_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN (
    'create_personal_task',
    'update_personal_task',
    'create_personal_note'
  )),
  payload jsonb NOT NULL,
  target_item_id uuid,
  expected_revision integer,
  consent_generation integer NOT NULL,
  confirmation_token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired', 'failed')),
  execution_receipt jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_proposals_user_status
  ON app.ai_proposals (user_id, status, created_at DESC);

ALTER TABLE app.ai_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_proposals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_ai_proposals_own ON app.ai_proposals;
CREATE POLICY p_ai_proposals_own ON app.ai_proposals
  FOR ALL
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON app.ai_proposals TO daynori_runtime;
