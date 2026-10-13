# Phase 13 — Shared client synchronization engine

Group: Foundation and sync. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [11 — Local data repositories and migrations](11-local-data-repositories-and-migrations.md)
- [12 — Server mutation receipts and change feed](12-server-mutation-receipts-and-change-feed.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/sync
- packages/api-client
- apps/web data
- apps/mobile data

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement local transactional enqueue, retry with backoff, mutation acknowledgments, paginated pulls, and cancellation.
2. Handle auth loss, app resume, reconnect, multiple browser tabs, and cursor reset without erasing drafts.
3. Display local save and cloud sync status separately; add a safe diagnostic summary.

## Acceptance

- Offline create/edit operations synchronize once after reconnect.
- A lost response, killed process, or second browser tab does not duplicate work.
- Conflict/error state is visible and unresolved content remains recoverable.

## Verification and evidence

- Run shared state-machine and adapter integration tests with network fault injection.
- Test airplane mode/restart/reconnect on Android and offline tabs in browser.

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

`feat(sync): synchronize offline mutations across web and mobile`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
