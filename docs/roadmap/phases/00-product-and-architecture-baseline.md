# Phase 00 — Product and architecture baseline

Group: Planning. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- No prior phase.

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- docs
- reserved repository directories
- root contributor files

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Capture every requested capability and distinguish initial, later, and gated scope.
2. Document architecture, UX, data ownership, security, offline sync, and platform limits.
3. Create the repository map, 64 phase plans, phase evidence template, progress register, and documentation validator.

## Acceptance

- All requested capabilities map to a phase and release gate.
- A successor can select Phase 01 without needing chat history.
- No skeleton directory is represented as implemented functionality.

## Verification and evidence

- Run node scripts/validate-planning.mjs and inspect all failures.
- Review naming clearance limitations, scope boundaries, source citations, and Git diff.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/product/requirements.md](../../product/requirements.md)
- [docs/architecture/system-overview.md](../../architecture/system-overview.md)
- [docs/engineering/handoff.md](../../engineering/handoff.md)

## Commit target

`docs(planning): establish product architecture and phased roadmap`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
