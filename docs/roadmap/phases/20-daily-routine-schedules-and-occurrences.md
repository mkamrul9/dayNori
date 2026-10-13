# Phase 20 — Daily routine schedules and occurrences

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [18 — Upcoming task domain and deadlines](18-upcoming-task-domain-and-deadlines.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain routines
- apps/api routines module
- infra/supabase migrations

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement daily/selected-weekday routine templates with active periods and an explicit scheduling time zone.
2. Create date-scoped occurrence identities with completion/skipped state and idempotent generation.
3. Define schedule edits, travel/time zone changes, history retention, and missed-day behavior without resetting prior records.

## Acceptance

- Completing today's routine never completes tomorrow's occurrence.
- Repeated generation cannot duplicate one scheduled occurrence.
- Editing a template preserves completed history and applies the documented future rule.

## Verification and evidence

- Test midnight, DST/travel, schedule edits, concurrent completion, and occurrence uniqueness.
- Validate behavior when a device stays offline for several days.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/data-model.md](../../architecture/data-model.md)
- [docs/product/requirements.md](../../product/requirements.md)

## Commit target

`feat(routines): add date-scoped daily routine occurrences`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
