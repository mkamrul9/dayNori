# Phase 19 — Upcoming task lists and detail views

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [18 — Upcoming task domain and deadlines](18-upcoming-task-domain-and-deadlines.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web tasks
- apps/mobile tasks

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Build upcoming, overdue, and completed views with priority indicators, sort/filter controls, and task details.
2. Add quick task capture, subtasks, deadline editing, accessible completion, and undo.
3. Keep daily routine navigation separate and avoid filling the initial view with advanced filters.

## Acceptance

- A task can be created, prioritized, scheduled, completed, reopened, and moved to a folder.
- Overdue state is explained using text and dates rather than color alone.
- Bulk actions are confirmable and cannot silently affect hidden selections.

## Verification and evidence

- Run end-to-end task journeys on web and Android with offline operation.
- Review keyboard, TalkBack, large text, and date-picker behavior.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/design/information-architecture.md](../../design/information-architecture.md)
- [docs/design/journeys.md](../../design/journeys.md)

## Commit target

`feat(tasks): add upcoming task workflows and priority views`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
