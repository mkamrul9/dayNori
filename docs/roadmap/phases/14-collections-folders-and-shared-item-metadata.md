# Phase 14 — Collections folders and shared item metadata

Group: Foundation and sync. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [13 — Shared client synchronization engine](13-shared-client-synchronization-engine.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain organization
- apps/api organization module
- infra/supabase migrations

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement collection/folder creation, rename, move, order, archive, and item references within one workspace.
2. Reject cycles, unauthorized parents, invalid depth, and incompatible scopes transactionally.
3. Define move/delete semantics, Inbox defaults, tags, and item links without copying feature bodies.

## Acceptance

- User-created folders can organize notes, tasks, journals, files, and later compatible types.
- Cross-workspace references and folder cycles are rejected.
- Deleting a folder follows a visible documented preservation/trash policy.

## Verification and evidence

- Test deep trees, concurrent moves, revision conflicts, unauthorized parents, and trash behavior.
- Measure indexed folder listing with large synthetic trees.

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

`feat(organization): add workspace folders and common item metadata`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
