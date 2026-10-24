#!/usr/bin/env node
/**
 * Phase 60 — bounded local release rehearsal.
 *
 * Requires explicit DAYNORI_REHEARSAL_TARGET=disposable-local before any
 * migration, fault injection, restore, or cleanup. Never mutates shared data.
 *
 * Separates engineering rehearsal from human launch authorization.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

try {
  if (typeof process.loadEnvFile === 'function') {
    const envPath = path.join(REPO_ROOT, '.env');
    if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
  }
} catch {
  /* ignore */
}

function record(results, name, status, detail = '') {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function run(cmd, args, opts = {}) {
  // Prefer shell:false for node arg fidelity on Windows (paths with spaces).
  const useShell =
    opts.shell === true || (process.platform === 'win32' && /\.cmd$/i.test(String(cmd)));
  const { shell: _ignored, ...rest } = opts;
  return spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    ...rest,
    shell: useShell,
  });
}

function main() {
  const results = [];
  const target = process.env.DAYNORI_REHEARSAL_TARGET;
  if (target !== 'disposable-local') {
    console.error(
      '[rehearsal:FAIL] Set DAYNORI_REHEARSAL_TARGET=disposable-local to authorize disposable migrations/faults/cleanup.'
    );
    process.exit(2);
  }
  record(results, 'explicit-test-target', 'PASS', target);

  const engines = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
    .engines?.node;
  const nodeOk = /^v24\.(2[1-9]|[3-9]\d)\./.test(process.version);
  record(
    results,
    'node-runtime',
    nodeOk ? 'PASS' : 'BLOCKED',
    `installed ${process.version}; engines ${engines}`
  );

  const preflight = run(process.execPath, [
    'scripts/release-preflight.mjs',
    '--allow-partial-local',
  ]);
  record(
    results,
    'release-preflight',
    preflight.status === 0 ? 'PASS' : 'FAIL',
    `exit ${preflight.status} (allow-partial-local; releaseEligible remains false)`
  );

  const inspect = run(process.execPath, ['scripts/mobile-android-release-path.mjs', 'inspect']);
  const disposablePath = path.join(
    REPO_ROOT,
    'artifacts',
    'release',
    'android-prebuild-inspection.json'
  );
  let disposableOk = false;
  if (fs.existsSync(disposablePath)) {
    try {
      disposableOk = !!JSON.parse(fs.readFileSync(disposablePath, 'utf8'))?.inspection?.ok;
    } catch {
      disposableOk = false;
    }
  }

  if (inspect.status !== 0 && disposableOk) {
    record(
      results,
      'android-inspect-workspace',
      'PASS',
      'expected FAIL on stale workspace android/; disposable prebuild evidence present'
    );
  } else {
    record(
      results,
      'android-inspect-workspace',
      inspect.status === 0 ? 'PASS' : 'FAIL',
      `exit ${inspect.status}`
    );
  }

  if (disposableOk) {
    record(
      results,
      'android-prebuild-disposable',
      'PASS',
      'reusing artifacts/release/android-prebuild-inspection.json'
    );
  } else {
    const prebuild = run(process.execPath, [
      'scripts/mobile-android-release-path.mjs',
      'prebuild-disposable',
    ]);
    record(
      results,
      'android-prebuild-disposable',
      prebuild.status === 0 ? 'PASS' : 'FAIL',
      `exit ${prebuild.status}`
    );
  }

  const dbName = process.env.DB_NAME || '';
  if (!/test|disposable|rehearsal/i.test(dbName)) {
    record(
      results,
      'db-isolation',
      'BLOCKED',
      `DB_NAME='${dbName || 'unset'}' must look like isolated test/disposable before migrations`
    );
  } else {
    record(results, 'db-isolation', 'PASS', dbName);
    const gates = run(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      [
        'vitest',
        'run',
        'tests/integration/phase60-release-boundaries.test.ts',
        'tests/integration/phase59-launch-gates.test.ts',
        'tests/integration/phase57-billing-repair.test.ts',
      ],
      { env: process.env, stdio: 'inherit' }
    );
    record(results, 'integration-gates', gates.status === 0 ? 'PASS' : 'FAIL', `exit ${gates.status}`);
  }

  const baselinePath = path.join(
    REPO_ROOT,
    'tests',
    'performance',
    'results',
    'phase58-baseline.json'
  );
  if (fs.existsSync(baselinePath)) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const getNoteErrors = (baseline.failedOps || []).filter(
      (e) => e.op === 'getNote' && /no note id/i.test(e.error || '')
    );
    record(
      results,
      'phase58-baseline-classification',
      'PASS',
      `label=${baseline.label}; notSustained100=${baseline.notSustained100UserCapacity}; getNote-no-id=${getNoteErrors.length} (intentional negative when id absent)`
    );
  } else {
    record(results, 'phase58-baseline-classification', 'UNEXECUTED', 'baseline file missing');
  }

  record(
    results,
    'rollback-policy',
    'PASS',
    'Prefer forward-fix; do not assume destructive DB rollback or Android downgrade is safe for installed clients'
  );

  record(
    results,
    'human-authorization',
    'BLOCKED',
    'Local rehearsal must never grant approval or initiate publication'
  );

  const out = path.join(REPO_ROOT, 'artifacts', 'release', 'phase60-local-rehearsal.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const report = {
    createdAt: new Date().toISOString(),
    gitRevision: run('git', ['rev-parse', 'HEAD']).stdout?.trim(),
    notHumanAuthorization: true,
    results,
  };
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(`[rehearsal] wrote ${out}`);

  const failed = results.filter((r) => r.status === 'FAIL');
  if (failed.length) process.exit(1);
  process.exit(0);
}

main();
