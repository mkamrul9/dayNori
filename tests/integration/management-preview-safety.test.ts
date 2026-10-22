import crypto from 'node:crypto';
import fs from 'node:fs';
import { afterAll, expect, it, vi } from 'vitest';
import { createAdminPool, getAdminDatabaseConfig } from '../../apps/api/src/db/index.js';
import {
  PreviewManagementClient,
  managedCoreMigrationSql,
  previewMigrationBatch,
  previewRoleGuard,
} from '../../infra/supabase/managementPreview.js';

if (!['127.0.0.1', 'localhost'].includes(getAdminDatabaseConfig().host))
  throw new Error('Local synthetic database required');
const pool = createAdminPool();
afterAll(() => pool.end());

it('rolls back failed multi-statement migration DDL and its receipt together', async () => {
  const client = await pool.connect();
  const sql =
    'CREATE TABLE app.preview_management_probe (id int); SELECT * FROM app.nonexistent_preview_relation;';
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');
  try {
    await expect(
      client.query(previewMigrationBatch('99989_preview_management_probe.sql', sql, checksum))
    ).rejects.toThrow();
    await client.query('ROLLBACK');
    const result = await client.query(
      "SELECT to_regclass('app.preview_management_probe') IS NULL AS absent, NOT EXISTS(SELECT 1 FROM app.schema_migrations WHERE version='99989') AS no_receipt"
    );
    expect(result.rows[0]).toEqual({ absent: true, no_receipt: true });
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

it('disables fixture logins within the migration transaction', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(previewRoleGuard);
    const result = await client.query(
      "SELECT rolname FROM pg_roles WHERE rolname IN ('daynori_runtime','daynori_billing','daynori_worker') AND rolcanlogin"
    );
    expect(result.rows).toEqual([]);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

it('rejects altered source and SQL-bearing migration identifiers', () => {
  expect(() => previewMigrationBatch('99989_probe.sql', 'SELECT 1;', '0'.repeat(64))).toThrow(
    'checksum'
  );
  expect(() => previewMigrationBatch("99989_probe';DROP.sql", 'SELECT 1;', '')).toThrow('name');
});

it('preserves Storage policies while omitting provider-owned scaffolding and bucket creation', () => {
  const source = fs.readFileSync(
    'infra/supabase/migrations/00007_storage_policies_and_context.sql',
    'utf8'
  );
  const executed = managedCoreMigrationSql('00007_storage_policies_and_context.sql', source);
  expect(executed).not.toMatch(/CREATE TABLE|INSERT INTO storage.buckets|ALTER TABLE storage/);
  for (const action of ['select', 'insert', 'update', 'delete'])
    expect(executed).toContain(`CREATE POLICY "private_assets_${action}"`);
  const checksum = crypto.createHash('sha256').update(source).digest('hex');
  expect(
    previewMigrationBatch('00007_storage_policies_and_context.sql', source, checksum)
  ).toContain('INSERT INTO app.preview_migration_adaptations');
});

it('redacts provider SQL diagnostics rather than exposing a credential', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response("SQL failed PASSWORD 'synthetic-private-value'", { status: 400 })
      )
  );
  try {
    const api = new PreviewManagementClient('sbp_' + 'x'.repeat(40));
    await expect(api.query('SELECT 1')).rejects.toThrow('Management SQL 400: query rejected');
  } finally {
    vi.unstubAllGlobals();
  }
});
