-- API credentials retain tenant RLS. The separate worker processes trusted
-- server-created jobs across tenants and needs application DML, never database
-- administration, auth-schema access, or role creation. LOGIN/password activation
-- is an operator step; no deployable credential is embedded in this migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daynori_worker') THEN
    CREATE ROLE daynori_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA app TO daynori_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO daynori_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO daynori_worker;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO daynori_worker;
-- Immutable migration history is not part of job processing.
REVOKE INSERT, UPDATE, DELETE ON app.schema_migrations FROM daynori_worker;

DO $$
DECLARE relation record;
BEGIN
  FOR relation IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    EXECUTE format('CREATE POLICY application_worker_service ON app.%I FOR ALL TO daynori_worker USING (true) WITH CHECK (true)', relation.relname);
  END LOOP;
END $$;
