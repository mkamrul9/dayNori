# Phase 53 — Room chat and realtime events

Group: Rooms and chat. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [52 — Shared content sync and revocation](52-shared-content-sync-and-revocation.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api chat module
- apps/worker realtime
- apps/web chat
- apps/mobile chat

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement persisted room messages with pagination, client IDs, send retry, edits/deletes policy, and authorized realtime delivery.
2. Add unread counts, mute controls, privacy-safe notifications, connection status, and reconnect gap recovery.
3. Keep chat bounded with retention/rate/attachment limits and avoid realtime channels bypassing server authorization.

## Acceptance

- Messages are persisted before acknowledgment and appear once after retry/reconnect.
- Only current room members can subscribe or fetch history.
- Muted rooms and private lock-screen previews follow user preferences.

## Verification and evidence

- Test message retry/order, duplicate events, reconnect history gap, room removal, rate limits, and attachment permissions.
- Load-test room fan-out against a stated synthetic workload and review accessibility.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/api-conventions.md](../../architecture/api-conventions.md)
- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)

## Commit target

`feat(chat): add durable authorized room conversations`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
