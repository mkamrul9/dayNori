-- Migration: 00012_organization_folders_and_metadata
-- Description: Workspace folders, tags, item tags, item links, cycle prevention, and depth limits
-- Search Path: app, pg_temp

-- 1. Folders table (typed payload for kind = 'folder' items)
CREATE TABLE IF NOT EXISTS app.folders (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    parent_id uuid,
    name text NOT NULL,
    color text,
    icon text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id),
    CONSTRAINT fk_folders_item FOREIGN KEY (workspace_id, id)
        REFERENCES app.items (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_folders_parent FOREIGN KEY (workspace_id, parent_id)
        REFERENCES app.folders (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_folders_workspace_parent ON app.folders (workspace_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_id ON app.folders (id);

-- 2. Tags table (workspace-scoped tags)
CREATE TABLE IF NOT EXISTS app.tags (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text,
    created_by uuid NOT NULL REFERENCES app.profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    revision bigint NOT NULL DEFAULT 1,
    PRIMARY KEY (workspace_id, id),
    UNIQUE (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_workspace_name ON app.tags (workspace_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_tags_workspace_active ON app.tags (workspace_id, deleted_at, name);

-- 3. Item-Tags table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS app.item_tags (
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    item_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_by uuid NOT NULL REFERENCES app.profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, item_id, tag_id),
    CONSTRAINT fk_item_tags_item FOREIGN KEY (workspace_id, item_id)
        REFERENCES app.items (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_item_tags_tag FOREIGN KEY (workspace_id, tag_id)
        REFERENCES app.tags (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_tags_lookup_item ON app.item_tags (workspace_id, item_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_lookup_tag ON app.item_tags (workspace_id, tag_id);

-- 4. Item-Links table (many-to-many relationships between items without copying content)
CREATE TABLE IF NOT EXISTS app.item_links (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    source_item_id uuid NOT NULL,
    target_item_id uuid NOT NULL,
    link_type text NOT NULL DEFAULT 'related',
    created_by uuid NOT NULL REFERENCES app.profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, source_item_id, target_item_id, link_type),
    CONSTRAINT fk_item_links_source FOREIGN KEY (workspace_id, source_item_id)
        REFERENCES app.items (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_item_links_target FOREIGN KEY (workspace_id, target_item_id)
        REFERENCES app.items (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT chk_item_links_no_self CHECK (source_item_id <> target_item_id)
);

CREATE INDEX IF NOT EXISTS idx_item_links_source ON app.item_links (workspace_id, source_item_id);
CREATE INDEX IF NOT EXISTS idx_item_links_target ON app.item_links (workspace_id, target_item_id);

-- 5. Helper Function: Validate Folder Parent, Cycle Prevention, Depth Bounds
CREATE OR REPLACE FUNCTION app.validate_folder_parent(
    p_workspace_id uuid,
    p_folder_id uuid,
    p_target_parent_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = app, pg_temp
AS $$
DECLARE
    curr_id uuid;
    curr_depth integer := 1;
    subtree_max_depth integer := 1;
    v_target_parent_depth integer := 0;
    v_parent_scope text;
    v_folder_scope text;
BEGIN
    -- 1. If target parent is NULL, moving/creating at root (depth 1)
    IF p_target_parent_id IS NULL THEN
        -- If moving an existing folder to root, check that its subtree does not exceed max depth 5
        IF p_folder_id IS NOT NULL THEN
            WITH RECURSIVE sub AS (
                SELECT id, 1 as rel_depth
                FROM app.folders
                WHERE workspace_id = p_workspace_id AND id = p_folder_id
                UNION ALL
                SELECT f.id, sub.rel_depth + 1
                FROM app.folders f
                JOIN sub ON f.parent_id = sub.id
                WHERE f.workspace_id = p_workspace_id
            )
            SELECT COALESCE(MAX(rel_depth), 1) INTO subtree_max_depth FROM sub;

            IF subtree_max_depth > 5 THEN
                RAISE EXCEPTION 'DEPTH_LIMIT_EXCEEDED: Subtree exceeds maximum depth of 5 (rel depth %)', subtree_max_depth
                    USING ERRCODE = '22000';
            END IF;
        END IF;
        RETURN 1;
    END IF;

    -- 2. Verify target parent exists in the same workspace and is not tombstoned
    SELECT i.security_scope INTO v_parent_scope
    FROM app.items i
    WHERE i.workspace_id = p_workspace_id
      AND i.id = p_target_parent_id
      AND i.kind = 'folder'
      AND i.deleted_at IS NULL;

    IF v_parent_scope IS NULL THEN
        RAISE EXCEPTION 'INVALID_PARENT: Target parent folder does not exist or is deleted in workspace %', p_workspace_id
            USING ERRCODE = '23503';
    END IF;

    -- 3. Scope compatibility check if folder_id is given
    IF p_folder_id IS NOT NULL THEN
        SELECT security_scope INTO v_folder_scope
        FROM app.items
        WHERE workspace_id = p_workspace_id AND id = p_folder_id;

        IF v_folder_scope IS NOT NULL AND v_folder_scope <> v_parent_scope THEN
            RAISE EXCEPTION 'INCOMPATIBLE_SECURITY_SCOPE: Folder scope (%) does not match parent scope (%)', v_folder_scope, v_parent_scope
                USING ERRCODE = '22000';
        END IF;
    END IF;

    -- 4. Cycle Detection: Follow parent pointers up from target parent
    -- If we hit p_folder_id, target parent is in p_folder_id's subtree!
    curr_id := p_target_parent_id;
    v_target_parent_depth := 1;

    WHILE curr_id IS NOT NULL LOOP
        IF p_folder_id IS NOT NULL AND curr_id = p_folder_id THEN
            RAISE EXCEPTION 'FOLDER_CYCLE_DETECTED: Target parent is a descendant of folder %', p_folder_id
                USING ERRCODE = '22000';
        END IF;

        SELECT f.parent_id INTO curr_id
        FROM app.folders f
        WHERE f.workspace_id = p_workspace_id AND f.id = curr_id;

        IF curr_id IS NOT NULL THEN
            v_target_parent_depth := v_target_parent_depth + 1;
            IF v_target_parent_depth > 5 THEN
                RAISE EXCEPTION 'DEPTH_LIMIT_EXCEEDED: Target parent hierarchy exceeds maximum depth of 5'
                    USING ERRCODE = '22000';
            END IF;
        END IF;
    END LOOP;

    -- 5. Subtree Depth Bound Check:
    -- Target parent depth + Subtree depth of p_folder_id <= 5
    IF p_folder_id IS NOT NULL THEN
        WITH RECURSIVE sub AS (
            SELECT id, 1 as rel_depth
            FROM app.folders
            WHERE workspace_id = p_workspace_id AND id = p_folder_id
            UNION ALL
            SELECT f.id, sub.rel_depth + 1
            FROM app.folders f
            JOIN sub ON f.parent_id = sub.id
            WHERE f.workspace_id = p_workspace_id
        )
        SELECT COALESCE(MAX(rel_depth), 1) INTO subtree_max_depth FROM sub;
    ELSE
        subtree_max_depth := 1;
    END IF;

    IF v_target_parent_depth + subtree_max_depth > 5 THEN
        RAISE EXCEPTION 'DEPTH_LIMIT_EXCEEDED: Move or creation would result in depth % (parent depth %, subtree depth %)',
            (v_target_parent_depth + subtree_max_depth), v_target_parent_depth, subtree_max_depth
            USING ERRCODE = '22000';
    END IF;

    RETURN v_target_parent_depth + 1;
END;
$$;

-- 6. Enable Row Level Security and Grants
ALTER TABLE app.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.item_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.item_links ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.folders TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.tags TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.item_tags TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.item_links TO daynori_runtime;

-- RLS Policies
DROP POLICY IF EXISTS p_folders_select ON app.folders;
CREATE POLICY p_folders_select ON app.folders
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_folders_insert ON app.folders;
CREATE POLICY p_folders_insert ON app.folders
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_folders_update ON app.folders;
CREATE POLICY p_folders_update ON app.folders
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_folders_delete ON app.folders;
CREATE POLICY p_folders_delete ON app.folders
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_tags_select ON app.tags;
CREATE POLICY p_tags_select ON app.tags
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_tags_insert ON app.tags;
CREATE POLICY p_tags_insert ON app.tags
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_tags_update ON app.tags;
CREATE POLICY p_tags_update ON app.tags
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_tags_delete ON app.tags;
CREATE POLICY p_tags_delete ON app.tags
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_item_tags_select ON app.item_tags;
CREATE POLICY p_item_tags_select ON app.item_tags
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_item_tags_insert ON app.item_tags;
CREATE POLICY p_item_tags_insert ON app.item_tags
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_item_tags_update ON app.item_tags;
CREATE POLICY p_item_tags_update ON app.item_tags
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_item_tags_delete ON app.item_tags;
CREATE POLICY p_item_tags_delete ON app.item_tags
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_item_links_select ON app.item_links;
CREATE POLICY p_item_links_select ON app.item_links
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_item_links_insert ON app.item_links;
CREATE POLICY p_item_links_insert ON app.item_links
    FOR INSERT TO daynori_runtime
    WITH CHECK (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_item_links_update ON app.item_links;
CREATE POLICY p_item_links_update ON app.item_links
    FOR UPDATE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));

DROP POLICY IF EXISTS p_item_links_delete ON app.item_links;
CREATE POLICY p_item_links_delete ON app.item_links
    FOR DELETE TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'editor'));
