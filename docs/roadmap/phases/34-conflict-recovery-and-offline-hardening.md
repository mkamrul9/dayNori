# Phase 34 — Conflict recovery and offline hardening

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [33 — Global authorized search and filters](33-global-authorized-search-and-filters.md)
- [13 — Shared client synchronization engine](13-shared-client-synchronization-engine.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/sync
- apps/web recovery
- apps/mobile recovery
- tests/integration

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Add side-by-side conflict review with keep-both/choose-version behavior for text and explicit policies for structured fields.
2. Harden deleted-parent references, account switching, cursor reset, storage eviction, and partial attachment transfer.
3. Add local recovery export and a redacted sync diagnostic view without sending content automatically.

## Acceptance

- Concurrent editing never silently destroys either text version.
- A reconnect after long offline use preserves queued mutations or gives a recoverable explanation.
- Users can distinguish storage failure, conflict, and network delay.

## Verification and evidence

- Run multi-device concurrent-edit/delete, crash/restart, cursor compaction, and quota/eviction fault tests.
- Inspect recovery usability with realistic lost-network scenarios.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/sync-and-offline.md](../../architecture/sync-and-offline.md)
- [docs/engineering/quality.md](../../engineering/quality.md)

## Commit target

`fix(sync): preserve edits through conflicts and offline failures`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
