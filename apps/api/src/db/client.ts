import { Pool, type PoolClient } from 'pg';
import {
  type DatabaseConfig,
  type TenantContext,
  getRuntimeDatabaseConfig,
  getAdminDatabaseConfig,
} from './config.js';

let defaultRuntimePool: Pool | null = null;

export function createRuntimePool(config?: DatabaseConfig): Pool {
  const cfg = config || getRuntimeDatabaseConfig();
  return new Pool(cfg);
}

export function createAdminPool(config?: DatabaseConfig): Pool {
  const cfg = config || getAdminDatabaseConfig();
  return new Pool(cfg);
}

export function getDefaultRuntimePool(): Pool {
  if (!defaultRuntimePool) {
    defaultRuntimePool = createRuntimePool();
  }
  return defaultRuntimePool;
}

export async function closeDefaultRuntimePool(): Promise<void> {
  if (defaultRuntimePool) {
    await defaultRuntimePool.end();
    defaultRuntimePool = null;
  }
}

/**
 * Invariant: Context is applied via set_config(..., is_local = true), guaranteeing that
 * the variables are strictly local to this specific transaction. Upon COMMIT or ROLLBACK,
 * PostgreSQL resets the context, preventing identity leakage across pooled connections.
 */
export interface TenantContextOptions {
  isolationLevel?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
}

/**
 * Executes a unit of work scoped to a verified tenant context inside a database transaction.
 * Sets PostgreSQL session variables (app.current_user_id, app.current_workspace_id) with
 * is_local=true so that RLS policies enforce isolation for the duration of the transaction.
 * PostgreSQL resets the context, preventing identity leakage across pooled connections.
 */
export async function withTenantContext<T>(
  pool: Pool,
  context: TenantContext,
  callback: (client: PoolClient) => Promise<T>,
  options?: TenantContextOptions
): Promise<T> {
  if (!context.userId || !context.workspaceId) {
    throw new Error('TenantContext requires both userId and workspaceId');
  }

  const client = await pool.connect();
  let discardConnection = false;
  try {
    const beginSql = options?.isolationLevel
      ? `BEGIN TRANSACTION ISOLATION LEVEL ${options.isolationLevel};`
      : 'BEGIN;';
    await client.query(beginSql);
    await client.query("SELECT set_config('app.current_user_id', $1, true);", [context.userId]);
    await client.query("SELECT set_config('app.current_workspace_id', $1, true);", [
      context.workspaceId,
    ]);

    const result = await callback(client);
    await client.query('COMMIT;');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK;');
    } catch {
      discardConnection = true;
    }
    throw error;
  } finally {
    client.release(discardConnection);
  }
}

/**
 * Executes a unit of work scoped to a verified user context inside a database transaction.
 * Used for listing workspaces or creating an initial workspace prior to workspace context selection.
 */
export async function withUserContext<T>(
  pool: Pool,
  userId: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!userId) {
    throw new Error('withUserContext requires a userId');
  }

  const client = await pool.connect();
  let discardConnection = false;
  try {
    await client.query('BEGIN;');
    await client.query("SELECT set_config('app.current_user_id', $1, true);", [userId]);

    const result = await callback(client);
    await client.query('COMMIT;');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK;');
    } catch {
      discardConnection = true;
    }
    throw error;
  } finally {
    client.release(discardConnection);
  }
}

/**
 * Executes a query through the runtime pool without setting any identity context.
 * Used for verifying anonymous rejection and default RLS denial.
 */
export async function withNoContext<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

/**
 * Asserts and inspects the active role credentials for the connected client.
 */
export async function inspectConnectionRole(client: PoolClient): Promise<{
  currentUser: string;
  sessionUser: string;
  isSuperuser: boolean;
  bypassesRls: boolean;
}> {
  const userRes = await client.query<{ current_user: string; session_user: string }>(
    'SELECT current_user, session_user;'
  );
  const currentUser = userRes.rows[0]?.current_user ?? '';
  const sessionUser = userRes.rows[0]?.session_user ?? '';

  const roleRes = await client.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;'
  );
  const isSuperuser = Boolean(roleRes.rows[0]?.rolsuper);
  const bypassesRls = Boolean(roleRes.rows[0]?.rolbypassrls);

  return {
    currentUser,
    sessionUser,
    isSuperuser,
    bypassesRls,
  };
}
