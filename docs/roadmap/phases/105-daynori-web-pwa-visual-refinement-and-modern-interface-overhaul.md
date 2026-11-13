# Phase 105 — Daynori web/PWA visual refinement and modern interface overhaul

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [104 — Current Daynori web/PWA readiness audit and critical core fixes](104-current-daynori-web-pwa-readiness-audit-and-critical-core-fixes.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web
- packages/ui-web
- packages/design-tokens
- tests/e2e
- tests/unit
- artifacts/phase105
- docs/roadmap
- docs/phase-reports

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Capture fresh current-build screenshots of Today, Plan, Library, Journal, Create, menus, Settings, and Ask Nori at desktop and 320-412px mobile widths in light and dark themes.
2. Make interface calmer and more modern: reduce repeated large card borders, simplify first viewport, establish clearer type and spacing hierarchy, and remove redundant actions.
3. Redesign navigation, header, sidebar, and mobile bottom nav so common tasks are obvious while preserving Daynori warm notebook identity, vector icons, and no-emoji chrome.
4. Improve dark surfaces, selected states, contrast, focus rings, empty/error/offline states, and 200% text scaling resilience with before/after visual evidence.

## Acceptance

- Before and after screenshots captured across desktop and 320-412px mobile viewports in light and dark themes.
- Card borders reduced and simplified across Today, Plan, Library, Journal, Settings, and Create modal.
- Header quick actions, sidebar navigation, and mobile bottom nav redesigned without repeated border boxes and with clear touch targets (>= 44px).
- WCAG AA contrast maintained across light and dark themes, focus-visible rings verified, and 200% text scaling verified without horizontal overflow.
- Zero app-authored emoji introduced into application chrome.

## Verification and evidence

- pnpm vitest run tests/unit/phase105-visual-tokens-and-a11y.test.ts tests/e2e/phase105-v2-web-visual-refinement.test.ts
- pnpm typecheck
- pnpm lint
- node scripts/validate-planning.mjs

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/design/design-system.md](../../design/design-system.md)
- [docs/design/accessibility.md](../../design/accessibility.md)
- [docs/design/information-architecture.md](../../design/information-architecture.md)
- [docs/engineering/handoff.md](../../engineering/handoff.md)
- [docs/decisions/0105-daynori-web-pwa-visual-refinement-and-modern-interface-overhaul.md](../../decisions/0105-daynori-web-pwa-visual-refinement-and-modern-interface-overhaul.md)
- [docs/phase-reports/phase-104.md](../../phase-reports/phase-104.md)

## Commit target

`refactor(web): refine visual hierarchy, calm card borders, and modernize navigation`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
