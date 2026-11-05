# Phase 102 — Authorized Version 2 publication and live verification

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [101 — Version 2 release candidate and operational preparation](101-version-2-release-candidate-and-operational-preparation.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- docs/release
- infra/deployment
- docs/phase-reports
- support operations

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Obtain explicit owner authorization for the prepared candidate and actual targets; perform only that approved publication/rollout.
2. Verify production-safe synthetic account/content/sync/upload/push/AI/support paths and monitor initial error/rollback signals.
3. Record web availability, actual Android track/review/approval states, artifact identifiers and operator decisions separately.

## Acceptance

- Authorized intended destinations serve the verified build and scoped smoke checks pass with working rollback/support paths.
- Store submission is not reported as approval; publication cannot waive feature or native iOS gates.
- If authorization/approval/provider/device prerequisites are missing, the phase remains blocked with a concrete next step.

## Verification and evidence

- Run approved live synthetic smoke checks and record destination/build/provider/physical notification results.
- Verify rollout/rollback, consent/feature switches and staffed incident/contact procedures.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/roadmap/v2/feature-coverage.md](../v2/feature-coverage.md)
- [docs/engineering/handoff.md](../../engineering/handoff.md)
- [docs/roadmap/v2/quality-and-release.md](../v2/quality-and-release.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`chore(launch): record the authorized Version 2 release`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
