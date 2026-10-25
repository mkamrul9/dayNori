# Responsive and keyboard behavior notes

## Viewports to inspect

320 · 360 · 390 · 412 · 768 CSS px · desktop ≥1024. Both themes. Landscape: verify bottom nav + content; no global `overflow: hidden` on `body`.

Capture helper: `node scripts/capture-phase67-prototype-shots.mjs` → `artifacts/local/phase67/` (gitignored).

## Mobile composition

- One compact top bar (search, create, all features, settings).
- Labeled bottom navigation for primary tabs (3 when Journal hidden).
- Create uses a sheet; Journal/Note editors are full-width content.
- Settings as stacked groups (subpages conceptual).
- Calendar agenda default on narrow; month option reachable.

## Keyboard-open editor

Task editor → “Simulate keyboard-open” shows a **reduced viewport + simulated keyboard**. This is **design evidence**, not physical Android IME validation.

Expectations illustrated:

- Focused field remains visible.
- Save/retry remain reachable.
- Bottom nav coexistence considered via padding on content.

## Safe areas

`padding-bottom: env(safe-area-inset-bottom)` on bottom nav.

## Native Android adaptations (DOM cannot prove)

Document for Phase 68/71:

- Hardware Back dismisses sheets then routes.
- `WindowInsets` / IME padding via native APIs.
- TalkBack roles for tabs and checkboxes.
- Do **not** replace native screens with WebView for the redesign.

## Desktop zoom / 200% text

Use browser zoom 200% on desktop width; prototype uses relative `rem`-like spacing via px on a 16px root — reflow checked manually; clipping must not hide primary actions.
