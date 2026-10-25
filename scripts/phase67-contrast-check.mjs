#!/usr/bin/env node
/**
 * Phase 67 — opaque sRGB contrast ratios for prototype direction pairs.
 * Not a WCAG conformance certificate.
 */

function luminance(hex) {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a, b) {
  const L1 = luminance(a);
  const L2 = luminance(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

const pairs = [
  ['Warm ink/paper', '#172C2C', '#F7F5EF'],
  ['Warm secondary/paper', '#526363', '#F7F5EF'],
  ['Warm white/teal', '#FFFFFF', '#146B63'],
  ['Warm ink/amber', '#172C2C', '#D9A441'],
  ['Warm border/paper', '#758680', '#F7F5EF'],
  ['Warm dark text/bg', '#E9F0ED', '#0D1919'],
  ['Warm dark label/teal', '#102020', '#73C2B6'],
  ['Crisp ink/paper', '#142424', '#F3F5F4'],
  ['Crisp white/teal', '#FFFFFF', '#0F5F58'],
  ['Crisp border/paper', '#5F716C', '#F3F5F4'],
];

let failed = 0;
for (const [name, fg, bg] of pairs) {
  const r = ratio(fg, bg);
  const need = name.includes('border') ? 3 : 4.5;
  const ok = r + 1e-9 >= need;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${r.toFixed(2)}:1 (need ≥ ${need})`);
}

if (failed) {
  console.error(`Contrast check failed: ${failed} pair(s)`);
  process.exit(1);
}
console.log('Contrast check passed for listed opaque pairs.');
