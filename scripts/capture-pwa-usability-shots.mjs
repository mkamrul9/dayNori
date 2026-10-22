#!/usr/bin/env node
/**
 * Headless Chromium screenshots for mobile PWA layout verification.
 * Emulation only — not physical Android evidence.
 *
 * Usage:
 *   node scripts/capture-pwa-usability-shots.mjs [baseUrl]
 * Default baseUrl: http://127.0.0.1:3010
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
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
];

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

const chrome = findChrome();
if (!chrome) {
  console.error('[shots] Chrome not found — skipping visual capture (emulation unavailable).');
  process.exit(0);
}

await waitReady(`${baseUrl}/privacy`);

/**
 * File size alone is not layout acceptance. Dump metrics via a small evaluation
 * page when Chrome remote debugging is unavailable — record known limitations.
 */
const results = [];
for (const width of widths) {
  for (const route of routes) {
    const file = path.join(outDir, `${route.name}-${width}.png`);
    const url = `${baseUrl}${route.path}`;
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${width},844`,
      `--screenshot=${file}`,
      url,
    ];
    await new Promise((resolve, reject) => {
      const child = spawn(chrome, args, { stdio: 'ignore' });
      child.on('error', reject);
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`chrome exit ${code}`))));
    });
    const exists = fs.existsSync(file) && fs.statSync(file).size > 1000;
    // Emulation caveat: --window-size is not a guaranteed CSS viewport; owners must
    // still verify on a physical Android PWA. Mark as capture-ok, not layout-certified.
    const ok = exists;
    results.push({
      width,
      route: route.path,
      file,
      ok,
      layoutCertified: false,
      note: 'headless window-size emulation — not physical CSS viewport certification',
    });
    console.log(ok ? `[CAPTURE] ${route.name}@${width}` : `[FAIL] ${route.name}@${width}`);
  }
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
      results,
    },
    null,
    2
  ) + '\n'
);
console.log(`[shots] wrote ${summary}`);
const failed = results.filter((r) => !r.ok);
process.exit(failed.length ? 1 : 0);
