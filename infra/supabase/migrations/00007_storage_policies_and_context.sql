-- 00007_storage_policies_and_context.sql
-- Establishes executable private-storage RLS policies for storage.objects
-- and extends identity resolution to support Supabase Storage daemon context.

-- 1. Extend app.current_user_id() to support both API transaction-local context
-- and Supabase request.jwt.claim.sub / auth.uid() context.
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    uid uuid;
BEGIN
    -- 1. API transaction-local setting
    uid := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
    IF uid IS NOT NULL THEN
        RETURN uid;
    END IF;

    -- 2. Supabase Storage request.jwt.claim.sub
    uid := NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    IF uid IS NOT NULL THEN
        RETURN uid;
    END IF;

    -- 3. Supabase auth.uid() function if auth schema exists
    BEGIN
        EXECUTE 'SELECT auth.uid()' INTO uid;
        RETURN uid;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
END;
$$;

-- 2. Safe workspace_id extraction with path traversal and UUID format validation
CREATE OR REPLACE FUNCTION app.storage_extract_workspace_id(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    first_part text;
BEGIN
    -- Reject empty, null, leading slashes, path traversal, or names without slashes
    IF object_name IS NULL 
       OR object_name LIKE '/%' 
       OR object_name LIKE '%..%' 
       OR object_name NOT LIKE '%/%' THEN
        RETURN NULL;
    END IF;

    first_part := split_part(object_name, '/', 1);
    -- Validate exact standard UUID regex: 8-4-4-4-12 hex characters
    IF first_part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN first_part::uuid;
    END IF;

    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION app.storage_extract_workspace_id(text) TO daynori_runtime;
GRANT EXECUTE ON FUNCTION app.storage_extract_workspace_id(text) TO PUBLIC;

-- 3. Ensure storage schema and tables exist for policy execution
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
    id text PRIMARY KEY,
    name text NOT NULL,
    owner uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    bucket_id text REFERENCES storage.buckets(id),
    name text NOT NULL,
    owner uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    last_accessed_at timestamptz DEFAULT now(),
    metadata jsonb,
    version text
);

-- 4. Ensure private_assets bucket exists and is private (public = false)
INSERT INTO storage.buckets (id, name, public)
VALUES ('private_assets', 'private_assets', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 5. Enable Row-Level Security on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 6. Grant least-privilege permissions on storage tables to daynori_runtime
GRANT USAGE ON SCHEMA storage TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE storage.objects TO daynori_runtime;
GRANT SELECT ON TABLE storage.buckets TO daynori_runtime;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT USAGE ON SCHEMA storage TO authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE storage.objects TO authenticated;
        GRANT SELECT ON TABLE storage.buckets TO authenticated;
        GRANT EXECUTE ON FUNCTION app.user_has_workspace_role(uuid, text) TO authenticated;
        GRANT EXECUTE ON FUNCTION app.current_user_id() TO authenticated;
        GRANT EXECUTE ON FUNCTION app.storage_extract_workspace_id(text) TO authenticated;
    END IF;
END $$;

-- 7. Define declarative storage.objects tenant-isolated RLS policies
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
