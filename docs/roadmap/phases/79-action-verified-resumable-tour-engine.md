# Phase 79 — Action-verified resumable tour engine

Group: V2 learning and support. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [66 — Simple navigation personalization and developer boundaries](66-simple-navigation-personalization-and-developer-boundaries.md)
- [68 — Design tokens components icons and motion](68-design-tokens-components-icons-and-motion.md)
- [77 — Safe offline reopen sync and upgrade recovery](77-safe-offline-reopen-sync-and-upgrade-recovery.md)
- [78 — Complete contextual Help and user instructions](78-complete-contextual-help-and-user-instructions.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain
- packages/contracts
- apps/web/src/components
- apps/mobile/src/views
- apps/api

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Evolve existing onboarding into a versioned chapter/step state machine with semantic targets, event correlation and persisted completion predicates.
2. Implement interactive web/native coachmarks, route/target readiness, focus/keyboard adapters, pause/skip/back/resume and safe unavailable recovery.
3. Migrate V1 progress and practice IDs; preserve preferences and prevent duplicate or destructive replay.

## Acceptance

- Only the matching verified action/result completes an action step; Next/old/unrelated events cannot fake success.
- Restart/account switch/offline/permission denial preserve correct progress and drafts with no cross-account leakage.
- Tour controls remain accessible and the actual highlighted control/picker can be operated on each platform.

## Verification and evidence

- Test stale events, retries, remount, route changes, interrupted receipts, concurrent progress and V1 migration.
- Run real-control web/native proof chapters plus keyboard/screen-reader and phone-keyboard overlay review.

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
- [docs/roadmap/v2/guided-tours.md](../v2/guided-tours.md)
- [docs/phase-reports/phase-31.md](../../phase-reports/phase-31.md)

## Commit target

`feat(tours): add action-verified resumable guidance`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
