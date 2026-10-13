# Phase 12 — Server mutation receipts and change feed

Group: Foundation and sync. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [08 — API contracts and service foundation](08-api-contracts-and-service-foundation.md)
- [10 — Personal workspace and preferences](10-personal-workspace-and-preferences.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api sync module
- packages/contracts
- infra/supabase migrations

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement idempotent mutation IDs, optimistic revisions, transactional receipt/outbox persistence, and tenant-scoped changes.
2. Design commit-safe feed cursor ordering that cannot skip later-committing transactions; document compaction and reset semantics.
3. Add tombstones, snapshot bootstrap, bounded pagination, and conflict responses with preserved server versions.

## Acceptance

- Retrying a mutation returns its existing result without double creation.
- Clients never acknowledge a cursor that can skip a committed change.
- Expired cursors trigger a safe snapshot reset while keeping unsent local mutations.

## Verification and evidence

- Test duplicate/concurrent requests, rollback, commit order races, pagination, and cursor expiration.
- Run authorization tests for receipts, snapshots, and tombstones.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/sync-and-offline.md](../../architecture/sync-and-offline.md)
- [docs/architecture/api-conventions.md](../../architecture/api-conventions.md)

## Commit target

`feat(sync): add durable mutation receipts and ordered changes`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
