#!/usr/bin/env node
/**
 * Replace application-authored emoji glyphs with semantic IconName strings
 * in apps/ and packages/ui-* only. Does not rewrite user content fixtures.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'packages/design-tokens/src/icons.ts'), 'utf8');
const legacyBlock = source.match(
  /const legacyIcons(?:\s*:\s*[^=]+)?\s*=\s*\{([\s\S]*?)\n\};/
);
if (!legacyBlock) {
  console.error('Could not parse legacyIcons');
  process.exit(1);
}

const pairRe = /(['"])(.*?)\1\s*:\s*['"]([a-z0-9-]+)['"]/g;
const pairs = [];
let m;
while ((m = pairRe.exec(legacyBlock[1]))) {
  pairs.push({ glyph: m[2], name: m[3] });
}
pairs.sort((a, b) => b.glyph.length - a.glyph.length || b.glyph.localeCompare(a.glyph));

const roots = [
  path.join(root, 'apps/web/src'),
  path.join(root, 'apps/mobile/src'),
  path.join(root, 'packages/ui-web/src'),
  path.join(root, 'packages/ui-mobile/src'),
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(abs);
  }
  return out;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function migrateFile(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  const original = text;

  for (const { glyph, name } of pairs) {
    const g = escapeRe(glyph);
    const vs = '(?:\\uFE0E|\\uFE0F)?';
    text = text.replace(new RegExp(`name=(['"\`])${g}${vs}\\1`, 'gu'), `name=$1${name}$1`);
    text = text.replace(
      new RegExp(`\\b(icon|emoji)\\s*:\\s*(['"\`])${g}${vs}\\2`, 'gu'),
      (_full, _key, q) => `icon: ${q}${name}${q}`
    );
    text = text.replace(new RegExp(`(:\\s*)(['"\`])${g}${vs}\\2`, 'gu'), `$1$2${name}$2`);
  }

  // Mood config property rename after emoji→icon migration
  if (/AVAILABLE_MOODS/.test(text)) {
    text = text.replace(/\bemoji\s*:/g, 'icon:');
    text = text.replace(/\bm\.emoji\b/g, 'm.icon');
  }

  if (text !== original) {
    fs.writeFileSync(filePath, text, 'utf8');
    return true;
  }
  return false;
}

let changed = 0;
for (const dir of roots) {
  for (const file of walk(dir)) {
    if (migrateFile(file)) {
      changed += 1;
      console.log('updated', path.relative(root, file));
    }
  }
}
console.log(`Migrated ${changed} files to semantic icon names.`);
