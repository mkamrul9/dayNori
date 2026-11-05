# Phase 67 — Original visual direction and responsive journey prototypes

**Status:** **Complete** — owner selected **Warm notebook** (2026-10-25). Five-participant sessions deferred to Phase 99 (did not occur).

## Open instructions

1. Open [`index.html`](index.html) or [`prototype.html`](prototype.html) in Chrome, Edge, or Firefox.
2. Optional local server (avoids some `file://` iframe limits) — prefer a local static server you already trust; do not rely on unpinned downloads for evidence:

```powershell
cd "D:\SWE\UNIQUE WORK\dailyLIfe"
node -e "require('http').createServer((q,s)=>{const p=require('path');const f=require('fs');const u=q.url==='/'?'/index.html':q.url;const file=p.join('docs/design/v2/phase67',u);f.readFile(file,(e,d)=>{if(e){s.writeHead(404);s.end();return;}s.end(d);});}).listen(8767,'127.0.0.1')"
```

Then visit `http://127.0.0.1:8767/` and `http://127.0.0.1:8767/prototype.html`.

3. Capture + smoke (writes under gitignored `artifacts/local/phase67/`; requires local Chrome/Edge):

```powershell
node scripts/capture-phase67-prototype-shots.mjs
node scripts/phase67-prototype-smoke.mjs
node scripts/phase67-contrast-check.mjs
```

Required capture mode exits **1** if the browser is missing. Optional: `--allow-skip` records `skipped` + unmet evidence (never a silent pass).

## What this is

Isolated HTML/CSS/JS prototypes illustrating two Daynori-original directions, full core journeys, and states. **Not** production application code. Phase 66 navigation/authorization behavior is preserved in the product; this package designs presentation only.

## Documents

| File | Purpose |
| --- | --- |
| [reference-board.md](reference-board.md) | Dated official product references |
| [comparison.md](comparison.md) | Warm notebook vs crisp utility |
| [recommendation.md](recommendation.md) | Provisional recommendation until owner chooses |
| [journey-state-matrix.md](journey-state-matrix.md) | Journeys × states |
| [responsive-notes.md](responsive-notes.md) | Breakpoints, keyboard, native notes |
| [token-inventory.md](token-inventory.md) | Proposed token/component list for Phase 68 |
| [provenance.md](provenance.md) | Fonts/assets licenses |
| [contrast-evidence.md](contrast-evidence.md) | Contrast methodology and ratios |
| [review-package.md](review-package.md) | Owner/participant review kit (decision pending) |
| [phase68-handoff.md](phase68-handoff.md) | Implementation checklist |
| [evidence/manifest.md](evidence/manifest.md) | Capture inventory |

## Selection status

**Warm notebook** — owner-selected 2026-10-25. Participant sessions deferred to Phase 99. See [recommendation.md](recommendation.md) and [review-package.md](review-package.md).
