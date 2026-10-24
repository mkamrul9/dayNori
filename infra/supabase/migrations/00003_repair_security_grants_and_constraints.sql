-- 00003_repair_security_grants_and_constraints.sql
-- Corrective migration addressing Phase 07 audit findings:
-- 1. Composite folder foreign key deletion: specify (folder_id) on delete set null to preserve workspace_id.
-- 2. Membership privilege escalation: eliminate context spoofing by requiring initial owner bootstrap to match creator workspace with 0 existing members.
-- 3. Replace broad runtime grants: revoke schema-wide grants and grant strictly to the 6 tenant application tables; deny runtime access to app.schema_migrations.

-- 1. Composite folder foreign key correction
ALTER TABLE app.items DROP CONSTRAINT IF EXISTS fk_items_folder;
ALTER TABLE app.items ADD CONSTRAINT fk_items_folder
    FOREIGN KEY (workspace_id, folder_id)
    REFERENCES app.items (workspace_id, id)
    ON DELETE SET NULL (folder_id);

-- 2. Membership privilege escalation fix
DROP POLICY IF EXISTS memberships_insert ON app.workspace_memberships;
CREATE POLICY memberships_insert ON app.workspace_memberships
    FOR INSERT
    WITH CHECK (
        -- Calling user is an existing owner of the workspace (inviting/adding another member)
        app.user_has_workspace_role(workspace_id, 'owner')
        -- OR calling user is bootstrapping their initial owner membership on a workspace they legitimately own
        OR (
            user_id = app.current_user_id()
            AND role = 'owner'
            AND EXISTS (
                SELECT 1 FROM app.workspaces w
                WHERE w.id = workspace_id
                  AND w.owner_id = app.current_user_id()
            )
            AND NOT EXISTS (
                SELECT 1 FROM app.workspace_memberships m
                WHERE m.workspace_id = workspace_id
            )
        )
    );

-- 3. Restrict runtime role grants
-- Revoke broad grant covering all tables in schema app
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM daynori_runtime;

-- Explicitly grant least-privilege permissions only to tenant application tables
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.profiles TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.workspaces TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.workspace_memberships TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.items TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.audit_events TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.storage_objects TO daynori_runtime;

-- Ensure daynori_runtime cannot read or modify the migration ledger
REVOKE ALL ON TABLE app.schema_migrations FROM daynori_runtime;
