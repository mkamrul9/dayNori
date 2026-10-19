-- Migration 00044: Enforce immutability and foreign integrity on custom section schemas
-- Prevents ordinary runtime updates, deletes, and cross-workspace references for historical schemas.

-- 1. Drop mutable RLS policies on custom_section_schemas
DROP POLICY IF EXISTS "custom_section_schemas_update" ON app.custom_section_schemas;
DROP POLICY IF EXISTS "custom_section_schemas_delete" ON app.custom_section_schemas;

-- 2. Revoke destructive privileges from runtime roles
REVOKE UPDATE, DELETE, TRUNCATE ON app.custom_section_schemas FROM daynori_runtime;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE UPDATE, DELETE, TRUNCATE ON TABLE app.custom_section_schemas FROM authenticated;
    END IF;
END $$;

-- 3. Create database trigger preventing any UPDATE or direct DELETE on historical schemas
CREATE OR REPLACE FUNCTION app.prevent_custom_section_schema_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Custom section schemas are immutable. New versions must be published instead.';
    ELSIF TG_OP = 'DELETE' THEN
        -- Ordinary deletion of a schema version while the section exists is prohibited.
        -- Deletions are only permitted as part of parent section/workspace lifecycle cascade deletion.
        IF EXISTS (
            SELECT 1 FROM app.custom_sections
            WHERE id = OLD.section_id AND workspace_id = OLD.workspace_id
        ) THEN
            RAISE EXCEPTION 'Custom section schemas are immutable and cannot be deleted directly. Lifecycle cleanup required.';
        END IF;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_custom_section_schema_mutation ON app.custom_section_schemas;
CREATE TRIGGER trg_prevent_custom_section_schema_mutation
    BEFORE UPDATE OR DELETE ON app.custom_section_schemas
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_custom_section_schema_mutation();

-- 4. Composite unique constraint on custom_sections (workspace_id, id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_custom_sections_workspace_id'
    ) THEN
        ALTER TABLE app.custom_sections
            ADD CONSTRAINT uq_custom_sections_workspace_id UNIQUE (workspace_id, id);
    END IF;
END $$;

-- 5. Composite foreign key ensuring schemas belong to the exact same workspace and section
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_custom_section_schemas_workspace_section'
    ) THEN
        ALTER TABLE app.custom_section_schemas
            ADD CONSTRAINT fk_custom_section_schemas_workspace_section
            FOREIGN KEY (workspace_id, section_id)
            REFERENCES app.custom_sections (workspace_id, id)
            ON DELETE CASCADE;
    END IF;
END $$;
