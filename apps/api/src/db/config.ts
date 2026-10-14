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
 */
export function getRuntimeDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env['DB_HOST'] || '127.0.0.1',
    port: Number(process.env['DB_PORT'] || 5432),
    database: process.env['DB_NAME'] || 'daynori_test',
    user: process.env['DB_USER'] || 'daynori_runtime',
    password: process.env['DB_PASSWORD'] || 'runtime_dev_secret_9876',
    max: Number(process.env['DB_POOL_MAX'] || 10),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  };
}

/**
 * Returns administrative database configuration for migrations and setup.
 * Must NEVER be used for ordinary API request processing.
 */
export function getAdminDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env['PGHOST'] || '127.0.0.1',
    port: Number(process.env['PGPORT'] || 5432),
    database: process.env['PGDATABASE'] || 'daynori_test',
    user: process.env['PGUSER'] || 'postgres',
    password: process.env['PGPASSWORD'] || '1234',
    max: 2,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
  };
}
