import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import {
  PreviewManagementClient,
  previewProjectRef,
  previewMigrationBatch,
  previewActivationHelper,
  managedCoreMigrationSql,
} from '../infra/supabase/managementPreview.js';

const privateDir = path.resolve('artifacts/local');
const host = 'aws-0-ap-southeast-1.pooler.supabase.com';
let stage = 'setup';

function localSecret(name: string): string {
  const file = path.join(privateDir, name);
  if (!fs.existsSync(file))
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  const value = fs.readFileSync(file, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid generated local credential');
  return value;
}

async function main(): Promise<void> {
  const token = fs
    .readFileSync(path.join(privateDir, 'supabase-preview-management-token'), 'utf8')
    .trim();
  const api = new PreviewManagementClient(token);
  const runtimePassword = localSecret('preview-runtime-secret');
  const reauthSecret = localSecret('preview-reauth-secret');
  const input = fs.readFileSync(path.join(privateDir, 'supabase-preview-private.env'), 'utf8');
  const publicKey = input.match(/^PREVIEW_SUPABASE_ANON_KEY=(.*)$/m)?.[1]?.trim();
  if (!publicKey?.startsWith('sb_publishable_')) throw new Error('Missing public Auth key');

  stage = 'initialize';
  const managedStorage = await api.query(
    `SELECT
    (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass) AS rls_enabled,
    (SELECT count(*)::int FROM storage.buckets) AS buckets,
    (SELECT count(*)::int FROM storage.objects) AS objects`,
    undefined,
    true
  );
  if (
    !Array.isArray(managedStorage) ||
    managedStorage[0]?.rls_enabled !== true ||
    managedStorage[0]?.buckets !== 0 ||
    managedStorage[0]?.objects !== 0
  )
    throw new Error('Expected empty managed Storage with RLS enabled');
  await api.query(`BEGIN;
    CREATE SCHEMA IF NOT EXISTS app;
    CREATE TABLE IF NOT EXISTS app.schema_migrations (
      version text PRIMARY KEY, name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(), checksum text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app.preview_migration_adaptations (
      version text PRIMARY KEY, source_checksum text NOT NULL,
      execution_checksum text NOT NULL, profile text NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT now()
    );
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='daynori_runtime') THEN
        CREATE ROLE daynori_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='daynori_billing') THEN
        CREATE ROLE daynori_billing NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      END IF;
    END $$;
    COMMIT;`);
  const records = await api.query(
    'SELECT version, checksum FROM app.schema_migrations ORDER BY version',
    undefined,
    true
  );
  if (!Array.isArray(records)) throw new Error('Invalid migration history');
  const applied = new Map<string, string>();
  for (const record of records) {
    if (typeof record?.version !== 'string' || typeof record?.checksum !== 'string')
      throw new Error('Invalid migration receipt');
    applied.set(record.version, record.checksum);
  }
  const dir = path.resolve('infra/supabase/migrations');
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const adaptations = await api.query(
    'SELECT version,source_checksum,execution_checksum,profile FROM app.preview_migration_adaptations',
    undefined,
    true
  );
  if (!Array.isArray(adaptations)) throw new Error('Invalid adaptation history');
  for (const name of files) {
    stage = name;
    const sql = fs.readFileSync(path.join(dir, name), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
    const receipt = applied.get(name.slice(0, 5));
    if (receipt !== undefined) {
      if (receipt !== checksum) throw new Error('Immutable migration differs');
      const executedSql = managedCoreMigrationSql(name, sql);
      if (executedSql !== sql) {
        const executionChecksum = crypto
          .createHash('sha256')
          .update(executedSql, 'utf8')
          .digest('hex');
        const adaptation = adaptations.find((record) => record?.version === name.slice(0, 5));
        if (
          adaptation?.source_checksum !== checksum ||
          adaptation?.execution_checksum !== executionChecksum ||
          adaptation?.profile !== 'managed-core-no-storage'
        )
          throw new Error('Managed adaptation history differs');
      }
      continue;
    }
    await api.query(previewMigrationBatch(name, sql, checksum));
    console.log(`Applied ${name}`);
  }
  stage = 'activate restricted runtime';
  await api.query(
    'REVOKE ALL ON app.preview_migration_adaptations FROM daynori_runtime, daynori_worker, daynori_billing'
  );
  const roleState = await api.query(
    "SELECT rolcanlogin FROM pg_roles WHERE rolname='daynori_runtime'",
    undefined,
    true
  );
  if (!Array.isArray(roleState) || typeof roleState[0]?.rolcanlogin !== 'boolean')
    throw new Error('Missing runtime role');
  // Preserve active SCRAM verifiers on retries because the pooler caches them.
  if (!roleState[0].rolcanlogin) {
    await api.query(previewActivationHelper);
    try {
      await api.query('SELECT app.preview_activate_runtime($1::text)', [runtimePassword]);
    } finally {
      await api.query('DROP FUNCTION IF EXISTS app.preview_activate_runtime(text)');
    }
  }

  stage = 'TLS runtime verification';
  const runtime = new Pool({
    host,
    port: 5432,
    database: 'postgres',
    user: `daynori_runtime.${previewProjectRef}`,
    password: runtimePassword,
    ssl: {
      rejectUnauthorized: true,
      ca: fs.readFileSync('infra/deployment/supabase-preview-ca.crt', 'utf8'),
    },
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  try {
    const result = await runtime.query<{
      role: string;
      unsafe: boolean;
    }>(`SELECT current_user AS role,
      (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls
      OR has_schema_privilege(current_user,'app','CREATE')
      OR pg_has_role(current_user,'daynori_worker','MEMBER')) AS unsafe
      FROM pg_roles WHERE rolname=current_user`);
    if (result.rows[0]?.role !== 'daynori_runtime' || result.rows[0]?.unsafe !== false)
      throw new Error('Restricted role check failed');
    await runtime.query('SELECT id FROM app.items LIMIT 1');
  } finally {
    await runtime.end();
  }
  const origin = `https://${previewProjectRef}.supabase.co`;
  fs.writeFileSync(
    path.join(privateDir, 'render-api-private.env'),
    [
      'NODE_VERSION=24.21.0',
      'NODE_ENV=production',
      'DAYNORI_CORE_PREVIEW=true',
      `DB_HOST=${host}`,
      'DB_PORT=5432',
      'DB_NAME=postgres',
      `DB_USER=daynori_runtime.${previewProjectRef}`,
      `DB_PASSWORD=${runtimePassword}`,
      'DB_POOL_MAX=3',
      'PGSSLMODE=verify-full',
      `SUPABASE_URL=${origin}`,
      `SUPABASE_ANON_KEY=${publicKey}`,
      `REAUTH_SIGNING_SECRET=${reauthSecret}`,
      `SUPABASE_JWKS_URL=${origin}/auth/v1/.well-known/jwks.json`,
      `SUPABASE_JWT_ISSUER=${origin}/auth/v1`,
      'SUPABASE_JWT_AUDIENCE=authenticated',
      '',
    ].join('\n'),
    { mode: 0o600 }
  );
  console.log(
    `Cloud schema verified (${files.length} migrations). Restricted TLS login passed. Private Render configuration saved locally.`
  );
}

main().catch((error: unknown) => {
  const safeReason =
    error instanceof Error && /^Management SQL \d{3}: [a-z -]+$/.test(error.message)
      ? ` (${error.message})`
      : '';
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z0-9_]{1,50}$/.test(error.code)
      ? ` [${error.code}]`
      : '';
  const invariant =
    error instanceof Error && error.message === 'Restricted role check failed'
      ? ' [ROLE_INVARIANT]'
      : '';
  console.error(
    `Preview setup stopped at ${stage}${safeReason}${code}${invariant}. No credential or provider SQL was logged.`
  );
  process.exitCode = 1;
});
