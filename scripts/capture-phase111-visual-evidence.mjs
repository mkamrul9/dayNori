#!/usr/bin/env node
/**
 * Phase 111 visual evidence capture via Chrome CDP.
 * Captures Today, Plan, Library, Journal, Create, Menus, Settings, and Ask Nori
 * across desktop (1280px) and mobile widths (320-412px) in light and dark themes.
 *
 * Fixes Phase 105 capture defect: selects the app's actual React theme state through
 * the UI / React state, emulates prefers-color-scheme, waits for rendering, and fails
 * verification immediately when light and dark captures are unexpectedly identical.
 *
 * Usage:
 *   node scripts/capture-phase111-visual-evidence.mjs [--before | --after]
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

const outDir = path.join(REPO_ROOT, 'artifacts', 'phase111', 'screenshots', mode);
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

  async navigateAndWait(url, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.ws) this.ws.removeEventListener('message', onMessage);
        reject(new Error(`Navigation timeout: ${url}`));
      }, timeoutMs);

      const onMessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.method === 'Page.loadEventFired') {
            if (this.ws) this.ws.removeEventListener('message', onMessage);
            clearTimeout(timer);
            resolve();
          }
        } catch {
          /* ignore */
        }
      };
      if (this.ws) this.ws.addEventListener('message', onMessage);
      this.send('Page.navigate', { url }).catch((err) => {
        clearTimeout(timer);
        if (this.ws) this.ws.removeEventListener('message', onMessage);
        reject(err);
      });
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
    prepare: async () => {
      await sleep(250);
    },
    cleanup: async () => {},
  },
  {
    id: 'plan',
    url: '/plan',
    prepare: async () => {
      await sleep(250);
    },
    cleanup: async () => {},
  },
  {
    id: 'library',
    url: '/library',
    prepare: async () => {
      await sleep(250);
    },
    cleanup: async () => {},
  },
  {
    id: 'journal',
    url: '/journal',
    prepare: async () => {
      await sleep(250);
    },
    cleanup: async () => {},
  },
  {
    id: 'settings',
    url: '/settings',
    prepare: async () => {
      await sleep(250);
    },
    cleanup: async () => {},
  },
  {
    id: 'create',
    url: '/today',
    prepare: async (cdp) => {
      await sleep(200);
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const btn = document.getElementById('global-create-btn') || document.getElementById('today-create-btn');
          if (btn) btn.click();
        })()`,
      });
      await sleep(350);
    },
    cleanup: async (cdp) => {
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          if (window.__daynoriShell && typeof window.__daynoriShell.closeModal === 'function') {
            window.__daynoriShell.closeModal();
          }
          const closeBtn = document.querySelector('button[aria-label="Close dialog"]');
          if (closeBtn) closeBtn.click();
        })()`,
      });
      await sleep(200);
    },
  },
  {
    id: 'menus',
    url: '/today',
    prepare: async (cdp, viewport) => {
      await sleep(200);
      if (viewport.isMobile) {
        await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const drawerBtn = document.querySelector('button[aria-label="Toggle navigation drawer"]');
            if (drawerBtn) drawerBtn.click();
          })()`,
        });
        await sleep(350);
      }
    },
    cleanup: async (cdp, viewport) => {
      if (viewport.isMobile) {
        await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const closeBtn = document.querySelector('button[aria-label="Close dialog"]');
            if (closeBtn) closeBtn.click();
          })()`,
        });
        await sleep(200);
      }
    },
  },
  {
    id: 'assistant',
    url: '/today',
    prepare: async (cdp) => {
      await sleep(200);
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const btn = document.getElementById('global-assistant-btn');
          if (btn) btn.click();
        })()`,
      });
      await sleep(350);
    },
    cleanup: async (cdp) => {
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          if (window.__daynoriShell && typeof window.__daynoriShell.closeModal === 'function') {
            window.__daynoriShell.closeModal();
          }
          const closeBtn = document.querySelector('button[aria-label="Close dialog"]');
          if (closeBtn) closeBtn.click();
        })()`,
      });
      await sleep(200);
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
    phase: '111',
    mode,
    timestamp: new Date().toISOString(),
    viewports: VIEWPORTS,
    themes: THEMES,
    screens: SCREENS.map((s) => s.id),
    captures: [],
    themeDifferenceVerification: {
      pairsTested: 0,
      pairsDistinct: 0,
      pairsIdentical: 0,
      passed: true,
      failures: [],
    },
  };

  try {
    const targetsRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];

    const cdp = new CdpSession(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Runtime.enable');

    console.log(`Executing Phase 111 visual captures in mode: [${mode.toUpperCase()}]...`);

    let lastNavigatedUrl = '';

    for (const screen of SCREENS) {
      for (const vp of VIEWPORTS) {
        const targetUrl = `${baseUrl}${screen.url}`;
        const themeCaptures = {};

        // Configure viewport
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 2,
          mobile: vp.isMobile,
        });

        // Navigate if screen URL or viewport changed
        await cdp.navigateAndWait(targetUrl);
        lastNavigatedUrl = targetUrl;

        // Wait for page load and React hydration
        await cdp.send('Runtime.evaluate', {
          expression: `new Promise((resolve) => {
            let count = 0;
            const interval = setInterval(() => {
              count++;
              if ((document.readyState === 'complete' && window.__daynoriShell) || count > 60) {
                clearInterval(interval);
                resolve();
              }
            }, 50);
          })`,
          awaitPromise: true,
        });

        for (const theme of THEMES) {
          const filename = `${screen.id}_${vp.name}_${theme}.png`;
          const filePath = path.join(outDir, filename);

          // 1. Emulate color scheme media feature
          await cdp.send('Emulation.setEmulatedMedia', {
            media: 'screen',
            features: [{ name: 'prefers-color-scheme', value: theme }],
          });

          // 2. Select actual React theme state through UI or React context setter
          const themeEvalRes = await cdp.send('Runtime.evaluate', {
            expression: `(() => {
              const target = '${theme}';
              const initialTheme = document.documentElement.getAttribute('data-theme');
              let method = 'none';
              const btn = document.getElementById('set-theme-' + target);
              if (btn) {
                btn.click();
                method = 'btn';
              } else if (window.__daynoriShell && typeof window.__daynoriShell.setTheme === 'function') {
                window.__daynoriShell.setTheme(target);
                method = 'shell';
              } else {
                const current = document.documentElement.getAttribute('data-theme');
                if (current !== target) {
                  const toggleBtn = document.getElementById('global-theme-toggle');
                  if (toggleBtn) {
                    toggleBtn.click();
                    method = 'toggle';
                  }
                }
              }
              return { initialTheme, method, finalTheme: document.documentElement.getAttribute('data-theme') };
            })()`,
            returnByValue: true,
          });

          // 3. Wait for theme rendering and CSS transitions to settle
          await cdp.send('Runtime.evaluate', {
            expression: `new Promise((resolve) => {
              const target = '${theme}';
              let attempts = 0;
              const check = () => {
                attempts++;
                if (document.documentElement.getAttribute('data-theme') === target || attempts > 25) {
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => setTimeout(resolve, 220));
                  });
                } else {
                  setTimeout(check, 40);
                }
              };
              check();
            })`,
            awaitPromise: true,
          });

          const verifiedThemeRes = await cdp.send('Runtime.evaluate', {
            expression: `document.documentElement.getAttribute('data-theme')`,
            returnByValue: true,
          });
          const actualTheme = verifiedThemeRes?.result?.value;

          // 4. Screen preparation (modals, drawers, etc.)
          await screen.prepare(cdp, vp);

          // 5. Measure horizontal overflow
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

          // 6. Capture screenshot
          const screenshot = await cdp.send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
          });

          const buffer = Buffer.from(screenshot.data, 'base64');
          fs.writeFileSync(filePath, buffer);

          const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

          themeCaptures[theme] = {
            sha256,
            bytes: buffer.length,
          };

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

          console.log(`  [${manifest.captures.length}/80] captured ${filename} (theme: ${actualTheme}, sha: ${sha256.slice(0, 10)})`);

          // 7. Cleanup overlay state for next capture
          if (screen.cleanup) {
            await screen.cleanup(cdp, vp);
          }
        }

        // FAIL VERIFICATION when light and dark captures are unexpectedly identical
        manifest.themeDifferenceVerification.pairsTested++;
        if (themeCaptures.light && themeCaptures.dark) {
          if (themeCaptures.light.sha256 === themeCaptures.dark.sha256) {
            const errorMsg = `VERIFICATION FAILED: Light and dark captures for screen "${screen.id}" on viewport "${vp.name}" are byte-identical! SHA-256: ${themeCaptures.light.sha256}`;
            manifest.themeDifferenceVerification.pairsIdentical++;
            manifest.themeDifferenceVerification.passed = false;
            manifest.themeDifferenceVerification.failures.push({
              screen: screen.id,
              viewport: vp.name,
              sha256: themeCaptures.light.sha256,
            });
            console.error('\n' + errorMsg);
            throw new Error(errorMsg);
          } else {
            manifest.themeDifferenceVerification.pairsDistinct++;
          }
        }
      }
    }

    console.log('\nAll captures completed and theme difference verified!');
    console.log(`Theme difference verification: ${manifest.themeDifferenceVerification.pairsDistinct}/${manifest.themeDifferenceVerification.pairsTested} pairs verified distinct.`);

    const manifestPath = path.join(REPO_ROOT, 'artifacts', 'phase111', `capture-manifest-${mode}.json`);
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
