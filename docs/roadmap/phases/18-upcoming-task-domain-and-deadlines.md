# Phase 18 — Upcoming task domain and deadlines

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [15 — Folder browsing and organization interfaces](15-folder-browsing-and-organization-interfaces.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain tasks
- apps/api tasks module
- packages/contracts

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement task title, optional details, priority, status, deadline semantics, completion, and folder links.
2. Separate date-only deadlines from timed due instants and define overdue boundaries in the user's zone.
3. Support subtasks and deterministic sorting; keep daily routines as a distinct domain.

## Acceptance

- Priority and deadline filters produce stable results.
- Completion records an instant and reopening retains task history.
- Timed and date-only deadlines behave correctly across time zones.

## Verification and evidence

- Test overdue transitions, leap days/DST, completion retries, priorities, and authorization.
- Test parent/subtask invariants and folder consistency.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/product/requirements.md](../../product/requirements.md)
- [docs/architecture/data-model.md](../../architecture/data-model.md)

## Commit target

`feat(tasks): add prioritized tasks and explicit deadline semantics`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
