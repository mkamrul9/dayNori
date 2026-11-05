#!/usr/bin/env node
/**
 * Headless Chromium screenshots + CSS overflow metrics for mobile PWA layout.
 * Emulation only — not physical Android evidence. File size alone is NOT acceptance.
 *
 * Usage:
 *   node scripts/capture-pwa-usability-shots.mjs [baseUrl]
 * Default baseUrl: http://127.0.0.1:3010
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'artifacts', 'local', 'pwa-usability-shots');
const baseUrl = (process.argv[2] || 'http://127.0.0.1:3010').replace(/\/$/, '');
const widths = [320, 360, 390, 412, 768];
const routes = [
  { path: '/today', name: 'today' },
  { path: '/plan', name: 'plan' },
  { path: '/library', name: 'library' },
  { path: '/journal', name: 'journal' },
  { path: '/help', name: 'help' },
  { path: '/settings', name: 'settings' },
  { path: '/settings/appearance', name: 'settings-appearance' },
  { path: '/settings/privacy', name: 'settings-privacy' },
  { path: '/plan/calendar', name: 'calendar' },
];
const OVERFLOW_TOLERANCE_PX = 2;

fs.mkdirSync(outDir, { recursive: true });

async function waitReady(url, ms = 90_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status > 0) return;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error(`not ready: ${url}`);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

async function cdp(wsUrl, method, params = {}) {
  if (typeof WebSocket === 'undefined') {
    throw new Error('WebSocket unavailable in this Node runtime');
  }
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`CDP timeout ${method}`));
    }, 30_000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.id === id) {
          clearTimeout(timer);
          ws.close();
          if (msg.error) reject(new Error(JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      } catch (err) {
        clearTimeout(timer);
        ws.close();
        reject(err);
      }
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function measureOverflow(pageWs, width, height) {
  await cdp(pageWs, 'Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  const evalResult = await cdp(pageWs, 'Runtime.evaluate', {
    expression: `(() => {
      const doc = document.documentElement;
      const body = document.body;
      const scrollWidth = Math.max(doc.scrollWidth, body ? body.scrollWidth : 0);
      const clientWidth = doc.clientWidth;
      const scrollHeight = Math.max(doc.scrollHeight, body ? body.scrollHeight : 0);
      const clientHeight = doc.clientHeight;
      const main = document.getElementById('main-content');
      return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        clientWidth,
        scrollWidth,
        clientHeight,
        scrollHeight,
        horizontalOverflow: scrollWidth > clientWidth + ${OVERFLOW_TOLERANCE_PX},
        hasMain: Boolean(main),
      };
    })()`,
    returnByValue: true,
    awaitPromise: false,
  });
  return evalResult?.result?.value ?? null;
}

const chrome = findChrome();
if (!chrome) {
  console.error('[shots] Chrome not found — skipping visual capture (emulation unavailable).');
  process.exit(0);
}

await waitReady(`${baseUrl}/privacy`);

const port = await getFreePort();
const userDataDir = path.join(outDir, `.chrome-profile-${port}`);
fs.mkdirSync(userDataDir, { recursive: true });

const chromeProc = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

async function waitDebugger(ms = 20_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  throw new Error('Chrome debugger not ready');
}

const results = [];
let layoutFailCount = 0;

try {
  await waitDebugger();

  for (const width of widths) {
    for (const route of routes) {
      const file = path.join(outDir, `${route.name}-${width}.png`);
      const url = `${baseUrl}${route.path}`;
      const height = 844;

      const newRes = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
        method: 'PUT',
      }).catch(async () => {
        // Older Chrome: POST /json/new
        return fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
          method: 'POST',
        });
      });

      let target = newRes.ok ? await newRes.json() : null;
      if (!target?.webSocketDebuggerUrl) {
        await sleep(800);
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find((t) => t.url?.includes(route.path)) || list[0];
      }

      if (!target?.webSocketDebuggerUrl) {
        results.push({
          width,
          route: route.path,
          file,
          ok: false,
          layoutCertified: false,
          note: 'no CDP target',
        });
        console.log(`[FAIL] ${route.name}@${width} no CDP target`);
        continue;
      }

      await sleep(1200);
      let metrics = null;
      try {
        metrics = await measureOverflow(target.webSocketDebuggerUrl, width, height);
      } catch (err) {
        metrics = { error: String(err) };
      }

      // Screenshot via CDP
      try {
        const shot = await cdp(target.webSocketDebuggerUrl, 'Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
        });
        if (shot?.data) {
          fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
        }
      } catch {
        // Fallback: legacy --screenshot spawn for this route
        await new Promise((resolve, reject) => {
          const child = spawn(
            chrome,
            [
              '--headless=new',
              '--disable-gpu',
              '--hide-scrollbars',
              '--force-device-scale-factor=1',
              `--window-size=${width},${height}`,
              `--screenshot=${file}`,
              url,
            ],
            { stdio: 'ignore' }
          );
          child.on('error', reject);
          child.on('exit', (code) =>
            code === 0 ? resolve() : reject(new Error(`chrome exit ${code}`))
          );
        }).catch(() => undefined);
      }

      const exists = fs.existsSync(file) && fs.statSync(file).size > 1000;
      const overflow = metrics?.horizontalOverflow === true;
      if (overflow) layoutFailCount += 1;
      const viewportMismatch =
        metrics &&
        typeof metrics.innerWidth === 'number' &&
        Math.abs(metrics.innerWidth - width) > 8;

      const ok = exists && !overflow;
      results.push({
        width,
        route: route.path,
        file,
        ok,
        layoutCertified: false,
        emulationOnly: true,
        notPhysicalAndroid: true,
        metrics,
        viewportMismatch: Boolean(viewportMismatch),
        note: overflow
          ? 'horizontal overflow detected in headless CSS metrics'
          : 'headless CDP metrics — not physical CSS viewport certification',
      });
      console.log(
        ok
          ? `[CAPTURE] ${route.name}@${width} inner=${metrics?.innerWidth ?? '?'} overflow=no`
          : `[FAIL] ${route.name}@${width} exists=${exists} overflow=${overflow}`
      );

      // Close target if possible
      try {
        await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => undefined);
      } catch {
        /* ignore */
      }
    }
  }
} finally {
  chromeProc.kill();
}

const summary = path.join(outDir, 'summary.json');
fs.writeFileSync(
  summary,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      baseUrl,
      emulationOnly: true,
      notPhysicalAndroid: true,
      overflowTolerancePx: OVERFLOW_TOLERANCE_PX,
      layoutFailCount,
      acceptance:
        'PNG existence is insufficient. Fail when horizontalOverflow is true. Still not physical Android certification.',
      results,
    },
    null,
    2
  ) + '\n'
);
console.log(`[shots] wrote ${summary}; layoutFailCount=${layoutFailCount}`);
const failed = results.filter((r) => !r.ok);
process.exit(failed.length ? 1 : 0);
