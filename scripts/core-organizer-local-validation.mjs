#!/usr/bin/env node
/**
 * Thin runner for core organizer consolidation validation.
 * Prefer: npx vitest run tests/integration/core-organizer-local-validation.test.ts
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  if (typeof process.loadEnvFile === 'function') {
    const envPath = path.join(root, '.env');
    const fs = await import('node:fs');
    if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
  }
} catch {
  /* ignore */
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const r = spawnSync(
  npx,
  ['vitest', 'run', 'tests/integration/core-organizer-local-validation.test.ts'],
  { cwd: root, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' }
);
process.exit(r.status ?? 1);
