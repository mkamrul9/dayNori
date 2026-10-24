-- 00008_personal_workspace_and_preferences.sql
-- Phase 10: Personal workspace idempotency & user preferences persistence

-- 1. Reconcile legacy duplicate personal workspaces without deletion:
-- Retain the primary (earliest) personal workspace per owner, and reclassify
-- excess duplicate workspaces to 'room' so all historic items, memberships,
-- and records are preserved intact without resetting the database.
WITH ranked_personal_workspaces AS (
    SELECT id, owner_id,
           ROW_NUMBER() OVER (PARTITION BY owner_id ORDER BY created_at ASC, id ASC) as rn
    FROM app.workspaces
    WHERE kind = 'personal'
)
UPDATE app.workspaces
SET kind = 'room',
    name = CASE 
             WHEN name NOT LIKE '%(Legacy Room)%' THEN name || ' (Legacy Room)'
             ELSE name 
           END
WHERE id IN (
    SELECT id FROM ranked_personal_workspaces WHERE rn > 1
);

-- 2. Enforce exactly one personal workspace per owner/user via partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_personal_owner
ON app.workspaces (owner_id)
WHERE kind = 'personal';

-- 3. Extend app.profiles with week_start, structured preferences, versioning, and revision concurrency control
ALTER TABLE app.profiles
ADD COLUMN IF NOT EXISTS week_start text NOT NULL DEFAULT 'monday'
CHECK (week_start IN ('monday', 'sunday', 'saturday'));

ALTER TABLE app.profiles
ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{"theme": "system", "compactMode": false}'::jsonb;

ALTER TABLE app.profiles
ADD COLUMN IF NOT EXISTS preferences_schema_version integer NOT NULL DEFAULT 1;

ALTER TABLE app.profiles
ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1;

-- 4. Ensure daynori_runtime permissions on app.profiles, app.workspaces, and app.workspace_memberships
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.profiles TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.workspaces TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.workspace_memberships TO daynori_runtime;
