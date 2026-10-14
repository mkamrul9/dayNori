-- Migration: 00001_initial_schema
-- Description: Core tenant isolation foundation, schema app, roles, RLS, and composite foreign keys
-- Pinned Search Path & Security Boundary: app, pg_temp

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daynori_runtime') THEN
        CREATE ROLE daynori_runtime WITH LOGIN PASSWORD 'runtime_dev_secret_9876'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS app;

-- 1. Profiles (User Identity)
CREATE TABLE IF NOT EXISTS app.profiles (
    id uuid PRIMARY KEY,
    display_name text NOT NULL,
    preferred_locale text NOT NULL DEFAULT 'en',
    time_zone text NOT NULL DEFAULT 'UTC',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Workspaces (Tenant Root)
CREATE TABLE IF NOT EXISTS app.workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('personal', 'room')),
    owner_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Workspace Memberships (Tenant Authorization Boundary)
CREATE TABLE IF NOT EXISTS app.workspace_memberships (
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
);

-- 4. Items (Shared Item Identities & Hierarchy)
-- Enforces composite (workspace_id, id) for tenant-scoped foreign keys
CREATE TABLE IF NOT EXISTS app.items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    folder_id uuid,
    kind text NOT NULL CHECK (kind IN ('note', 'todo', 'routine', 'journal_entry', 'file_item', 'calendar_event', 'folder')),
    created_by uuid NOT NULL REFERENCES app.profiles(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES app.profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    PRIMARY KEY (workspace_id, id),
    UNIQUE (id),
    CONSTRAINT fk_items_folder FOREIGN KEY (workspace_id, folder_id)
        REFERENCES app.items (workspace_id, id) ON DELETE SET NULL
);

-- 5. Audit Events (Immutable Tenant Audit Log)
CREATE TABLE IF NOT EXISTS app.audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    actor_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE RESTRICT,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Storage Objects (Private Object Metadata Foundation)
CREATE TABLE IF NOT EXISTS app.storage_objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    owner_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE RESTRICT,
    bucket_id text NOT NULL DEFAULT 'private_assets',
    object_path text NOT NULL,
    byte_size bigint NOT NULL CHECK (byte_size >= 0),
    mime_type text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, bucket_id, object_path)
);

-- Indexes supporting foundation queries
CREATE INDEX IF NOT EXISTS idx_items_browse ON app.items (workspace_id, deleted_at, updated_at, id);
CREATE INDEX IF NOT EXISTS idx_items_kind ON app.items (workspace_id, kind) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_memberships_user ON app.workspace_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_workspace_time ON app.audit_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storage_workspace ON app.storage_objects (workspace_id, bucket_id);

-- Helper functions for transaction context
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.current_workspace_id', true), '')::uuid;
$$;

-- Non-recursive Security Definer membership check
-- Pinned search_path prevents search_path hijacking
CREATE OR REPLACE FUNCTION app.user_has_workspace_role(
    target_workspace_id uuid,
    required_role text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
    calling_user_id uuid;
    user_role text;
BEGIN
    calling_user_id := app.current_user_id();
    IF calling_user_id IS NULL OR target_workspace_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT role INTO user_role
    FROM app.workspace_memberships
    WHERE workspace_id = target_workspace_id
      AND user_id = calling_user_id;

    IF user_role IS NULL THEN
        RETURN false;
    END IF;

    IF required_role IS NULL THEN
        RETURN true;
    END IF;

    IF required_role = 'viewer' THEN
        RETURN user_role IN ('owner', 'editor', 'viewer');
    ELSIF required_role = 'editor' THEN
        RETURN user_role IN ('owner', 'editor');
    ELSIF required_role = 'owner' THEN
        RETURN user_role = 'owner';
    END IF;

    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION app.user_has_workspace_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.user_has_workspace_role(uuid, text) TO daynori_runtime;

-- Row Level Security (RLS) Configuration with FORCE ROW LEVEL SECURITY

-- Profiles RLS
ALTER TABLE app.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select ON app.profiles;
CREATE POLICY profiles_select ON app.profiles
    FOR SELECT
    USING (
        id = app.current_user_id()
        OR EXISTS (
            SELECT 1
            FROM app.workspace_memberships m1
            JOIN app.workspace_memberships m2 ON m1.workspace_id = m2.workspace_id
            WHERE m1.user_id = app.current_user_id()
              AND m2.user_id = app.profiles.id
        )
    );

DROP POLICY IF EXISTS profiles_insert ON app.profiles;
CREATE POLICY profiles_insert ON app.profiles
    FOR INSERT
    WITH CHECK (id = app.current_user_id());

DROP POLICY IF EXISTS profiles_update ON app.profiles;
CREATE POLICY profiles_update ON app.profiles
    FOR UPDATE
    USING (id = app.current_user_id())
    WITH CHECK (id = app.current_user_id());

-- Workspaces RLS
ALTER TABLE app.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspaces FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspaces_select ON app.workspaces;
CREATE POLICY workspaces_select ON app.workspaces
    FOR SELECT
    USING (app.user_has_workspace_role(id, 'viewer'));

DROP POLICY IF EXISTS workspaces_insert ON app.workspaces;
CREATE POLICY workspaces_insert ON app.workspaces
    FOR INSERT
    WITH CHECK (owner_id = app.current_user_id());

DROP POLICY IF EXISTS workspaces_update ON app.workspaces;
CREATE POLICY workspaces_update ON app.workspaces
    FOR UPDATE
    USING (app.user_has_workspace_role(id, 'owner'))
    WITH CHECK (app.user_has_workspace_role(id, 'owner'));

DROP POLICY IF EXISTS workspaces_delete ON app.workspaces;
CREATE POLICY workspaces_delete ON app.workspaces
    FOR DELETE
    USING (app.user_has_workspace_role(id, 'owner'));

-- Workspace Memberships RLS
ALTER TABLE app.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspace_memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memberships_select ON app.workspace_memberships;
CREATE POLICY memberships_select ON app.workspace_memberships
    FOR SELECT
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS memberships_insert ON app.workspace_memberships;
CREATE POLICY memberships_insert ON app.workspace_memberships
    FOR INSERT
    WITH CHECK (
        app.user_has_workspace_role(workspace_id, 'owner')
        OR (
            workspace_id = app.current_workspace_id()
            AND user_id = app.current_user_id()
            AND role = 'owner'
        )
    );

DROP POLICY IF EXISTS memberships_update ON app.workspace_memberships;
CREATE POLICY memberships_update ON app.workspace_memberships
    FOR UPDATE
    USING (app.user_has_workspace_role(workspace_id, 'owner'))
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'owner'));

DROP POLICY IF EXISTS memberships_delete ON app.workspace_memberships;
CREATE POLICY memberships_delete ON app.workspace_memberships
    FOR DELETE
    USING (app.user_has_workspace_role(workspace_id, 'owner'));

-- Items RLS
ALTER TABLE app.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS items_select ON app.items;
CREATE POLICY items_select ON app.items
    FOR SELECT
    USING (
        workspace_id = app.current_workspace_id()
        AND app.user_has_workspace_role(workspace_id, 'viewer')
    );

DROP POLICY IF EXISTS items_insert ON app.items;
CREATE POLICY items_insert ON app.items
    FOR INSERT
    WITH CHECK (
        workspace_id = app.current_workspace_id()
        AND created_by = app.current_user_id()
        AND app.user_has_workspace_role(workspace_id, 'editor')
    );

DROP POLICY IF EXISTS items_update ON app.items;
CREATE POLICY items_update ON app.items
    FOR UPDATE
    USING (
        workspace_id = app.current_workspace_id()
        AND app.user_has_workspace_role(workspace_id, 'editor')
    )
    WITH CHECK (
        workspace_id = app.current_workspace_id()
        AND app.user_has_workspace_role(workspace_id, 'editor')
    );

DROP POLICY IF EXISTS items_delete ON app.items;
CREATE POLICY items_delete ON app.items
    FOR DELETE
    USING (
        workspace_id = app.current_workspace_id()
        AND app.user_has_workspace_role(workspace_id, 'editor')
    );

-- Audit Events RLS
ALTER TABLE app.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_select ON app.audit_events;
CREATE POLICY audit_select ON app.audit_events
    FOR SELECT
    USING (
        workspace_id = app.current_workspace_id()
        AND app.user_has_workspace_role(workspace_id, 'viewer')
    );

DROP POLICY IF EXISTS audit_insert ON app.audit_events;
CREATE POLICY audit_insert ON app.audit_events
    FOR INSERT
    WITH CHECK (
        workspace_id = app.current_workspace_id()
        AND actor_id = app.current_user_id()
        AND app.user_has_workspace_role(workspace_id, 'viewer')
    );

-- Storage Objects RLS
ALTER TABLE app.storage_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.storage_objects FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storage_select ON app.storage_objects;
CREATE POLICY storage_select ON app.storage_objects
    FOR SELECT
    USING (
        workspace_id = app.current_workspace_id()
        AND app.user_has_workspace_role(workspace_id, 'viewer')
    );

DROP POLICY IF EXISTS storage_insert ON app.storage_objects;
CREATE POLICY storage_insert ON app.storage_objects
    FOR INSERT
    WITH CHECK (
        workspace_id = app.current_workspace_id()
        AND owner_id = app.current_user_id()
        AND app.user_has_workspace_role(workspace_id, 'editor')
    );

DROP POLICY IF EXISTS storage_update ON app.storage_objects;
CREATE POLICY storage_update ON app.storage_objects
    FOR UPDATE
    USING (
        workspace_id = app.current_workspace_id()
        AND app.user_has_workspace_role(workspace_id, 'editor')
    )
    WITH CHECK (
        workspace_id = app.current_workspace_id()
        AND app.user_has_workspace_role(workspace_id, 'editor')
    );

DROP POLICY IF EXISTS storage_delete ON app.storage_objects;
CREATE POLICY storage_delete ON app.storage_objects
    FOR DELETE
    USING (
        workspace_id = app.current_workspace_id()
        AND app.user_has_workspace_role(workspace_id, 'editor')
    );

-- Grants to runtime application role
GRANT USAGE ON SCHEMA app TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO daynori_runtime;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO daynori_runtime;
GRANT EXECUTE ON FUNCTION app.current_workspace_id() TO daynori_runtime;
GRANT EXECUTE ON FUNCTION app.user_has_workspace_role(uuid, text) TO daynori_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
