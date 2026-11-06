-- Phase 88: Moderation message takedown enforcement (RM-001)
-- Allows platform moderators to soft-delete offending messages and emit deletion events
-- via a SECURITY DEFINER function app.moderation_takedown_room_message.

CREATE OR REPLACE FUNCTION app.moderation_takedown_room_message(
  p_room_id uuid,
  p_message_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_caller uuid := app.current_user_id();
  v_next_order bigint;
  v_deleted int;
BEGIN
  IF v_caller IS NULL OR NOT app.is_platform_moderator(v_caller) THEN
    RAISE EXCEPTION 'MODERATION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  UPDATE app.room_messages
  SET deleted_at = now(), body = '', updated_at = now()
  WHERE id = p_message_id AND workspace_id = p_room_id AND deleted_at IS NULL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RETURN false;
  END IF;

  SELECT next_server_order INTO v_next_order
  FROM app.room_chat_state
  WHERE workspace_id = p_room_id
  FOR UPDATE;

  IF v_next_order IS NOT NULL THEN
    UPDATE app.room_chat_state
    SET next_server_order = next_server_order + 1
    WHERE workspace_id = p_room_id;

    INSERT INTO app.room_chat_events (workspace_id, server_order, event_type, message_id, payload)
    VALUES (p_room_id, v_next_order, 'room_message.deleted', p_message_id, '{}'::jsonb);
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION app.moderation_takedown_room_message(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.moderation_takedown_room_message(uuid, uuid) TO daynori_runtime;
