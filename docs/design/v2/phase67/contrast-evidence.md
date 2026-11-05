# Contrast evidence (Phase 67 prototypes)

Methodology: WCAG 2.2 relative-luminance contrast for **opaque** pairs (same approach as `packages/design-tokens` / design-system.md). These are calculations for proposed prototype CSS variables — **not** a full accessibility conformance claim. Opacity/composited surfaces, focus rings on busy backgrounds, and disabled states need Phase 68 component audits.

Access / calc date: 2026-10-25 (repair pass). Script: `node scripts/phase67-contrast-check.mjs` (22 pairs).

## Repair note

Earlier package listed ten pairs and treated muted text as untested. Repair pass found Warm muted `#697A7A` on paper at **4.13:1** (below 4.5). Prototype CSS now uses `#5A6B6B` (**5.14:1**). Do not treat the original ten-pair list as complete verification.

## Warm notebook — light (selected samples)

| Pair | Ratio | Criterion |
| --- | --- | --- |
| Ink `#172C2C` on paper `#F7F5EF` | 13.44:1 | Text AA 4.5:1 |
| Secondary `#526363` on paper | 5.80:1 | Text AA |
| Muted `#5A6B6B` on paper | 5.14:1 | Text AA |
| White on teal `#146B63` | 6.34:1 | Text on action |
| Ink on amber `#D9A441` | 6.52:1 | Accent label |
| Teal-subtle text on subtle | 7.22:1 | Status chip |
| Danger / danger-bg | 5.96:1 | Error text |
| Success / success-bg | 6.31:1 | Status |
| Warning / warning-bg | 6.22:1 | Status |
| Border `#758680` on paper | 3.52:1 | Non-text UI ≥3:1 |
| Focus `#146B63` on paper | 5.81:1 | Non-text UI |

## Warm notebook — dark

| Pair | Ratio | Criterion |
| --- | --- | --- |
| Pale `#E9F0ED` on `#0D1919` | 15.51:1 | Text AA |
| Secondary on bg | 9.45:1 | Text AA |
| Soft teal label `#102020` on `#73C2B6` | 8.10:1 | Action label |
| Danger on danger-bg | 9.51:1 | Error |

## Crisp utility — light / dark

| Pair | Ratio | Criterion |
| --- | --- | --- |
| Ink on `#F3F5F4` | 14.67:1 | Text AA |
| White on `#0F5F58` | 7.51:1 | Action |
| Border on paper | 4.72:1 | Non-text UI |
| Focus on paper | 6.85:1 | Non-text UI |
| Dark text on `#0A1414` | 15.84:1 | Text AA |
| Dark label on teal | 7.97:1 | Action label |

## Out of scope for this calc

- Focus indicator on photographic/composited chrome (none in prototype)
- Disabled control opacity stacks
- Placeholder text ratios (browser-dependent)
- Physical display calibration
