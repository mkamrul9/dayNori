import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ClientBase, Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MigrationFile {
  version: string;
  name: string;
  filePath: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  version: string;
  name: string;
  applied_at: Date;
  checksum: string;
}

export interface MigratorConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  migrationsDir?: string;
}

export class Migrator {
  private pool: Pool;
  private migrationsDir: string;

  constructor(config?: MigratorConfig) {
    this.migrationsDir = config?.migrationsDir || path.resolve(__dirname, 'migrations');

    this.pool = new Pool({
      connectionString: config?.connectionString || process.env['DATABASE_ADMIN_URL'],
      host: config?.host || process.env['PGHOST'] || '127.0.0.1',
      port: config?.port || Number(process.env['PGPORT']) || 5432,
      database: config?.database || process.env['PGDATABASE'] || 'daynori_test',
      user: config?.user || process.env['PGUSER'] || 'postgres',
      password: config?.password || process.env['PGPASSWORD'] || '1234',
    });
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  public async initMigrationTable(client: ClientBase): Promise<void> {
    await client.query('CREATE SCHEMA IF NOT EXISTS app;');
    await client.query(`
      CREATE TABLE IF NOT EXISTS app.schema_migrations (
        version text PRIMARY KEY,
        name text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        checksum text NOT NULL
      );
    `);
  }

  public getMigrationFiles(): MigrationFile[] {
    const files = fs
      .readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    return files.map((fileName) => {
      const filePath = path.join(this.migrationsDir, fileName);
      const sql = fs.readFileSync(filePath, 'utf8');
      const version = fileName.split('_')[0] || fileName;
      const checksum = crypto.createHash('sha256').update(sql, 'utf8').digest('hex');

      return {
        version,
        name: fileName,
        filePath,
        sql,
        checksum,
      };
    });
  }

  public async getAppliedMigrations(client: ClientBase): Promise<AppliedMigration[]> {
    const res = await client.query<AppliedMigration>(
      'SELECT version, name, applied_at, checksum FROM app.schema_migrations ORDER BY version ASC;'
    );
    return res.rows;
  }

  public async migrate(): Promise<{
    applied: string[];
    skipped: string[];
  }> {
    const client = await this.pool.connect();
    try {
      await this.initMigrationTable(client);
      const appliedRecords = await this.getAppliedMigrations(client);
      const appliedMap = new Map(appliedRecords.map((r) => [r.version, r]));

      const migrationFiles = this.getMigrationFiles();
      const applied: string[] = [];
      const skipped: string[] = [];

      for (const mig of migrationFiles) {
        const record = appliedMap.get(mig.version);
        if (record) {
          if (record.checksum !== mig.checksum) {
            throw new Error(
              `Migration checksum mismatch for ${mig.name}! Stored: ${record.checksum}, Current: ${mig.checksum}`
            );
          }
          skipped.push(mig.name);
          continue;
        }

        // Apply new migration in transaction
        await client.query('BEGIN');
        try {
          await client.query(mig.sql);
          await client.query(
            'INSERT INTO app.schema_migrations (version, name, checksum) VALUES ($1, $2, $3);',
            [mig.version, mig.name, mig.checksum]
          );
          await client.query('COMMIT');
          applied.push(mig.name);
        } catch (err) {
          await client.query('ROLLBACK');
          throw new Error(`Failed to apply migration ${mig.name}: ${(err as Error).message}`);
        }
      }

      return { applied, skipped };
    } finally {
      client.release();
    }
  }
}

// CLI runner entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const migrator = new Migrator();
  migrator
    .migrate()
    .then((result) => {
      console.log('Migration complete:', result);
      return migrator.close();
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
