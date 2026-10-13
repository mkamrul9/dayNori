# Phase 62 — iOS store release gate

Group: iOS. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [61 — iOS platform parity and native adaptation](61-ios-platform-parity-and-native-adaptation.md)
- [58 — Reliability scale and operating cost gate](58-reliability-scale-and-operating-cost-gate.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/mobile ios metadata
- release tags
- docs/phase-reports

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Prepare TestFlight coverage, privacy declarations, purchase products, signing, screenshots, deletion/support links, and current review checklist.
2. Resolve iOS-specific security/usability findings before submitting the exact tested artifact.
3. With owner-authorized release targets, submit and stage rollout; record review outcome and monitoring/rollback plans.

## Acceptance

- TestFlight evidence covers supported devices and enabled feature scope.
- Store approval/live availability is recorded separately from submission.
- No incomplete platform feature is advertised as supported.

## Verification and evidence

- Run iOS release-build smoke/upgrade/accessibility/purchase checks.
- Verify current primary App Store policies and live artifact status before completion.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/engineering/release-gates.md](../../engineering/release-gates.md)
- [docs/engineering/quality.md](../../engineering/quality.md)

## Commit target

`chore(ios-release): record verified store readiness and release`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
