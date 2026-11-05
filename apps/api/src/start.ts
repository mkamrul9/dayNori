import { buildServer } from './server.js';
import { createRuntimePool } from './db/index.js';
import { createConfiguredStorageProvider } from './modules/files/supabaseProvider.js';
import {
  MemoryStorageProvider,
  setDefaultStorageProvider,
} from './modules/files/storageAdapter.js';
import { setDefaultMalwareScanner } from './modules/files/scanner.js';
import { createConfiguredMalwareScanner } from './providers/index.js';

const port = Number(process.env['PORT'] ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const pool = createRuntimePool();
const corePreview = process.env['DAYNORI_CORE_PREVIEW'] === 'true';
const configuredStorage = corePreview ? null : createConfiguredStorageProvider(pool);
const localMemoryStorage =
  !corePreview &&
  !configuredStorage &&
  process.env['DAYNORI_LOCAL_MEMORY_STORAGE'] === 'true' &&
  process.env['NODE_ENV'] !== 'production'
    ? new MemoryStorageProvider(
        process.env['DAYNORI_API_ORIGIN'] ?? `http://127.0.0.1:${port}`
      )
    : null;
const storage = configuredStorage ?? localMemoryStorage;
if (storage) setDefaultStorageProvider(storage);
setDefaultMalwareScanner(createConfiguredMalwareScanner());
const app = buildServer({ runtimePool: pool });
app.addHook('onClose', async () => pool.end());

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

try {
  await app.listen({ port, host: process.env['HOST'] ?? '0.0.0.0' });
  console.info(`Daynori API listening on port ${port}`);
} catch {
  // Provider and database errors can contain credentials or connection strings.
  console.error('API startup failed; verify port, database, and authentication configuration.');
  await app.close();
  process.exitCode = 1;
}
