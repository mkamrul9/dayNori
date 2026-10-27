#!/usr/bin/env node
/**
 * Phase 79 required-mode evidence helper.
 * Fails when domain tour engine / Help catalog regressions fail or when
 * required automated checks are unmet. Does not invent device proof.
 *
 * Usage:
 *   node scripts/phase79-tour-evidence.mjs
 *   node scripts/phase79-tour-evidence.mjs --required
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const required = process.argv.includes('--required');
const outDir = path.join(root, 'artifacts', 'phase79');
mkdirSync(outDir, { recursive: true });

function run(label, command, args) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: process.env,
  });
  const ok = result.status === 0;
  return {
    label,
    ok,
    status: result.status,
    durationMs: Date.now() - started,
    stdoutTail: (result.stdout || '').slice(-4000),
    stderrTail: (result.stderr || '').slice(-4000),
  };
}

const checks = [];
checks.push(
  run('phase79-tour-engine', 'pnpm', [
    'exec',
    'vitest',
    'run',
    'tests/unit/phase79-tour-engine.test.ts',
  ])
);
checks.push(
  run('phase78-help-regressions', 'pnpm', [
    'exec',
    'vitest',
    'run',
    'tests/unit/phase78-help-catalog.test.ts',
    'tests/unit/phase78-help-return-context.test.ts',
  ])
);
checks.push(
  run('domain-build', 'pnpm', ['--filter', '@daynori/domain', 'build'])
);
checks.push(
  run('contracts-build', 'pnpm', ['--filter', '@daynori/contracts', 'build'])
);

const summary = {
  phase: 79,
  required,
  at: new Date().toISOString(),
  node: process.version,
  checks,
  unmet: checks.filter((c) => !c.ok).map((c) => c.label),
  manualPlatformEvidence: {
    note: 'Interactive web/native proof journeys and a11y reviews are recorded in docs/phase-reports/phase-79.md. This helper does not substitute TalkBack spoken review (Phase 71) or attachment gates (Phase 75).',
  },
};

const summaryPath = path.join(outDir, 'evidence-summary.json');
writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

const failed = summary.unmet.length > 0;
console.log(JSON.stringify({ summaryPath, failed, unmet: summary.unmet }, null, 2));

if (required && failed) {
  console.error('Phase 79 required evidence unmet:', summary.unmet.join(', '));
  process.exit(1);
}
if (failed) process.exit(1);
process.exit(0);
