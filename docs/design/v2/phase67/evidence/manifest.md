# Phase 67 capture evidence manifest (pointer)

Authoritative machine-readable capture results live under gitignored:

`artifacts/local/phase67/capture-manifest.json`

Smoke results: `artifacts/local/phase67/smoke-results.json`

## How to regenerate

```powershell
# Required mode — exits 1 if Chrome/Edge missing or captures fail
node scripts/capture-phase67-prototype-shots.mjs

# Optional skip (records status skipped + unmetEvidence; never "pass")
node scripts/capture-phase67-prototype-shots.mjs --allow-skip

node scripts/phase67-prototype-smoke.mjs
node scripts/phase67-contrast-check.mjs
```

Uses local Chrome/Edge CDP + `capture-host.html` iframe sizing (not Playwright; not unpinned npx).

## Sampling (2026-10-25 repair pass)

- Today × Warm/Crisp × light/dark × 320/360/390/412/768/desktop
- Journey screens (welcome, today, task-editor, library, journal-write, settings, help, features, assistant) × both directions × both themes × 360 + desktop
- Total: 96 PNGs when capture succeeds
- Manifest fields: timestamp, git revision, dirty tree, direction, theme, screen, viewport (+ measuredClientWidth), browser, overflow, limitations

## Status semantics

| Manifest `status` | Meaning |
| --- | --- |
| `pass_capture_only` | Files written; **manual visual inspection still required** |
| `fail` | Capture/prerequisite failure |
| `skipped` | Only with `--allow-skip`; `unmetEvidence: true` |

Screenshot creation alone is **not** a visual pass.

## Manual inspection (agent, 2026-10-25)

| Observation | Result |
| --- | --- |
| Unstyled SVG icons rendered as huge filled silhouettes | **Fixed** — stroke size/fill rules on `.tab`/`.nav-item`/`.btn` SVGs |
| Warm muted `#697a7a` on paper 4.13:1 | **Fixed** — muted → `#5a6b6b` (5.14:1) |
| Desktop layout showed mobile chrome when metrics lied | **Fixed** — iframe host; desktop shows sidebar |
| Horizontal overflow at required widths | **0** overflow findings on successful re-capture |
| Create Escape / Journal hide→3 tabs / drafts / search empty / tour / assistant cancel | **Smoke PASS** (11 assertions) |

Physical Android IME/TalkBack: **not** claimed.
