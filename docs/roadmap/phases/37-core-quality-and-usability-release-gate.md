# Phase 37 — Core quality and usability release gate

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [31 — First-use tutorial and progressive discovery](31-first-use-tutorial-and-progressive-discovery.md)
- [33 — Global authorized search and filters](33-global-authorized-search-and-filters.md)
- [34 — Conflict recovery and offline hardening](34-conflict-recovery-and-offline-hardening.md)
- [35 — Portable export and controlled import](35-portable-export-and-controlled-import.md)
- [36 — Account deletion backup and recovery lifecycle](36-account-deletion-backup-and-recovery-lifecycle.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- tests/e2e
- tests/security
- tests/performance
- apps/web
- apps/mobile

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Exercise complete personal organizer journeys across browser and physical Android devices using realistic synthetic data.
2. Audit accessibility, localization readiness, permission boundaries, file safety, migration behavior, and recovery.
3. Measure performance and run a small usability study; fix gate failures within this bounded phase or split concrete defect phases before release.

## Acceptance

- Core acceptance scenarios and cross-tenant negative tests pass with recorded evidence.
- No unresolved critical/high security or data-loss defects remain.
- Documented performance targets are measured and accessibility review has no blocking failures.

## Verification and evidence

- Run the full core scenario suite, migration/restore tests, security review, and documented load/device checks.
- Record pilot usability observations and resolved defects without inventing satisfaction metrics.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/engineering/quality.md](../../engineering/quality.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)
- [docs/design/journeys.md](../../design/journeys.md)

## Commit target

`test(core): verify organizer quality and release readiness`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
