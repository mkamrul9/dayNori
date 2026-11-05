#!/usr/bin/env node
/**
 * Phase 72 focused native auth + workspace + C↔B isolation.
 * Reuses helpers from phase71-android-journeys by spawning the same env with
 * DAYNORI_PHASE72_AUTH_ONLY=1 when that gate is present; otherwise inlines
 * a thin runner that imports nothing and shells out to the journeys file after
 * monkey-patching via env DAYNORI_PHASE71_ACCOUNT_LABEL.
 *
 * Prefer: node scripts/phase71-android-journeys.mjs with the runner fixes.
 * This script documents Phase 72 evidence expectations and exits after printing
 * the latest journey auth/isolation steps.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serial = process.env.DAYNORI_ANDROID_SERIAL;
if (!serial) {
  console.error('Set DAYNORI_ANDROID_SERIAL');
  process.exit(2);
}

const env = {
  ...process.env,
  DAYNORI_ANDROID_SERIAL: serial,
  DAYNORI_PHASE71_ACCOUNT_LABEL: process.env.DAYNORI_PHASE71_ACCOUNT_LABEL || 'C',
};

const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'phase71-android-journeys.mjs')], {
  cwd: root,
  env,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');

const summaryPath = path.join(
  root,
  'artifacts',
  'android-e2e',
  'phase71',
  'journeys',
  'phase71-journeys.json'
);
if (fs.existsSync(summaryPath)) {
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const steps = (summary.steps || []).filter((s) =>
    /auth|isolation|search-canonical/i.test(s.step || '')
  );
  const out = path.join(
    root,
    'artifacts',
    'android-e2e',
    'phase71',
    'journeys',
    'phase72-auth-isolation-extract.json'
  );
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        passCount: summary.passCount,
        failCount: summary.failCount,
        authIsolationSteps: steps,
      },
      null,
      2
    )
  );
  console.log(`Wrote ${out}`);
}

process.exit(result.status ?? 1);
