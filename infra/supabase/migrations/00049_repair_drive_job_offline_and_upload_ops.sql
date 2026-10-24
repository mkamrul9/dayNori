-- 00049_repair_drive_job_offline_and_upload_ops.sql
-- Phase 49 repair: truthful offline availability + persisted upload operation identity.

-- Allow pending_offline: server stored bytes but client has not acknowledged durable offline cache.
ALTER TABLE app.drive_linked_files DROP CONSTRAINT IF EXISTS drive_linked_files_availability_check;
ALTER TABLE app.drive_linked_files
  ADD CONSTRAINT drive_linked_files_availability_check
  CHECK (availability IN (
    'linked',
    'imported',
    'pending_offline',
    'offline_cached',
    'source_unavailable',
    'permission_lost'
  ));

-- Provider revocation outcome separate from local disconnect fencing.
ALTER TABLE app.drive_connections
  ADD COLUMN IF NOT EXISTS provider_revoke_status text
    CHECK (provider_revoke_status IS NULL OR provider_revoke_status IN (
      'not_attempted', 'pending', 'confirmed', 'failed', 'skipped'
    ));

-- Persisted upload operation identity for uncertain Google upload reconciliation.
CREATE TABLE IF NOT EXISTS app.drive_upload_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    connection_id uuid NOT NULL REFERENCES app.drive_connections(id) ON DELETE CASCADE,
    drive_job_id uuid NOT NULL REFERENCES app.drive_jobs(id) ON DELETE CASCADE,
    idempotency_key text NOT NULL,
    local_file_item_id uuid NOT NULL,
    provider_file_id text,
    status text NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'succeeded', 'failed', 'uncertain', 'fenced')),
    last_error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (connection_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_drive_upload_ops_job
  ON app.drive_upload_operations(drive_job_id);

ALTER TABLE app.drive_upload_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drive_upload_ops_select" ON app.drive_upload_operations;
CREATE POLICY "drive_upload_ops_select" ON app.drive_upload_operations
  FOR SELECT USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS "drive_upload_ops_write" ON app.drive_upload_operations;
CREATE POLICY "drive_upload_ops_write" ON app.drive_upload_operations
  FOR ALL TO daynori_runtime
  USING (app.user_has_workspace_role(workspace_id, 'editor'))
  WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON app.drive_upload_operations TO daynori_runtime;

-- Lease fencing for drive_jobs so duplicate delivery cannot double-execute.
ALTER TABLE app.drive_jobs
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS leased_until timestamptz;
