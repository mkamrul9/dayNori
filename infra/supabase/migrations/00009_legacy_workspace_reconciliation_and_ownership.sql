-- 00009_legacy_workspace_reconciliation_and_ownership.sql
-- Phase 10 Repair: Legacy workspace reconciliation inventory, reviewed procedure, and strict personal workspace ownership enforcement

-- 1. Create table to inventory duplicate workspaces reclassified in migration 00008
CREATE TABLE IF NOT EXISTS app.legacy_workspace_reconciliation_inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    owner_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE RESTRICT,
    original_kind text NOT NULL DEFAULT 'personal',
    current_kind text NOT NULL,
    item_count integer NOT NULL DEFAULT 0,
    membership_count integer NOT NULL DEFAULT 0,
    status text NOT NULL CHECK (status IN ('quarantined_pending_review', 'reconciled_archived', 'reconciled_personal_copy', 'reconciled_confirmed_room')),
    reconciliation_notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    reviewed_by uuid REFERENCES app.profiles(id)
);

-- 2. Inventory all historical records affected by migration 00008 automatic reclassification
INSERT INTO app.legacy_workspace_reconciliation_inventory (
    workspace_id,
    owner_id,
    original_kind,
    current_kind,
    item_count,
    membership_count,
    status,
    reconciliation_notes
)
SELECT 
    w.id,
    w.owner_id,
    'personal' AS original_kind,
    w.kind AS current_kind,
    (SELECT count(*)::int FROM app.items i WHERE i.workspace_id = w.id),
    (SELECT count(*)::int FROM app.workspace_memberships wm WHERE wm.workspace_id = w.id),
    'quarantined_pending_review',
    'Preserved and inventoried for reviewed reconciliation; ownership semantics kept private until operator review.'
FROM app.workspaces w
WHERE w.name LIKE '%(Legacy Room)%'
ON CONFLICT DO NOTHING;

-- 3. Explicit reviewed reconciliation procedure
CREATE OR REPLACE FUNCTION app.reconcile_legacy_workspace(
    p_workspace_id uuid,
    p_action text,
    p_reviewer_id uuid,
    p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
    IF p_action NOT IN ('archive', 'confirm_room', 'restore_as_personal_backup') THEN
        RAISE EXCEPTION 'Invalid reconciliation action: %', p_action;
    END IF;

    UPDATE app.legacy_workspace_reconciliation_inventory
    SET status = CASE 
                    WHEN p_action = 'archive' THEN 'reconciled_archived'
                    WHEN p_action = 'confirm_room' THEN 'reconciled_confirmed_room'
                    ELSE 'reconciled_personal_copy'
                 END,
        reviewed_at = now(),
        reviewed_by = p_reviewer_id,
        reconciliation_notes = COALESCE(p_notes, reconciliation_notes),
        updated_at = now()
    WHERE workspace_id = p_workspace_id;
END;
$$;

-- 4. Enforce personal workspace ownership at the database layer
-- Personal workspaces must strictly remain owner-only in this release.
-- Prevents adding another user through membership APIs or direct runtime-role writes.
CREATE OR REPLACE FUNCTION app.enforce_personal_workspace_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
    ws_kind text;
    ws_owner uuid;
BEGIN
    SELECT kind, owner_id INTO ws_kind, ws_owner
    FROM app.workspaces
    WHERE id = NEW.workspace_id;

    IF ws_kind = 'personal' THEN
        IF NEW.user_id <> ws_owner THEN
            RAISE EXCEPTION 'Personal workspaces are owner-only in this release; adding additional members is forbidden.';
        END IF;
        IF NEW.role <> 'owner' THEN
            RAISE EXCEPTION 'Personal workspace membership role must be owner.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_personal_workspace_ownership ON app.workspace_memberships;
CREATE TRIGGER trg_enforce_personal_workspace_ownership
AFTER INSERT OR UPDATE ON app.workspace_memberships
FOR EACH ROW
EXECUTE FUNCTION app.enforce_personal_workspace_ownership();

-- 5. Grant permissions to daynori_runtime
GRANT SELECT ON TABLE app.legacy_workspace_reconciliation_inventory TO daynori_runtime;
