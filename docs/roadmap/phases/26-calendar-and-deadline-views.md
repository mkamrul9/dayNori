# Phase 26 — Calendar and deadline views

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [19 — Upcoming task lists and detail views](19-upcoming-task-lists-and-detail-views.md)
- [21 — Daily routine experience and history](21-daily-routine-experience-and-history.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain calendar
- packages/contracts calendar
- apps/api calendar module
- infra/supabase migrations
- apps/web calendar
- apps/mobile calendar

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Build a read model for upcoming task deadlines and scheduled routine occurrences without duplicating task records.
2. Implement agenda/day/month views, date navigation, zone/week-start preferences, and accessible list alternatives.
3. Add personal calendar events with separate date-only/timed semantics: all-day intervals use exclusive end dates and timed end must follow start. Keep external calendar integration outside this phase.
4. Implement authorized event create/read/update/trash, local adapter persistence, sync projections, and migrations. Add optional journal-date indicators without entry body exposure.

## Acceptance

- Upcoming tasks appear on their due date and link back to the source task.
- Changing a deadline updates all views through one domain record.
- Users can read calendar content without interpreting a visual grid.

## Verification and evidence

- Test DST/month boundaries, date-only deadlines, long-range pagination, and duplicate source prevention.
- Run web/Android agenda and month navigation journeys.
- Test event CRUD and offline/reconnect round trips, interval validation, cross-tenant access, journal indicator privacy, and calendar schema upgrade fixtures.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/data-model.md](../../architecture/data-model.md)
- [docs/design/information-architecture.md](../../design/information-architecture.md)

## Commit target

`feat(calendar): add linked deadlines routines and personal events`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
