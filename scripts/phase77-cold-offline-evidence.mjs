#!/usr/bin/env node
/**
 * Phase 77 cold offline evidence.
 *
 * Modes (mutually classified in the JSON artifact):
 * - fixture (default): static public/ assets + seeded IndexedDB. Supplementary only.
 * - installed-pwa: production Next.js origin, isolated profile, real SW, process kill,
 *   offline reopen. Required for Phase 77 installed-PWA acceptance.
 *
 * DAYNORI_PHASE77_REQUIRED=1 → nonzero exit when result !== pass (required mode).
 * DAYNORI_PHASE77_MODE=fixture|installed-pwa (default fixture).
 *
 * Fixture success alone must never mark Phase 77 complete.
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
const mode = (process.env.DAYNORI_PHASE77_MODE || 'fixture').toLowerCase();
const required = process.env.DAYNORI_PHASE77_REQUIRED === '1' || mode === 'installed-pwa';

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
  mode,
  evidenceClass:
    mode === 'installed-pwa' ? 'installed-pwa' : 'fixture-static-public-assets',
  requiredMode: required,
  browserExe: browserExe || null,
  steps: [],
  cacheInspection: null,
  assertions: {},
  result: 'unmet',
  limits: [],
};

function record(step, status, details) {
  evidence.steps.push({ step, status, details, at: new Date().toISOString() });
  console.log(`[${status}] ${step}: ${details}`);
}

function writeEvidence(filename) {
  const target = path.join(outDir, filename);
  fs.writeFileSync(target, JSON.stringify(evidence, null, 2));
  console.log(`Wrote ${target}`);
}

function exitForResult() {
  if (required && evidence.result !== 'pass') {
    process.exit(evidence.result === 'fail' ? 1 : 2);
  }
  process.exit(evidence.result === 'fail' ? 1 : 0);
}

async function connectCdp(cdpPort, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

function createCdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
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
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result.value;
  };
  return { ws, send, ready, evaluate };
}

async function runFixture() {
  evidence.limits.push(
    'FIXTURE ONLY: static apps/web/public server + direct IndexedDB seed. Not installed-PWA acceptance.'
  );
  if (!browserExe) {
    record('browser', 'unmet', 'No Edge/Chrome at standard paths');
    evidence.result = 'unmet';
    writeEvidence('cold-offline-pwa-fixture.json');
    return;
  }

  const publicDir = path.join(root, 'apps', 'web', 'public');
  const requiredAssets = [
    'sw.js',
    'offline-shell.html',
    'offline-shell.js',
    'offline.html',
    'manifest.json',
    'help-essential.json',
  ];
  for (const f of requiredAssets) {
    if (!fs.existsSync(path.join(publicDir, f))) {
      record('assets', 'fail', `Missing ${f}`);
      evidence.result = 'fail';
      writeEvidence('cold-offline-pwa-fixture.json');
      return;
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
  const serverPort = Number(process.env.DAYNORI_PHASE77_FIXTURE_PORT || 3199);
  const cdpPort = Number(process.env.DAYNORI_PHASE77_FIXTURE_CDP || 9239);
  const userDataDir = path.join(root, 'artifacts', 'local', 'phase77-edge-fixture-profile');
  fs.mkdirSync(userDataDir, { recursive: true });

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || '/', `http://127.0.0.1:${serverPort}`);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/offline-shell.html';
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

  try {
    const versionInfo = await connectCdp(cdpPort);
    if (!versionInfo) {
      record('cdp', 'fail', 'Could not connect to browser CDP');
      evidence.result = 'fail';
      return;
    }
    evidence.browserVersion = versionInfo.Browser;
    record('cdp', 'pass', versionInfo.Browser);

    const newTabRes = await fetch(
      `http://127.0.0.1:${cdpPort}/json/new?http://127.0.0.1:${serverPort}/offline-shell.html`,
      { method: 'PUT' }
    );
    const tab = await newTabRes.json();
    const session = createCdpSession(tab.webSocketDebuggerUrl);
    await session.ready;
    await session.send('Runtime.enable');
    await session.send('Page.enable');
    await session.send('Network.enable');

    await session.send('Page.navigate', {
      url: `http://127.0.0.1:${serverPort}/offline-shell.html`,
    });
    await new Promise((r) => setTimeout(r, 800));

    const seeded = await session.evaluate(`(async () => {
      localStorage.setItem('daynori_trusted_device_consent', 'true');
      await new Promise((resolve) => {
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
      const userId = 'usr_phase77_fixture';
      const workspaceId = 'ws_11111111-1111-1111-1111-111111111111';
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['offline_boot', 'notes', 'tasks', 'pending_mutations', 'drafts'], 'readwrite');
        tx.objectStore('offline_boot').put({
          id: 'primary', userId, workspaceId, updatedAt: new Date().toISOString(), shellBuildId: 'phase77-fixture',
          trustedDeviceConsent: true,
        });
        tx.objectStore('notes').put({
          id: 'note-77-fixture', workspaceId, title: 'Phase 77 Bangla নোট', body: 'Fixture only', updatedAt: new Date().toISOString(),
        });
        tx.objectStore('tasks').put({
          id: 'task-77-fixture', workspaceId, title: 'Offline fixture task', updatedAt: new Date().toISOString(),
        });
        tx.objectStore('pending_mutations').put({
          operationId: 'op_77_fixture', workspaceId, userId, clientTimestamp: new Date().toISOString(), commandType: 'note.upsert',
        });
        tx.objectStore('drafts').put({
          id: 'draft-77-fixture', workspaceId, userId, draftType: 'note', title: 'Dirty draft', updatedAt: new Date().toISOString(), isQuarantined: false,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        return { ok: true, sw: !!(reg.active || reg.installing || reg.waiting) };
      }
      return { ok: true, sw: false };
    })()`);
    record('seed-idb-sw', seeded?.ok ? 'pass' : 'fail', JSON.stringify(seeded));
    await new Promise((r) => setTimeout(r, 1500));

    await session.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    record('go-offline', 'pass', 'Network.emulateNetworkConditions offline=true');

    await session.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/offline-shell.html` });
    await new Promise((r) => setTimeout(r, 1000));
    const ui = await session.evaluate(`(() => {
      const app = document.getElementById('app');
      const list = document.getElementById('list');
      const text = (list && list.innerText) || '';
      return {
        href: location.href,
        appVisible: !!(app && getComputedStyle(app).display !== 'none'),
        hasBangla: text.includes('নোট') || text.includes('Phase 77'),
        hasTask: text.includes('Offline fixture task'),
        textSample: text.slice(0, 200),
      };
    })()`);
    const shellOk = ui?.appVisible && (ui.hasBangla || ui.hasTask);
    evidence.assertions.fixtureShell = ui;
    record('cold-offline-shell', shellOk ? 'pass' : 'fail', JSON.stringify(ui));

    const cacheInfo = await session.evaluate(`(async () => {
      const keys = await caches.keys();
      const daynori = keys.filter((k) => k.startsWith('daynori-static-'));
      const forbidden = [];
      let allowedCount = 0;
      for (const key of daynori) {
        const cache = await caches.open(key);
        for (const req of await cache.keys()) {
          const u = new URL(req.url);
          const entry = { cache: key, path: u.pathname, search: u.search };
          if (
            u.pathname.startsWith('/api/') || u.pathname.startsWith('/v1/') ||
            u.pathname.startsWith('/auth/') || u.searchParams.has('_rsc') || u.searchParams.has('token')
          ) forbidden.push(entry);
          else allowedCount += 1;
        }
      }
      return { keys: daynori, forbidden, allowedCount };
    })()`);
    evidence.cacheInspection = cacheInfo;
    const cacheOk = Array.isArray(cacheInfo?.forbidden) && cacheInfo.forbidden.length === 0;
    record('cache-storage-private-ban', cacheOk ? 'pass' : 'fail', JSON.stringify(cacheInfo));

    try {
      const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outDir, 'cold-offline-shell-fixture.png'), Buffer.from(data, 'base64'));
      record('screenshot', 'pass', 'cold-offline-shell-fixture.png');
    } catch (err) {
      record('screenshot', 'skipped', String(err));
    }

    session.ws.close();
    const failed = evidence.steps.some((s) => s.status === 'fail');
    evidence.result = failed ? 'fail' : 'pass';
    evidence.limits.push('Fixture pass is supplementary; run DAYNORI_PHASE77_MODE=installed-pwa for acceptance.');
  } catch (err) {
    record('exception', 'fail', err instanceof Error ? err.message : String(err));
    evidence.result = 'fail';
  } finally {
    browser.kill();
    server.close();
    writeEvidence('cold-offline-pwa-fixture.json');
    // Keep legacy filename for older report links.
    fs.copyFileSync(
      path.join(outDir, 'cold-offline-pwa-fixture.json'),
      path.join(outDir, 'cold-offline-pwa.json')
    );
  }
}

async function runInstalledPwa() {
  evidence.limits.push(
    'Installed-PWA mode requires production Next build, isolated profile, process terminate, offline reopen.'
  );
  // Delegate to dedicated script so this file stays maintainable.
  const helper = path.join(root, 'scripts', 'phase77-installed-pwa-evidence.mjs');
  if (!fs.existsSync(helper)) {
    record('helper', 'fail', `Missing ${helper}`);
    evidence.result = 'fail';
    writeEvidence('cold-offline-pwa-installed.json');
    return;
  }
  const env = {
    ...process.env,
    DAYNORI_PHASE77_REQUIRED: required ? '1' : process.env.DAYNORI_PHASE77_REQUIRED || '0',
    DAYNORI_PHASE77_PARENT_REVISION: revision || '',
  };
  const r = spawnSync(process.execPath, [helper], {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  const outPath = path.join(outDir, 'cold-offline-pwa-installed.json');
  if (fs.existsSync(outPath)) {
    const child = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    evidence.result = child.result || 'unmet';
    evidence.steps = child.steps || evidence.steps;
    evidence.cacheInspection = child.cacheInspection || null;
    evidence.assertions = child.assertions || {};
    evidence.limits.push(...(child.limits || []));
    evidence.browserVersion = child.browserVersion;
    evidence.buildIdentity = child.buildIdentity;
  } else {
    record('child-artifact', 'fail', 'installed PWA helper did not write evidence JSON');
    evidence.result = 'fail';
  }
  writeEvidence('cold-offline-pwa-installed.json');
  if (r.status !== 0 && evidence.result === 'pass') {
    evidence.result = 'fail';
    record('child-exit', 'fail', `helper exit ${r.status} despite pass artifact`);
    writeEvidence('cold-offline-pwa-installed.json');
  }
}

async function main() {
  if (mode === 'installed-pwa') {
    await runInstalledPwa();
  } else {
    await runFixture();
  }
  exitForResult();
}

main().catch((err) => {
  record('fatal', 'fail', err instanceof Error ? err.message : String(err));
  evidence.result = 'fail';
  writeEvidence(
    mode === 'installed-pwa' ? 'cold-offline-pwa-installed.json' : 'cold-offline-pwa-fixture.json'
  );
  process.exit(1);
});
