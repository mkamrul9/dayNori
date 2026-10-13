# Phase 60 — Public Android and web release

Group: Business and public launch. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [59 — Google Play and web launch preparation](59-google-play-and-web-launch-preparation.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- release tags
- infra/deployment
- docs/phase-reports
- support operations

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Use the owner's authorized production/store targets; submit/release the tested signed artifact and matching web version with staged rollout.
2. Verify deployed account lifecycle, purchases, uploads, sync, notifications, moderation/AI where enabled, and monitoring.
3. Record artifact versions, rollback/rollout decisions, support ownership, and store approval outcome without treating submission as approval.

## Acceptance

- The approved public build and web release are live at the intended destinations.
- Core and enabled-module smoke checks pass and a rollback path is ready.
- If store review/deployment prerequisites remain unresolved, the phase remains pending rather than complete.

## Verification and evidence

- Run production-safe synthetic smoke checks and inspect rollout/crash/error signals.
- Record release URLs, store status, build identifiers, and operator confirmation.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/engineering/release-gates.md](../../engineering/release-gates.md)
- [docs/architecture/operations-and-scaling.md](../../architecture/operations-and-scaling.md)

## Commit target

`chore(launch): record the verified Android and web release`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
