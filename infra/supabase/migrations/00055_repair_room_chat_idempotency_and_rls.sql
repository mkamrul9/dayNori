-- 00055_repair_room_chat_idempotency_and_rls.sql
-- Phase 53 repair: immutable send receipt hash, tighter write RLS, chat outbox lifecycle.

ALTER TABLE app.room_messages
  ADD COLUMN IF NOT EXISTS original_payload_hash text;

-- Backfill from current body for rows created before this repair (best-effort).
UPDATE app.room_messages
SET original_payload_hash = encode(sha256(convert_to(coalesce(body, '') || '|' || coalesce(attachment_file_id::text, ''), 'UTF8')), 'hex')
WHERE original_payload_hash IS NULL;

ALTER TABLE app.room_messages
  ALTER COLUMN original_payload_hash SET NOT NULL;

-- Chat publication outbox rows tracked separately from generic outbox_intents payload.
ALTER TABLE app.room_chat_events
  ADD COLUMN IF NOT EXISTS outbox_intent_id uuid REFERENCES app.outbox_intents(id) ON DELETE SET NULL;

-- Tighten message policies: viewers read; only editors/owners insert as themselves;
-- updates limited to author (or owner for moderated delete via API SECURITY path still uses runtime role).
DROP POLICY IF EXISTS p_room_messages_member ON app.room_messages;

DROP POLICY IF EXISTS p_room_messages_select ON app.room_messages;
CREATE POLICY p_room_messages_select ON app.room_messages
  FOR SELECT
  USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_room_messages_insert ON app.room_messages;
CREATE POLICY p_room_messages_insert ON app.room_messages
  FOR INSERT
  WITH CHECK (
    sender_id = app.current_user_id()
    AND app.user_has_workspace_role(workspace_id, 'editor')
  );

DROP POLICY IF EXISTS p_room_messages_update ON app.room_messages;
CREATE POLICY p_room_messages_update ON app.room_messages
  FOR UPDATE
  USING (
    app.user_has_workspace_role(workspace_id, 'viewer')
    AND (
      sender_id = app.current_user_id()
      OR app.user_has_workspace_role(workspace_id, 'owner')
    )
  )
  WITH CHECK (
    app.user_has_workspace_role(workspace_id, 'viewer')
    AND (
      sender_id = app.current_user_id()
      OR app.user_has_workspace_role(workspace_id, 'owner')
    )
  );

-- Events: members may select; only editors/owners insert/update publication markers.
DROP POLICY IF EXISTS p_room_chat_events_insert ON app.room_chat_events;
CREATE POLICY p_room_chat_events_insert ON app.room_chat_events
  FOR INSERT
  WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_room_chat_events_update ON app.room_chat_events;
CREATE POLICY p_room_chat_events_update ON app.room_chat_events
  FOR UPDATE
  USING (app.user_has_workspace_role(workspace_id, 'editor'));

-- Chat state allocator: editors/owners only (viewers must not bump orders).
DROP POLICY IF EXISTS p_room_chat_state_write ON app.room_chat_state;
CREATE POLICY p_room_chat_state_select ON app.room_chat_state
  FOR SELECT
  USING (app.user_has_workspace_role(workspace_id, 'viewer'));

CREATE POLICY p_room_chat_state_write ON app.room_chat_state
  FOR ALL
  USING (app.user_has_workspace_role(workspace_id, 'editor'))
  WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

-- Trusted recovery for unpublished chat events (runtime worker / API lifecycle).
CREATE OR REPLACE FUNCTION app.claim_unpublished_room_chat_events(p_limit integer DEFAULT 100)
RETURNS TABLE (
  event_id uuid,
  workspace_id uuid,
  server_order bigint,
  event_type text,
  message_id uuid,
  outbox_intent_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT e.id
    FROM app.room_chat_events e
    WHERE e.published_at IS NULL
    ORDER BY e.workspace_id, e.server_order
    LIMIT GREATEST(1, LEAST(p_limit, 500))
    FOR UPDATE SKIP LOCKED
  )
  SELECT e.id, e.workspace_id, e.server_order, e.event_type, e.message_id, e.outbox_intent_id
  FROM app.room_chat_events e
  JOIN claimed c ON c.id = e.id
  ORDER BY e.workspace_id, e.server_order;
END;
$$;

REVOKE ALL ON FUNCTION app.claim_unpublished_room_chat_events(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_unpublished_room_chat_events(integer) TO daynori_runtime;

CREATE OR REPLACE FUNCTION app.mark_room_chat_event_published(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_outbox uuid;
  v_workspace uuid;
  v_type text;
  v_message uuid;
  v_order bigint;
BEGIN
  UPDATE app.room_chat_events
  SET published_at = now()
  WHERE id = p_event_id AND published_at IS NULL
  RETURNING outbox_intent_id, workspace_id, event_type, message_id, server_order
  INTO v_outbox, v_workspace, v_type, v_message, v_order;

  IF v_outbox IS NOT NULL THEN
    UPDATE app.outbox_intents SET status = 'delivered' WHERE id = v_outbox AND status = 'pending';
  ELSIF v_workspace IS NOT NULL THEN
    UPDATE app.outbox_intents
    SET status = 'delivered'
    WHERE workspace_id = v_workspace
      AND event_type = v_type
      AND status = 'pending'
      AND payload->>'messageId' = v_message::text
      AND (payload->>'serverOrder')::bigint = v_order;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app.mark_room_chat_event_published(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.mark_room_chat_event_published(uuid) TO daynori_runtime;
