#!/usr/bin/env node
/**
 * Phase 80 required-mode evidence helper.
 * Unit/build checks are mandatory. Real UI journeys must be recorded under
 * artifacts/phase80/ — successful unit exit alone is NOT acceptance.
 *
 * Usage:
 *   node scripts/phase80-tour-evidence.mjs
 *   node scripts/phase80-tour-evidence.mjs --required
 *
 * Optional env:
 *   DAYNORI_PHASE80_UI_ATTESTATION=path/to/manual-evidence.json
 *     JSON must include desktopWeb, narrowPwa, nativeAndroid objects with
 *     { ok: true, provenance: string } for required UI journeys.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const required = process.argv.includes('--required');
const outDir = path.join(root, 'artifacts', 'phase80');
mkdirSync(outDir, { recursive: true });

function run(label, command, args) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: process.env,
  });
  return {
    label,
    ok: result.status === 0,
    status: result.status,
    durationMs: Date.now() - started,
    stdoutTail: (result.stdout || '').slice(-3000),
    stderrTail: (result.stderr || '').slice(-3000),
  };
}

const checks = [];
checks.push(
  run('phase80-everyday-tours', 'pnpm', [
    'exec',
    'vitest',
    'run',
    'tests/unit/phase80-everyday-tours.test.ts',
  ])
);
checks.push(
  run('phase79-regression', 'pnpm', [
    'exec',
    'vitest',
    'run',
    'tests/unit/phase79-tour-engine.test.ts',
  ])
);
checks.push(
  run('phase78-help-regression', 'pnpm', [
    'exec',
    'vitest',
    'run',
    'tests/unit/phase78-help-catalog.test.ts',
    'tests/unit/phase78-help-return-context.test.ts',
  ])
);
checks.push(run('domain-build', 'pnpm', ['--filter', '@daynori/domain', 'build']));
checks.push(run('contracts-build', 'pnpm', ['--filter', '@daynori/contracts', 'build']));

const attestationPath =
  process.env.DAYNORI_PHASE80_UI_ATTESTATION ||
  path.join(outDir, 'manual-ui-evidence.json');

let uiEvidence = {
  label: 'real-ui-journeys',
  ok: false,
  status: 'unmet',
  detail:
    'No manual/UI attestation file. Record desktop web, narrow PWA, and native Android journeys with canonical IDs.',
  path: attestationPath,
};

if (existsSync(attestationPath)) {
  try {
    const raw = JSON.parse(readFileSync(attestationPath, 'utf8'));
    const platforms = ['desktopWeb', 'narrowPwa', 'nativeAndroid'];
    const missing = platforms.filter((p) => !(raw[p] && raw[p].ok === true && raw[p].provenance));
    // TalkBack XML / service enablement alone is not spoken review — reject false substitutes.
    const falseSubstitute =
      raw.nativeAndroid?.talkbackXmlOnly === true ||
      raw.nativeAndroid?.spokenReviewClaimedWithoutSpeech === true;
    uiEvidence = {
      label: 'real-ui-journeys',
      ok: missing.length === 0 && !falseSubstitute,
      status: missing.length === 0 && !falseSubstitute ? 'met' : 'unmet',
      missing,
      falseSubstitute,
      path: attestationPath,
      note: raw.note || null,
    };
  } catch (err) {
    uiEvidence = {
      label: 'real-ui-journeys',
      ok: false,
      status: 'unmet',
      detail: err instanceof Error ? err.message : String(err),
      path: attestationPath,
    };
  }
}

checks.push(uiEvidence);

const summary = {
  phase: 80,
  required,
  at: new Date().toISOString(),
  node: process.version,
  checks,
  unmet: checks.filter((c) => !c.ok).map((c) => c.label),
  limits: {
    note: 'Phase 79 unit evidence helper success does not prove Phase 80 UI journeys. Phase 71 TalkBack spoken gate remains separate.',
  },
};

const summaryPath = path.join(outDir, 'evidence-summary.json');
writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify({ summaryPath, failed: summary.unmet.length > 0, unmet: summary.unmet }, null, 2));

if (required && summary.unmet.length > 0) {
  console.error('Phase 80 required evidence unmet:', summary.unmet.join(', '));
  process.exit(1);
}
if (summary.unmet.length > 0) process.exit(1);
process.exit(0);
