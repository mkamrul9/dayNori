#!/usr/bin/env node
/**
 * Phase 67 — opaque sRGB contrast ratios for prototype direction pairs.
 * Scoped calculations only — not a WCAG conformance certificate.
 * Includes text, action, status, border, and focus-ring adjacent pairs.
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

/** [name, fg, bg, need] — need 4.5 text / 3 non-text UI */
const pairs = [
  ['Warm ink/paper', '#172C2C', '#F7F5EF', 4.5],
  ['Warm secondary/paper', '#526363', '#F7F5EF', 4.5],
  ['Warm muted/paper', '#5A6B6B', '#F7F5EF', 4.5],
  ['Warm white/teal', '#FFFFFF', '#146B63', 4.5],
  ['Warm ink/amber', '#172C2C', '#D9A441', 4.5],
  ['Warm teal-label/subtle', '#105650', '#E4EFEA', 4.5],
  ['Warm danger/danger-bg', '#B3261E', '#FDF2F2', 4.5],
  ['Warm success/success-bg', '#1B6A3F', '#F0FDF4', 4.5],
  ['Warm warning/warning-bg', '#8F4E00', '#FFFBEB', 4.5],
  ['Warm border/paper', '#758680', '#F7F5EF', 3],
  ['Warm focus/paper', '#146B63', '#F7F5EF', 3],
  ['Warm ink/surface', '#172C2C', '#FFFFFF', 4.5],
  ['Warm dark text/bg', '#E9F0ED', '#0D1919', 4.5],
  ['Warm dark secondary/bg', '#AEC0BB', '#0D1919', 4.5],
  ['Warm dark label/teal', '#102020', '#73C2B6', 4.5],
  ['Warm dark danger/danger-bg', '#F2B8B5', '#381615', 4.5],
  ['Crisp ink/paper', '#142424', '#F3F5F4', 4.5],
  ['Crisp white/teal', '#FFFFFF', '#0F5F58', 4.5],
  ['Crisp border/paper', '#5F716C', '#F3F5F4', 3],
  ['Crisp focus/paper', '#0F5F58', '#F3F5F4', 3],
  ['Crisp dark text/bg', '#E6EEEB', '#0A1414', 4.5],
  ['Crisp dark label/teal', '#0A1616', '#6BB8AC', 4.5],
];

let failed = 0;
for (const [name, fg, bg, need] of pairs) {
  const r = ratio(fg, bg);
  const ok = r + 1e-9 >= need;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${r.toFixed(2)}:1 (need ≥ ${need})`);
}

if (failed) {
  console.error(`Contrast check failed: ${failed} pair(s)`);
  process.exit(1);
}
console.log(`Contrast check passed for ${pairs.length} listed opaque pairs.`);
