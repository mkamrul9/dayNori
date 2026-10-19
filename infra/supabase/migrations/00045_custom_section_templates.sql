-- 00045_custom_section_templates.sql
-- Phase 43: Custom section builder and personal templates
-- Personal templates storage, schema validation, and tenant isolation

-- 1. Custom Section Templates Table
CREATE TABLE IF NOT EXISTS app.custom_section_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
    description text CHECK (description IS NULL OR char_length(description) <= 500),
    icon text CHECK (icon IS NULL OR char_length(icon) <= 50),
    layout_mode text NOT NULL DEFAULT 'single_column' CHECK (layout_mode IN ('single_column', 'two_column', 'grid')),
    schema jsonb NOT NULL,
    is_starter boolean NOT NULL DEFAULT false,
    created_by uuid NOT NULL REFERENCES app.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_section_templates_workspace ON app.custom_section_templates(workspace_id);

-- 2. Enable Row-Level Security
ALTER TABLE app.custom_section_templates ENABLE ROW LEVEL SECURITY;

-- 3. Grants for daynori_runtime role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.custom_section_templates TO daynori_runtime;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.custom_section_templates TO authenticated;
    END IF;
END $$;

-- 4. RLS Policies
DROP POLICY IF EXISTS "custom_section_templates_select" ON app.custom_section_templates;
CREATE POLICY "custom_section_templates_select" ON app.custom_section_templates
    FOR SELECT
    TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS "custom_section_templates_insert" ON app.custom_section_templates;
CREATE POLICY "custom_section_templates_insert" ON app.custom_section_templates
    FOR INSERT
    TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "custom_section_templates_update" ON app.custom_section_templates;
CREATE POLICY "custom_section_templates_update" ON app.custom_section_templates
    FOR UPDATE
    TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS "custom_section_templates_delete" ON app.custom_section_templates;
CREATE POLICY "custom_section_templates_delete" ON app.custom_section_templates
    FOR DELETE
    TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));
