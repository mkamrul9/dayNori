-- 00060_ai_budget_delete_grant.sql
-- Allow runtime to clear own budget windows (consent/disable tests and owner reset paths).

GRANT SELECT, INSERT, UPDATE, DELETE ON app.ai_budget_windows TO daynori_runtime;
