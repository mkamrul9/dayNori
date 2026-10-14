-- infra/supabase/policies/storage.sql
-- Declarative Supabase Storage (storage.objects) RLS Policies
-- Executable definitions matching migration 00007_storage_policies_and_context.sql

-- 1. Ensure private_assets bucket exists and is private
INSERT INTO storage.buckets (id, name, public)
VALUES ('private_assets', 'private_assets', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Storage Objects RLS: Tenant Isolation
-- Bucket: private_assets
-- Path convention: {workspace_id}/{object_path}
-- Validated via app.storage_extract_workspace_id(name) preventing path traversal and malformed names

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Read policy: Requires viewer role in target workspace
DROP POLICY IF EXISTS "private_assets_select" ON storage.objects;
CREATE POLICY "private_assets_select" ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'private_assets'
        AND app.user_has_workspace_role(
            app.storage_extract_workspace_id(name),
            'viewer'
        )
    );

-- Insert/Upload policy: Requires editor role in target workspace
DROP POLICY IF EXISTS "private_assets_insert" ON storage.objects;
CREATE POLICY "private_assets_insert" ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'private_assets'
        AND app.user_has_workspace_role(
            app.storage_extract_workspace_id(name),
            'editor'
        )
    );

-- Update policy: Requires editor role in target workspace
DROP POLICY IF EXISTS "private_assets_update" ON storage.objects;
CREATE POLICY "private_assets_update" ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'private_assets'
        AND app.user_has_workspace_role(
            app.storage_extract_workspace_id(name),
            'editor'
        )
    )
    WITH CHECK (
        bucket_id = 'private_assets'
        AND app.user_has_workspace_role(
            app.storage_extract_workspace_id(name),
            'editor'
        )
    );

-- Delete policy: Requires editor role in target workspace
DROP POLICY IF EXISTS "private_assets_delete" ON storage.objects;
CREATE POLICY "private_assets_delete" ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'private_assets'
        AND app.user_has_workspace_role(
            app.storage_extract_workspace_id(name),
            'editor'
        )
    );
