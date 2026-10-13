# Phase 52 — Shared content sync and revocation

Group: Rooms and chat. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [51 — Shared rooms invitations and roles](51-shared-rooms-invitations-and-roles.md)
- [34 — Conflict recovery and offline hardening](34-conflict-recovery-and-offline-hardening.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/sync membership
- apps/api shared changes
- apps/web room content
- apps/mobile room content

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Enable approved shared note/task/file types with room-scoped synchronization and role-aware editing.
2. Revalidate membership for every pull/push/download and remove local readable room caches after observed revocation.
3. Define honest offline revocation limits, concurrent edits, room deletion, and signed URL expiration.

## Acceptance

- A removed member cannot obtain new changes or fresh read links.
- Clients purge shared caches when revocation becomes known; existing offline copies are disclosed as a limit.
- Concurrent shared edits preserve conflict versions without claiming live collaborative text editing.

## Verification and evidence

- Test role downgrade during queued writes, offline removal, stale tokens, signed-link expiry, and room delete.
- Run simultaneous two-user note/task/file journeys with network faults.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/sync-and-offline.md](../../architecture/sync-and-offline.md)
- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)

## Commit target

`feat(rooms): synchronize shared content and enforce membership changes`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
