-- 00042_item_attachments_and_audio_lifecycle.sql
-- Authorized item attachments and audio recording lifecycle foundation

-- 1. Extend file_items with optional audio metadata
ALTER TABLE app.file_items
ADD COLUMN IF NOT EXISTS audio_duration_seconds integer CHECK (
    audio_duration_seconds IS NULL OR (audio_duration_seconds >= 1 AND audio_duration_seconds <= 600)
);

-- 2. Create canonical item_attachments table
CREATE TABLE IF NOT EXISTS app.item_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES app.items(id) ON DELETE CASCADE,
    file_id uuid NOT NULL REFERENCES app.file_items(id) ON DELETE CASCADE,
    attachment_type text NOT NULL CHECK (attachment_type IN ('audio', 'receipt', 'file')),
    file_name text NOT NULL,
    mime_type text NOT NULL,
    byte_size bigint NOT NULL CHECK (byte_size > 0),
    duration_seconds integer CHECK (duration_seconds IS NULL OR (duration_seconds >= 1 AND duration_seconds <= 600)),
    created_by uuid NOT NULL REFERENCES app.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT uq_item_attachments_workspace_item_file UNIQUE (workspace_id, item_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_item_attachments_workspace_item ON app.item_attachments(workspace_id, item_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_item_attachments_workspace_file ON app.item_attachments(workspace_id, file_id) WHERE deleted_at IS NULL;

-- 3. Enable Row-Level Security
ALTER TABLE app.item_attachments ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "item_attachments_select" ON app.item_attachments;
CREATE POLICY "item_attachments_select" ON app.item_attachments
    FOR SELECT
    USING (
        app.user_has_workspace_role(workspace_id, 'viewer')
    );

DROP POLICY IF EXISTS "item_attachments_insert" ON app.item_attachments;
CREATE POLICY "item_attachments_insert" ON app.item_attachments
    FOR INSERT
    WITH CHECK (
        app.user_has_workspace_role(workspace_id, 'editor')
    );

DROP POLICY IF EXISTS "item_attachments_update" ON app.item_attachments;
CREATE POLICY "item_attachments_update" ON app.item_attachments
    FOR UPDATE
    USING (
        app.user_has_workspace_role(workspace_id, 'editor')
    )
    WITH CHECK (
        app.user_has_workspace_role(workspace_id, 'editor')
    );

DROP POLICY IF EXISTS "item_attachments_delete" ON app.item_attachments;
CREATE POLICY "item_attachments_delete" ON app.item_attachments
    FOR DELETE
    USING (
        app.user_has_workspace_role(workspace_id, 'editor')
    );

-- 5. Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON app.item_attachments TO daynori_runtime;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.item_attachments TO authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.item_attachments TO service_role;
    END IF;
END $$;

