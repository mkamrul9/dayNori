#!/usr/bin/env node
/**
 * Phase 67 prototype capture via local Chrome/Edge CDP (same family as Phase 65).
 *
 * Modes:
 *   (default) required — exits 1 if browser/server/capture prerequisites fail
 *   --allow-skip     — exits 0 with status "skipped" and unmet-evidence reason (never "pass")
 *
 * Writes PNGs + manifest under artifacts/local/phase67/ (gitignored).
 * Screenshot creation alone is not a visual pass — see manualInspectionRequired.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const protoDir = path.join(root, 'docs', 'design', 'v2', 'phase67');
const outDir = path.join(root, 'artifacts', 'local', 'phase67', 'screenshots');
const metaDir = path.join(root, 'artifacts', 'local', 'phase67');
const manifestPath = path.join(metaDir, 'capture-manifest.json');
const allowSkip = process.argv.includes('--allow-skip');

fs.mkdirSync(outDir, { recursive: true });

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
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

function writeManifest(partial) {
  const payload = {
    phase: '67',
    artifact: 'prototype-capture',
    ...partial,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

function failOrSkip(reason, details = {}) {
  const status = allowSkip ? 'skipped' : 'fail';
  writeManifest({
    status,
    reason,
    unmetEvidence: true,
    capturedAt: new Date().toISOString(),
    ...details,
  });
  console.error(`[${status}] ${reason}`);
  process.exit(allowSkip ? 0 : 1);
}

function servePrototype(dir, port) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
  };
  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      const file = path.resolve(dir, rel);
      if (!file.startsWith(dir + path.sep) && file !== dir) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    } catch {
      res.writeHead(400);
      res.end('Bad request');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function cdp(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = Math.floor(Math.random() * 1e9);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
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

const viewports = [
  { name: 'w320', width: 320, height: 720 },
  { name: 'w360', width: 360, height: 740 },
  { name: 'w390', width: 390, height: 844 },
  { name: 'w412', width: 412, height: 915 },
  { name: 'w768', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

const directions = ['warm', 'crisp'];
const themes = ['light', 'dark'];

/** Journey screens sampled at 360 + desktop for each direction×theme */
const journeyScreens = [
  { id: 'welcome', setup: `window.__dn67.go('welcome')` },
  { id: 'today', setup: `window.__dn67.go('today')` },
  { id: 'task-editor', setup: `window.__dn67.go('task-editor')` },
  { id: 'library', setup: `window.__dn67.go('library')` },
  { id: 'journal-write', setup: `window.__dn67.go('journal-write')` },
  { id: 'settings', setup: `window.__dn67.go('settings')` },
  { id: 'help', setup: `window.__dn67.go('help')` },
  { id: 'features', setup: `window.__dn67.go('features')` },
  { id: 'assistant', setup: `window.__dn67.go('assistant')` },
];

let browserProc = null;
let server = null;

async function cleanup() {
  if (browserProc && !browserProc.killed) {
    try {
      browserProc.kill();
    } catch {
      /* ignore */
    }
  }
  if (server) {
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(130);
});

async function main() {
  if (!fs.existsSync(path.join(protoDir, 'prototype.html'))) {
    failOrSkip('prototype.html missing', { protoDir });
  }

  let revision = 'unknown';
  let dirty = false;
  try {
    revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
      .length > 0;
  } catch {
    /* ignore */
  }

  const chrome = findChrome();
  if (!chrome) {
    failOrSkip('No Chrome/Edge found at standard paths; set CHROME_PATH or EDGE_PATH', {
      gitRevision: revision,
      workingTreeDirty: dirty,
    });
  }

  const httpPort = await getFreePort();
  const cdpPort = await getFreePort();
  server = await servePrototype(protoDir, httpPort);
  const base = `http://127.0.0.1:${httpPort}`;

  const profile = path.join(metaDir, 'browser-profile');
  fs.mkdirSync(profile, { recursive: true });
  browserProc = spawn(
    chrome,
    [
      `--remote-debugging-port=${cdpPort}`,
      '--headless=new',
      '--disable-gpu',
      '--window-size=1400,1000',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  await sleep(1500);
  let version;
  try {
    version = await fetch(`http://127.0.0.1:${cdpPort}/json/version`).then((r) => r.json());
  } catch (err) {
    await cleanup();
    failOrSkip('CDP endpoint did not become ready', {
      error: String(err),
      gitRevision: revision,
    });
  }
  const browserWs = version.webSocketDebuggerUrl;

  const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json());
  let page = targets.find((t) => t.type === 'page');
  if (!page) {
    await cdp(browserWs, 'Target.createTarget', { url: 'about:blank' });
    await sleep(400);
    const again = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json());
    page = again.find((t) => t.type === 'page');
  }
  if (!page?.webSocketDebuggerUrl) {
    await cleanup();
    failOrSkip('No CDP page target available');
  }
  const pageWs = page.webSocketDebuggerUrl;

  const captures = [];
  const overflowFindings = [];
  const failures = [];

  /**
   * Iframe host sizes the prototype document so CSS media queries match the
   * requested CSS width (headless Emulation.setDeviceMetricsOverride is unreliable here).
   */
  async function evalHost(expression) {
    const { result } = await cdp(pageWs, 'Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.subtype === 'error') throw new Error(result.description || 'host eval error');
    return result?.value;
  }

  async function setFrameSize(vp) {
    await evalHost(`window.__dn67host.setSize(${vp.width}, ${vp.height})`);
    await sleep(120);
    const measured = await evalHost(`window.__dn67host.measure()`);
    // Allow a few px for subpixel/layout; >20 usually means host sizing failed.
    if (!measured || Math.abs(measured.clientW - vp.width) > 20) {
      throw new Error(
        `iframe viewport mismatch: wanted ${vp.width}, clientWidth=${measured && measured.clientW}`
      );
    }
    return measured;
  }

  async function configure(direction, theme) {
    await evalHost(`(() => {
      const api = window.__dn67host.api();
      if (!api) throw new Error('prototype bridge missing inside iframe');
      api.setChrome(${JSON.stringify(direction)}, ${JSON.stringify(theme)});
      return true;
    })()`);
  }

  async function goScreen(setupExpr) {
    // setupExpr references window.__dn67 — rewrite to iframe API
    const route = setupExpr.match(/go\('([^']+)'\)/)?.[1];
    if (!route) throw new Error(`unrecognized setup: ${setupExpr}`);
    await evalHost(`window.__dn67host.api().go(${JSON.stringify(route)})`);
  }

  async function shot(meta) {
    const overflow = await evalHost(`window.__dn67host.measure()`);
    const file = `${meta.direction}-${meta.theme}-${meta.viewport}-${meta.screen}.png`;
    const filePath = path.join(outDir, file);
    const png = await cdp(pageWs, 'Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: 0,
        y: 0,
        width: meta.width,
        height: meta.height,
        scale: 1,
      },
      captureBeyondViewport: true,
    });
    fs.writeFileSync(filePath, Buffer.from(png.data, 'base64'));
    const entry = {
      file: path.relative(root, filePath).replaceAll('\\', '/'),
      timestamp: new Date().toISOString(),
      gitRevision: revision,
      workingTreeDirty: dirty,
      direction: meta.direction,
      theme: meta.theme,
      screen: meta.screen,
      state: meta.state || 'default',
      viewport: {
        width: meta.width,
        height: meta.height,
        label: meta.viewport,
        measuredClientWidth: overflow.clientW,
      },
      browser: chrome,
      platform: 'headless-chromium-iframe-host',
      baseUrl: base,
      authMode: 'synthetic-prototype',
      fixtureIdentity: 'phase67-synthetic',
      overflowXPx: overflow.overflowX,
      clippedControlsSample: overflow.clipped,
      observedResult: 'captured',
      limitations:
        'Iframe CSS-pixel host. Not physical Android keyboard/TalkBack. Manual visual inspection required.',
    };
    captures.push(entry);
    if (overflow.overflowX > 2 || (overflow.clipped && overflow.clipped.length)) {
      overflowFindings.push({
        file: entry.file,
        overflowXPx: overflow.overflowX,
        clippedCount: overflow.clipped.length,
      });
    }
    console.log(
      `captured ${file} clientW=${overflow.clientW} overflowX=${overflow.overflowX}`
    );
    return entry;
  }

  try {
    await cdp(pageWs, 'Page.navigate', { url: `${base}/capture-host.html` });
    await sleep(900);
    const ready = await evalHost(`window.__dn67host && window.__dn67host.ready()`);
    if (!ready) {
      // iframe may still be loading
      await sleep(800);
      const again = await evalHost(`window.__dn67host && window.__dn67host.ready()`);
      if (!again) throw new Error('capture-host iframe prototype bridge not ready');
    }

    // Viewport sweep: both directions × themes × all widths × Today
    for (const direction of directions) {
      for (const theme of themes) {
        for (const vp of viewports) {
          try {
            await setFrameSize(vp);
            await configure(direction, theme);
            await goScreen(`window.__dn67.go('today')`);
            await sleep(200);
            await shot({
              direction,
              theme,
              viewport: vp.name,
              width: vp.width,
              height: vp.height,
              screen: 'today',
              state: 'populated',
            });
          } catch (err) {
            failures.push({
              direction,
              theme,
              viewport: vp.name,
              screen: 'today',
              error: String(err),
            });
            console.error('capture failed', direction, theme, vp.name, err);
          }
        }
      }
    }

    // Journey sampling at 360 + desktop
    for (const direction of directions) {
      for (const theme of themes) {
        for (const vp of viewports.filter((v) => v.name === 'w360' || v.name === 'desktop')) {
          try {
            await setFrameSize(vp);
            await configure(direction, theme);
          } catch (err) {
            failures.push({
              direction,
              theme,
              viewport: vp.name,
              screen: 'setup',
              error: String(err),
            });
            continue;
          }
          for (const screen of journeyScreens) {
            try {
              await goScreen(screen.setup);
              await sleep(180);
              await shot({
                direction,
                theme,
                viewport: vp.name,
                width: vp.width,
                height: vp.height,
                screen: screen.id,
                state: 'representative',
              });
            } catch (err) {
              failures.push({
                direction,
                theme,
                viewport: vp.name,
                screen: screen.id,
                error: String(err),
              });
              console.error('journey capture failed', screen.id, err);
            }
          }
        }
      }
    }
  } finally {
    await cleanup();
  }

  const status = failures.length ? 'fail' : 'pass_capture_only';
  const manifest = writeManifest({
    status,
    unmetEvidence: false,
    note:
      status === 'pass_capture_only'
        ? 'Files written successfully. Manual visual inspection still required before calling Phase 67 visual verification complete.'
        : 'One or more captures failed; see failures[].',
    capturedAt: new Date().toISOString(),
    gitRevision: revision,
    workingTreeDirty: dirty,
    browser: chrome,
    baseUrl: base,
    captureCount: captures.length,
    captures,
    overflowFindings,
    failures,
    manualInspectionRequired: true,
    sampling:
      'Today at all required viewports × direction × theme; journey screens at 360+desktop × direction × theme.',
  });

  console.log(
    JSON.stringify(
      {
        status: manifest.status,
        captureCount: captures.length,
        overflowFindings: overflowFindings.length,
        failures: failures.length,
        manifest: path.relative(root, manifestPath),
      },
      null,
      2
    )
  );

  if (failures.length) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup();
  writeManifest({
    status: allowSkip ? 'skipped' : 'fail',
    unmetEvidence: true,
    reason: String(err),
    capturedAt: new Date().toISOString(),
  });
  process.exit(allowSkip ? 0 : 1);
});
