-- 00052_repair_room_quarantine_and_ownership.sql
-- Phase 51 repair: quarantine by reconciliation inventory (not display name);
-- serialize last-owner checks against the workspace row; bind invite accept to session actor.

-- 1) Shareability depends on authoritative inventory status, never the mutable name suffix.
CREATE OR REPLACE FUNCTION app.is_confirmed_shareable_room(p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  ws record;
  inv_status text;
BEGIN
  SELECT id, kind, status INTO ws FROM app.workspaces WHERE id = p_workspace_id;
  IF ws IS NULL THEN
    RETURN false;
  END IF;
  IF ws.kind <> 'room' THEN
    RETURN false;
  END IF;
  IF ws.status = 'archived' THEN
    RETURN false;
  END IF;

  -- Any inventoried legacy workspace stays non-shareable until confirm_room.
  SELECT status INTO inv_status
  FROM app.legacy_workspace_reconciliation_inventory
  WHERE workspace_id = p_workspace_id
  ORDER BY updated_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN inv_status = 'reconciled_confirmed_room';
  END IF;

  -- No inventory row: ordinary Phase 51+ room created through /v1/rooms.
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION app.is_confirmed_shareable_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_confirmed_shareable_room(uuid) TO daynori_runtime;

-- 2) Last-owner + canonical owner_id consistency under workspace row lock.
-- Concurrent ownership mutations serialize on app.workspaces FOR UPDATE.
-- Invariant: workspaces.owner_id must retain an owner membership; transfer must
-- update owner_id before demoting/removing the previous canonical owner.
CREATE OR REPLACE FUNCTION app.enforce_room_last_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  wid uuid;
  ws_kind text;
  ws_owner uuid;
  owner_count int;
BEGIN
  wid := COALESCE(OLD.workspace_id, NEW.workspace_id);

  SELECT kind, owner_id INTO ws_kind, ws_owner
  FROM app.workspaces
  WHERE id = wid
  FOR UPDATE;

  IF ws_kind IS DISTINCT FROM 'room' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' THEN
      SELECT count(*) INTO owner_count
      FROM app.workspace_memberships
      WHERE workspace_id = wid AND role = 'owner' AND user_id <> OLD.user_id;
      IF owner_count < 1 THEN
        RAISE EXCEPTION 'ROOM_LAST_OWNER: cannot remove the last owner of a room';
      END IF;
      IF OLD.user_id = ws_owner THEN
        RAISE EXCEPTION 'ROOM_LAST_OWNER: transfer ownership before removing the canonical owner membership';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner' THEN
    SELECT count(*) INTO owner_count
    FROM app.workspace_memberships
    WHERE workspace_id = wid AND role = 'owner' AND user_id <> NEW.user_id;
    IF owner_count < 1 THEN
      RAISE EXCEPTION 'ROOM_LAST_OWNER: cannot demote the last owner of a room';
    END IF;
    IF NEW.user_id = ws_owner THEN
      RAISE EXCEPTION 'ROOM_LAST_OWNER: transfer ownership before demoting the canonical owner';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_room_last_owner ON app.workspace_memberships;
CREATE TRIGGER trg_enforce_room_last_owner
BEFORE UPDATE OR DELETE ON app.workspace_memberships
FOR EACH ROW EXECUTE FUNCTION app.enforce_room_last_owner();

-- 3) Bind invitation acceptance to the authenticated session actor (GUC), ignore mismatched caller args.
CREATE OR REPLACE FUNCTION app.accept_room_invitation(
  p_token_hash text,
  p_acceptor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  inv app.room_invitations%ROWTYPE;
  existing_role text;
  session_actor uuid;
  acceptor uuid;
BEGIN
  session_actor := app.current_user_id();
  IF session_actor IS NULL THEN
    RAISE EXCEPTION 'ROOM_INVITE_INVALID';
  END IF;
  -- Prefer session actor; reject explicit mismatch if a different id is supplied.
  IF p_acceptor_id IS NOT NULL AND p_acceptor_id IS DISTINCT FROM session_actor THEN
    RAISE EXCEPTION 'ROOM_INVITE_INVALID';
  END IF;
  acceptor := session_actor;

  IF p_token_hash IS NULL OR length(p_token_hash) < 32 THEN
    RAISE EXCEPTION 'ROOM_INVITE_INVALID';
  END IF;

  SELECT * INTO inv
  FROM app.room_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVITE_INVALID';
  END IF;

  IF inv.status = 'accepted' AND inv.accepted_by = acceptor THEN
    SELECT role INTO existing_role
    FROM app.workspace_memberships
    WHERE workspace_id = inv.workspace_id AND user_id = acceptor;
    RETURN jsonb_build_object(
      'status', 'already_accepted',
      'workspaceId', inv.workspace_id,
      'role', COALESCE(existing_role, inv.role),
      'invitationId', inv.id
    );
  END IF;

  IF inv.status = 'revoked' THEN
    RAISE EXCEPTION 'ROOM_INVITE_REVOKED';
  END IF;
  IF inv.status = 'accepted' THEN
    RAISE EXCEPTION 'ROOM_INVITE_USED';
  END IF;
  IF inv.status <> 'pending' OR inv.expires_at <= now() THEN
    UPDATE app.room_invitations SET status = 'expired', updated_at = now()
    WHERE id = inv.id AND status = 'pending';
    RAISE EXCEPTION 'ROOM_INVITE_EXPIRED';
  END IF;

  IF NOT app.is_confirmed_shareable_room(inv.workspace_id) THEN
    RAISE EXCEPTION 'ROOM_INVITE_UNAVAILABLE';
  END IF;

  IF inv.recipient_user_id IS NOT NULL AND inv.recipient_user_id <> acceptor THEN
    RAISE EXCEPTION 'ROOM_INVITE_RECIPIENT_MISMATCH';
  END IF;

  -- Removed prior recipient who lost membership cannot reuse a consumed invite (status already accepted).
  SELECT role INTO existing_role
  FROM app.workspace_memberships
  WHERE workspace_id = inv.workspace_id AND user_id = acceptor;

  IF existing_role IS NOT NULL THEN
    UPDATE app.room_invitations SET
      status = 'accepted',
      accepted_by = acceptor,
      accepted_at = now(),
      updated_at = now()
    WHERE id = inv.id;
    RETURN jsonb_build_object(
      'status', 'already_member',
      'workspaceId', inv.workspace_id,
      'role', existing_role,
      'invitationId', inv.id
    );
  END IF;

  INSERT INTO app.workspace_memberships (workspace_id, user_id, role, revision)
  VALUES (inv.workspace_id, acceptor, inv.role, 1);

  UPDATE app.room_invitations SET
    status = 'accepted',
    accepted_by = acceptor,
    accepted_at = now(),
    updated_at = now()
  WHERE id = inv.id;

  UPDATE app.workspaces SET
    membership_revision = membership_revision + 1,
    updated_at = now()
  WHERE id = inv.workspace_id;

  INSERT INTO app.workspace_sync_state (workspace_id, next_change_seq, access_epoch)
  VALUES (inv.workspace_id, 1, gen_random_uuid()::text)
  ON CONFLICT (workspace_id) DO UPDATE
  SET access_epoch = gen_random_uuid()::text, updated_at = now();

  RETURN jsonb_build_object(
    'status', 'accepted',
    'workspaceId', inv.workspace_id,
    'role', inv.role,
    'invitationId', inv.id
  );
END;
$$;

REVOKE ALL ON FUNCTION app.accept_room_invitation(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.accept_room_invitation(text, uuid) TO daynori_runtime;
