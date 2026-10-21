import fs from 'node:fs';
import path from 'node:path';

// Load local .env configuration if present
try {
  if (typeof process.loadEnvFile === 'function') {
    const envPaths = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '../../.env'),
    ];
    for (const p of envPaths) {
      if (fs.existsSync(p)) {
        process.loadEnvFile(p);
        break;
      }
    }
  }
} catch {
  // Ignore if already loaded or not found
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface TenantContext {
  userId: string;
  workspaceId: string;
}

/**
 * Returns least-privilege runtime database configuration.
 * Consumed by API routes and background workers using non-owner credentials.
 * Credentials must be provided via DB_* environment variables or .env.
 */
export function getRuntimeDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env['DB_HOST'] || '127.0.0.1',
    port: Number(process.env['DB_PORT'] || 5432),
    database: process.env['DB_NAME'] || 'daynori_test',
    user: process.env['DB_USER'] || 'daynori_runtime',
    password: process.env['DB_PASSWORD'] || '',
    max: Number(process.env['DB_POOL_MAX'] || 10),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  };
}

/**
 * Returns administrative database configuration for migrations and setup.
 * Must NEVER be used for ordinary API request processing.
 * Credentials must be provided via PG* environment variables or .env.
 */
export function getAdminDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env['PGHOST'] || '127.0.0.1',
    port: Number(process.env['PGPORT'] || 5432),
    database: process.env['PGDATABASE'] || 'daynori_test',
    user: process.env['PGUSER'] || 'postgres',
    password: process.env['PGPASSWORD'] || '',
    max: 2,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
  };
}

/**
 * Protected billing service role — privileged entitlement/event helpers only.
 * Must NOT be used for ordinary tenant API traffic. Local default password matches
 * migration 00068 and is not a release credential.
 */
export function getBillingDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env['BILLING_DB_HOST'] || process.env['DB_HOST'] || '127.0.0.1',
    port: Number(process.env['BILLING_DB_PORT'] || process.env['DB_PORT'] || 5432),
    database: process.env['BILLING_DB_NAME'] || process.env['DB_NAME'] || 'daynori_test',
    user: process.env['BILLING_DB_USER'] || 'daynori_billing',
    // Do not reuse DB_PASSWORD (runtime role). Local default matches migration 00068 only.
    password: process.env['BILLING_DB_PASSWORD'] || 'billing_dev_secret_9876',
    max: Number(process.env['BILLING_DB_POOL_MAX'] || 5),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  };
}
