import {
  DaynoriWorker,
  createConfiguredWebPushAdapter,
  createConfiguredAuthProvider,
  createConfiguredDeletionEmailAdapter,
  createConfiguredStorageService,
  createWorkerDatabasePool,
} from './worker.js';
import { createConfiguredMalwareScanner } from '@daynori/api/providers';
import { createConfiguredPushAdapter } from './providers/push.js';

const pool = createWorkerDatabasePool();
const worker = new DaynoriWorker(pool);
worker.setPushAdapter(createConfiguredPushAdapter());
worker.setScannerService(createConfiguredMalwareScanner());

worker.setWebPushAdapter(createConfiguredWebPushAdapter());

const authProvider = createConfiguredAuthProvider();
if (authProvider) {
  worker.setAuthProvider(authProvider);
}

const deletionEmailAdapter = createConfiguredDeletionEmailAdapter();
if (deletionEmailAdapter) {
  worker.setDeletionEmailAdapter(deletionEmailAdapter);
}

const storageService = createConfiguredStorageService();
if (storageService) {
  worker.setStorageService(storageService);
}

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
  if (pool && typeof pool.end === 'function') {
    await pool.end();
  }
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
