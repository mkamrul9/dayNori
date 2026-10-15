import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactsDir = path.join(root, 'artifacts', 'indexeddb-browser');
fs.mkdirSync(artifactsDir, { recursive: true });

const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

const browserExe = edgeCandidates.find((c) => fs.existsSync(c));
if (!browserExe) {
  console.error('No compatible Chromium browser found at standard paths.');
  process.exit(1);
}

const httpPort = 3199;
const cdpPort = 9235;
const userDataDir = path.join(root, 'artifacts', 'local', 'browser-idb-profile');
fs.mkdirSync(userDataDir, { recursive: true });

// Compile production IndexedDB repository and dependencies into browser bundle
console.log('Compiling production IndexedDbLocalRepository bundle for browser execution...');
const errorsSrc = fs.readFileSync(path.join(root, 'packages/sync/src/errors.ts'), 'utf8');
const modelsSrc = fs.readFileSync(path.join(root, 'packages/sync/src/models.ts'), 'utf8');
let repoSrc = fs.readFileSync(path.join(root, 'apps/web/src/data/indexedDbRepository.ts'), 'utf8');

// Strip TypeScript imports and exports so it forms a clean browser closure
let cleanErrors = errorsSrc.replace(/^export\s+(default\s+)?/gm, '');
let cleanModels = modelsSrc.replace(/^export\s+(default\s+)?/gm, '');
let cleanRepo = repoSrc
  .replace(/import\s+type\s+[^;]+;\s*/g, '')
  .replace(/import\s*\{[^}]*\}\s*from\s*['"]@daynori\/sync['"];\s*/g, '')
  .replace(/^export\s+(default\s+)?/gm, '');

const combinedSource = `
(function(window) {
${cleanErrors}
${cleanModels}
${cleanRepo}

window.Daynori = {
  IndexedDbLocalRepository,
  setTrustedDeviceConsent,
  clearTrustedDeviceConsent,
  getTrustedDeviceConsent,
  clearAllLocalData,
  StorageQuotaError,
  StorageUnavailableError,
  StorageMigrationError,
  TrustedDeviceConsentRequiredError
};
})(window);
`;

const transpiledBundle = ts.transpileModule(combinedSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
    removeComments: true,
  },
}).outputText;

// Start local HTTP server to host test page and bundle under origin http://127.0.0.1:3199
const httpServer = http.createServer((req, res) => {
  if (req.url === '/daynori-indexeddb.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(transpiledBundle);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Daynori IndexedDB Test</title>
  <script src="/daynori-indexeddb.js"></script>
</head>
<body>
  <h1>Daynori Production IndexedDbLocalRepository Test</h1>
</body>
</html>`);
});

await new Promise((resolve) => httpServer.listen(httpPort, '127.0.0.1', resolve));

console.log('=== VERIFYING REAL PRODUCTION INDEXEDDB ADAPTER IN CHROMIUM BROWSER ===');
console.log(`HTTP Server: http://127.0.0.1:${httpPort}`);
console.log(`Browser: ${browserExe}`);
console.log(`CDP Port: ${cdpPort}`);

// Launch Browser via CDP
const browser = spawn(browserExe, [
  '--headless=new',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  `http://127.0.0.1:${httpPort}/`,
]);

let versionInfo = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
    if (res.ok) {
      versionInfo = await res.json();
      break;
    }
  } catch {}
}

if (!versionInfo) {
  browser.kill();
  httpServer.close();
  throw new Error('Could not connect to browser CDP');
}
console.log(`✓ Connected to ${versionInfo.Browser}`);

// Discover tab
const tabsRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
const tabs = await tabsRes.json();
const tab = tabs.find((t) => t.url.includes(`127.0.0.1:${httpPort}`)) || tabs[0];
const ws = new WebSocket(tab.webSocketDebuggerUrl);

let msgId = 1;
const eventHandlers = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = msgId++;
    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        ws.removeEventListener('message', handler);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  if (data.method && eventHandlers.has(data.method)) {
    eventHandlers.get(data.method)(data.params);
  }
});

await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Page.enable');

// Wait for initial load
await new Promise((r) => setTimeout(r, 500));

const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error('Evaluation exception: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result.value;
};

try {
  // Scenario 1: Consent refusal
  console.log('\n--- Scenario 1: Consent refusal & enforcement ---');
  const consentRefusalResult = await evaluate(`
    (async () => {
      localStorage.clear();
      const repo = new window.Daynori.IndexedDbLocalRepository();
      try {
        await repo.initialize({ userId: 'usr_alice', workspaceId: 'ws_test_01' });
        return { error: null };
      } catch (err) {
        return { error: err.message, code: err.code || err.name };
      }
    })()
  `);
  console.log(`[1/6] Consent refusal threw: ${consentRefusalResult.error}`);
  if (!consentRefusalResult.error?.includes('consent')) {
    throw new Error('Consent check failed: initialize() should have required consent');
  }

  // Scenario 2: Transactional enqueue & atomic multi-store write
  console.log('\n--- Scenario 2: Transactional enqueue & atomic save ---');
  const enqueueResult = await evaluate(`
    (async () => {
      window.Daynori.setTrustedDeviceConsent(true);
      const repo = new window.Daynori.IndexedDbLocalRepository();
      await repo.initialize({ userId: 'usr_alice', workspaceId: 'ws_test_01' });

      // Save Item Header
      await repo.upsertItemHeader({
        id: 'item-browser-prod-01',
        workspaceId: 'ws_test_01',
        kind: 'note',
        folderId: null,
        rank: '0|hzzzzz:',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        createdAt: '2026-10-15T12:00:00.000Z',
        updatedAt: '2026-10-15T12:00:00.000Z',
        deletedAt: null
      });

      // Save Draft and Mutation atomically
      await repo.saveDraftAndMutation(
        {
          id: 'draft-browser-prod-01',
          workspaceId: 'ws_test_01',
          userId: 'usr_alice',
          entityType: 'note',
          entityId: 'item-browser-prod-01',
          title: 'Offline Note Title',
          payload: { text: 'Real Chromium IndexedDB text' },
          savedAt: '2026-10-15T12:05:00.000Z',
          isQuarantined: false,
          quarantinedAt: null
        },
        {
          operationId: 'op-browser-prod-01',
          deviceId: 'dev-chromium-01',
          workspaceId: 'ws_test_01',
          userId: 'usr_alice',
          entityType: 'note',
          entityId: 'item-browser-prod-01',
          action: 'create',
          payload: { text: 'Real Chromium IndexedDB text' },
          baseRevision: 0,
          dependencyOperationIds: [],
          clientTimestamp: '2026-10-15T12:05:00.000Z',
          retryCount: 0,
          status: 'pending',
          lastError: null
        }
      );

      const header = await repo.getItemHeader('ws_test_01', 'item-browser-prod-01');
      const draft = await repo.getDraft('ws_test_01', 'usr_alice', 'draft-browser-prod-01');
      const mutations = await repo.getPendingMutations('ws_test_01', 'usr_alice');

      await repo.close();

      return {
        hasHeader: Boolean(header),
        hasDraft: Boolean(draft),
        mutationCount: mutations.length,
        mutationOpId: mutations[0]?.operationId
      };
    })()
  `);
  console.log(`[2/6] Transactional write results:`, enqueueResult);
  if (!enqueueResult.hasHeader || !enqueueResult.hasDraft || enqueueResult.mutationCount !== 1) {
    throw new Error('Transactional write failed to write draft and mutation');
  }

  // Scenario 3: Persistence after reload
  console.log('\n--- Scenario 3: Persistence across page reload ---');
  await send('Page.reload');
  await new Promise((r) => setTimeout(r, 600));

  const reloadResult = await evaluate(`
    (async () => {
      const repo = new window.Daynori.IndexedDbLocalRepository();
      await repo.initialize({ userId: 'usr_alice', workspaceId: 'ws_test_01' });

      const header = await repo.getItemHeader('ws_test_01', 'item-browser-prod-01');
      const draft = await repo.getDraft('ws_test_01', 'usr_alice', 'draft-browser-prod-01');
      const mutations = await repo.getPendingMutations('ws_test_01', 'usr_alice');

      await repo.close();

      return {
        reloadedHeaderId: header?.id,
        reloadedDraftTitle: draft?.title,
        reloadedOpId: mutations[0]?.operationId
      };
    })()
  `);
  console.log(`[3/6] Reloaded records from disk:`, reloadResult);
  if (
    reloadResult.reloadedHeaderId !== 'item-browser-prod-01' ||
    reloadResult.reloadedDraftTitle !== 'Offline Note Title' ||
    reloadResult.reloadedOpId !== 'op-browser-prod-01'
  ) {
    throw new Error('Persistence verification failed after page reload');
  }

  // Scenario 4: Account/workspace isolation
  console.log('\n--- Scenario 4: Account and workspace boundary isolation ---');
  const isolationResult = await evaluate(`
    (async () => {
      const repo = new window.Daynori.IndexedDbLocalRepository();
      await repo.initialize({ userId: 'usr_alice', workspaceId: 'ws_test_01' });

      let crossWsError = null;
      let crossUserError = null;

      try {
        await repo.getItemHeader('ws_test_OTHER', 'item-browser-prod-01');
      } catch (err) {
        crossWsError = err.message;
      }

      try {
        await repo.getDraft('ws_test_01', 'usr_bob', 'draft-browser-prod-01');
      } catch (err) {
        crossUserError = err.message;
      }

      await repo.close();

      return { crossWsError, crossUserError };
    })()
  `);
  console.log(`[4/6] Isolation errors:`, isolationResult);
  if (
    !isolationResult.crossWsError?.includes('CROSS_WORKSPACE_VIOLATION') ||
    !isolationResult.crossUserError?.includes('CROSS_ACCOUNT_VIOLATION')
  ) {
    throw new Error('Boundary isolation failed');
  }

  // Scenario 5: Transaction failure & rollback
  console.log('\n--- Scenario 5: Transaction failure & rollback integrity ---');
  const rollbackResult = await evaluate(`
    (async () => {
      const repo = new window.Daynori.IndexedDbLocalRepository();
      await repo.initialize({ userId: 'usr_alice', workspaceId: 'ws_test_01' });

      let thrown = false;
      try {
        await repo.saveDraftAndMutation(
          {
            id: 'draft-rollback-test',
            workspaceId: 'ws_test_01',
            userId: 'usr_alice',
            entityType: 'note',
            entityId: null,
            title: 'Should not persist',
            payload: {},
            savedAt: '2026-10-15T12:10:00.000Z',
            isQuarantined: false,
            quarantinedAt: null
          },
          {
            operationId: 'op-rollback-test',
            deviceId: 'dev-chromium-01',
            workspaceId: 'ws_test_WRONG', // Cross-workspace violation!
            userId: 'usr_alice',
            entityType: 'note',
            entityId: 'note-01',
            action: 'create',
            payload: {},
            baseRevision: 0,
            dependencyOperationIds: [],
            clientTimestamp: '2026-10-15T12:10:00.000Z',
            retryCount: 0,
            status: 'pending',
            lastError: null
          }
        );
      } catch {
        thrown = true;
      }

      const draft = await repo.getDraft('ws_test_01', 'usr_alice', 'draft-rollback-test');
      await repo.close();

      return { thrown, draftPersisted: Boolean(draft) };
    })()
  `);
  console.log(`[5/6] Rollback result:`, rollbackResult);
  if (!rollbackResult.thrown || rollbackResult.draftPersisted) {
    throw new Error('Atomic transaction rollback integrity failed');
  }

  // Scenario 6: Coordination between browser tabs & revocation
  console.log('\n--- Scenario 6: Multi-tab coordination via BroadcastChannel ---');
  const coordinationResult = await evaluate(`
    (async () => {
      const repo = new window.Daynori.IndexedDbLocalRepository();
      await repo.initialize({ userId: 'usr_alice', workspaceId: 'ws_test_01' });

      // Simulate a secondary browser tab sending REVOKE_CONSENT
      const otherTabChannel = new BroadcastChannel('daynori_storage_coordination');
      otherTabChannel.postMessage({ type: 'REVOKE_CONSENT' });
      otherTabChannel.close();

      // Give listener event loop tick
      await new Promise((r) => setTimeout(r, 100));

      let opError = null;
      try {
        await repo.getItemHeader('ws_test_01', 'item-browser-prod-01');
      } catch (err) {
        opError = err.message;
      }

      // Cleanup local database cleanly
      await window.Daynori.clearAllLocalData();

      return { opError };
    })()
  `);
  console.log(`[6/6] Coordination revocation result:`, coordinationResult);
  if (!coordinationResult.opError) {
    throw new Error('Coordination across tabs failed to close or revoke handle');
  }

  console.log('\n✓ PRODUCTION INDEXEDDB REPOSITORY PASSED ALL 6 BROWSER CDP INTEGRATION CHECKS.');
} finally {
  ws.close();
  browser.kill();
  httpServer.close();
}
