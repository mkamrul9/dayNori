# Responsive and keyboard behavior notes

## Viewports to inspect

320 · 360 · 390 · 412 · 768 CSS px · desktop ≥1024. Both themes. Landscape: verify bottom nav + content; no global `overflow: hidden` on `body` (capture host may hide overflow temporarily inside the iframe only).

Capture helper: `node scripts/capture-phase67-prototype-shots.mjs` → `artifacts/local/phase67/` (gitignored). Uses `capture-host.html` iframe sizing so media queries match CSS widths.

## Mobile composition (≤768px)

- One compact top bar (search, create, all features, settings).
- Labeled bottom navigation for primary tabs (3 when Journal hidden).
- Create uses a sheet; Escape / backdrop / Close dismiss; focus returns to Create.
- Journal/Note editors are full-width content.
- Settings as stacked groups (subpages conceptual). **Production (Phase 70):** hub `/settings` plus `/settings/{account,appearance,notifications,workspace,privacy,help}` — see ADR 0070.
- Calendar agenda default on narrow; month option reachable. **Production:** same default; narrow hint + month→agenda affordance.

## Desktop composition (≥769px)

- Sidebar with primary tabs, pins (open destination), All features / Help / Settings.
- Bottom nav hidden; mobile-only header controls hidden.
- Verified in repair-pass screenshots (`warm-light-desktop-today.png`).

## Keyboard-open editor

Task editor → “Simulate keyboard-open” shows a **reduced viewport + simulated keyboard**. This is **design evidence**, not physical Android IME validation.

Expectations illustrated:

- Focused field remains visible.
- Save/retry remain reachable.
- Bottom nav coexistence considered via padding on content.

## Interaction repairs (2026-10-25)

| Issue | Fix |
| --- | --- |
| Create sheet Escape / focus return | Implemented in `js/app.js` |
| Pin navigated only to All features | Pins call `openFeature` |
| Hidden Journal still reachable | Redirect to All features + announcement |
| Search / Help empty query UX | Explicit no-results status |
| Drafts lost on save-fail / re-render | Persist title/body/email in state |
| Tour pause left Continue active | Continue disabled while paused; Exit resets |
| SVG icons unstyled → huge filled shapes | CSS stroke/size on tab/nav/btn SVGs |
| Capture skip-as-pass (no Playwright) | CDP required mode fails without browser; `--allow-skip` records skipped |

Smoke: `node scripts/phase67-prototype-smoke.mjs` (11 assertions).

## Safe areas

`padding-bottom: env(safe-area-inset-bottom)` on bottom nav.

## Native Android adaptations (DOM cannot prove)

Document for Phase 68/71:

- Hardware Back dismisses sheets then routes.
- `WindowInsets` / IME padding via native APIs.
- TalkBack roles for tabs and checkboxes.
- Do **not** replace native screens with WebView for the redesign.

## Desktop zoom / 200% text

Use browser zoom 200% on desktop width; prototype uses 16px root with wrapping clusters — primary actions remain reachable; review bar wraps first (expected chrome, not production shell).
