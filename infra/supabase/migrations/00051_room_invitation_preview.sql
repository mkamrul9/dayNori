-- 00051_room_invitation_preview.sql
-- Phase 51: allow invitation preview by token without prior membership.

CREATE OR REPLACE FUNCTION app.preview_room_invitation(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  inv app.room_invitations%ROWTYPE;
  room_name text;
  status text;
BEGIN
  IF p_token_hash IS NULL OR length(p_token_hash) < 32 THEN
    RETURN jsonb_build_object(
      'roomName', 'Unavailable',
      'role', 'viewer',
      'expiresAt', '1970-01-01T00:00:00.000Z',
      'status', 'unavailable',
      'deliveryPolicy', 'bearer_link'
    );
  END IF;

  SELECT * INTO inv FROM app.room_invitations WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'roomName', 'Unavailable',
      'role', 'viewer',
      'expiresAt', '1970-01-01T00:00:00.000Z',
      'status', 'unavailable',
      'deliveryPolicy', 'bearer_link'
    );
  END IF;

  SELECT name INTO room_name FROM app.workspaces WHERE id = inv.workspace_id;
  status := inv.status;
  IF status = 'pending' AND inv.expires_at <= now() THEN
    status := 'expired';
  END IF;
  IF NOT app.is_confirmed_shareable_room(inv.workspace_id) THEN
    status := 'unavailable';
  END IF;

  RETURN jsonb_build_object(
    'roomName', COALESCE(room_name, 'Unavailable'),
    'role', inv.role,
    'expiresAt', to_char(inv.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'status', status,
    'deliveryPolicy', CASE WHEN inv.recipient_user_id IS NULL THEN 'bearer_link' ELSE 'targeted_recipient' END
  );
END;
$$;

REVOKE ALL ON FUNCTION app.preview_room_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.preview_room_invitation(text) TO daynori_runtime;
