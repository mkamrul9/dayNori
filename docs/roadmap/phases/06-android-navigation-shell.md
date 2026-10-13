# Phase 06 — Android navigation shell

Group: Foundation and sync. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [04 — Design tokens and accessible primitives](04-design-tokens-and-accessible-primitives.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/mobile
- packages/ui-mobile

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement tab/stack navigation, headers, safe areas, and capture entry points using native patterns.
2. Add route contracts for notifications, files, and authentication links.
3. Handle Android back navigation, keyboard avoidance, app resume, and reduced motion.

## Acceptance

- A physical Android device can navigate every shell destination.
- Small displays, system font scaling, and keyboard opening do not hide primary controls.
- Deep links validate identifiers before routing and require appropriate authentication.

## Verification and evidence

- Run Android development-build smoke journeys and navigation tests.
- Inspect portrait/landscape and TalkBack behavior on supported screen sizes.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/design/information-architecture.md](../../design/information-architecture.md)
- [docs/engineering/quality.md](../../engineering/quality.md)

## Commit target

`feat(mobile): add accessible Android organizer navigation`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
