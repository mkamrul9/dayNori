-- infra/supabase/policies/storage.sql
-- Declarative Supabase Storage (storage.objects) RLS Policies
-- Applied when Supabase storage daemon is active with the 'storage' schema.

-- 1. Ensure private_assets bucket exists
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('private_assets', 'private_assets', false)
-- ON CONFLICT (id) DO NOTHING;

-- 2. Storage Objects RLS: Tenant Isolation
-- Bucket: private_assets
-- Path convention: {workspace_id}/{object_path}

-- Read policy: Requires viewer role in target workspace
-- CREATE POLICY "private_assets_select" ON storage.objects
--     FOR SELECT
--     TO authenticated
--     USING (
--         bucket_id = 'private_assets'
--         AND app.user_has_workspace_role(
--             (split_part(name, '/', 1))::uuid,
--             'viewer'
--         )
--     );

-- Insert/Upload policy: Requires editor role in target workspace
-- CREATE POLICY "private_assets_insert" ON storage.objects
--     FOR INSERT
--     TO authenticated
--     WITH CHECK (
--         bucket_id = 'private_assets'
--         AND app.user_has_workspace_role(
--             (split_part(name, '/', 1))::uuid,
--             'editor'
--         )
--     );

-- Delete policy: Requires editor role in target workspace
-- CREATE POLICY "private_assets_delete" ON storage.objects
--     FOR DELETE
--     TO authenticated
--     USING (
--         bucket_id = 'private_assets'
--         AND app.user_has_workspace_role(
--             (split_part(name, '/', 1))::uuid,
--             'editor'
--         )
--     );
