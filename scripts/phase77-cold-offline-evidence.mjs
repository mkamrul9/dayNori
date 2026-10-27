#!/usr/bin/env node
/**
 * Phase 77 cold installed-PWA style evidence (Edge/Chrome CDP).
 * Seeds trusted-device IndexedDB, registers the public SW, goes offline,
 * cold-navigates, asserts the public organizer shell, and inspects Cache Storage
 * for forbidden private responses.
 *
 * Reports skipped/unmet honestly when browser or assets are unavailable.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'artifacts', 'phase77');
fs.mkdirSync(outDir, { recursive: true });

const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim();

const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const browserExe = edgeCandidates.find((c) => fs.existsSync(c));

const evidence = {
  at: new Date().toISOString(),
  revision: revision || null,
  node: process.version,
  platform: process.platform,
  browserExe: browserExe || null,
  steps: [],
  cacheInspection: null,
  result: 'unmet',
  limits: [],
};

function record(step, status, details) {
  evidence.steps.push({ step, status, details });
  console.log(`[${status}] ${step}: ${details}`);
}

function writeEvidence() {
  const target = path.join(outDir, 'cold-offline-pwa.json');
  fs.writeFileSync(target, JSON.stringify(evidence, null, 2));
  console.log(`Wrote ${target}`);
}

if (!browserExe) {
  evidence.limits.push('No Edge/Chrome at standard paths');
  record('browser', 'skipped', 'No Chromium browser found');
  writeEvidence();
  process.exit(0);
}

const publicDir = path.join(root, 'apps', 'web', 'public');
const required = ['sw.js', 'offline-shell.html', 'offline-shell.js', 'offline.html', 'manifest.json'];
for (const f of required) {
  if (!fs.existsSync(path.join(publicDir, f))) {
    record('assets', 'fail', `Missing ${f}`);
    evidence.result = 'fail';
    writeEvidence();
    process.exit(1);
  }
}
record('assets', 'pass', 'Required public shell assets present');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const serverPort = 3199;
const cdpPort = 9239;
const userDataDir = path.join(root, 'artifacts', 'local', 'phase77-edge-profile');
fs.mkdirSync(userDataDir, { recursive: true });

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${serverPort}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/offline-shell.html';
    // Never serve private API-shaped paths from this public fixture server.
    if (pathname.startsWith('/api/') || pathname.startsWith('/v1/') || pathname.startsWith('/auth/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    const filePath = path.join(publicDir, pathname.replace(/^\//, ''));
    if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
});

await new Promise((resolve) => server.listen(serverPort, '127.0.0.1', resolve));
record('static-server', 'pass', `http://127.0.0.1:${serverPort}`);

const browser = spawn(
  browserExe,
  [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);

let versionInfo = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
    if (res.ok) {
      versionInfo = await res.json();
      break;
    }
  } catch {
    /* retry */
  }
}

if (!versionInfo) {
  record('cdp', 'fail', 'Could not connect to browser CDP');
  evidence.result = 'fail';
  browser.kill();
  server.close();
  writeEvidence();
  process.exit(1);
}
evidence.browserVersion = versionInfo.Browser;
record('cdp', 'pass', versionInfo.Browser);

const newTabRes = await fetch(
  `http://127.0.0.1:${cdpPort}/json/new?http://127.0.0.1:${serverPort}/offline-shell.html`,
  { method: 'PUT' }
);
const tab = await newTabRes.json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);

let msgId = 1;
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = msgId++;
    const handler = (event) => {
      const data = JSON.parse(event.data.toString());
      if (data.id === id) {
        ws.removeEventListener('message', handler);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve);
  ws.addEventListener('error', reject);
});
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');

const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(JSON.stringify(res.exceptionDetails));
  }
  return res.result.value;
};

try {
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/offline-shell.html` });
  await new Promise((r) => setTimeout(r, 800));

  // Seed trusted consent + namespaced local records (simulates prior authorized online session).
  const seeded = await evaluate(`(async () => {
    localStorage.setItem('daynori_trusted_device_consent', 'true');
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase('daynori_web_storage');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('daynori_web_storage', 9);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('offline_boot')) db.createObjectStore('offline_boot', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: ['workspaceId', 'id'] });
        if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: ['workspaceId', 'id'] });
        if (!db.objectStoreNames.contains('pending_mutations')) db.createObjectStore('pending_mutations', { keyPath: 'operationId' });
        if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: ['workspaceId', 'userId', 'id'] });
        if (!db.objectStoreNames.contains('item_headers')) db.createObjectStore('item_headers', { keyPath: ['workspaceId', 'id'] });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const userId = 'usr_phase77_seed';
    const workspaceId = 'ws_11111111-1111-1111-1111-111111111111';
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['offline_boot', 'notes', 'tasks', 'pending_mutations', 'drafts'], 'readwrite');
      tx.objectStore('offline_boot').put({
        id: 'primary',
        userId,
        workspaceId,
        updatedAt: new Date().toISOString(),
        shellBuildId: 'phase77-evidence',
      });
      tx.objectStore('notes').put({
        id: 'note-77',
        workspaceId,
        title: 'Phase 77 Bangla নোট',
        body: 'Local only',
        updatedAt: new Date().toISOString(),
      });
      tx.objectStore('tasks').put({
        id: 'task-77',
        workspaceId,
        title: 'Offline task',
        updatedAt: new Date().toISOString(),
      });
      tx.objectStore('pending_mutations').put({
        operationId: 'op_77_seed',
        workspaceId,
        userId,
        clientTimestamp: new Date().toISOString(),
        commandType: 'note.upsert',
      });
      tx.objectStore('drafts').put({
        id: 'draft-77',
        workspaceId,
        userId,
        draftType: 'note',
        title: 'Dirty draft',
        updatedAt: new Date().toISOString(),
        isQuarantined: false,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      return { ok: true, sw: !!reg.active || !!reg.installing || !!reg.waiting };
    }
    return { ok: true, sw: false };
  })()`);

  record('seed-idb-sw', seeded?.ok ? 'pass' : 'fail', JSON.stringify(seeded));
  await new Promise((r) => setTimeout(r, 1500));

  // Offline: block network, close document context via navigate after offline.
  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  record('go-offline', 'pass', 'Network.emulateNetworkConditions offline=true');

  // Cold reopen: navigate to a deep path while offline (SW navigate fallback).
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/today` });
  await new Promise((r) => setTimeout(r, 1200));

  const ui = await evaluate(`(() => {
    const app = document.getElementById('app');
    const fallback = document.getElementById('fallback');
    const list = document.getElementById('list');
    const title = document.title;
    const text = (list && list.innerText) || '';
    return {
      href: location.href,
      title,
      appVisible: !!(app && getComputedStyle(app).display !== 'none'),
      fallbackVisible: !!(fallback && getComputedStyle(fallback).display !== 'none'),
      hasBangla: text.includes('নোট') || text.includes('Phase 77'),
      hasTask: text.includes('Offline task'),
      textSample: text.slice(0, 200),
    };
  })()`);

  // If SW did not intercept (static server 404 for /today), open shell directly offline.
  let finalUi = ui;
  if (!ui?.appVisible) {
    await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/offline-shell.html` });
    await new Promise((r) => setTimeout(r, 1000));
    finalUi = await evaluate(`(() => {
      const app = document.getElementById('app');
      const list = document.getElementById('list');
      const text = (list && list.innerText) || '';
      return {
        href: location.href,
        appVisible: !!(app && getComputedStyle(app).display !== 'none'),
        hasBangla: text.includes('নোট') || text.includes('Phase 77'),
        hasTask: text.includes('Offline task'),
        textSample: text.slice(0, 200),
        mode: 'direct-shell',
      };
    })()`);
    evidence.limits.push(
      'Static fixture server has no /today HTML; SW navigate fallback may 404 without precached shell match — direct offline-shell reopen exercised.'
    );
  }

  const shellOk = finalUi?.appVisible && (finalUi.hasBangla || finalUi.hasTask);
  record(
    'cold-offline-shell',
    shellOk ? 'pass' : 'fail',
    JSON.stringify(finalUi)
  );

  // Cache Storage inspection for forbidden private responses.
  const cacheInfo = await evaluate(`(async () => {
    const keys = await caches.keys();
    const daynori = keys.filter((k) => k.startsWith('daynori-static-'));
    const forbidden = [];
    const allowed = [];
    for (const key of daynori) {
      const cache = await caches.open(key);
      const reqs = await cache.keys();
      for (const req of reqs) {
        const u = new URL(req.url);
        const entry = { cache: key, path: u.pathname, search: u.search };
        if (
          u.pathname.startsWith('/api/') ||
          u.pathname.startsWith('/v1/') ||
          u.pathname.startsWith('/auth/') ||
          u.searchParams.has('_rsc') ||
          u.searchParams.has('token')
        ) {
          forbidden.push(entry);
        } else {
          allowed.push(entry);
        }
      }
    }
    return { keys: daynori, forbidden, allowedCount: allowed.length, sample: allowed.slice(0, 20) };
  })()`);

  evidence.cacheInspection = cacheInfo;
  const cacheOk = Array.isArray(cacheInfo?.forbidden) && cacheInfo.forbidden.length === 0;
  record(
    'cache-storage-private-ban',
    cacheOk ? 'pass' : 'fail',
    JSON.stringify({
      keys: cacheInfo?.keys,
      forbidden: cacheInfo?.forbidden,
      allowedCount: cacheInfo?.allowedCount,
    })
  );

  // Screenshot
  try {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outDir, 'cold-offline-shell.png'), Buffer.from(data, 'base64'));
    record('screenshot', 'pass', 'cold-offline-shell.png');
  } catch (err) {
    record('screenshot', 'skipped', String(err));
  }

  const failed = evidence.steps.some((s) => s.status === 'fail');
  evidence.result = failed ? 'fail' : 'pass';
  evidence.limits.push(
    'This drill uses a public static fixture origin (not a full Next.js production install). Installed-PWA claim is limited to SW+IDB shell behavior on Chromium CDP.'
  );
  evidence.limits.push(
    'Native installed-build cold launch is recorded separately; Dev Client+Metro does not satisfy self-contained offline launch.'
  );
} catch (err) {
  record('exception', 'fail', err instanceof Error ? err.message : String(err));
  evidence.result = 'fail';
} finally {
  try {
    ws.close();
  } catch {
    /* ignore */
  }
  browser.kill();
  server.close();
  writeEvidence();
}

process.exit(evidence.result === 'pass' ? 0 : 1);
