-- 00043_custom_sections_and_schemas.sql
-- Phase 42: Safe custom section schema and renderer contracts

-- 1. Custom Sections Table
CREATE TABLE IF NOT EXISTS app.custom_sections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
    description text CHECK (description IS NULL OR char_length(description) <= 500),
    icon text CHECK (icon IS NULL OR char_length(icon) <= 50),
    current_schema_version integer NOT NULL DEFAULT 1 CHECK (current_schema_version >= 1),
    layout_mode text NOT NULL DEFAULT 'single_column' CHECK (layout_mode IN ('single_column', 'two_column', 'grid')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    rank text NOT NULL DEFAULT '0|hzzzzz:',
    created_by uuid NOT NULL REFERENCES app.profiles(id),
    updated_by uuid NOT NULL REFERENCES app.profiles(id),
    revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_custom_sections_workspace ON app.custom_sections(workspace_id) WHERE deleted_at IS NULL;

-- 2. Custom Section Schemas Table (Immutable versioned schemas)
CREATE TABLE IF NOT EXISTS app.custom_section_schemas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id uuid NOT NULL REFERENCES app.custom_sections(id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    version integer NOT NULL CHECK (version >= 1),
    blocks jsonb NOT NULL,
    created_by uuid NOT NULL REFERENCES app.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_custom_section_schema_version UNIQUE (section_id, version)
);

CREATE INDEX IF NOT EXISTS idx_custom_section_schemas_section ON app.custom_section_schemas(section_id, version);
CREATE INDEX IF NOT EXISTS idx_custom_section_schemas_workspace ON app.custom_section_schemas(workspace_id);

-- 3. Custom Section Records Table (Structured record items)
CREATE TABLE IF NOT EXISTS app.custom_section_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id uuid NOT NULL REFERENCES app.custom_sections(id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    schema_version integer NOT NULL CHECK (schema_version >= 1),
    field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
    archived_values jsonb NOT NULL DEFAULT '{}'::jsonb,
    rank text NOT NULL DEFAULT '0|hzzzzz:',
    created_by uuid NOT NULL REFERENCES app.profiles(id),
    updated_by uuid NOT NULL REFERENCES app.profiles(id),
    revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_custom_section_records_section ON app.custom_section_records(section_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_custom_section_records_workspace ON app.custom_section_records(workspace_id) WHERE deleted_at IS NULL;

-- 4. Enable Row-Level Security
ALTER TABLE app.custom_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.custom_section_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.custom_section_records ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for custom_sections
DROP POLICY IF EXISTS "custom_sections_select" ON app.custom_sections;
CREATE POLICY "custom_sections_select" ON app.custom_sections
    FOR SELECT
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS "custom_sections_insert" ON app.custom_sections;
CREATE POLICY "custom_sections_insert" ON app.custom_sections
    FOR INSERT
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "custom_sections_update" ON app.custom_sections;
CREATE POLICY "custom_sections_update" ON app.custom_sections
    FOR UPDATE
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "custom_sections_delete" ON app.custom_sections;
CREATE POLICY "custom_sections_delete" ON app.custom_sections
    FOR DELETE
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

-- 6. RLS Policies for custom_section_schemas
DROP POLICY IF EXISTS "custom_section_schemas_select" ON app.custom_section_schemas;
CREATE POLICY "custom_section_schemas_select" ON app.custom_section_schemas
    FOR SELECT
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS "custom_section_schemas_insert" ON app.custom_section_schemas;
CREATE POLICY "custom_section_schemas_insert" ON app.custom_section_schemas
    FOR INSERT
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "custom_section_schemas_update" ON app.custom_section_schemas;
CREATE POLICY "custom_section_schemas_update" ON app.custom_section_schemas
    FOR UPDATE
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "custom_section_schemas_delete" ON app.custom_section_schemas;
CREATE POLICY "custom_section_schemas_delete" ON app.custom_section_schemas
    FOR DELETE
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

-- 7. RLS Policies for custom_section_records
DROP POLICY IF EXISTS "custom_section_records_select" ON app.custom_section_records;
CREATE POLICY "custom_section_records_select" ON app.custom_section_records
    FOR SELECT
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS "custom_section_records_insert" ON app.custom_section_records;
CREATE POLICY "custom_section_records_insert" ON app.custom_section_records
    FOR INSERT
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "custom_section_records_update" ON app.custom_section_records;
CREATE POLICY "custom_section_records_update" ON app.custom_section_records
    FOR UPDATE
    USING (app.user_has_workspace_role(workspace_id, 'editor'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "custom_section_records_delete" ON app.custom_section_records;
CREATE POLICY "custom_section_records_delete" ON app.custom_section_records
    FOR DELETE
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

-- 8. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON app.custom_sections TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.custom_section_schemas TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.custom_section_records TO daynori_runtime;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.custom_sections TO authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.custom_section_schemas TO authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.custom_section_records TO authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.custom_sections TO service_role;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.custom_section_schemas TO service_role;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.custom_section_records TO service_role;
    END IF;
END $$;
