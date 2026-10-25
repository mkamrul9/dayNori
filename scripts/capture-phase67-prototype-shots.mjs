#!/usr/bin/env node
/**
 * Capture Phase 67 prototype viewports with Playwright if available.
 * Writes under artifacts/local/phase67/ (gitignored). Does not prove physical devices.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'artifacts', 'local', 'phase67', 'screenshots');
const protoDir = path.join(root, 'docs', 'design', 'v2', 'phase67');

const require = createRequire(import.meta.url);

async function findPlaywright() {
  try {
    return require('playwright');
  } catch {
    try {
      return require(path.join(root, 'apps/web/node_modules/playwright'));
    } catch {
      return null;
    }
  }
}

function serveStatic(dir, port) {
  const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.md': 'text/markdown',
    '.svg': 'image/svg+xml',
  };
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(dir, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(dir)) {
      res.writeHead(403);
      res.end();
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
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const pw = await findPlaywright();
  if (!pw) {
    console.error('Playwright not installed — skip PNG capture. Open prototype.html manually.');
    console.error(`Prototype path: ${protoDir}`);
    process.exit(0);
  }

  const port = 8767;
  const server = await serveStatic(protoDir, port);
  const base = `http://127.0.0.1:${port}`;
  const browser = await pw.chromium.launch();
  const viewports = [
    { name: 'w320', width: 320, height: 720 },
    { name: 'w360', width: 360, height: 740 },
    { name: 'w390', width: 390, height: 844 },
    { name: 'w412', width: 412, height: 915 },
    { name: 'w768', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 800 },
  ];
  const combos = [
    { direction: 'warm', theme: 'light' },
    { direction: 'warm', theme: 'dark' },
    { direction: 'crisp', theme: 'light' },
    { direction: 'crisp', theme: 'dark' },
  ];

  for (const combo of combos) {
    for (const vp of viewports) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto(`${base}/prototype.html`, { waitUntil: 'networkidle' });
      await page.evaluate((c) => {
        localStorage.setItem('dn67-direction', c.direction);
        localStorage.setItem('dn67-theme', c.theme);
      }, combo);
      await page.reload({ waitUntil: 'networkidle' });
      // Sign in path → Today
      await page.click('text=Sign in');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(200);
      const file = path.join(
        outDir,
        `${combo.direction}-${combo.theme}-${vp.name}-today.png`
      );
      await page.screenshot({ path: file, fullPage: false });
      await page.close();
      console.log('wrote', path.relative(root, file));
    }
  }

  await browser.close();
  server.close();
  console.log('Capture complete. PNGs are local-only evidence.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
