#!/usr/bin/env node
/**
 * Phase 105 visual evidence capture via Chrome CDP.
 * Captures Today, Plan, Library, Journal, Create, Menus, Settings, and Ask Nori
 * across desktop (1280px) and mobile widths (320-412px) in light and dark themes.
 *
 * Usage:
 *   node scripts/capture-phase105-visual-evidence.mjs [--before | --after]
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const webRoot = path.join(REPO_ROOT, 'apps', 'web');

const isAfter = process.argv.includes('--after');
const mode = isAfter ? 'after' : 'before';

const outDir = path.join(REPO_ROOT, 'artifacts', 'phase105', 'screenshots', mode);
fs.mkdirSync(outDir, { recursive: true });

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
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
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitForHttp(url, timeoutMs = 45_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status > 0) return;
    } catch {
      /* retry */
    }
    await sleep(350);
  }
  throw new Error(`Timeout waiting for HTTP: ${url}`);
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve: res, reject: rej } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
            else res(msg.result);
          }
        } catch (err) {
          console.error('CDP parse error:', err);
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout calling ${method}`));
      }, 30_000);
      this.pending.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
  }
}

const VIEWPORTS = [
  { name: 'desktop-1280', width: 1280, height: 800, isMobile: false },
  { name: 'mobile-412', width: 412, height: 915, isMobile: true },
  { name: 'mobile-390', width: 390, height: 844, isMobile: true },
  { name: 'mobile-360', width: 360, height: 740, isMobile: true },
  { name: 'mobile-320', width: 320, height: 720, isMobile: true },
];

const THEMES = ['light', 'dark'];

const SCREENS = [
  {
    id: 'today',
    url: '/today',
    prepare: async (cdp) => {
      await sleep(400);
    },
  },
  {
    id: 'plan',
    url: '/plan',
    prepare: async (cdp) => {
      await sleep(400);
    },
  },
  {
    id: 'library',
    url: '/library',
    prepare: async (cdp) => {
      await sleep(400);
    },
  },
  {
    id: 'journal',
    url: '/journal',
    prepare: async (cdp) => {
      await sleep(400);
    },
  },
  {
    id: 'settings',
    url: '/settings',
    prepare: async (cdp) => {
      await sleep(400);
    },
  },
  {
    id: 'create',
    url: '/today',
    prepare: async (cdp) => {
      await sleep(300);
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const btn = document.getElementById('today-create-btn') || document.getElementById('global-create-btn');
          if (btn) btn.click();
        })()`,
      });
      await sleep(400);
    },
  },
  {
    id: 'menus',
    url: '/today',
    prepare: async (cdp, viewport) => {
      await sleep(300);
      if (viewport.isMobile) {
        await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const drawerBtn = document.querySelector('button[aria-label=\"Toggle navigation drawer\"]');
            if (drawerBtn) drawerBtn.click();
          })()`,
        });
        await sleep(300);
      }
    },
  },
  {
    id: 'assistant',
    url: '/today',
    prepare: async (cdp) => {
      await sleep(300);
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const btn = document.getElementById('global-assistant-btn');
          if (btn) btn.click();
        })()`,
      });
      await sleep(400);
    },
  },
];

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error('Chrome executable not found');
    process.exit(1);
  }

  const webPort = await getFreePort();
  const cdpPort = await getFreePort();

  console.log(`Starting Next.js on port ${webPort}...`);
  const nextBin = path.join(webRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  const webProc = spawn(process.execPath, [nextBin, 'start', '-p', String(webPort)], {
    cwd: webRoot,
    env: { ...process.env, PORT: String(webPort) },
    stdio: 'ignore',
  });

  const baseUrl = `http://127.0.0.1:${webPort}`;
  try {
    await waitForHttp(`${baseUrl}/today`);
  } catch (err) {
    webProc.kill();
    throw err;
  }

  console.log(`Starting headless Chrome on CDP port ${cdpPort}...`);
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-extensions',
    '--hide-scrollbars',
    'about:blank',
  ]);

  await sleep(1500);

  const manifest = {
    phase: '105',
    mode,
    timestamp: new Date().toISOString(),
    viewports: VIEWPORTS,
    themes: THEMES,
    screens: SCREENS.map((s) => s.id),
    captures: [],
  };

  try {
    // Obtain browser target
    const versionRes = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
    const versionData = await versionRes.json();

    const targetsRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];

    const cdp = new CdpSession(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Runtime.enable');

    console.log(`Executing visual captures in mode: [${mode.toUpperCase()}]...`);

    for (const screen of SCREENS) {
      for (const vp of VIEWPORTS) {
        for (const theme of THEMES) {
          const filename = `${screen.id}_${vp.name}_${theme}.png`;
          const filePath = path.join(outDir, filename);

          // Configure viewport
          await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: vp.width,
            height: vp.height,
            deviceScaleFactor: 2,
            mobile: vp.isMobile,
          });

          // Navigate
          await cdp.send('Page.navigate', { url: `${baseUrl}${screen.url}` });
          await sleep(600);

          // Set theme
          await cdp.send('Runtime.evaluate', {
            expression: `(() => {
              document.documentElement.setAttribute('data-theme', '${theme}');
              window.localStorage.setItem('daynori_theme', '${theme}');
            })()`,
          });
          await sleep(150);

          // Screen preparation (modals, drawers, etc.)
          await screen.prepare(cdp, vp);

          // Measure overflow
          const overflowEval = await cdp.send('Runtime.evaluate', {
            expression: `(() => {
              const doc = document.documentElement;
              const body = document.body;
              const scrollWidth = Math.max(doc.scrollWidth, body ? body.scrollWidth : 0);
              const clientWidth = doc.clientWidth;
              return {
                scrollWidth,
                clientWidth,
                hasOverflow: scrollWidth > clientWidth + 2,
              };
            })()`,
            returnByValue: true,
          });
          const overflowInfo = overflowEval?.result?.value || { hasOverflow: false };

          // Capture screenshot
          const screenshot = await cdp.send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
          });

          const buffer = Buffer.from(screenshot.data, 'base64');
          fs.writeFileSync(filePath, buffer);

          const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

          manifest.captures.push({
            screen: screen.id,
            viewport: vp.name,
            width: vp.width,
            height: vp.height,
            theme,
            filename,
            sha256,
            bytes: buffer.length,
            horizontalOverflow: overflowInfo.hasOverflow,
          });

          process.stdout.write(`\r  [${manifest.captures.length}/${SCREENS.length * VIEWPORTS.length * THEMES.length}] captured ${filename}`);
        }
      }
    }

    console.log('\nAll captures completed successfully!');
    const manifestPath = path.join(REPO_ROOT, 'artifacts', 'phase105', `capture-manifest-${mode}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log(`Wrote manifest to: ${manifestPath}`);

    cdp.close();
  } finally {
    try {
      chromeProc.kill();
    } catch {
      /* ignore */
    }
    try {
      webProc.kill();
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error('\nCapture failed:', err);
  process.exit(1);
});

