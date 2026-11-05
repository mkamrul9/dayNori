# Phase 66 — Simple navigation personalization and developer boundaries

Group: V2 readiness and design. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [65 — Version 2 function inventory and readiness baseline](65-version-2-function-inventory-and-readiness-baseline.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain
- packages/contracts
- apps/api
- apps/web/src/components
- apps/mobile/src/navigation
- docs/design

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Define and implement a validated shared feature registry separating release capability, current authorization and personal visibility.
2. Specify stable primary destinations, searchable All features, pins and hide/restore behavior; migrate existing preferences without losing layouts or content.
3. Separate ordinary preferences from restricted developer tools; server-authorize privileged routes and remove harness/gallery/seed controls from everyday navigation.

## Acceptance

- Users can reach every enabled feature within two navigation actions and restore hidden modules without data loss.
- Settings, Help, account, Search and All features remain reachable; hiding a module cannot grant access or silently cancel reminders.
- Direct URL/API attempts cannot access developer functions or enable provisional features without authority.

## Verification and evidence

- Test preference migration, invalid registry input, stale revisions, hidden/disabled/unauthorized combinations and account switch.
- Run relevant contracts/domain/API tests and keyboard/native navigation checks using the registry.

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
- [docs/design/information-architecture.md](../../design/information-architecture.md)

## Commit target

`feat(navigation): separate feature visibility and developer access`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
