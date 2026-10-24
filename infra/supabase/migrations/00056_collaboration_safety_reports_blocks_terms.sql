-- 00056_collaboration_safety_reports_blocks_terms.sql
-- Phase 54: UGC reports, user blocks, terms acceptance, moderation audit (provisional local).

-- Terms acceptance (versioned; required before shared UGC contribution).
CREATE TABLE IF NOT EXISTS app.ugc_terms_acceptances (
  user_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  policy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, policy_version)
);

ALTER TABLE app.ugc_terms_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ugc_terms_acceptances FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ugc_terms_own ON app.ugc_terms_acceptances;
CREATE POLICY p_ugc_terms_own ON app.ugc_terms_acceptances
  FOR ALL
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

GRANT SELECT, INSERT, UPDATE ON app.ugc_terms_acceptances TO daynori_runtime;

-- User blocks (symmetric invite restriction; hide is client-side for blocker).
CREATE TABLE IF NOT EXISTS app.user_blocks (
  blocker_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON app.user_blocks (blocked_id);

ALTER TABLE app.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_blocks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_user_blocks_own ON app.user_blocks;
CREATE POLICY p_user_blocks_own ON app.user_blocks
  FOR ALL
  USING (blocker_id = app.current_user_id())
  WITH CHECK (blocker_id = app.current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON app.user_blocks TO daynori_runtime;

-- Reports: evidence snapshot frozen at submission; later edit/delete does not rewrite it.
CREATE TABLE IF NOT EXISTS app.ugc_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  client_report_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('message', 'user')),
  room_id uuid REFERENCES app.workspaces(id) ON DELETE SET NULL,
  message_id uuid,
  reported_user_id uuid REFERENCES app.profiles(id) ON DELETE SET NULL,
  category text NOT NULL,
  explanation text,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'triaged', 'actioned', 'dismissed', 'duplicate')),
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, client_report_id)
);

CREATE INDEX IF NOT EXISTS idx_ugc_reports_reporter_created
  ON app.ugc_reports (reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ugc_reports_status_created
  ON app.ugc_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ugc_reports_room
  ON app.ugc_reports (room_id) WHERE room_id IS NOT NULL;

ALTER TABLE app.ugc_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ugc_reports FORCE ROW LEVEL SECURITY;

-- Reporters may insert/select their own receipts only (no other reporters' rows).
DROP POLICY IF EXISTS p_ugc_reports_reporter ON app.ugc_reports;
CREATE POLICY p_ugc_reports_reporter ON app.ugc_reports
  FOR SELECT
  USING (reporter_id = app.current_user_id());

DROP POLICY IF EXISTS p_ugc_reports_insert ON app.ugc_reports;
CREATE POLICY p_ugc_reports_insert ON app.ugc_reports
  FOR INSERT
  WITH CHECK (reporter_id = app.current_user_id());

-- No general UPDATE/DELETE for runtime users; platform moderation uses SECURITY DEFINER.
GRANT SELECT, INSERT ON app.ugc_reports TO daynori_runtime;

-- Platform moderation audit (sensitive; not general workspace audit_events).
CREATE TABLE IF NOT EXISTS app.moderation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('platform', 'room')),
  room_id uuid REFERENCES app.workspaces(id) ON DELETE SET NULL,
  action text NOT NULL,
  reason text,
  target_type text NOT NULL,
  target_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_created
  ON app.moderation_audit (created_at DESC);

ALTER TABLE app.moderation_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.moderation_audit FORCE ROW LEVEL SECURITY;

-- No direct SELECT for ordinary users (deny-by-default via FORCE RLS with no policy).
-- Inserts go through SECURITY DEFINER helpers.
GRANT INSERT ON app.moderation_audit TO daynori_runtime;

CREATE OR REPLACE FUNCTION app.get_invitation_creator_by_token_hash(p_hash text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT created_by FROM app.room_invitations WHERE token_hash = p_hash LIMIT 1;
$$;

REVOKE ALL ON FUNCTION app.get_invitation_creator_by_token_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_invitation_creator_by_token_hash(text) TO daynori_runtime;

CREATE OR REPLACE FUNCTION app.are_users_blocked(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.user_blocks
    WHERE (blocker_id = p_a AND blocked_id = p_b)
       OR (blocker_id = p_b AND blocked_id = p_a)
  );
$$;

REVOKE ALL ON FUNCTION app.are_users_blocked(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.are_users_blocked(uuid, uuid) TO daynori_runtime;

CREATE OR REPLACE FUNCTION app.record_moderation_audit(
  p_actor uuid,
  p_scope text,
  p_room_id uuid,
  p_action text,
  p_reason text,
  p_target_type text,
  p_target_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO app.moderation_audit (
    actor_id, scope, room_id, action, reason, target_type, target_id
  ) VALUES (
    p_actor, p_scope, p_room_id, p_action, p_reason, p_target_type, p_target_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION app.record_moderation_audit(uuid, text, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_moderation_audit(uuid, text, uuid, text, text, text, text) TO daynori_runtime;

-- Platform moderator helpers: list/update reports. Authorization is enforced in API
-- (DAYNORI_PLATFORM_MODERATOR_IDS); these bypass RLS for the authorized actor path.
CREATE OR REPLACE FUNCTION app.list_ugc_reports_for_moderation(p_limit integer DEFAULT 50)
RETURNS SETOF app.ugc_reports
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT * FROM app.ugc_reports
  ORDER BY created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;

REVOKE ALL ON FUNCTION app.list_ugc_reports_for_moderation(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_ugc_reports_for_moderation(integer) TO daynori_runtime;

CREATE OR REPLACE FUNCTION app.update_ugc_report_status(
  p_report_id uuid,
  p_status text
)
RETURNS app.ugc_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_row app.ugc_reports;
BEGIN
  UPDATE app.ugc_reports
  SET status = p_status, updated_at = now()
  WHERE id = p_report_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION app.update_ugc_report_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.update_ugc_report_status(uuid, text) TO daynori_runtime;
