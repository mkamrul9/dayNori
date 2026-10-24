-- 00021_repair_file_lifecycle_jobs_and_grants.sql
-- Tighten database permissions, composite constraints, background jobs, and scanner metadata

-- 1. Ensure composite unique constraint on app.items for workspace-scoped foreign keys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_items_id_workspace'
    ) THEN
        ALTER TABLE app.items ADD CONSTRAINT uq_items_id_workspace UNIQUE (id, workspace_id);
    END IF;
END $$;

-- 2. Add tenant-safe composite foreign keys on folder references
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_file_items_folder_workspace'
    ) THEN
        ALTER TABLE app.file_items 
        ADD CONSTRAINT fk_file_items_folder_workspace 
        FOREIGN KEY (folder_id, workspace_id) REFERENCES app.items(id, workspace_id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_upload_reservations_folder_workspace'
    ) THEN
        ALTER TABLE app.upload_reservations 
        ADD CONSTRAINT fk_upload_reservations_folder_workspace 
        FOREIGN KEY (folder_id, workspace_id) REFERENCES app.items(id, workspace_id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Enforce immutable version uniqueness on file_versions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_file_versions_file_version'
    ) THEN
        ALTER TABLE app.file_versions 
        ADD CONSTRAINT uq_file_versions_file_version UNIQUE (file_id, version);
    END IF;
END $$;

-- 4. Revoke direct write grants from authenticated role to preserve API-owned mutation architecture
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE INSERT, UPDATE, DELETE ON TABLE app.workspace_storage_usage FROM authenticated;
        REVOKE INSERT, UPDATE, DELETE ON TABLE app.file_items FROM authenticated;
        REVOKE INSERT, UPDATE, DELETE ON TABLE app.file_versions FROM authenticated;
        REVOKE INSERT, UPDATE, DELETE ON TABLE app.upload_reservations FROM authenticated;
    END IF;
END $$;

-- Drop direct write policies for authenticated users
DROP POLICY IF EXISTS "workspace_storage_usage_insert" ON app.workspace_storage_usage;
DROP POLICY IF EXISTS "workspace_storage_usage_update" ON app.workspace_storage_usage;
DROP POLICY IF EXISTS "file_items_insert" ON app.file_items;
DROP POLICY IF EXISTS "file_items_update" ON app.file_items;
DROP POLICY IF EXISTS "file_items_delete" ON app.file_items;
DROP POLICY IF EXISTS "file_versions_insert" ON app.file_versions;
DROP POLICY IF EXISTS "file_versions_update" ON app.file_versions;
DROP POLICY IF EXISTS "file_versions_delete" ON app.file_versions;
DROP POLICY IF EXISTS "upload_reservations_insert" ON app.upload_reservations;
DROP POLICY IF EXISTS "upload_reservations_update" ON app.upload_reservations;

-- Recreate write policies restricted to daynori_runtime (API-owned mutation architecture)
DROP POLICY IF EXISTS "p_workspace_storage_usage_insert" ON app.workspace_storage_usage;
CREATE POLICY "p_workspace_storage_usage_insert" ON app.workspace_storage_usage
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "p_workspace_storage_usage_update" ON app.workspace_storage_usage;
CREATE POLICY "p_workspace_storage_usage_update" ON app.workspace_storage_usage
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "p_file_items_insert" ON app.file_items;
CREATE POLICY "p_file_items_insert" ON app.file_items
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "p_file_items_update" ON app.file_items;
CREATE POLICY "p_file_items_update" ON app.file_items
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "p_file_items_delete" ON app.file_items;
CREATE POLICY "p_file_items_delete" ON app.file_items
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "p_file_versions_insert" ON app.file_versions;
CREATE POLICY "p_file_versions_insert" ON app.file_versions
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "p_file_versions_update" ON app.file_versions;
CREATE POLICY "p_file_versions_update" ON app.file_versions
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "p_file_versions_delete" ON app.file_versions;
CREATE POLICY "p_file_versions_delete" ON app.file_versions
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "p_upload_reservations_insert" ON app.upload_reservations;
CREATE POLICY "p_upload_reservations_insert" ON app.upload_reservations
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "p_upload_reservations_update" ON app.upload_reservations;
CREATE POLICY "p_upload_reservations_update" ON app.upload_reservations
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "p_upload_reservations_delete" ON app.upload_reservations;
CREATE POLICY "p_upload_reservations_delete" ON app.upload_reservations
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.workspace_storage_usage TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.file_items TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.file_versions TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.upload_reservations TO daynori_runtime;

-- 5. Add scanner metadata fields to file_items
ALTER TABLE app.file_items 
ADD COLUMN IF NOT EXISTS scanner_engine text,
ADD COLUMN IF NOT EXISTS scanned_bytes bigint,
ADD COLUMN IF NOT EXISTS scanned_checksum text;

-- 6. Durable Background Jobs Table
CREATE TABLE IF NOT EXISTS app.background_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'dead_letter')),
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 5,
    run_at timestamptz NOT NULL DEFAULT now(),
    leased_by text,
    leased_until timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_polling 
ON app.background_jobs (run_at, status) 
WHERE status IN ('pending', 'running');

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.background_jobs TO daynori_runtime;
