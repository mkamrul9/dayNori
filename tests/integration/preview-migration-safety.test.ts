import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { createAdminPool, getAdminDatabaseConfig } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { secureCorePreviewRoles } from '../../infra/supabase/previewRoles.js';

const config = getAdminDatabaseConfig();
if (!['127.0.0.1', 'localhost'].includes(config.host))
  throw new Error('Local synthetic database required');
const pool = createAdminPool();
afterAll(() => pool.end());

it('rolls back schema and migration receipt if the credential safeguard fails', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daynori-preview-migration-'));
  const version = '99990';
  await fs.writeFile(
    path.join(dir, `${version}_preview_hook_test.sql`),
    'CREATE TABLE app.preview_hook_probe (id integer);'
  );
  const migrator = new Migrator({
    ...config,
    migrationsDir: dir,
    beforeCommit: async () => {
      throw new Error('synthetic safeguard failure');
    },
  });
  try {
    await expect(migrator.migrate()).rejects.toThrow('synthetic safeguard failure');
    const state = await pool.query(
      "SELECT to_regclass('app.preview_hook_probe') AS relation, EXISTS(SELECT 1 FROM app.schema_migrations WHERE version=$1) AS receipt",
      [version]
    );
    expect(state.rows[0]).toEqual({ relation: null, receipt: false });
  } finally {
    await migrator.close();
    await fs.rm(dir, { recursive: true });
  }
});

it('keeps unused service logins disabled without granting runtime administration', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await secureCorePreviewRoles(client, 'a'.repeat(64));
    const result = await client.query(
      'SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname',
      [['daynori_billing', 'daynori_runtime', 'daynori_worker']]
    );
    expect(result.rows).toEqual([
      {
        rolname: 'daynori_billing',
        rolcanlogin: false,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolbypassrls: false,
      },
      {
        rolname: 'daynori_runtime',
        rolcanlogin: true,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolbypassrls: false,
      },
      {
        rolname: 'daynori_worker',
        rolcanlogin: false,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolbypassrls: false,
      },
    ]);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
