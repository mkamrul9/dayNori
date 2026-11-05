# Phase 71 — Native Android interface and navigation parity

Group: V2 everyday experience. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [66 — Simple navigation personalization and developer boundaries](66-simple-navigation-personalization-and-developer-boundaries.md)
- [68 — Design tokens components icons and motion](68-design-tokens-components-icons-and-motion.md)
- [70 — Mobile web and PWA layout redesign](70-mobile-web-and-pwa-layout-redesign.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/mobile
- packages/ui-mobile

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Adapt the selected design to native navigation, full-screen editors, grouped Settings, sheets, hardware Back and keyboard avoidance.
2. Apply feature registry/personalization and remove ordinary-user harness/gallery surfaces while retaining authorized developer access.
3. Preserve local repositories, capture, sync and deep links; document differences from browser/PWA and separately gated native iOS.

## Acceptance

- Core native routes and all existing enabled feature entry points remain reachable with platform-appropriate interactions.
- Large text, TalkBack, keyboard, safe areas and hardware Back do not lose drafts or cover actions.
- No web wrapper or duplicated domain implementation substitutes for native adaptation.

## Verification and evidence

- Run affected native tests/typecheck/build and Android e2e scripts.
- Record actual Android device/TalkBack runs; retain incomplete status if required hardware evidence is missing.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/roadmap/v2/feature-coverage.md](../v2/feature-coverage.md)
- [docs/engineering/handoff.md](../../engineering/handoff.md)
- [docs/roadmap/v2/design-and-mobile.md](../v2/design-and-mobile.md)
- [docs/engineering/ios-support-matrix.md](../../engineering/ios-support-matrix.md)

## Commit target

`feat(mobile): adapt the Version 2 experience to native Android`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
