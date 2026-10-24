-- Migration 00013: Enforce Folder Hierarchy Triggers, Scope Compatibility, and Item Link Constraints

-- 1. Enhanced validate_folder_parent with explicit security scope parameter
CREATE OR REPLACE FUNCTION app.validate_folder_parent(
    p_workspace_id uuid,
    p_folder_id uuid,
    p_target_parent_id uuid,
    p_security_scope text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
    curr_id uuid;
    v_target_parent_depth integer := 0;
    subtree_max_depth integer := 1;
    v_parent_scope text;
    v_folder_scope text := p_security_scope;
BEGIN
    -- 1. If target parent is NULL, moving/creating at root (depth 1)
    IF p_target_parent_id IS NULL THEN
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

    -- 3. Scope compatibility check
    IF v_folder_scope IS NULL AND p_folder_id IS NOT NULL THEN
        SELECT security_scope INTO v_folder_scope
        FROM app.items
        WHERE workspace_id = p_workspace_id AND id = p_folder_id;
    END IF;

    IF v_folder_scope IS NOT NULL AND v_folder_scope <> v_parent_scope THEN
        RAISE EXCEPTION 'INCOMPATIBLE_SECURITY_SCOPE: Folder scope (%) does not match parent scope (%)', v_folder_scope, v_parent_scope
            USING ERRCODE = '22000';
    END IF;

    -- 4. Cycle Detection: Follow parent pointers up from target parent
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

-- 2. Trigger on app.folders for automatic parent hierarchy enforcement
CREATE OR REPLACE FUNCTION app.trg_folders_validate_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
    v_scope text;
BEGIN
    SELECT security_scope INTO v_scope
    FROM app.items
    WHERE workspace_id = NEW.workspace_id AND id = NEW.id;

    PERFORM app.validate_folder_parent(NEW.workspace_id, NEW.id, NEW.parent_id, v_scope);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_folders_validate_parent ON app.folders;
CREATE TRIGGER trg_folders_validate_parent
    BEFORE INSERT OR UPDATE OF parent_id, workspace_id ON app.folders
    FOR EACH ROW
    EXECUTE FUNCTION app.trg_folders_validate_parent();

-- 3. Trigger on app.items for folder_id and security_scope validation
CREATE OR REPLACE FUNCTION app.trg_items_validate_folder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
    v_parent_scope text;
    v_parent_kind text;
    v_parent_deleted timestamptz;
BEGIN
    IF NEW.folder_id IS NOT NULL THEN
        SELECT security_scope, kind, deleted_at INTO v_parent_scope, v_parent_kind, v_parent_deleted
        FROM app.items
        WHERE workspace_id = NEW.workspace_id AND id = NEW.folder_id;

        IF v_parent_scope IS NULL OR v_parent_deleted IS NOT NULL THEN
            RAISE EXCEPTION 'INVALID_FOLDER: Target folder % does not exist or is deleted', NEW.folder_id
                USING ERRCODE = '23503';
        END IF;

        IF v_parent_kind <> 'folder' THEN
            RAISE EXCEPTION 'INVALID_FOLDER: Target item % is not a folder', NEW.folder_id
                USING ERRCODE = '22000';
        END IF;

        IF NEW.security_scope <> v_parent_scope THEN
            RAISE EXCEPTION 'INCOMPATIBLE_SECURITY_SCOPE: Item scope (%) does not match folder scope (%)', NEW.security_scope, v_parent_scope
                USING ERRCODE = '22000';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_items_validate_folder ON app.items;
CREATE TRIGGER trg_items_validate_folder
    BEFORE INSERT OR UPDATE OF folder_id, security_scope ON app.items
    FOR EACH ROW
    EXECUTE FUNCTION app.trg_items_validate_folder();

-- 4. Trigger on app.item_links for self-link and security-scope enforcement
CREATE OR REPLACE FUNCTION app.trg_item_links_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
    v_source_scope text;
    v_target_scope text;
BEGIN
    IF NEW.source_item_id = NEW.target_item_id THEN
        RAISE EXCEPTION 'SELF_LINK_FORBIDDEN: Cannot link item to itself'
            USING ERRCODE = '22000';
    END IF;

    SELECT security_scope INTO v_source_scope
    FROM app.items
    WHERE workspace_id = NEW.workspace_id AND id = NEW.source_item_id AND deleted_at IS NULL;

    SELECT security_scope INTO v_target_scope
    FROM app.items
    WHERE workspace_id = NEW.workspace_id AND id = NEW.target_item_id AND deleted_at IS NULL;

    IF v_source_scope IS NULL OR v_target_scope IS NULL THEN
        RAISE EXCEPTION 'INVALID_ITEM_LINK: Source or target item not found'
            USING ERRCODE = '23503';
    END IF;

    IF v_source_scope <> v_target_scope THEN
        RAISE EXCEPTION 'INCOMPATIBLE_SECURITY_SCOPE: Cannot link items across security scopes (% vs %)', v_source_scope, v_target_scope
            USING ERRCODE = '22000';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_item_links_validate ON app.item_links;
CREATE TRIGGER trg_item_links_validate
    BEFORE INSERT OR UPDATE ON app.item_links
    FOR EACH ROW
    EXECUTE FUNCTION app.trg_item_links_validate();
