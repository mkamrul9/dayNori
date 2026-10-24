/**
 * Phase 48 Drive spike CLI.
 *
 * Modes:
 *   --mode=inventory  Write documentation/synthetic inventory only (no Google calls).
 *   --mode=mock       Alias for inventory (legacy name).
 *   --mode=live       Runs interactive OAuth + Drive API via tsx liveRunner.ts
 *
 * Inventory is NOT live verification. Live without config exits blocked/unexecuted.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const modeArg = process.argv.find((a) => a.startsWith('--mode='));
const modeRaw = modeArg ? modeArg.split('=')[1] : 'inventory';
const mode = modeRaw === 'mock' ? 'inventory' : modeRaw;

if (mode === 'live') {
  // Relative path avoids Windows spawn issues with spaces in absolute paths.
  const liveRel = 'tests/spikes/drive/src/liveRunner.ts';
  const repoRoot = join(here, '../../..');
  const r = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'tsx', liveRel],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, DAYNORI_DRIVE_LIVE_MAIN: '1' },
      shell: process.platform === 'win32',
    }
  );
  if (r.error) {
    console.error(`live runner spawn failed: ${r.error.message}`);
  }
  process.exit(r.status ?? 1);
}

if (mode !== 'inventory') {
  console.error(`Unknown mode=${mode}. Use inventory|mock|live.`);
  process.exit(2);
}

// Inventory-only path (no domain import / no Google).
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const cases = [
  'app-created-file',
  'picker-selected-file',
  'never-selected-file',
  'picker-selected-folder',
  'existing-children-of-selected-folder',
  'external-child-after-folder-selection',
  'app-created-child-in-authorized-location',
  'independently-selected-child',
  'file-move',
  'trash-restore',
  'permission-loss',
  'grant-revocation',
  'reauth-incremental',
];

const report = {
  phase: 48,
  mode: 'inventory',
  commandMeaning:
    'Prepares documentation/synthetic inventory only. Does not start OAuth, Picker, or Drive API.',
  startedAt: new Date().toISOString(),
  endedAt: new Date().toISOString(),
  requestedScope: DRIVE_FILE_SCOPE,
  cases: cases.map((id) => ({
    caseId: id,
    documentationOrSynthetic: 'see vitest matrix / ADR 0046',
    liveObservation: null,
    note: 'liveObservation remains null until --mode=live succeeds',
  })),
  next: 'node tests/spikes/drive/run-spike.mjs --mode=live',
};

const outDir = join(here, 'results');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'inventory.json');
writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log(`Phase 48 inventory written=${outPath}`);
console.log('This command does NOT perform live Google verification.');
