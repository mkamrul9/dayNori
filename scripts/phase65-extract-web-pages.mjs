#!/usr/bin/env node
/**
 * Phase 65 discovery helper — lists web App Router page.tsx routes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, 'apps/web/src/app');

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name === 'page.tsx') acc.push(full);
  }
  return acc;
}

const pages = walk(appDir).map((full) => {
  const rel = path.relative(appDir, path.dirname(full)).replaceAll('\\', '/');
  const route = rel === '' ? '/' : `/${rel}`;
  return { route, file: path.relative(root, full).replaceAll('\\', '/') };
});

process.stdout.write(JSON.stringify(pages, null, 2) + '\n');
