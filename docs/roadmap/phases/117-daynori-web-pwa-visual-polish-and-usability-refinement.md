# Phase 117 — Daynori web/PWA visual polish and usability refinement

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [105 — Daynori web/PWA visual refinement and modern interface overhaul](105-daynori-web-pwa-visual-refinement-and-modern-interface-overhaul.md)
- [111 — Daynori web/PWA design verification and theme capture correction](111-daynori-web-pwa-design-verification-and-theme-capture-correction.md)
- [112 — Daynori core web/PWA browser release verification and staging isolation audit](112-daynori-core-web-pwa-browser-release-verification-and-staging-isolation-audit.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web
- packages/ui-web
- packages/design-tokens
- scripts
- tests
- docs/decisions
- docs/roadmap
- docs/phase-reports
- artifacts/phase117
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Execute scripts/capture-phase117-visual-evidence.mjs --before to capture 80 baseline screenshots across desktop (1280px) and mobile viewports (412px, 390px, 360px, 320px) in light and dark themes with verified distinct hashes.
2. Refine navigation surfaces: polish AppHeader quick actions, Create button elevation, search kbd shortcut badge, theme toggle, and AppSidebar active indicator pill and section headers.
3. Simplify Today view: eliminate repetitive nested card borders, streamline routine checklist and task rows, refine gentle progress bar, elevate reflection prompt card, and polish customize controls.
4. Refine Library view: streamline search and creation toolbar, polish folder tree rows and note items, and ensure high-contrast type badges and hover states.
5. Enhance Journal view: unify view mode segmented tabs (Day View, Timeline, Trash), streamline date stepper controls, and elevate reflection prompts with warm notebook styling.
6. Refine UI primitives: modernize EmptyState card styling, Dialog backdrop and header presentation, CreationMenu bottom sheet items, and Form inputs (TextField, TextArea, Checkbox) with verified :focus-visible rings.
7. Verify accessibility standards: maintain WCAG 2.2 AA contrast across light ("Warm Paper") and dark ("Deep Ink") themes, keyboard accessibility, screen reader live regions, and prefers-reduced-motion: reduce.
8. Execute scripts/capture-phase117-visual-evidence.mjs --after to capture 80 post-refinement screenshots with verified distinct hashes and zero horizontal overflow.
9. Verify main user journeys (Note creation/edit/save/reopen, Task create/toggle, Routine checkoff, Journal reflection, Theme switching, Search modal, and Create menu) with automated unit and e2e test suites.
10. Record qualitative human design review in artifacts/phase117/human-design-review.md, author visual verification report in artifacts/phase117/visual-verification-report.md, author ADR 0117, update phase report, progress.json, CHANGELOG.md, and rebuild blueprint.

## Acceptance

- scripts/capture-phase117-visual-evidence.mjs captures 80 baseline and 80 post-refinement screenshots across 5 viewports and 2 themes with 40/40 distinct light/dark pairs.
- Zero horizontal layout overflow across all viewports down to 320px mobile.
- Reduced boxiness and visual clutter verified across Today, Library, Journal, Settings, Create, Menus, and Empty states.
- WCAG 2.2 AA contrast verified (>= 4.5:1 text, >= 3:1 strong borders) in both light and dark themes.
- Accessible keyboard focus rings (:focus-visible) and touch targets (>= 44px web, >= 48px mobile) verified.
- Human design review recorded separately from automated checks in artifacts/phase117/human-design-review.md.
- Automated unit and integration test suites in tests/unit/phase117-web-pwa-visual-polish.test.ts and tests/e2e/phase117-visual-polish-and-journeys.test.ts pass cleanly.
- Standing release gates (DEF-V2-001, DEF-V2-004, DEF-V2-005, DEF-V2-007, DEF-V2-008, DEF-V2-011, DEF-V2-013, OWNER-SIGNING-KEYS, OWNER-RELEASE-AUTH, Phase 71) remain strictly blocked.
- docs/roadmap/plan.json, progress.json, and blueprint.html updated and pass all planning validators.

## Verification and evidence

- node scripts/validate-planning.mjs
- node scripts/build-phase-plans.mjs --check
- node scripts/build-blueprint.mjs --check
- pnpm validate:function-register
- pnpm vitest run tests/unit/phase117-web-pwa-visual-polish.test.ts tests/e2e/phase117-visual-polish-and-journeys.test.ts
- pnpm --filter @daynori/ui-web typecheck
- pnpm --filter @daynori/web typecheck
- pnpm lint

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/design/design-system.md](../../design/design-system.md)
- [docs/design/accessibility.md](../../design/accessibility.md)
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/decisions/0105-daynori-web-pwa-visual-refinement-and-modern-interface-overhaul.md](../../decisions/0105-daynori-web-pwa-visual-refinement-and-modern-interface-overhaul.md)
- [docs/decisions/0111-web-pwa-design-verification-and-theme-capture-correction.md](../../decisions/0111-web-pwa-design-verification-and-theme-capture-correction.md)
- [docs/decisions/0117-daynori-web-pwa-visual-polish-and-usability-refinement.md](../../decisions/0117-daynori-web-pwa-visual-polish-and-usability-refinement.md)
- [docs/phase-reports/phase-111.md](../../phase-reports/phase-111.md)
- [docs/phase-reports/phase-112.md](../../phase-reports/phase-112.md)
- [docs/phase-reports/phase-117.md](../../phase-reports/phase-117.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`refactor(web): refine web visual polish, calm excessive boxes, and improve usability`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
