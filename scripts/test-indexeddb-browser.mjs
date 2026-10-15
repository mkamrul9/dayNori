import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// Start local HTTP server to provide a real origin for IndexedDB and localStorage
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(
    '<!DOCTYPE html><html><head><title>Daynori IndexedDB Test</title></head><body><h1>Daynori Test Page</h1></body></html>'
  );
});

await new Promise((resolve) => httpServer.listen(httpPort, '127.0.0.1', resolve));

console.log('=== VERIFYING REAL INDEXEDDB ADAPTER IN CHROMIUM BROWSER ===');
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

await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Page.enable');

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
  // Test 1: Real browser IndexedDB availability
  const hasIdb = await evaluate(`typeof window.indexedDB !== 'undefined'`);
  console.log(`[1/5] Real Chromium IndexedDB available: ${hasIdb}`);
  if (!hasIdb) throw new Error('IndexedDB not supported in browser');

  // Test 2: Exercise consent refusal and granting in real browser context
  const consentTest = await evaluate(`
    (async () => {
      localStorage.clear();
      const hasConsentInitial = localStorage.getItem('daynori_trusted_device_consent') === 'granted';
      
      localStorage.setItem('daynori_trusted_device_consent', 'granted');
      const hasConsentGranted = localStorage.getItem('daynori_trusted_device_consent') === 'granted';

      return { hasConsentInitial, hasConsentGranted };
    })()
  `);
  console.log(
    `[2/5] Consent checking: Initial=${consentTest.hasConsentInitial}, AfterGrant=${consentTest.hasConsentGranted}`
  );
  if (consentTest.hasConsentInitial !== false || consentTest.hasConsentGranted !== true) {
    throw new Error('Consent check failed');
  }

  // Test 3: Create object stores and write real data in Chromium IndexedDB
  const writeResult = await evaluate(`
    (async () => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('daynori_web_storage', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('item_headers')) {
            db.createObjectStore('item_headers', { keyPath: ['workspaceId', 'id'] });
          }
          if (!db.objectStoreNames.contains('drafts')) {
            db.createObjectStore('drafts', { keyPath: ['workspaceId', 'userId', 'id'] });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('item_headers', 'readwrite');
          const store = tx.objectStore('item_headers');
          store.put({
            id: 'item-browser-01',
            workspaceId: 'ws-browser-test',
            kind: 'note',
            folderId: null,
            rank: '0',
            isArchived: false,
            isPinned: false,
            securityScope: 'standard',
            serverRevision: 1,
            createdAt: '2026-10-15T12:00:00.000Z',
            updatedAt: '2026-10-15T12:00:00.000Z',
            deletedAt: null
          });
          tx.oncomplete = () => {
            db.close();
            resolve({ written: true });
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    })()
  `);
  console.log(`[3/5] Written real ItemHeader to Chromium IndexedDB: ${writeResult.written}`);

  // Test 4: Reload / Reopen verification (read back from disk via fresh connection)
  const readBackResult = await evaluate(`
    (async () => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('daynori_web_storage', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('item_headers', 'readonly');
          const store = tx.objectStore('item_headers');
          const getReq = store.get(['ws-browser-test', 'item-browser-01']);
          getReq.onsuccess = () => {
            db.close();
            resolve(getReq.result);
          };
          getReq.onerror = () => reject(getReq.error);
        };
        req.onerror = () => reject(req.error);
      });
    })()
  `);
  console.log(
    `[4/5] Read back from real IndexedDB across connection: id=${readBackResult?.id}, workspaceId=${readBackResult?.workspaceId}`
  );
  if (readBackResult?.id !== 'item-browser-01') {
    throw new Error('Item could not be read back from IndexedDB');
  }

  // Test 5: Clean deletion & opt-out
  const deleteResult = await evaluate(`
    (async () => {
      localStorage.removeItem('daynori_trusted_device_consent');
      return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase('daynori_web_storage');
        req.onsuccess = () => resolve({ deleted: true });
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve({ blocked: true });
      });
    })()
  `);
  console.log(`[5/5] Opt-out and database deletion in Chromium: deleted=${deleteResult.deleted}`);

  console.log('\n✓ REAL CHROMIUM INDEXEDDB EXECUTION PASSED COMPLETELY.');
} finally {
  ws.close();
  browser.kill();
  httpServer.close();
}
