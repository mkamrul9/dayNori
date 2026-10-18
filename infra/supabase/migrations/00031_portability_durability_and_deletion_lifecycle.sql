-- Migration: 00031_portability_durability_and_deletion_lifecycle
-- Description: Durable tables for workspace export jobs, import sessions, token revocation, account/workspace deletion state machines, and account-erasure suppression ledger.
-- Search Path: app, pg_temp

-- 1. Durable Workspace Exports Table
CREATE TABLE IF NOT EXISTS app.workspace_exports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app.profiles(id),
    session_hash text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'expired')),
    storage_path text,
    manifest jsonb,
    file_size_bytes bigint,
    checksum_sha256 text,
    include_attachments boolean NOT NULL DEFAULT true,
    download_count integer NOT NULL DEFAULT 0,
    expires_at timestamptz NOT NULL,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_workspace_exports_status 
ON app.workspace_exports (workspace_id, status, expires_at);

-- 2. Durable Workspace Imports Table
CREATE TABLE IF NOT EXISTS app.workspace_imports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app.profiles(id),
    session_hash text NOT NULL,
    status text NOT NULL DEFAULT 'preview_ready' CHECK (status IN ('preview_ready', 'executing', 'completed', 'failed', 'cancelled', 'expired')),
    storage_path text NOT NULL,
    manifest jsonb NOT NULL,
    detected_duplicates jsonb NOT NULL DEFAULT '[]'::jsonb,
    entity_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
    duplicate_strategy text CHECK (duplicate_strategy IN ('skip', 'create_copy', 'overwrite_if_newer')),
    required_binary_bytes bigint NOT NULL DEFAULT 0,
    execution_result jsonb,
    expires_at timestamptz NOT NULL,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_workspace_imports_status 
ON app.workspace_imports (workspace_id, status, expires_at);

-- 3. Revoked Tokens Table (for immediate lifecycle revocation)
CREATE TABLE IF NOT EXISTS app.revoked_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash text NOT NULL UNIQUE,
    user_id uuid NOT NULL,
    revoked_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_lookup 
ON app.revoked_tokens (token_hash, expires_at);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user 
ON app.revoked_tokens (user_id);

-- 4. Account Deletion State Machine Table
CREATE TABLE IF NOT EXISTS app.account_deletions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app.profiles(id),
    session_hash text NOT NULL,
    status text NOT NULL DEFAULT 'pending_confirmation' CHECK (status IN ('pending_confirmation', 'scheduled', 'processing', 'completed', 'failed', 'cancelled')),
    confirmation_token_hash text,
    confirmed_at timestamptz,
    cancellation_deadline timestamptz,
    cancellation_reason text,
    object_deletion_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
    progress jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_account_deletions_user 
ON app.account_deletions (user_id, status);

-- 5. Workspace Deletion State Machine Table
CREATE TABLE IF NOT EXISTS app.workspace_deletions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    requested_by uuid NOT NULL REFERENCES app.profiles(id),
    session_hash text NOT NULL,
    status text NOT NULL DEFAULT 'pending_confirmation' CHECK (status IN ('pending_confirmation', 'processing', 'completed', 'failed', 'cancelled')),
    confirmation_token_hash text,
    confirmed_at timestamptz,
    object_deletion_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
    progress jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_workspace_deletions_ws 
ON app.workspace_deletions (workspace_id, status);

-- 6. Deletion Suppression Ledger (persisted outside snapshot restores to prevent silent reactivation)
CREATE TABLE IF NOT EXISTS app.deletion_suppression_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type text NOT NULL CHECK (entity_type IN ('account', 'workspace')),
    entity_id uuid NOT NULL,
    deleted_at timestamptz NOT NULL DEFAULT now(),
    content_free_hash text NOT NULL,
    reason text NOT NULL,
    expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deletion_suppression_lookup 
ON app.deletion_suppression_ledger (entity_type, entity_id);

-- 7. Security Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.workspace_exports TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.workspace_imports TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.revoked_tokens TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.account_deletions TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.workspace_deletions TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.deletion_suppression_ledger TO daynori_runtime;
