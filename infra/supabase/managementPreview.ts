import crypto from 'node:crypto';

// This operator client cannot be redirected to another account or project.
export const previewProjectRef = 'sexxceqqknqzvxuuqnkx';

export class PreviewManagementClient {
  constructor(private readonly token: string) {
    if (!/^sbp_[A-Za-z0-9_]+$/.test(token)) throw new Error('Invalid setup credential');
  }

  async query(query: string, parameters?: unknown[], readOnly = false): Promise<unknown> {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${previewProjectRef}/database/query`,
      {
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, ...(parameters ? { parameters } : {}), read_only: readOnly }),
        signal: AbortSignal.timeout(60000),
      }
    );
    if (!response.ok) {
      // Provider diagnostics can contain SQL and credentials; expose fixed categories only.
      const diagnostic = await response.text();
      const reason = /permission denied to alter role/i.test(diagnostic)
        ? 'role alteration permission'
        : /only superusers/i.test(diagnostic)
          ? 'superuser-only operation'
          : /permission denied for schema storage/i.test(diagnostic)
            ? 'managed storage schema permission'
            : /permission denied for table objects/i.test(diagnostic)
              ? 'managed storage objects permission'
              : /must be owner/i.test(diagnostic)
                ? 'managed object ownership'
                : /permission denied/i.test(diagnostic)
                  ? 'database permission'
                  : /multiple commands/i.test(diagnostic)
                    ? 'parameterized multi-statement query'
                    : /already exists/i.test(diagnostic)
                      ? 'object already exists'
                      : /does not exist/i.test(diagnostic)
                        ? 'missing database object'
                        : 'query rejected';
      throw new Error(`Management SQL ${response.status}: ${reason}`);
    }
    return response.json();
  }
}

/** Disable all service logins before any historical fixture-password DDL commits. */
export const previewRoleGuard = `DO $preview_guard$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daynori_runtime') THEN
    ALTER ROLE daynori_runtime NOLOGIN PASSWORD NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daynori_billing') THEN
    ALTER ROLE daynori_billing NOLOGIN PASSWORD NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daynori_worker') THEN
    ALTER ROLE daynori_worker NOLOGIN PASSWORD NULL;
  END IF;
END $preview_guard$;`;

export function managedCoreMigrationSql(name: string, sql: string): string {
  if (name === '00069_billing_role_password_align.sql') {
    // This local-fixture migration must never activate billing in a free cloud preview.
    return 'ALTER ROLE daynori_billing NOLOGIN PASSWORD NULL NOINHERIT;';
  }
  if (name !== '00007_storage_policies_and_context.sql') return sql;
  const start = sql.indexOf('-- 3. Ensure storage schema');
  const end = sql.indexOf('-- 6. Grant least-privilege');
  if (start < 0 || end <= start) throw new Error('Managed Storage adaptation source changed');
  // Supabase owns the existing tables. Core preview creates no buckets or object bytes.
  // Policies/grants and app identity helpers still execute; source SQL remains immutable.
  return (
    sql.slice(0, start) +
    '-- Managed Storage already provisioned; no bucket in core preview.\n' +
    sql.slice(end)
  );
}

export function previewMigrationBatch(name: string, sql: string, checksum: string): string {
  if (!/^\d{5}_[a-z0-9_]+\.sql$/.test(name)) throw new Error('Invalid migration name');
  const expected = crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
  if (checksum !== expected) throw new Error('Migration checksum mismatch');
  const version = name.slice(0, 5);
  const executedSql = managedCoreMigrationSql(name, sql);
  const executionChecksum = crypto.createHash('sha256').update(executedSql, 'utf8').digest('hex');
  // Only validated immutable source identifiers are interpolated; secrets use bound parameters.
  return `BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtext('daynori_schema_migrations'));
DO $preview_receipt$ BEGIN
  IF EXISTS (SELECT 1 FROM app.schema_migrations WHERE version = '${version}') THEN
    RAISE EXCEPTION 'Migration was applied concurrently';
  END IF;
END $preview_receipt$;
${executedSql}
${previewRoleGuard}
${executedSql === sql ? '' : `INSERT INTO app.preview_migration_adaptations(version, source_checksum, execution_checksum, profile) VALUES ('${version}', '${checksum}', '${executionChecksum}', 'managed-core-no-storage');`}
INSERT INTO app.schema_migrations (version, name, checksum)
VALUES ('${version}', '${name}', '${checksum}');
COMMIT;`;
}

export const previewActivationHelper = `BEGIN;
CREATE OR REPLACE FUNCTION app.preview_activate_runtime(password_value text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $activate$
BEGIN
  IF password_value !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid generated credential'; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='daynori_runtime'
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Unsafe runtime attributes';
  END IF;
  EXECUTE format('ALTER ROLE daynori_runtime LOGIN PASSWORD %L', password_value);
END $activate$;
REVOKE ALL ON FUNCTION app.preview_activate_runtime(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.preview_activate_runtime(text) FROM daynori_runtime, daynori_worker, daynori_billing;
COMMIT;`;
