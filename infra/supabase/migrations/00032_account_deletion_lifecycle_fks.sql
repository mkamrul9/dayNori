-- 00032_account_deletion_lifecycle_fks.sql
-- Allow account profile deletion to succeed while preserving deletion audit logs and suppression ledgers.

ALTER TABLE app.account_deletions DROP CONSTRAINT IF EXISTS account_deletions_user_id_fkey;
ALTER TABLE app.workspace_deletions DROP CONSTRAINT IF EXISTS workspace_deletions_requested_by_fkey;
ALTER TABLE app.workspace_exports DROP CONSTRAINT IF EXISTS workspace_exports_user_id_fkey;
ALTER TABLE app.workspace_imports DROP CONSTRAINT IF EXISTS workspace_imports_user_id_fkey;
