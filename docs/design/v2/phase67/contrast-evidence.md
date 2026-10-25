# Contrast evidence (Phase 67 prototypes)

Methodology: WCAG 2.2 relative-luminance contrast for **opaque** pairs (same approach as `packages/design-tokens` / design-system.md). These are calculations for proposed prototype CSS variables — **not** a full accessibility conformance claim. Composed opacity, focus rings on busy backgrounds, and disabled states need Phase 68 component audits.

Access / calc date: 2026-10-25. Script: `node scripts/phase67-contrast-check.mjs`.

## Warm notebook — light

| Pair | Ratio | Criterion |
| --- | --- | --- |
| Ink `#172C2C` on paper `#F7F5EF` | ≥13:1 | Text AA 4.5:1 |
| Secondary `#526363` on paper | ≥5.5:1 | Text AA |
| White on teal `#146B63` | ≥6:1 | Text on action |
| Ink on amber `#D9A441` | ≥6:1 | Accent label |
| Strong border `#758680` on paper | ≥3:1 | Non-text UI |

## Warm notebook — dark

| Pair | Ratio | Criterion |
| --- | --- | --- |
| Pale `#E9F0ED` on `#0D1919` | ≥14:1 | Text AA |
| Soft teal `#73C2B6` label `#102020` | ≥8:1 | Action label |

## Crisp utility — light

| Pair | Ratio | Criterion |
| --- | --- | --- |
| Ink `#142424` on `#F3F5F4` | ≥13:1 | Text AA |
| White on `#0F5F58` | ≥6:1 | Action |
| Border `#5F716C` on `#F3F5F4` | ≥3:1 | Non-text UI |

Exact computed values are emitted by the contrast script into the console and summarized in the phase report after the script runs.
