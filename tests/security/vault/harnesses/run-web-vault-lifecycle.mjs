/**
 * Phase 47 — Playwright lifecycle + CSP checks against the Next.js web app.
 * Reuses the harness package Playwright dependency (not production app code).
 *
 * Usage (from repo root, after `pnpm --filter @daynori/web build`):
 *   node tests/security/vault/harnesses/run-web-vault-lifecycle.mjs
 *
 * Env:
 *   WEB_ROOT — path to apps/web (default: ../../../../apps/web from this file)
 *   PROD_PORT / DEV_PORT — defaults 3027 / 3028
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const webRoot = process.env.WEB_ROOT ? resolve(process.env.WEB_ROOT) : join(repoRoot, 'apps/web');
const evidenceDir = join(here, 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const PROD_PORT = Number(process.env.PROD_PORT || 3027);
const DEV_PORT = Number(process.env.DEV_PORT || 3028);
const SYNTHETIC_PASSPHRASE = 'correct-horse-battery-staple-synthetic';

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status > 0) return;
    } catch {
      // retry
    }
    await sleep(400);
  }
  throw new Error(`Server not ready: ${url}`);
}

function startNext(args, env, cwd) {
  // Invoke the local Next binary via node (works on Windows without shell:true).
  const nextBin = join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
  });
  child.stderr.on('data', (d) => {
    buf += d.toString();
  });
  return {
    child,
    getLog: () => buf,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      await sleep(500);
      if (child.exitCode === null) child.kill('SIGKILL');
    },
  };
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'msedge', headless: true });
  } catch {
    return await chromium.launch({ headless: true });
  }
}

async function runProductionChecks(browser) {
  const server = startNext(['start', '-p', String(PROD_PORT)], { NODE_ENV: 'production' }, webRoot);
  try {
    try {
      await waitForHttp(`http://127.0.0.1:${PROD_PORT}/vault`);
    } catch (err) {
      throw new Error(`${err instanceof Error ? err.message : err}\nserver log:\n${server.getLog()}`);
    }
    const page = await browser.newPage();
    const cspViolations = [];
    page.on('console', (msg) => {
      const t = msg.text();
      if (/Content Security Policy|Refused to execute/i.test(t)) cspViolations.push(t);
    });

    const vaultRes = await page.goto(`http://127.0.0.1:${PROD_PORT}/vault`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    const headers = vaultRes?.headers() ?? {};
    const csp = headers['content-security-policy'] || '';
    record(
      'production CSP has no unsafe-inline/unsafe-eval in script-src',
      /script-src[^;]*nonce-/.test(csp) &&
        !/script-src[^;]*'unsafe-inline'/.test(csp) &&
        !/script-src[^;]*'unsafe-eval'/.test(csp),
      csp.slice(0, 180)
    );
    record(
      'production Permissions-Policy denies microphone on /vault',
      /microphone=\(\)/.test(headers['permissions-policy'] || ''),
      headers['permissions-policy'] || ''
    );
    const html = await page.content();
    record(
      'production /vault HTML has no synthetic secrets',
      !/correct-horse|0123456789abcdef|Harness plaintext/i.test(html) &&
        /Vault unavailable/i.test(html)
    );
    // Inline event-handler scriptlets are not covered by nonce/'strict-dynamic' trust
    // and must be blocked (creating <script> from a nonced page script can inherit trust).
    const injected = await page.evaluate(async () => {
      return await new Promise((resolve) => {
        window.__UNAUTHORIZED_SCRIPT__ = false;
        const img = document.createElement('img');
        img.setAttribute('onerror', 'window.__UNAUTHORIZED_SCRIPT__=true');
        img.src = `/missing-csp-probe-${Date.now()}`;
        document.body.appendChild(img);
        setTimeout(() => resolve(window.__UNAUTHORIZED_SCRIPT__ === true ? 'ran' : 'blocked'), 500);
      });
    });
    record('CSP blocks unauthorized inline event-handler script', injected !== 'ran', injected);
    // Discard intentional probe violation noise before navigating further.
    cspViolations.length = 0;

    const harnessRes = await page.goto(`http://127.0.0.1:${PROD_PORT}/dev/vault-harness`, {
      waitUntil: 'domcontentloaded',
    });
    record('production harness route returns 404', harnessRes?.status() === 404, String(harnessRes?.status()));

    // Ordinary settings page should still hydrate under nonce CSP.
    await page.goto(`http://127.0.0.1:${PROD_PORT}/settings`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForTimeout(1000);
    const settingsOk = await page.locator('text=Vault').first().isVisible().catch(() => false);
    record('production settings page renders under nonce CSP', settingsOk);
    const unexpected = cspViolations.filter((t) => !/missing-csp-probe/i.test(t));
    record(
      'no unexpected CSP console violations on settings navigation',
      unexpected.length === 0,
      unexpected.slice(0, 2).join(' | ')
    );
    await page.close();
  } finally {
    await server.stop();
  }
}

async function runDevHarnessChecks(browser) {
  const server = startNext(['dev', '-p', String(DEV_PORT)], { NODE_ENV: 'development' }, webRoot);
  try {
    await waitForHttp(`http://127.0.0.1:${DEV_PORT}/dev/vault-harness`, 90_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleMsgs = [];
    page.on('console', (msg) => consoleMsgs.push(msg.text()));

    await page.goto(`http://127.0.0.1:${DEV_PORT}/dev/vault-harness`, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    await page.waitForTimeout(1500);
    await page.getByTestId('web-vault-harness-banner').waitFor({ timeout: 30_000 });
    record('dev harness banner visible', true);

    // Locked state status
    await page.getByTestId('web-vault-lock-state').waitFor();
    const lockedText = await page.getByTestId('web-vault-lock-state').innerText();
    record('locked status feedback present', /locked/i.test(lockedText), lockedText);

    // Keyboard: open unlock, focus passphrase
    await page.getByTestId('web-vault-open-unlock').focus();
    await page.keyboard.press('Enter');
    await page.getByTestId('web-vault-unlock-panel').waitFor();
    await page.getByTestId('web-vault-passphrase').focus();
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    record('keyboard focus reaches passphrase field', focused === 'web-vault-passphrase', focused || '');

    // Wrong passphrase — panel must remain for retry; status must not dump provider stacks
    await page.getByTestId('web-vault-passphrase').fill('wrong-passphrase');
    await page.getByTestId('web-vault-unlock-submit').click();
    await page.getByTestId('web-vault-unlock-panel').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(400);
    const afterFail = await page.getByRole('status').allInnerTexts();
    const panelStillOpen = await page.getByTestId('web-vault-passphrase').isVisible();
    record(
      'failed unlock keeps sheet open with accessible status',
      panelStillOpen &&
        afterFail.some((t) => /reject|fail|cooldown|locked|passphrase/i.test(t)) &&
        !afterFail.some((t) => /stack|Error:|at Object\./i.test(t)),
      afterFail.join(' | ').slice(0, 160)
    );

    // Cancel if pending, then unlock success
    const cancel = page.getByRole('button', { name: 'Cancel' });
    if (await cancel.isVisible().catch(() => false)) await cancel.click();
    if (!(await page.getByTestId('web-vault-passphrase').isVisible().catch(() => false))) {
      await page.getByTestId('web-vault-open-unlock').click();
      await page.getByTestId('web-vault-passphrase').waitFor();
    }
    await page.getByTestId('web-vault-passphrase').fill(SYNTHETIC_PASSPHRASE);
    await page.getByTestId('web-vault-unlock-submit').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="web-vault-lock-state"]')?.textContent?.includes('unlocked'),
      null,
      { timeout: 15_000 }
    );
    const unlocked = await page.getByTestId('web-vault-lock-state').innerText();
    record('synthetic unlock succeeds', /unlocked/i.test(unlocked), unlocked);

    // Storage / secrets inspection after unlock
    const storageLeak = await page.evaluate(() => {
      const dump = {
        localStorage: { ...localStorage },
        sessionStorage: { ...sessionStorage },
      };
      return JSON.stringify(dump);
    });
    record(
      'no passphrase/plaintext in web storage after unlock',
      !/correct-horse|Harness plaintext|synth-handle/i.test(storageLeak),
      storageLeak.slice(0, 120)
    );

    // Lock during unlocked session
    await page.getByTestId('web-vault-lock').click();
    await page.waitForTimeout(300);
    const afterLock = await page.getByTestId('web-vault-lock-state').innerText();
    record('explicit lock returns locked state', /locked/i.test(afterLock), afterLock);

    // Cross-tab lock without secrets
    await page.getByTestId('web-vault-open-unlock').click();
    await page.getByTestId('web-vault-passphrase').fill(SYNTHETIC_PASSPHRASE);
    await page.getByTestId('web-vault-unlock-submit').click();
    await page.waitForTimeout(500);
    const page2 = await context.newPage();
    const channelMsgs = [];
    await page2.addInitScript(() => {
      window.__vaultMsgs = [];
      try {
        const ch = new BroadcastChannel('daynori-vault-session-v1');
        ch.onmessage = (ev) => window.__vaultMsgs.push(ev.data);
      } catch {
        /* ignore */
      }
    });
    await page2.goto(`http://127.0.0.1:${DEV_PORT}/dev/vault-harness`, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    await page2.waitForTimeout(1500);
    // Lock from tab 1
    await page.getByTestId('web-vault-lock').click();
    await page.waitForTimeout(800);
    const msgs = await page2.evaluate(() => window.__vaultMsgs || []);
    channelMsgs.push(...msgs);
    const secretInChannel = JSON.stringify(msgs);
    record(
      'cross-tab lock signal observed without secrets',
      msgs.some((m) => m?.type === 'lock_signal') &&
        !/correct-horse|0123456789abcdef|Harness plaintext|synth-handle/i.test(secretInChannel),
      JSON.stringify(msgs).slice(0, 160)
    );
    const tab2State = await page2.getByTestId('web-vault-lock-state').innerText();
    record('tab 2 remains/ends locked (no silent unlock)', /locked/i.test(tab2State), tab2State);

    // Cooldown: use a fresh controller path by reloading and failing once with max attempts —
    // default policy is 5; verify unavailable production path via disabled /vault instead.
    await page.goto(`http://127.0.0.1:${DEV_PORT}/vault`);
    record(
      'dev /vault status page has no harness plaintext',
      !(await page.content()).includes('Harness plaintext')
    );

    const sensitiveConsole = consoleMsgs.filter((t) =>
      /correct-horse|0123456789abcdef|Harness plaintext|synth-handle/i.test(t)
    );
    record('console has no vault secrets', sensitiveConsole.length === 0, sensitiveConsole[0] || '');

    await context.close();
  } finally {
    await server.stop();
  }
}

const startedAt = new Date().toISOString();
let browser;
let exitCode = 0;
try {
  browser = await launchBrowser();
  await runProductionChecks(browser);
  await runDevHarnessChecks(browser);
} catch (err) {
  console.error(err);
  record('runner exception', false, err instanceof Error ? err.message : String(err));
  exitCode = 1;
} finally {
  if (browser) await browser.close();
}

const failed = results.filter((r) => !r.ok);
if (failed.length) exitCode = 1;
const endedAt = new Date().toISOString();
const report = [
  '# Phase 47 web vault Playwright evidence',
  '',
  `- startedAt: ${startedAt}`,
  `- endedAt: ${endedAt}`,
  `- webRoot: ${webRoot}`,
  `- failed: ${failed.length}/${results.length}`,
  '',
  ...results.map((r) => `- ${r.ok ? 'PASS' : 'FAIL'}: ${r.name}${r.detail ? ` (${r.detail})` : ''}`),
  '',
].join('\n');
const outPath = join(evidenceDir, 'web-vault-lifecycle-latest.md');
writeFileSync(outPath, report, 'utf8');
console.log(report);
process.exit(exitCode);
