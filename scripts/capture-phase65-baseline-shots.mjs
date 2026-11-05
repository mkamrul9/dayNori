#!/usr/bin/env node
/**
 * Phase 65 fresh visual baseline (browser emulation).
 * Not physical Android or installed-PWA proof. Manually inspect overflow metrics.
 *
 * Usage: node scripts/capture-phase65-baseline-shots.mjs [baseUrl]
 * Default: starts local next start on an ephemeral port if baseUrl omitted and .next exists.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'artifacts', 'local', 'phase65', 'screenshots');
const manifestPath = path.join(
  root,
  'docs',
  'roadmap',
  'v2',
  'evidence',
  'phase65-visual-manifest.json'
);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });

const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const widths = [
  { w: 1280, h: 800, name: 'desktop' },
  { w: 768, h: 1024, name: 'tablet' },
  { w: 412, h: 915, name: '412' },
  { w: 390, h: 844, name: '390' },
  { w: 360, h: 800, name: '360' },
  { w: 320, h: 720, name: '320' },
];
const routes = [
  { path: '/today', name: 'today' },
  { path: '/plan', name: 'plan' },
  { path: '/plan/calendar', name: 'calendar' },
  { path: '/library', name: 'library' },
  { path: '/journal', name: 'journal' },
  { path: '/settings', name: 'settings' },
  { path: '/help', name: 'help' },
  { path: '/support', name: 'support' },
];

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
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

async function waitReady(url, ms = 120_000) {
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

async function cdp(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`CDP timeout ${method}`));
    }, 45_000);
    ws.onopen = () => ws.send(JSON.stringify({ id, method, params }));
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
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
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error('WebSocket error'));
    };
  });
}

const chrome = findChrome();
if (!chrome) {
  console.error('No Chrome/Edge found');
  process.exit(1);
}

let baseUrl = process.argv[2];
let serverProc = null;
if (!baseUrl) {
  if (!fs.existsSync(path.join(root, 'apps/web/.next'))) {
    console.error('apps/web/.next missing; pass baseUrl or build web first');
    process.exit(1);
  }
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const nextBin = path.join(root, 'apps/web/node_modules/next/dist/bin/next');
  serverProc = spawn(
    process.execPath,
    [nextBin, 'start', path.join(root, 'apps/web'), '-p', String(port)],
    {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NEXT_PUBLIC_DAYNORI_CORE_PREVIEW: 'true' },
    }
  );
  await waitReady(`${baseUrl}/api/health`);
}

const cdpPort = await getFreePort();
const profile = path.join(root, 'artifacts', 'local', 'phase65', 'browser-profile');
fs.mkdirSync(profile, { recursive: true });
const browser = spawn(
  chrome,
  [
    `--remote-debugging-port=${cdpPort}`,
    '--headless=new',
    '--disable-gpu',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    'about:blank',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] }
);

await sleep(1500);
const version = await fetch(`http://127.0.0.1:${cdpPort}/json/version`).then((r) => r.json());
const wsUrl = version.webSocketDebuggerUrl;

const captures = [];
const overflowFindings = [];

async function measureOverflow(pageWs) {
  const { result } = await cdp(pageWs, 'Runtime.evaluate', {
    expression: `(() => {
      const doc = document.documentElement;
      const body = document.body;
      const scrollW = Math.max(doc.scrollWidth, body?.scrollWidth || 0);
      const clientW = doc.clientWidth;
      const overflowX = scrollW - clientW;
      const clipped = [];
      for (const el of document.querySelectorAll('button, a, input, [role="button"]')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > clientW + 2 || r.left < -2)) {
          clipped.push({ tag: el.tagName, id: el.id || null, text: (el.innerText || '').slice(0, 40), right: r.right, left: r.left });
        }
      }
      return { scrollW, clientW, overflowX, clipped: clipped.slice(0, 12) };
    })()`,
    returnByValue: true,
  });
  return result.value;
}

// Obtain a page target
const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json());
let page = targets.find((t) => t.type === 'page');
if (!page) {
  await cdp(wsUrl, 'Target.createTarget', { url: 'about:blank' });
  await sleep(500);
  const again = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json());
  page = again.find((t) => t.type === 'page');
}
const pageWs = page.webSocketDebuggerUrl;

for (const route of routes) {
  for (const vp of widths) {
    for (const theme of route.name === 'today' || route.name === 'settings'
      ? ['light', 'dark']
      : ['light']) {
      await cdp(pageWs, 'Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 1,
        mobile: vp.w <= 412,
      });
      const url = `${baseUrl.replace(/\/$/, '')}${route.path}`;
      await cdp(pageWs, 'Page.navigate', { url });
      await sleep(1200);
      if (theme === 'dark') {
        await cdp(pageWs, 'Runtime.evaluate', {
          expression: `(() => {
            const btn = document.querySelector('[data-testid="theme-toggle"], button[aria-label*="theme" i], button[aria-label*="Dark" i], button[aria-label*="Light" i]');
            if (btn) btn.click();
            document.documentElement.dataset.theme = 'dark';
            document.documentElement.classList.add('dark');
            return true;
          })()`,
        });
        await sleep(400);
      }
      const overflow = await measureOverflow(pageWs);
      const file = `${route.name}-${theme}-${vp.name}.png`;
      const shot = await cdp(pageWs, 'Page.captureScreenshot', { format: 'png' });
      const filePath = path.join(outDir, file);
      fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
      const entry = {
        file: path.relative(root, filePath).replaceAll('\\', '/'),
        route: route.path,
        uiState: theme,
        viewport: { width: vp.w, height: vp.h, label: vp.name },
        scale: 1,
        theme,
        timestamp: new Date().toISOString(),
        gitRevision: revision,
        platform: 'headless-chromium-emulation',
        browser: chrome,
        baseUrl,
        authMode: 'anonymous-or-shell-session',
        fixtureIdentity: 'none-synthetic-shell',
        environment: 'local-phase65',
        overflowXPx: overflow.overflowX,
        clippedControlsSample: overflow.clipped,
        historical: false,
        note: 'Browser device emulation only; not installed PWA or physical Android.',
      };
      captures.push(entry);
      if (overflow.overflowX > 2 || (overflow.clipped && overflow.clipped.length)) {
        overflowFindings.push({
          file: entry.file,
          overflowXPx: overflow.overflowX,
          clippedCount: overflow.clipped.length,
        });
      }
      console.log(`captured ${file} overflowX=${overflow.overflowX}`);
    }
  }
}

const manifest = {
  phase: '65',
  capturedAt: new Date().toISOString(),
  gitRevision: revision,
  baseUrl,
  label: 'phase65-fresh-visual-baseline',
  historicalSiblingNote:
    'artifacts/web-e2e/*.png from earlier phases are historical and must not be treated as this revision.',
  captures,
  overflowFindings,
  manualInspectionRequired: true,
  accessibilityNote:
    'Automated overflow/clip sampling only. Keyboard/focus/screen-reader not fully exercised in this capture script.',
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest -> ${path.relative(root, manifestPath)}`);
console.log(`overflow findings: ${overflowFindings.length}`);

browser.kill();
if (serverProc) serverProc.kill();
process.exit(0);
