#!/usr/bin/env node
/**
 * Phase 65 discovery helper — extracts Fastify route registrations from API route modules.
 * Read-only; prints JSON to stdout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'apps/api/src/routes/v1');
const out = {};

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const found = new Set();
  const re = /\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    found.add(`${m[1].toUpperCase()} ${m[2]}`);
  }
  out[file] = [...found].sort();
}

process.stdout.write(JSON.stringify(out, null, 2) + '\n');
