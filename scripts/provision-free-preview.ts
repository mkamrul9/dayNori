import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { Migrator } from '../infra/supabase/migrator.js';
import { secureCorePreviewRoles } from '../infra/supabase/previewRoles.js';

// Deliberately restricted to the owner's newly created, disposable preview project.
// This command never loads the local test .env as a cloud database target.
const projectRef = 'sexxceqqknqzvxuuqnkx';
const host = 'aws-0-ap-southeast-1.pooler.supabase.com';
const privateDir = path.resolve('artifacts/local');
const credentialFile = path.join(privateDir, 'supabase-preview-private.env');
const outputFile = path.join(privateDir, 'render-api-private.env');
const runtimeSecretFile = path.join(privateDir, 'preview-runtime-secret');
const reauthSecretFile = path.join(privateDir, 'preview-reauth-secret');

async function main(): Promise<void> {
  const raw = fs.readFileSync(credentialFile, 'utf8');
  const password = raw.match(/^PREVIEW_DATABASE_PASSWORD=(.*)$/m)?.[1]?.trim();
  if (!password)
    throw new Error('Save the new database password in the private deployment file first.');
  const publicKey = raw.match(/^PREVIEW_SUPABASE_ANON_KEY=(.*)$/m)?.[1]?.trim();
  if (!publicKey?.startsWith('sb_publishable_'))
    throw new Error('Public preview Auth configuration is missing.');
  // Retain one generated secret across retries and verify it before touching the database.
  if (!fs.existsSync(runtimeSecretFile))
    fs.writeFileSync(runtimeSecretFile, crypto.randomBytes(32).toString('hex'), {
      mode: 0o600,
      flag: 'wx',
    });
  const runtimePassword = fs.readFileSync(runtimeSecretFile, 'utf8');
  if (!/^[a-f0-9]{64}$/.test(runtimePassword))
    throw new Error('Invalid local preview runtime secret.');
  if (!fs.existsSync(reauthSecretFile))
    fs.writeFileSync(reauthSecretFile, crypto.randomBytes(32).toString('hex'), {
      mode: 0o600,
      flag: 'wx',
    });
  const reauthSecret = fs.readFileSync(reauthSecretFile, 'utf8');
  if (!/^[a-f0-9]{64}$/.test(reauthSecret))
    throw new Error('Invalid local preview reauthentication secret.');
  // Explicit URL also overrides DATABASE_ADMIN_URL from an existing local .env.
  const target = new URL(`postgresql://${host}:5432/postgres`);
  target.username = `postgres.${projectRef}`;
  target.password = password;
  const migrator = new Migrator({
    connectionString: target.toString(),
    host,
    port: 5432,
    database: 'postgres',
    user: `postgres.${projectRef}`,
    password,
    ssl: { rejectUnauthorized: true },
    beforeCommit: (client) => secureCorePreviewRoles(client, runtimePassword),
  });
  try {
    const result = await migrator.migrate();
    const runtimeTarget = new URL(target);
    runtimeTarget.username = `daynori_runtime.${projectRef}`;
    runtimeTarget.password = runtimePassword;
    const runtime = new Pool({
      connectionString: runtimeTarget.toString(),
      ssl: { rejectUnauthorized: true },
      max: 1,
      connectionTimeoutMillis: 15000,
    });
    try {
      const check = await runtime.query<{
        role: string;
        unsafe: boolean;
      }>(`SELECT current_user AS role,
        (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR has_schema_privilege(current_user, 'app', 'CREATE') OR pg_has_role(current_user, 'daynori_worker', 'MEMBER')) AS unsafe
        FROM pg_roles WHERE rolname = current_user`);
      if (check.rows[0]?.role !== 'daynori_runtime' || check.rows[0]?.unsafe !== false)
        throw new Error('Runtime role verification failed');
      await runtime.query('SELECT id FROM app.items LIMIT 1');
    } finally {
      await runtime.end();
    }
    const origin = `https://${projectRef}.supabase.co`;
    fs.writeFileSync(
      outputFile,
      [
        'NODE_ENV=production',
        'DAYNORI_CORE_PREVIEW=true',
        `DB_HOST=${host}`,
        'DB_PORT=5432',
        'DB_NAME=postgres',
        `DB_USER=daynori_runtime.${projectRef}`,
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
      `Preview schema ready: ${result.applied.length} applied, ${result.skipped.length} already applied. Private API configuration saved locally.`
    );
  } finally {
    await migrator.close();
  }
}

main().catch((error: unknown) => {
  // Provider error text may include SQL, connection strings, or passwords.
  const migration =
    error instanceof Error
      ? error.message.match(/^Failed to apply migration (\d{5}_[a-z0-9_]+\.sql):/)?.[1]
      : undefined;
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z0-9_]{1,40}$/.test(error.code)
      ? error.code
      : undefined;
  console.error(
    `Preview database setup failed${migration ? ` at ${migration}` : code ? ` (${code})` : ''}. Check the private password file, TLS trust, and project availability. No credential details were logged.`
  );
  process.exitCode = 1;
});
