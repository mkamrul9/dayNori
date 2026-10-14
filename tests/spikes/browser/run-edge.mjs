import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

const browserExe = browserCandidates.find((c) => fs.existsSync(c));
if (!browserExe) {
  console.error('No compatible Chromium browser found at standard paths.');
  process.exit(1);
}

const serverPort = 4174;
const cdpPort = 9224;
const userDataDir = path.join(
  process.env.TEMP || 'C:\\Users\\Lenovo\\AppData\\Local\\Temp',
  'edge-idb-spike-' + Date.now()
);

fs.mkdirSync(userDataDir, { recursive: true });

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${serverPort}`);
      let file = 'indexeddb-real.html';
      if (url.pathname === '/primitives' || url.pathname === '/primitives-real.html') {
        file = 'primitives-real.html';
      } else if (url.pathname.endsWith('.html')) {
        const candidate = path.basename(url.pathname);
        if (fs.existsSync(path.join(dir, candidate))) file = candidate;
      }
      const filePath = path.join(dir, file);
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const content = fs.readFileSync(filePath);
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(content);
    });

    server.listen(serverPort, '127.0.0.1', () => resolve(server));
  });
}

async function runSpike() {
  const server = await startServer();
  console.log(`Spike server listening on http://127.0.0.1:${serverPort}/`);

  const browser = spawn(browserExe, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ]);

  try {
    let version = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
        if (res.ok) {
          version = await res.json();
          break;
        }
      } catch {}
    }
    if (!version) throw new Error('Could not connect to browser CDP');
    console.log('Connected to browser:', version.Browser);

    const newTabRes = await fetch(
      `http://127.0.0.1:${cdpPort}/json/new?http://127.0.0.1:${serverPort}/?run=write`,
      { method: 'PUT' }
    );
    const tab = await newTabRes.json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);

    let id = 1;
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const msgId = id++;
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.id === msgId) {
            ws.removeEventListener('message', handler);
            if (data.error) reject(data.error);
            else resolve(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });

    await new Promise((r) => ws.addEventListener('open', r));
    await send('Runtime.enable');
    await send('Page.enable');

    async function waitForResults(expectedTitle, timeoutMs = 8000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 200));
        const titleRes = await send('Runtime.evaluate', { expression: 'document.title' });
        if (titleRes?.result?.value === expectedTitle) {
          const resObj = await send('Runtime.evaluate', {
            expression: 'JSON.stringify(window.__results || [])',
          });
          const raw = resObj?.result?.value;
          return JSON.parse(raw || '[]');
        }
      }
      throw new Error(`Timeout waiting for title '${expectedTitle}' after ${timeoutMs}ms`);
    }

    // 1. Run Write
    console.log('\n[1/3] Executing write experiment (?run=write)...');
    const writeResults = await waitForResults('done-write');
    console.log('Write results:', writeResults);
    const writeEntry = writeResults.find((r) => r.name === 'write');
    if (!writeEntry || writeEntry.observed !== 'ok') {
      throw new Error(`Write experiment failed: ${JSON.stringify(writeResults)}`);
    }

    // 2. Run Verify (persistence test across navigation)
    console.log('\n[2/3] Executing persistence verification (?run=verify)...');
    await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?run=verify` });
    const verifyResults = await waitForResults('done-verify');
    console.log('Verify results:', verifyResults);
    const persistEntry = verifyResults.find((r) => r.name === 'persistence-after-reload');
    if (!persistEntry || persistEntry.observed !== 'persisted') {
      throw new Error(`Persistence verification failed: ${JSON.stringify(verifyResults)}`);
    }

    // 3. Run All (rollback on abort, duplicate key constraint, upgrade v1->v2, failed upgrade recovery)
    console.log('\n[3/3] Executing full transaction & upgrade suite (?run=all)...');
    await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?run=all` });
    const allResults = await waitForResults('done-all');
    console.log('All experiment results:', allResults);

    // Assert no experiment-error occurred
    const errorEntry = allResults.find((r) => r.name === 'experiment-error');
    if (errorEntry) {
      throw new Error(`Experiment error recorded: ${JSON.stringify(errorEntry)}`);
    }

    // Assert rollback on abort
    const rollbackEntry = allResults.find((r) => r.name === 'rollback-on-abort');
    if (!rollbackEntry || rollbackEntry.observed !== 'no partial write') {
      throw new Error(`Rollback on abort failed: ${JSON.stringify(rollbackEntry)}`);
    }

    // Assert duplicate key constraint failure
    const dupEntry = allResults.find((r) => r.name === 'duplicate-key-failure');
    if (!dupEntry || dupEntry.observed !== 'ConstraintError') {
      throw new Error(
        `Duplicate key failure assertion failed. Expected ConstraintError, got: ${dupEntry?.observed}`
      );
    }

    // Assert v1 -> v2 upgrade
    const upgradeEntry = allResults.find((r) => r.name === 'upgrade-v1-to-v2');
    if (!upgradeEntry || upgradeEntry.observed !== 'data kept, index added') {
      throw new Error(`Upgrade v1 to v2 failed: ${JSON.stringify(upgradeEntry)}`);
    }

    // Assert failed upgrade rollback
    const failedUpgradeEntry = allResults.find((r) => r.name === 'failed-upgrade-rollback');
    if (!failedUpgradeEntry || !failedUpgradeEntry.observed.includes('version=2')) {
      throw new Error(
        `Failed upgrade rollback assertion failed: ${JSON.stringify(failedUpgradeEntry)}`
      );
    }

    ws.close();
    console.log('\n=== ALL INDEXEDDB REAL BROWSER EXPERIMENTS PASSED SUCCESSFULLY ===');
  } finally {
    browser.kill();
    server.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

runSpike().catch((e) => {
  console.error('\nFAILURE: Browser experiment failed:', e);
  process.exit(1);
});
