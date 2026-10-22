import { afterAll, beforeAll, expect, it } from 'vitest';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';

const admin = createAdminPool();
const runtime = createRuntimePool();
beforeAll(async () => {
  const migrator = new Migrator();
  try {
    await migrator.migrate();
  } finally {
    await migrator.close();
  }
});
afterAll(async () => {
  await runtime.end();
  await admin.end();
});

it('does not let API runtime credentials assume the application worker role', async () => {
  const client = await runtime.connect();
  try {
    await expect(client.query('SET ROLE daynori_worker')).rejects.toMatchObject({ code: '42501' });
  } finally {
    client.release();
  }
});

it('grants the worker application DML without migration writes, DDL, or database administration', async () => {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE daynori_worker');
    const role = await client.query(
      'SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = current_user'
    );
    expect(role.rows[0]).toEqual({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolbypassrls: false,
    });
    const permissions =
      await client.query(`SELECT has_schema_privilege(current_user, 'app', 'CREATE') AS ddl,
      has_table_privilege(current_user, 'app.schema_migrations', 'UPDATE') AS migration_write,
      has_table_privilege(current_user, 'app.background_jobs', 'UPDATE') AS queue_write`);
    expect(permissions.rows[0]).toEqual({ ddl: false, migration_write: false, queue_write: true });
    // This must work with no user context: the worker reconciles trusted jobs
    // globally using its separate application-service policy, never API login.
    await client.query('SELECT id FROM app.upload_reservations LIMIT 1');
    await client.query('SELECT id FROM app.reminder_instances LIMIT 1');
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
