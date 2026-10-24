-- Migration: 00039_harden_privileged_lifecycle_authorization
-- Description: Closes authorization gaps in SECURITY DEFINER lifecycle procedures,
--              prevents general daynori_runtime from fabricating authorization records
--              (enforcing RLS on workspace_deletions and integrity triggers on public/account deletions),
--              and introduces beta invitation and enrollment state tables.

-- 1. Enable RLS on app.workspace_deletions and bind to authenticated user
ALTER TABLE app.workspace_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_deletions_user ON app.workspace_deletions;
CREATE POLICY workspace_deletions_user ON app.workspace_deletions
    FOR ALL TO daynori_runtime
    USING (requested_by = app.current_user_id())
    WITH CHECK (requested_by = app.current_user_id());

-- 2. Enforce initial insertion integrity on app.workspace_deletions
CREATE OR REPLACE FUNCTION app.check_workspace_deletion_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status != 'pending_confirmation' THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Initial workspace deletion requests must be pending_confirmation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_workspace_deletion_integrity ON app.workspace_deletions;
CREATE TRIGGER trg_check_workspace_deletion_integrity
BEFORE INSERT ON app.workspace_deletions
FOR EACH ROW
EXECUTE FUNCTION app.check_workspace_deletion_integrity();

-- 3. Enforce initial insertion integrity on app.account_deletions
CREATE OR REPLACE FUNCTION app.check_account_deletion_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status != 'pending_confirmation' THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Initial account deletion requests must be pending_confirmation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_account_deletion_integrity ON app.account_deletions;
CREATE TRIGGER trg_check_account_deletion_integrity
BEFORE INSERT ON app.account_deletions
FOR EACH ROW
EXECUTE FUNCTION app.check_account_deletion_integrity();

-- 4. Enforce submission and transition integrity on app.public_deletion_requests
CREATE OR REPLACE FUNCTION app.check_public_deletion_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status != 'pending_verification' OR NEW.target_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Initial public deletion requests must be pending_verification without target_user_id';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'pending_verification' AND NEW.status NOT IN ('pending_verification', 'processing', 'expired') THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Invalid status transition for public deletion request';
    END IF;
    IF NEW.target_user_id IS NOT NULL AND OLD.target_user_id IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM app.profiles WHERE id = NEW.target_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Target user ID does not exist in profiles';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_public_deletion_integrity ON app.public_deletion_requests;
CREATE TRIGGER trg_check_public_deletion_integrity
BEFORE INSERT OR UPDATE ON app.public_deletion_requests
FOR EACH ROW
EXECUTE FUNCTION app.check_public_deletion_integrity();

-- 5. Harden record_deletion_tombstone: strictly bind unauthenticated invocations
--    to the exact verified entity and active processing request (no broad OR clauses)
CREATE OR REPLACE FUNCTION app.record_deletion_tombstone(p_entity_type text, p_entity_id uuid, p_hash text, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_caller uuid := app.current_user_id();
  v_owner uuid;
BEGIN
  IF v_caller IS NOT NULL THEN
    IF p_entity_type = 'account' AND v_caller != p_entity_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Current user % cannot record tombstone for account %', v_caller, p_entity_id;
    ELSIF p_entity_type = 'workspace' THEN
      SELECT owner_id INTO v_owner FROM app.workspaces WHERE id = p_entity_id;
      IF v_owner IS NOT NULL AND v_caller != v_owner THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Current user % cannot record tombstone for workspace % owned by %', v_caller, p_entity_id, v_owner;
      END IF;
    END IF;
  ELSE
    -- Unauthenticated caller must have an active authorized deletion operation matching the exact entity
    IF p_entity_type = 'account' THEN
      IF NOT EXISTS (
        SELECT 1 FROM app.account_deletions WHERE user_id = p_entity_id AND status = 'processing'
      ) AND NOT EXISTS (
        SELECT 1 FROM app.public_deletion_requests WHERE target_user_id = p_entity_id AND status = 'processing'
      ) AND NOT EXISTS (
        SELECT 1 FROM app.public_deletion_requests WHERE id = p_entity_id AND status IN ('processing', 'verified')
      ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Recording account tombstone requires verified caller or active processing deletion request';
      END IF;
    ELSIF p_entity_type = 'workspace' THEN
      IF NOT EXISTS (
        SELECT 1 FROM app.workspace_deletions WHERE workspace_id = p_entity_id AND status = 'processing'
      ) AND NOT EXISTS (
        SELECT 1 FROM app.account_deletions ad
        JOIN app.workspaces w ON w.owner_id = ad.user_id
        WHERE w.id = p_entity_id AND ad.status = 'processing'
      ) AND NOT EXISTS (
        SELECT 1 FROM app.public_deletion_requests pdr
        JOIN app.workspaces w ON w.owner_id = pdr.target_user_id
        WHERE w.id = p_entity_id AND pdr.status = 'processing'
      ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Recording workspace tombstone requires verified caller or active processing deletion request';
      END IF;
    ELSE
      RAISE EXCEPTION 'INVALID_ARGUMENT: Unsupported entity type % for tombstone', p_entity_type;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app.deletion_suppression_ledger
    WHERE entity_type = p_entity_type AND entity_id = p_entity_id
  ) THEN
    INSERT INTO app.deletion_suppression_ledger (entity_type, entity_id, content_free_hash, reason, expires_at)
    VALUES (p_entity_type, p_entity_id, p_hash, p_reason, now() + interval '90 days');
  END IF;
END;
$$;

-- 6. Beta invitations and enrollment state tables
CREATE TABLE IF NOT EXISTS app.beta_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_code_hash text NOT NULL UNIQUE,
    recipient_email text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'claimed', 'revoked', 'expired')),
    claimed_by_user_id uuid REFERENCES app.profiles(id),
    claimed_at timestamptz,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beta_invitations_hash ON app.beta_invitations(invitation_code_hash, status);

CREATE TABLE IF NOT EXISTS app.beta_enrollments (
    user_id uuid PRIMARY KEY REFERENCES app.profiles(id),
    invitation_id uuid REFERENCES app.beta_invitations(id),
    enrolled_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'revoked'))
);

GRANT SELECT, INSERT, UPDATE ON TABLE app.beta_invitations TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE app.beta_enrollments TO daynori_runtime;

ALTER TABLE app.beta_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.beta_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS beta_invitations_runtime ON app.beta_invitations;
CREATE POLICY beta_invitations_runtime ON app.beta_invitations
    FOR ALL TO daynori_runtime
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS beta_enrollments_runtime ON app.beta_enrollments;
CREATE POLICY beta_enrollments_runtime ON app.beta_enrollments
    FOR ALL TO daynori_runtime
    USING (true)
    WITH CHECK (true);
