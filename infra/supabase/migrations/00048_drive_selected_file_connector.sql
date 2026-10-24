-- 00048_drive_selected_file_connector.sql
-- Phase 49: selected-file Google Drive connector (narrow drive.file).
-- Encrypted refresh tokens stored server-side only; vault content excluded.

CREATE TABLE IF NOT EXISTS app.drive_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'unconfigured'
        CHECK (status IN ('unconfigured', 'pending_consent', 'connected', 'degraded', 'disconnected', 'revoked')),
    provider_kind text NOT NULL DEFAULT 'unconfigured'
        CHECK (provider_kind IN ('unconfigured', 'fake', 'google_production')),
    provider_subject text,
    provider_account_email text,
    granted_scope text,
    generation bigint NOT NULL DEFAULT 0 CHECK (generation >= 0),
    -- AES-256-GCM sealed refresh token (versioned key id + ciphertext). Never plaintext.
    refresh_token_ciphertext text,
    refresh_token_key_version text,
    access_token_expires_at timestamptz,
    connected_at timestamptz,
    disconnected_at timestamptz,
    last_reconciled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_drive_connections_workspace
    ON app.drive_connections(workspace_id, status);

ALTER TABLE app.drive_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS app.drive_auth_intents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
    platform text NOT NULL CHECK (platform IN ('web', 'android')),
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'consumed', 'cancelled', 'denied', 'expired', 'failed')),
    state_token text NOT NULL UNIQUE,
    code_verifier text NOT NULL,
    return_path text NOT NULL,
    redirect_uri text NOT NULL,
    requested_scope text NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drive_auth_intents_lookup
    ON app.drive_auth_intents(workspace_id, account_id, status);

ALTER TABLE app.drive_auth_intents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS app.drive_linked_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    connection_id uuid NOT NULL REFERENCES app.drive_connections(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
    provider_file_id text NOT NULL,
    display_name text NOT NULL,
    mime_type text NOT NULL,
    provenance text NOT NULL
        CHECK (provenance IN ('app_created', 'picker_selected', 'imported_copy', 'upload')),
    link_mode text NOT NULL
        CHECK (link_mode IN ('link_reference', 'import_copy', 'upload_to_drive', 'download_offline')),
    provider_version text,
    checksum text,
    local_file_item_id uuid,
    availability text NOT NULL DEFAULT 'linked'
        CHECK (availability IN ('linked', 'imported', 'offline_cached', 'source_unavailable', 'permission_lost')),
    last_reconciled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (connection_id, provider_file_id)
);

CREATE INDEX IF NOT EXISTS idx_drive_linked_files_workspace
    ON app.drive_linked_files(workspace_id, connection_id);

ALTER TABLE app.drive_linked_files ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS app.drive_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    connection_id uuid NOT NULL REFERENCES app.drive_connections(id) ON DELETE CASCADE,
    linked_file_id uuid REFERENCES app.drive_linked_files(id) ON DELETE SET NULL,
    kind text NOT NULL
        CHECK (kind IN ('import_copy', 'upload_to_drive', 'download_offline', 'reconcile')),
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled', 'fenced')),
    connection_generation bigint NOT NULL,
    idempotency_key text NOT NULL,
    error_code text,
    error_message text,
    background_job_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (connection_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_drive_jobs_pending
    ON app.drive_jobs(workspace_id, status);

ALTER TABLE app.drive_jobs ENABLE ROW LEVEL SECURITY;

-- RLS: members can read; mutations via daynori_runtime + membership checks in API
DROP POLICY IF EXISTS "drive_connections_select" ON app.drive_connections;
CREATE POLICY "drive_connections_select" ON app.drive_connections
    FOR SELECT USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS "drive_connections_write" ON app.drive_connections;
CREATE POLICY "drive_connections_write" ON app.drive_connections
    FOR ALL TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "drive_auth_intents_select" ON app.drive_auth_intents;
CREATE POLICY "drive_auth_intents_select" ON app.drive_auth_intents
    FOR SELECT USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS "drive_auth_intents_write" ON app.drive_auth_intents;
CREATE POLICY "drive_auth_intents_write" ON app.drive_auth_intents
    FOR ALL TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "drive_linked_files_select" ON app.drive_linked_files;
CREATE POLICY "drive_linked_files_select" ON app.drive_linked_files
    FOR SELECT USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS "drive_linked_files_write" ON app.drive_linked_files;
CREATE POLICY "drive_linked_files_write" ON app.drive_linked_files
    FOR ALL TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "drive_jobs_select" ON app.drive_jobs;
CREATE POLICY "drive_jobs_select" ON app.drive_jobs
    FOR SELECT USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS "drive_jobs_write" ON app.drive_jobs;
CREATE POLICY "drive_jobs_write" ON app.drive_jobs
    FOR ALL TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON app.drive_connections TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.drive_auth_intents TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.drive_linked_files TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.drive_jobs TO daynori_runtime;
