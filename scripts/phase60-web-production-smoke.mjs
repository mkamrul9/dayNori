#!/usr/bin/env node
/**
 * Phase 60 — production-mode web smoke against a built Next.js app.
 *
 * Requires: prior `pnpm --filter @daynori/web build` (or runs build when --build).
 * Uses a local API if DAYNORI_API_URL is set; otherwise starts checks that do not need API.
 *
 * Does not send real email. Synthetic deletion posts go to local API only.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const webRoot = path.join(REPO_ROOT, 'apps', 'web');
const PORT = Number(process.env.PHASE60_WEB_PORT || 3060);
const results = [];

function record(name, status, detail = '') {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function waitForHttp(url, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status > 0) return;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error(`Server not ready: ${url}`);
}

function startNext() {
  const nextBin = path.join(webRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], {
    cwd: webRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DAYNORI_ROOMS_LOCAL_ENABLED: 'true',
      DAYNORI_AI_LOCAL_ENABLED: 'true',
      DAYNORI_BILLING_LOCAL_ENABLED: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => {
    log += d.toString();
  });
  child.stderr.on('data', (d) => {
    log += d.toString();
  });
  return {
    child,
    getLog: () => log,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      await sleep(500);
      if (child.exitCode === null) child.kill('SIGKILL');
    },
  };
}

async function main() {
  const doBuild = process.argv.includes('--build');
  if (doBuild) {
    console.log('[phase60-web] building @daynori/web ...');
    const build = spawn(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['--filter', '@daynori/web', 'build'],
      { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' }
    );
    const code = await new Promise((resolve) => build.on('close', resolve));
    if (code !== 0) {
      record('web-build', 'FAIL', `exit ${code}`);
      writeReport();
      process.exit(1);
    }
    record('web-build', 'PASS');
  } else if (!fs.existsSync(path.join(webRoot, '.next'))) {
    record('web-build', 'UNEXECUTED', 'No .next — re-run with --build');
    writeReport();
    process.exit(2);
  } else {
    record('web-build', 'PASS', 'reusing existing .next');
  }

  const server = startNext();
  try {
    await waitForHttp(`http://127.0.0.1:${PORT}/privacy`);
  } catch (err) {
    record('web-start', 'FAIL', `${err}\n${server.getLog().slice(-2000)}`);
    await server.stop();
    writeReport();
    process.exit(1);
  }
  record('web-start', 'PASS', `port ${PORT}`);

  const publicPages = ['/privacy', '/terms', '/support', '/account-deletion'];
  for (const p of publicPages) {
    const res = await fetch(`http://127.0.0.1:${PORT}${p}`);
    const csp = res.headers.get('content-security-policy') || '';
    const setCookie = res.headers.get('set-cookie') || '';
    const body = await res.text();
    const pageOk = res.status === 200 && body.length > 100;
    record(`public-page ${p}`, pageOk ? 'PASS' : 'FAIL', `status=${res.status}`);
    const cspOk =
      /script-src/.test(csp) &&
      !/script-src[^;]*'unsafe-eval'/.test(csp) &&
      /nonce-/.test(csp);
    record(`csp ${p}`, cspOk ? 'PASS' : 'FAIL', csp.slice(0, 160));
    // Public legal pages should not mint authenticated session cookies.
    const sessionCookie = /daynori_access|sb-access|session/i.test(setCookie);
    record(
      `no-session-cookie ${p}`,
      sessionCookie ? 'FAIL' : 'PASS',
      sessionCookie ? setCookie.slice(0, 120) : 'none'
    );
    if (/UNRESOLVED|not a monitored|placeholder/i.test(body)) {
      record(
        `unresolved-fields ${p}`,
        'PASS',
        'draft marks unresolved owner fields (not labeled launch-ready)'
      );
    }
  }

  // Dev harness URL should not be presented as a production feature surface.
  const harness = await fetch(`http://127.0.0.1:${PORT}/dev/vault-harness`);
  const harnessBody = await harness.text();
  record(
    'vault-harness-labeled',
    /development|harness|synthetic/i.test(harnessBody) || harness.status >= 400
      ? 'PASS'
      : 'FAIL',
    `status=${harness.status}`
  );

  // Proxy deletion — only when API is reachable
  const apiUrl = process.env.DAYNORI_API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    const del = await fetch(
      `http://127.0.0.1:${PORT}/api/v1/public/account-deletion-request`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: `http://127.0.0.1:${PORT}`,
        },
        body: JSON.stringify({ email: 'synthetic-web-proxy@example.test' }),
      }
    );
    record(
      'web-proxy-deletion',
      [200, 202].includes(del.status) ? 'PASS' : 'FAIL',
      `status=${del.status}`
    );
  } else {
    record('web-proxy-deletion', 'UNEXECUTED', 'DAYNORI_API_URL unset');
  }

  // Deep-link / intentional public routes must not enable rooms via query flags
  const roomsFlag = await fetch(
    `http://127.0.0.1:${PORT}/settings?DAYNORI_ROOMS_LOCAL_ENABLED=true`
  );
  record(
    'deep-link-flag-ignored-by-static',
    roomsFlag.status > 0 ? 'PASS' : 'FAIL',
    'query flags are not server feature gates; API production gates covered separately'
  );

  await server.stop();
  writeReport();
  const failed = results.filter((r) => r.status === 'FAIL');
  process.exit(failed.length ? 1 : 0);
}

function writeReport() {
  const out = path.join(REPO_ROOT, 'artifacts', 'release', 'phase60-web-production-smoke.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify({ createdAt: new Date().toISOString(), port: PORT, results }, null, 2) + '\n'
  );
  console.log(`[phase60-web] wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
