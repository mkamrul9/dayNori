-- 00020_file_upload_lifecycle_and_quarantine.sql
-- Private binary upload lifecycle, storage quota accounting, quarantine states, and RLS policies

-- 1. Storage Quota Accounting Table
CREATE TABLE IF NOT EXISTS app.workspace_storage_usage (
    workspace_id uuid PRIMARY KEY REFERENCES app.workspaces(id) ON DELETE CASCADE,
    stored_bytes bigint NOT NULL DEFAULT 0 CHECK (stored_bytes >= 0),
    reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
    max_storage_bytes bigint NOT NULL DEFAULT 104857600 CHECK (max_storage_bytes > 0), -- 100 MiB default per personal workspace
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.workspace_storage_usage ENABLE ROW LEVEL SECURITY;

-- 2. File Items Table (extends app.items where kind = 'file')
CREATE TABLE IF NOT EXISTS app.file_items (
    id uuid PRIMARY KEY REFERENCES app.items(id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    folder_id uuid REFERENCES app.items(id) ON DELETE SET NULL,
    file_name text NOT NULL,
    declared_mime_type text NOT NULL,
    detected_mime_type text NOT NULL,
    byte_size bigint NOT NULL CHECK (byte_size >= 0),
    sha256_checksum text NOT NULL,
    object_path text NOT NULL UNIQUE,
    version text NOT NULL DEFAULT '1',
    quarantine_status text NOT NULL DEFAULT 'quarantined' CHECK (quarantine_status IN ('quarantined', 'verified', 'rejected', 'deleted')),
    rejection_reason text,
    created_by uuid NOT NULL REFERENCES app.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    verified_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_file_items_workspace ON app.file_items(workspace_id, quarantine_status);
CREATE INDEX IF NOT EXISTS idx_file_items_folder ON app.file_items(folder_id);
ALTER TABLE app.file_items ENABLE ROW LEVEL SECURITY;

-- 3. File Versions Table (immutable versions for file revisions)
CREATE TABLE IF NOT EXISTS app.file_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id uuid NOT NULL REFERENCES app.file_items(id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    version text NOT NULL,
    object_path text NOT NULL UNIQUE,
    byte_size bigint NOT NULL CHECK (byte_size >= 0),
    sha256_checksum text NOT NULL,
    detected_mime_type text NOT NULL,
    created_by uuid NOT NULL REFERENCES app.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_versions_file ON app.file_versions(file_id);
ALTER TABLE app.file_versions ENABLE ROW LEVEL SECURITY;

-- 4. Upload Reservations Table
CREATE TABLE IF NOT EXISTS app.upload_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES app.profiles(id),
    folder_id uuid REFERENCES app.items(id) ON DELETE SET NULL,
    file_name text NOT NULL,
    declared_mime_type text NOT NULL,
    declared_bytes bigint NOT NULL CHECK (declared_bytes > 0),
    reserved_exposure_bytes bigint NOT NULL CHECK (reserved_exposure_bytes > 0),
    object_path text NOT NULL UNIQUE,
    file_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'uploaded', 'quarantined', 'verified', 'rejected', 'cancelled', 'expired', 'finalized')),
    provider_upload_url text NOT NULL,
    expires_at timestamptz NOT NULL,
    reconciled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upload_reservations_workspace ON app.upload_reservations(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_upload_reservations_expiry ON app.upload_reservations(expires_at) WHERE reconciled = false;
ALTER TABLE app.upload_reservations ENABLE ROW LEVEL SECURITY;

-- 5. Row-Level Security Policies

-- Storage Usage: Viewable by workspace members, editable by workspace editors
DROP POLICY IF EXISTS "workspace_storage_usage_select" ON app.workspace_storage_usage;
CREATE POLICY "workspace_storage_usage_select" ON app.workspace_storage_usage
    FOR SELECT
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS "workspace_storage_usage_insert" ON app.workspace_storage_usage;
CREATE POLICY "workspace_storage_usage_insert" ON app.workspace_storage_usage
    FOR INSERT
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "workspace_storage_usage_update" ON app.workspace_storage_usage;
CREATE POLICY "workspace_storage_usage_update" ON app.workspace_storage_usage
    FOR UPDATE
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

-- File Items: Viewable by workspace members (viewers only see verified files; editors see quarantined/rejected for diagnostics)
DROP POLICY IF EXISTS "file_items_select" ON app.file_items;
CREATE POLICY "file_items_select" ON app.file_items
    FOR SELECT
    USING (
        app.user_has_workspace_role(workspace_id, 'viewer')
        AND (
            quarantine_status = 'verified'
            OR app.user_has_workspace_role(workspace_id, 'editor')
        )
    );

DROP POLICY IF EXISTS "file_items_insert" ON app.file_items;
CREATE POLICY "file_items_insert" ON app.file_items
    FOR INSERT
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "file_items_update" ON app.file_items;
CREATE POLICY "file_items_update" ON app.file_items
    FOR UPDATE
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "file_items_delete" ON app.file_items;
CREATE POLICY "file_items_delete" ON app.file_items
    FOR DELETE
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

-- File Versions: Viewable by workspace viewers, editable by editors
DROP POLICY IF EXISTS "file_versions_select" ON app.file_versions;
CREATE POLICY "file_versions_select" ON app.file_versions
    FOR SELECT
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS "file_versions_insert" ON app.file_versions;
CREATE POLICY "file_versions_insert" ON app.file_versions
    FOR INSERT
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "file_versions_update" ON app.file_versions;
CREATE POLICY "file_versions_update" ON app.file_versions
    FOR UPDATE
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "file_versions_delete" ON app.file_versions;
CREATE POLICY "file_versions_delete" ON app.file_versions
    FOR DELETE
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

-- Upload Reservations: Viewable and editable by workspace editors
DROP POLICY IF EXISTS "upload_reservations_select" ON app.upload_reservations;
CREATE POLICY "upload_reservations_select" ON app.upload_reservations
    FOR SELECT
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "upload_reservations_insert" ON app.upload_reservations;
CREATE POLICY "upload_reservations_insert" ON app.upload_reservations
    FOR INSERT
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "upload_reservations_update" ON app.upload_reservations;
CREATE POLICY "upload_reservations_update" ON app.upload_reservations
    FOR UPDATE
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

-- 6. Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.workspace_storage_usage TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.file_items TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.file_versions TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.upload_reservations TO daynori_runtime;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.workspace_storage_usage TO authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.file_items TO authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.file_versions TO authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.upload_reservations TO authenticated;
    END IF;
END $$;
