#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('apps/mobile/src/views');

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.tsx'))) {
  const p = path.join(dir, f);
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  const out = [];
  let i = 0;
  let usesIcon = false;
  let usesIconText = false;
  const full = lines.join('\n');
  usesIcon = /<Icon[\s/>]/.test(full);
  usesIconText = /<IconText[\s/>]/.test(full);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith('import ') && !line.startsWith('import{')) {
      out.push(line);
      i += 1;
      continue;
    }

    // Collect multi-line import
    let block = line;
    let j = i;
    while (!block.includes(' from ') && j + 1 < lines.length) {
      j += 1;
      block += '\n' + lines[j];
    }
    // If still incomplete (no semicolon), keep absorbing
    while (!/;\s*$/.test(block) && j + 1 < lines.length && /^\s/.test(lines[j + 1])) {
      j += 1;
      block += '\n' + lines[j];
    }

    const fromMatch = block.match(/from\s+'([^']+)'/);
    if (!fromMatch) {
      out.push(line);
      i += 1;
      continue;
    }
    const from = fromMatch[1];
    const namesMatch = block.match(/import\s*\{([\s\S]*)\}\s*from/);
    if (!namesMatch) {
      out.push(...block.split('\n'));
      i = j + 1;
      continue;
    }

    let names = namesMatch[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (from === '@daynori/ui-mobile') {
      names = names.filter((n) => n !== 'Icon' && n !== 'IconText');
      if (usesIcon) names.unshift('Icon');
      if (usesIconText) {
        const idx = names.indexOf('Icon');
        names.splice(idx >= 0 ? idx + 1 : 0, 0, 'IconText');
      }
      if (names.length === 0) {
        i = j + 1;
        continue;
      }
      out.push(`import {\n  ${names.join(',\n  ')}\n} from '@daynori/ui-mobile';`);
      i = j + 1;
      continue;
    }

    // Strip Icon/IconText from other imports
    names = names.filter((n) => n !== 'Icon' && n !== 'IconText');
    if (names.length === 0) {
      i = j + 1;
      continue;
    }
    if (names.length <= 4) {
      out.push(`import { ${names.join(', ')} } from '${from}';`);
    } else {
      out.push(`import {\n  ${names.join(',\n  ')}\n} from '${from}';`);
    }
    i = j + 1;
  }

  let text = out.join('\n');
  if ((usesIcon || usesIconText) && !text.includes("from '@daynori/ui-mobile'")) {
    const names = [];
    if (usesIcon) names.push('Icon');
    if (usesIconText) names.push('IconText');
    text = `import {\n  ${names.join(',\n  ')}\n} from '@daynori/ui-mobile';\n` + text;
  } else if ((usesIcon || usesIconText) && !/import\s*\{[^}]*\bIcon\b[^}]*\}\s*from\s*'@daynori\/ui-mobile'/.test(text.replace(/\n/g, ' '))) {
    // ui-mobile import exists but Icon missing — handled above
  }

  fs.writeFileSync(p, text.endsWith('\n') ? text : text + '\n');
  console.log('normalized', f);
}
