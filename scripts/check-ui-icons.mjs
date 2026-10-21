#!/usr/bin/env node
/**
 * Fail if application UI still uses emoji as icon configuration,
 * or references unknown semantic icon names in Icon name="..." props.
 * Does not scan user-content fixtures or domain packages.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'packages/design-tokens/src/icons.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const { iconPaths } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);
const valid = new Set(Object.keys(iconPaths));

const roots = [
  'apps/web/src',
  'apps/mobile/src',
  'packages/ui-web/src',
  'packages/ui-mobile/src',
].map((p) => path.join(root, p));

const emojiRe =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}✓✔✕✗⚠⚙☀]/gu;
const namePropRe = /<Icon\b[^>]*\bname=(['"`])([a-z0-9-]+)\1/g;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (
      /\.(tsx|ts)$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts') &&
      !/Icon\.tsx$|icons\.ts$|\.test\.ts$/.test(entry.name)
    ) {
      out.push(abs);
    }
  }
  return out;
}

const errors = [];
for (const dir of roots) {
  for (const file of walk(dir)) {
    const rel = path.relative(root, file);
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\n/);
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      // Allow prose arrows in copy; flag emoji pictographs used as UI chrome
      if (emojiRe.test(line) && !/Settings →|Daynori →|→ Rooms/.test(line)) {
        errors.push(`${rel}:${idx + 1}: application UI still contains emoji/pictogram chrome`);
      }
    });
    let m;
    while ((m = namePropRe.exec(text))) {
      if (!valid.has(m[2])) {
        errors.push(`${rel}: unknown Icon name "${m[2]}"`);
      }
    }
  }
}

// Native asset coverage
const assetsDir = path.join(root, 'packages/ui-mobile/assets/icons');
for (const name of valid) {
  const png = path.join(assetsDir, `${name}.png`);
  if (!fs.existsSync(png)) errors.push(`missing native icon asset: ${name}.png`);
}

if (errors.length) {
  console.error(`Icon check failed (${errors.length}):`);
  for (const e of errors.slice(0, 50)) console.error(' -', e);
  if (errors.length > 50) console.error(` ... and ${errors.length - 50} more`);
  process.exit(1);
}
console.log(`Icon check passed: ${valid.size} names, native assets present, no UI emoji chrome.`);
