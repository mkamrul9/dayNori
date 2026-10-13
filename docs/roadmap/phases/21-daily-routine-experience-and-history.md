# Phase 21 — Daily routine experience and history

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [20 — Daily routine schedules and occurrences](20-daily-routine-schedules-and-occurrences.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web routines
- apps/mobile routines

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Build today's routine checklist, routine creation/editing, pause, skip, and history.
2. Offer gentle progress with no punitive streak dependency or forced notifications.
3. Show why a routine is due today and how changes affect future dates.

## Acceptance

- Users can complete daily work independently from upcoming tasks.
- Yesterday's completion remains visible while today starts a new occurrence.
- Paused routines and skipped days have clear understandable states.

## Verification and evidence

- Run multi-day/time-zone journeys with fake clocks and real local adapters.
- Review low-friction checklist use with screen readers and undo.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/design/journeys.md](../../design/journeys.md)
- [docs/product/requirements.md](../../product/requirements.md)

## Commit target

`feat(routines): add daily checklists and completion history`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
