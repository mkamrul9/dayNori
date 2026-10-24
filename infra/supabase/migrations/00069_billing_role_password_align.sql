-- 00069_billing_role_password_align.sql
-- Align local daynori_billing password with documented non-release default.
-- Idempotent; production must set BILLING_DB_PASSWORD via secrets, not this string.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daynori_billing') THEN
    ALTER ROLE daynori_billing WITH LOGIN PASSWORD 'billing_dev_secret_9876'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;
