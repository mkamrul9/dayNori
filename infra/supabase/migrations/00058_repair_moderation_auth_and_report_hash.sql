-- 00058_repair_moderation_auth_and_report_hash.sql
-- Phase 54 repair: DB-enforced platform moderator membership, immutable report hash,
-- self-service safety audit vs platform moderation paths.

-- Protected moderator membership (ordinary runtime cannot INSERT/UPDATE/DELETE).
CREATE TABLE IF NOT EXISTS app.platform_moderators (
  user_id uuid PRIMARY KEY REFERENCES app.profiles(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note text
);

ALTER TABLE app.platform_moderators ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.platform_moderators FORCE ROW LEVEL SECURITY;

-- No policies for daynori_runtime → deny-by-default under FORCE RLS.
-- Admin/migration role (table owner) manages membership outside RLS bypass rules for owners.
REVOKE ALL ON TABLE app.platform_moderators FROM PUBLIC;
REVOKE ALL ON TABLE app.platform_moderators FROM daynori_runtime;

CREATE OR REPLACE FUNCTION app.is_platform_moderator(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.platform_moderators WHERE user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION app.is_platform_moderator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_platform_moderator(uuid) TO daynori_runtime;

-- Immutable request identity for report idempotency.
ALTER TABLE app.ugc_reports
  ADD COLUMN IF NOT EXISTS original_request_hash text;

UPDATE app.ugc_reports
SET original_request_hash = encode(
  sha256(
    convert_to(
      coalesce(target_type, '') || '|' ||
      coalesce(room_id::text, '') || '|' ||
      coalesce(message_id::text, '') || '|' ||
      coalesce(reported_user_id::text, '') || '|' ||
      coalesce(category, '') || '|' ||
      coalesce(explanation, ''),
      'UTF8'
    )
  ),
  'hex'
)
WHERE original_request_hash IS NULL;

ALTER TABLE app.ugc_reports
  ALTER COLUMN original_request_hash SET NOT NULL;

-- Disposition recorded when status becomes actioned.
ALTER TABLE app.ugc_reports
  ADD COLUMN IF NOT EXISTS disposition text;

ALTER TABLE app.ugc_reports
  DROP CONSTRAINT IF EXISTS ugc_reports_disposition_check;
ALTER TABLE app.ugc_reports
  ADD CONSTRAINT ugc_reports_disposition_check
  CHECK (
    disposition IS NULL
    OR disposition IN (
      'content_removed',
      'user_warned',
      'user_restricted',
      'no_violation',
      'escalated',
      'other'
    )
  );

-- Self-service safety audit: only current_user may attribute actions to themselves.
CREATE OR REPLACE FUNCTION app.record_self_safety_audit(
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
  v_actor uuid := app.current_user_id();
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'SAFETY_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('user.blocked', 'user.unblocked') THEN
    RAISE EXCEPTION 'SAFETY_ACTION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  INSERT INTO app.moderation_audit (
    actor_id, scope, room_id, action, reason, target_type, target_id
  ) VALUES (
    v_actor, 'platform', NULL, p_action, p_reason, p_target_type, p_target_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION app.record_self_safety_audit(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_self_safety_audit(text, text, text, text) TO daynori_runtime;

-- Replace unrestricted platform helpers with membership-checked versions.
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
  v_caller uuid := app.current_user_id();
  v_id uuid;
BEGIN
  IF v_caller IS NULL OR NOT app.is_platform_moderator(v_caller) THEN
    RAISE EXCEPTION 'MODERATION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  -- Bind audit actor to authenticated caller; ignore forged p_actor.
  INSERT INTO app.moderation_audit (
    actor_id, scope, room_id, action, reason, target_type, target_id
  ) VALUES (
    v_caller, p_scope, p_room_id, p_action, p_reason, p_target_type, p_target_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.list_ugc_reports_for_moderation(p_limit integer DEFAULT 50)
RETURNS SETOF app.ugc_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_caller uuid := app.current_user_id();
BEGIN
  IF v_caller IS NULL OR NOT app.is_platform_moderator(v_caller) THEN
    RAISE EXCEPTION 'MODERATION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT * FROM app.ugc_reports
  ORDER BY created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$$;

CREATE OR REPLACE FUNCTION app.update_ugc_report_status(
  p_report_id uuid,
  p_status text,
  p_disposition text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS app.ugc_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_caller uuid := app.current_user_id();
  v_row app.ugc_reports;
  v_prev text;
BEGIN
  IF v_caller IS NULL OR NOT app.is_platform_moderator(v_caller) THEN
    RAISE EXCEPTION 'MODERATION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_prev FROM app.ugc_reports WHERE id = p_report_id FOR UPDATE;
  IF v_prev IS NULL THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Allowed transitions (received → triaged → actioned|dismissed|duplicate; triaged similarly).
  IF NOT (
    (v_prev = 'received' AND p_status IN ('triaged', 'dismissed', 'duplicate', 'actioned'))
    OR (v_prev = 'triaged' AND p_status IN ('actioned', 'dismissed', 'duplicate'))
    OR (v_prev = p_status)
  ) THEN
    RAISE EXCEPTION 'REPORT_STATUS_TRANSITION_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_status = 'actioned' THEN
    IF p_disposition IS NULL OR length(trim(p_disposition)) = 0 THEN
      RAISE EXCEPTION 'REPORT_DISPOSITION_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
      RAISE EXCEPTION 'REPORT_REASON_REQUIRED' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE app.ugc_reports
  SET status = p_status,
      disposition = CASE WHEN p_status = 'actioned' THEN p_disposition ELSE disposition END,
      updated_at = now()
  WHERE id = p_report_id
  RETURNING * INTO v_row;

  INSERT INTO app.moderation_audit (
    actor_id, scope, room_id, action, reason, target_type, target_id
  ) VALUES (
    v_caller,
    'platform',
    v_row.room_id,
    'report.status.' || p_status,
    p_reason,
    'report',
    p_report_id::text
  );

  RETURN v_row;
END;
$$;

-- Drop old 2-arg signature if present so callers use the authorized 4-arg form.
DROP FUNCTION IF EXISTS app.update_ugc_report_status(uuid, text);

REVOKE ALL ON FUNCTION app.update_ugc_report_status(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.update_ugc_report_status(uuid, text, text, text) TO daynori_runtime;

-- Advisory-friendly reporter lock helper for concurrent report/rate limits.
CREATE OR REPLACE FUNCTION app.lock_reporter_rate_bucket(p_reporter uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  IF app.current_user_id() IS DISTINCT FROM p_reporter THEN
    RAISE EXCEPTION 'SAFETY_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_reporter::text || ':ugc_report'));
END;
$$;

REVOKE ALL ON FUNCTION app.lock_reporter_rate_bucket(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_reporter_rate_bucket(uuid) TO daynori_runtime;

CREATE OR REPLACE FUNCTION app.lock_invite_create_rate_bucket(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  IF app.current_user_id() IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'SAFETY_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_actor::text || ':room_invite'));
END;
$$;

REVOKE ALL ON FUNCTION app.lock_invite_create_rate_bucket(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_invite_create_rate_bucket(uuid) TO daynori_runtime;

-- Ensure report read/insert remains available after repair migrations.
GRANT SELECT, INSERT ON app.ugc_reports TO daynori_runtime;
