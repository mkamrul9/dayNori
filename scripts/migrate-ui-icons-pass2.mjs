#!/usr/bin/env node
/** Second pass: ?? / || / value= / return / useState / ternaries / IconText leftovers. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'packages/design-tokens/src/icons.ts'), 'utf8');
const legacyBlock = source.match(/const legacyIcons(?:\s*:\s*[^=]+)?\s*=\s*\{([\s\S]*?)\n\};/);
if (!legacyBlock) throw new Error('legacyIcons parse failed');
const pairRe = /(['"])(.*?)\1\s*:\s*['"]([a-z0-9-]+)['"]/g;
const pairs = [];
let m;
while ((m = pairRe.exec(legacyBlock[1]))) pairs.push({ glyph: m[2], name: m[3] });
pairs.sort((a, b) => b.glyph.length - a.glyph.length);

function stripVs(s) {
  return s.replace(/[\uFE0E\uFE0F]/g, '');
}

function matchLeading(value) {
  const cleaned = stripVs(value);
  for (const { glyph, name } of pairs) {
    if (cleaned === glyph) return { name, rest: '' };
    if (cleaned.startsWith(glyph)) {
      const rest = cleaned.slice(glyph.length);
      if (rest === '' || /^\s/.test(rest)) return { name, rest: rest.replace(/^\s+/, '') };
    }
  }
  return null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const roots = [
  'apps/web/src',
  'apps/mobile/src',
  'packages/ui-web/src',
  'packages/ui-mobile/src',
  'apps/api/src/modules/custom-sections',
].map((p) => path.join(root, p));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(abs);
  }
  return out;
}

function migrate(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  const original = text;

  for (const { glyph, name } of pairs) {
    const g = escapeRe(glyph);
    const vs = '(?:\\uFE0E|\\uFE0F)?';
    text = text.replace(new RegExp(`(\\?\\?|\\|\\|)\\s*(['"\`])${g}${vs}\\2`, 'gu'), `$1 $2${name}$2`);
    text = text.replace(new RegExp(`value=(['"\`])${g}${vs}\\1`, 'gu'), `value=$1${name}$1`);
    text = text.replace(new RegExp(`return\\s+(['"\`])${g}${vs}\\1`, 'gu'), `return $1${name}$1`);
    text = text.replace(new RegExp(`useState\\((['"\`])${g}${vs}\\1\\)`, 'gu'), `useState($1${name}$1)`);
    text = text.replace(new RegExp(`setCreateIcon\\((['"\`])${g}${vs}\\1\\)`, 'gu'), `setCreateIcon($1${name}$1)`);
  }

  // IconText text="🌙 Dark" → <> <Icon name="moon" /> Dark </>
  text = text.replace(
    /<IconText\s+text=\{?\s*(['"`])([^'"`]+)\1\s*\}?\s*(?:\/>|><\/IconText>)/g,
    (full, q, value) => {
      const hit = matchLeading(value);
      if (!hit) return full;
      if (!hit.rest) return `<Icon name=${q}${hit.name}${q} />`;
      return `<><Icon name=${q}${hit.name}${q} /> {${q}${hit.rest}${q}}</>`;
    }
  );

  // IconText text={cond ? '🌙 Dark' : '☀️ Light'}
  text = text.replace(
    /<IconText\s+text=\{([^}]+)\}\s*\/>/g,
    (full, expr) => {
      const ternary = expr.match(
        /^\s*(.+?)\s*\?\s*(['"`])([^'"`]+)\2\s*:\s*(['"`])([^'"`]+)\4\s*$/
      );
      if (!ternary) return full;
      const [, cond, q1, a, q2, b] = ternary;
      const ha = matchLeading(a);
      const hb = matchLeading(b);
      if (!ha || !hb) return full;
      const left = ha.rest
        ? `<><Icon name=${q1}${ha.name}${q1} /> {${q1}${ha.rest}${q1}}</>`
        : `<Icon name=${q1}${ha.name}${q1} />`;
      const right = hb.rest
        ? `<><Icon name=${q2}${hb.name}${q2} /> {${q2}${hb.rest}${q2}}</>`
        : `<Icon name=${q2}${hb.name}${q2} />`;
      return `{${cond.trim()} ? (${left}) : (${right})}`;
    }
  );

  // Fix ▶→play used as expand control
  text = text.replace(
    /(isOverdueExpanded\s*\?\s*(['"`]))(?:▼|chevron-down)\2\s*:\s*\2play\2/g,
    '$1chevron-down$2 : $2chevron-right$2'
  );
  text = text.replace(/\? '▼' : 'play'/g, "? 'chevron-down' : 'chevron-right'");
  text = text.replace(/\? "▼" : "play"/g, '? "chevron-down" : "chevron-right"');

  // Remaining IconText with ternary pure checks ☑/☐
  text = text.replace(
    /IconText\s+text=\{([^}]*\?\s*(['"`])([^'"`]+)\2\s*:\s*(['"`])([^'"`]+)\4)\}/g,
    (full, _expr, q1, a, q2, b) => {
      const ha = matchLeading(a) || (validName(a) ? { name: a, rest: '' } : null);
      const hb = matchLeading(b) || (validName(b) ? { name: b, rest: '' } : null);
      if (!ha || !hb || ha.rest || hb.rest) return full;
      // Rebuild using original condition
      const condMatch = full.match(/text=\{(.+?)\s*\?/);
      if (!condMatch) return full;
      return `Icon name={${condMatch[1].replace(/^text=\{/, '').trim()} ? ${q1}${ha.name}${q1} : ${q2}${hb.name}${q2}}`;
    }
  );

  if (text !== original) {
    fs.writeFileSync(filePath, text, 'utf8');
    return true;
  }
  return false;
}

function validName(s) {
  return /^[a-z][a-z0-9-]*$/.test(s);
}

let n = 0;
for (const dir of roots) {
  for (const file of walk(dir)) {
    if (migrate(file)) {
      n += 1;
      console.log('updated', path.relative(root, file));
    }
  }
}
console.log(`Pass2 updated ${n} files`);
