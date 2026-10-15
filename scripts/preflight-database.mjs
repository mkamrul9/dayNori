import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// Load .env if present
try {
  if (typeof process.loadEnvFile === 'function') {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  }
} catch {
  // Ignore
}

const { Pool } = pg;

const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || 5432);
const database = process.env.DB_NAME || 'daynori_test';
const user = process.env.DB_USER || 'daynori_runtime';
const password = process.env.DB_PASSWORD || '';

const pool = new Pool({
  host,
  port,
  database,
  user,
  password,
  max: 2,
  connectionTimeoutMillis: 5000,
});

async function runPreflight() {
  console.log(`[preflight] Checking database ${user}@${host}:${port}/${database}...`);
  const client = await pool.connect();

  try {
    // 1. Check for duplicate personal workspaces
    const dupRes = await client.query(`
      SELECT owner_id, count(*)::int as count
      FROM app.workspaces
      WHERE kind = 'personal'
      GROUP BY owner_id
      HAVING count(*) > 1;
    `);

    if (dupRes.rows.length > 0) {
      console.error(
        `[preflight:FAIL] Detected ${dupRes.rows.length} owner(s) with duplicate personal workspaces!`
      );
      for (const row of dupRes.rows) {
        console.error(`  - Owner ${row.owner_id}: ${row.count} personal workspaces`);
      }
      console.error(
        `[preflight:ACTION] Do not automatically convert rows to rooms without authorization. Run the reviewed reconciliation procedure: app.reconcile_legacy_workspace(id, action).`
      );
      process.exit(1);
    }

    // 2. Check reconciliation inventory
    const invRes = await client.query(`
      SELECT status, count(*)::int as count
      FROM app.legacy_workspace_reconciliation_inventory
      GROUP BY status;
    `);

    if (invRes.rows.length > 0) {
      console.log(`[preflight:INFO] Workspace reconciliation inventory status:`);
      for (const row of invRes.rows) {
        console.log(`  - ${row.status}: ${row.count}`);
      }
    } else {
      console.log(`[preflight:OK] No legacy workspace reconciliation records pending.`);
    }

    // 3. Check personal workspace uniqueness constraint
    const idxRes = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'app' AND tablename = 'workspaces' AND indexname = 'idx_workspaces_personal_owner';
    `);

    if (idxRes.rows.length === 0) {
      console.warn(
        `[preflight:WARN] Missing index idx_workspaces_personal_owner on app.workspaces`
      );
    } else {
      console.log(`[preflight:OK] Index idx_workspaces_personal_owner verified.`);
    }

    console.log(`[preflight:OK] Database preflight checks passed.`);
  } finally {
    client.release();
    await pool.end();
  }
}

runPreflight().catch((err) => {
  console.error('[preflight:ERROR]', err);
  process.exit(1);
});
