-- 00050_room_invitations_and_lifecycle.sql
-- Phase 51: shared room invitations, lifecycle, last-owner invariants.
-- Legacy kind=room rows remain non-shareable until confirmed via reconcile_legacy_workspace.

-- Room lifecycle on workspaces (personal rows ignore these columns).
ALTER TABLE app.workspaces
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS membership_revision bigint NOT NULL DEFAULT 0;

-- Membership revision for versioned role changes (client must not trust stale roles).
ALTER TABLE app.workspace_memberships
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS app.room_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES app.profiles(id) ON DELETE RESTRICT,
    role text NOT NULL CHECK (role IN ('editor', 'viewer')),
    token_hash text NOT NULL,
    token_prefix text NOT NULL,
    status text NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    expires_at timestamptz NOT NULL,
    -- Bearer-link policy: null recipient_user_id means any authenticated acceptor.
    -- Targeted: recipient_user_id must match accepting actor.
    recipient_user_id uuid REFERENCES app.profiles(id) ON DELETE CASCADE,
    recipient_email text,
    accepted_by uuid REFERENCES app.profiles(id) ON DELETE SET NULL,
    accepted_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_room_invitations_workspace_status
  ON app.room_invitations(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_room_invitations_expires
  ON app.room_invitations(expires_at)
  WHERE status = 'pending';

ALTER TABLE app.room_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.room_invitations FORCE ROW LEVEL SECURITY;

-- Members can see invitation metadata for their rooms (never the raw token).
DROP POLICY IF EXISTS room_invitations_select ON app.room_invitations;
CREATE POLICY room_invitations_select ON app.room_invitations
  FOR SELECT
  USING (app.user_has_workspace_role(workspace_id, 'viewer'));

-- Only owners create/revoke invitations (mutations also gated in API).
DROP POLICY IF EXISTS room_invitations_insert ON app.room_invitations;
CREATE POLICY room_invitations_insert ON app.room_invitations
  FOR INSERT
  WITH CHECK (app.user_has_workspace_role(workspace_id, 'owner'));

DROP POLICY IF EXISTS room_invitations_update ON app.room_invitations;
CREATE POLICY room_invitations_update ON app.room_invitations
  FOR UPDATE
  USING (app.user_has_workspace_role(workspace_id, 'owner'))
  WITH CHECK (app.user_has_workspace_role(workspace_id, 'owner'));

GRANT SELECT, INSERT, UPDATE ON app.room_invitations TO daynori_runtime;

-- Quarantine: unconfirmed legacy rooms cannot issue invitations or accept members via invites.
CREATE OR REPLACE FUNCTION app.is_confirmed_shareable_room(p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  ws record;
BEGIN
  SELECT id, kind, name, status INTO ws FROM app.workspaces WHERE id = p_workspace_id;
  IF ws IS NULL THEN
    RETURN false;
  END IF;
  IF ws.kind <> 'room' THEN
    RETURN false;
  END IF;
  IF ws.status = 'archived' THEN
    RETURN false;
  END IF;
  -- Legacy quarantine: name suffix from migration 00008 until confirm_room.
  IF ws.name LIKE '% (Legacy Room)' THEN
    IF NOT EXISTS (
      SELECT 1 FROM app.legacy_workspace_reconciliation_inventory inv
      WHERE inv.workspace_id = p_workspace_id
        AND inv.status = 'reconciled_confirmed_room'
    ) THEN
      RETURN false;
    END IF;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION app.is_confirmed_shareable_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_confirmed_shareable_room(uuid) TO daynori_runtime;

-- Last-owner invariant for rooms (personal already owner-only).
CREATE OR REPLACE FUNCTION app.enforce_room_last_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  ws_kind text;
  owner_count int;
BEGIN
  SELECT kind INTO ws_kind FROM app.workspaces WHERE id = COALESCE(OLD.workspace_id, NEW.workspace_id);
  IF ws_kind IS DISTINCT FROM 'room' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' THEN
      SELECT count(*) INTO owner_count
      FROM app.workspace_memberships
      WHERE workspace_id = OLD.workspace_id AND role = 'owner' AND user_id <> OLD.user_id;
      IF owner_count < 1 THEN
        RAISE EXCEPTION 'ROOM_LAST_OWNER: cannot remove the last owner of a room';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner' THEN
    SELECT count(*) INTO owner_count
    FROM app.workspace_memberships
    WHERE workspace_id = NEW.workspace_id AND role = 'owner' AND user_id <> NEW.user_id;
    IF owner_count < 1 THEN
      RAISE EXCEPTION 'ROOM_LAST_OWNER: cannot demote the last owner of a room';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_room_last_owner ON app.workspace_memberships;
CREATE TRIGGER trg_enforce_room_last_owner
BEFORE UPDATE OR DELETE ON app.workspace_memberships
FOR EACH ROW EXECUTE FUNCTION app.enforce_room_last_owner();

-- Allow room members to leave themselves (owners still blocked by last-owner trigger).
DROP POLICY IF EXISTS memberships_delete ON app.workspace_memberships;
CREATE POLICY memberships_delete ON app.workspace_memberships
  FOR DELETE
  USING (
    app.user_has_workspace_role(workspace_id, 'owner')
    OR (
      user_id = app.current_user_id()
      AND EXISTS (
        SELECT 1 FROM app.workspaces w
        WHERE w.id = workspace_id AND w.kind = 'room'
      )
    )
  );

-- Atomic invitation acceptance (does not trust client role / actor beyond session GUC).
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
  result jsonb;
BEGIN
  IF p_token_hash IS NULL OR length(p_token_hash) < 32 OR p_acceptor_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_INVITE_INVALID';
  END IF;

  SELECT * INTO inv
  FROM app.room_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVITE_INVALID';
  END IF;

  -- Idempotent: same acceptor already accepted this invite.
  IF inv.status = 'accepted' AND inv.accepted_by = p_acceptor_id THEN
    SELECT role INTO existing_role
    FROM app.workspace_memberships
    WHERE workspace_id = inv.workspace_id AND user_id = p_acceptor_id;
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

  IF inv.recipient_user_id IS NOT NULL AND inv.recipient_user_id <> p_acceptor_id THEN
    RAISE EXCEPTION 'ROOM_INVITE_RECIPIENT_MISMATCH';
  END IF;

  -- Already a member (different path): do not consume for a second role upgrade via invite.
  SELECT role INTO existing_role
  FROM app.workspace_memberships
  WHERE workspace_id = inv.workspace_id AND user_id = p_acceptor_id;

  IF existing_role IS NOT NULL THEN
    UPDATE app.room_invitations SET
      status = 'accepted',
      accepted_by = p_acceptor_id,
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
  VALUES (inv.workspace_id, p_acceptor_id, inv.role, 1);

  UPDATE app.room_invitations SET
    status = 'accepted',
    accepted_by = p_acceptor_id,
    accepted_at = now(),
    updated_at = now()
  WHERE id = inv.id;

  UPDATE app.workspaces SET
    membership_revision = membership_revision + 1,
    updated_at = now()
  WHERE id = inv.workspace_id;

  UPDATE app.workspace_sync_state
  SET access_epoch = gen_random_uuid()::text, updated_at = now()
  WHERE workspace_id = inv.workspace_id;

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

-- Bump membership_revision on membership mutations for rooms.
CREATE OR REPLACE FUNCTION app.bump_room_membership_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  wid uuid;
BEGIN
  wid := COALESCE(NEW.workspace_id, OLD.workspace_id);
  IF EXISTS (SELECT 1 FROM app.workspaces WHERE id = wid AND kind = 'room') THEN
    UPDATE app.workspaces
    SET membership_revision = membership_revision + 1, updated_at = now()
    WHERE id = wid;
    IF TG_OP = 'UPDATE' AND NEW IS NOT NULL THEN
      NEW.revision := OLD.revision + 1;
      NEW.updated_at := now();
      RETURN NEW;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_room_membership_revision ON app.workspace_memberships;
CREATE TRIGGER trg_bump_room_membership_revision
BEFORE UPDATE ON app.workspace_memberships
FOR EACH ROW EXECUTE FUNCTION app.bump_room_membership_revision();

CREATE OR REPLACE FUNCTION app.bump_room_membership_revision_after_ins_del()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  wid uuid;
BEGIN
  wid := COALESCE(NEW.workspace_id, OLD.workspace_id);
  IF EXISTS (SELECT 1 FROM app.workspaces WHERE id = wid AND kind = 'room') THEN
    UPDATE app.workspaces
    SET membership_revision = membership_revision + 1, updated_at = now()
    WHERE id = wid;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_room_membership_revision_ins_del ON app.workspace_memberships;
CREATE TRIGGER trg_bump_room_membership_revision_ins_del
AFTER INSERT OR DELETE ON app.workspace_memberships
FOR EACH ROW EXECUTE FUNCTION app.bump_room_membership_revision_after_ins_del();
