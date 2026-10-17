import { DaynoriWorker, createConfiguredWebPushAdapter } from './worker.js';
import pg from 'pg';

const databaseUrl = process.env['DATABASE_URL'];
let pool: pg.Pool | undefined;

if (databaseUrl) {
  pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
  });
}

const worker = new DaynoriWorker(pool);
worker.setWebPushAdapter(createConfiguredWebPushAdapter());

// Register built-in smoke task
worker.registerHandler('smoke', async (jobId) => {
  return { details: { jobId, timestamp: new Date().toISOString() } };
});

const pollIntervalMs = Number(process.env['WORKER_POLL_INTERVAL_MS']) || 1000;
worker.start(pool, { pollIntervalMs });

console.log(`Daynori Worker running (polling every ${pollIntervalMs}ms)...`);

const shutdown = async () => {
  console.log('Stopping Daynori Worker...');
  worker.stop();
  if (pool) {
    await pool.end();
  }
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
