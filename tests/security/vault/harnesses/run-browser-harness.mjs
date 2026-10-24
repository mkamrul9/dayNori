/**
 * Execute browser-webcrypto.harness.html in Chromium via Playwright.
 * Records engine version and on-page log to stdout / evidence file.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, 'browser-webcrypto.harness.html');
const evidenceDir = join(here, 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const html = readFileSync(htmlPath);

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/browser-webcrypto.harness.html`;

// Prefer installed Microsoft Edge to avoid downloading Chromium when possible.
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
} catch {
  browser = await chromium.launch({ headless: true });
}
const page = await browser.newPage();
const startedAt = new Date().toISOString();

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__HARNESS_DONE__ === true, null, {
  timeout: 30_000,
});

const result = await page.evaluate(() => ({
  result: window.__HARNESS_RESULT__,
  log: window.__HARNESS_LOG__,
  userAgent: navigator.userAgent,
}));

const browserVersion = browser.version();
const endedAt = new Date().toISOString();

const report = [
  '# Browser WebCrypto harness evidence',
  '',
  `- startedAt: ${startedAt}`,
  `- endedAt: ${endedAt}`,
  `- url: ${url}`,
  `- playwrightChromiumVersion: ${browserVersion}`,
  `- userAgent: ${result.userAgent}`,
  `- harnessResult: ${result.result}`,
  '',
  '## On-page log',
  '',
  '```',
  result.log,
  '```',
  '',
].join('\n');

const outPath = join(evidenceDir, 'browser-harness-latest.md');
writeFileSync(outPath, report, 'utf8');
console.log(report);

await browser.close();
server.close();

process.exit(result.result === 'PASS' ? 0 : 1);
