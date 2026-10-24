#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'packages/design-tokens/src/icons.ts'), 'utf8');
const legacyBlock = source.match(/const legacyIcons(?:\s*:\s*[^=]+)?\s*=\s*\{([\s\S]*?)\n\};/);
const pairRe = /(['"])(.*?)\1\s*:\s*['"]([a-z0-9-]+)['"]/g;
const pairs = [];
let m;
while ((m = pairRe.exec(legacyBlock[1]))) pairs.push({ glyph: m[2], name: m[3] });
pairs.sort((a, b) => b.glyph.length - a.glyph.length);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
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

const files = [
  'packages/ui-web/src/Feedback.tsx',
  'packages/ui-web/src/ItemTypeBadge.tsx',
  'packages/ui-mobile/src/MobileFeedback.tsx',
  'packages/ui-mobile/src/MobileTypeBadge.tsx',
  'packages/ui-web/src/FilePreviewDialog.tsx',
  'packages/ui-web/src/QuickReferenceView.tsx',
  'packages/ui-web/src/TaskRow.tsx',
  'packages/ui-web/src/WorkspacePortabilityDialog.tsx',
  'packages/ui-web/src/AudioRecorderDialog.tsx',
  'packages/ui-mobile/src/MobileFilePreviewSheet.tsx',
  'packages/ui-mobile/src/MobileQuickReferenceView.tsx',
  'packages/ui-mobile/src/MobileWorkspacePortabilitySheet.tsx',
  'packages/ui-mobile/src/MobileAudioRecorderSheet.tsx',
  'apps/web/src/app/journal/page.tsx',
  'apps/web/src/app/plan/page.tsx',
  'apps/web/src/components/ReminderAgendaView.tsx',
  'apps/mobile/src/views/PlanView.tsx',
  'apps/mobile/src/views/SettingsView.tsx',
  'apps/mobile/src/views/ExpensesView.tsx',
  'apps/web/src/app/custom-sections/page.tsx',
  'packages/ui-web/src/ExpenseCaptureDialog.tsx',
];

for (const rel of files) {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) continue;
  let text = fs.readFileSync(filePath, 'utf8');
  const original = text;

  for (const { glyph, name } of pairs) {
    const g = escapeRe(glyph);
    const vs = '(?:\\uFE0E|\\uFE0F)?';
    text = text.replace(new RegExp(`(icon\\s*=\\s*)(['"\`])${g}${vs}\\2`, 'gu'), `$1$2${name}$2`);
  }

  // Generic: any quoted string that is only a known glyph (remaining)
  for (const { glyph, name } of pairs) {
    const g = escapeRe(glyph);
    const vs = '(?:\\uFE0E|\\uFE0F)?';
    text = text.replace(new RegExp(`(['"\`])${g}${vs}\\1`, 'gu'), `$1${name}$1`);
  }

  // Template literals starting with glyph: `⚠️ ${...}` → keep text only with Icon sibling is hard;
  // Convert to `${...}` without glyph for plain Text, or leave for IconText via split — strip glyph prefix in templates used as labels
  text = text.replace(/`([^`$]*)\$\{/g, (full, prefix) => {
    const hit = matchLeading(prefix);
    if (!hit) return full;
    // Drop decorative glyph from template; caller should use Icon
    return `\`${hit.rest ? hit.rest + ' ' : ''}\${`;
  });

  // IconText ternaries still containing words after glyph
  text = text.replace(
    /<IconText\s+([^>]*)\s*text=\{([^}]+)\}\s*([^>]*)\/>/g,
    (full, before, expr, after) => {
      const tern = expr.match(/^\s*(.+?)\s*\?\s*(['"`])([^'"`]+)\2\s*:\s*(['"`])([^'"`]+)\4\s*$/);
      if (!tern) return full;
      const [, cond, q1, a, q2, b] = tern;
      const ha = matchLeading(a) || (/^[a-z][a-z0-9-]*$/.test(a) ? { name: a, rest: '' } : null);
      const hb = matchLeading(b) || (/^[a-z][a-z0-9-]*$/.test(b) ? { name: b, rest: '' } : null);
      if (!ha && !hb) return full;
      // If one side has rest text, render conditional fragment
      const render = (h, q, raw) => {
        if (!h) return `${q}${raw}${q}`;
        if (!h.rest) return `<Icon name=${q}${h.name}${q} />`;
        return `<><Icon name=${q}${h.name}${q} /> {${q}${h.rest}${q}}</>`;
      };
      if ((ha && ha.rest) || (hb && hb.rest) || (ha && !ha.rest && hb && !hb.rest && a !== ha.name)) {
        return `{${cond.trim()} ? (${render(ha || { name: a, rest: '' }, q1, a)}) : (${render(hb || { name: b, rest: '' }, q2, b)})}`;
      }
      if (ha && hb && !ha.rest && !hb.rest) {
        return `<Icon ${before} name={${cond.trim()} ? ${q1}${ha.name}${q1} : ${q2}${hb.name}${q2}} ${after}/>`;
      }
      return full;
    }
  );

  if (text !== original) {
    fs.writeFileSync(filePath, text, 'utf8');
    console.log('updated', rel);
  }
}
console.log('pass3 done');
