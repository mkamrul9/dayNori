# Phase 58 — Reliability scale and operating cost gate

Group: Business and public launch. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [37 — Core quality and usability release gate](37-core-quality-and-usability-release-gate.md)
- [57 — Entitlements subscriptions and purchase lifecycle](57-entitlements-subscriptions-and-purchase-lifecycle.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- infra/deployment
- apps/api
- apps/worker
- tests/performance
- docs/engineering

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Measure agreed beta-derived load, database plans, storage/egress, sync lag, queues, push/realtime usage, and AI cost if enabled.
2. Add autoscaling/pooling/index improvements only where evidence requires and protect per-tenant quotas.
3. Exercise job failure, provider outage, rolling upgrade, migration, restore, and rollback; define alert/runbook owners and feature kill switches.

## Acceptance

- Performance targets and cost assumptions have measured evidence at a stated workload.
- Failures degrade individual capabilities without corrupting core data.
- RPO/RTO and restore coverage have been demonstrated rather than merely written.

## Verification and evidence

- Run load/soak and fault-injection tests plus backup/restore/rollback drills.
- Verify quotas/alerts against controlled synthetic incidents and inspect billing exposure.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/operations-and-scaling.md](../../architecture/operations-and-scaling.md)
- [docs/engineering/quality.md](../../engineering/quality.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`perf(platform): validate reliability capacity and operating costs`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
