# Phase 27 — Reminder scheduling and durable delivery jobs

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [20 — Daily routine schedules and occurrences](20-daily-routine-schedules-and-occurrences.md)
- [26 — Calendar and deadline views](26-calendar-and-deadline-views.md)
- [12 — Server mutation receipts and change feed](12-server-mutation-receipts-and-change-feed.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api reminders module
- apps/worker reminders
- packages/domain reminders

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement reminder preferences, schedule versioning, recurrence instances, snooze, quiet hours, and cancellation.
2. Use transactional outbox and durable leased jobs with retry/deduplication; separate device schedules from server delivery.
3. Invalidate old schedules when tasks complete or dates/zones change and record operational delivery status without sensitive bodies.

## Acceptance

- Completing/rescheduling a task invalidates its stale pending reminder.
- Retrying a delivery job does not create duplicate reminder instances.
- Reminder status distinguishes scheduled/provider-accepted from observed/user-opened and never guarantees receipt.

## Verification and evidence

- Test leased-job crash recovery, duplicate deliveries, snooze, quiet hours, DST, and schedule edits.
- Verify redacted payloads and unauthorized reminder targets.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/integrations-and-reminders.md](../../architecture/integrations-and-reminders.md)
- [docs/architecture/data-model.md](../../architecture/data-model.md)

## Commit target

`feat(reminders): add durable scheduling and delivery state`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
