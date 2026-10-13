# Phase 63 — First post-launch review and next roadmap

Group: Post-launch review. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [60 — Public Android and web release](60-public-android-and-web-release.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- docs/product
- docs/engineering
- docs/roadmap future phases

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Review an agreed initial operating period using privacy-safe usage, support themes, crashes, cost, and reliability evidence.
2. Prioritize concrete defects and user needs without automatically expanding every feature request.
3. Create the next bounded phase set with migration/security/design implications and preserve the original completed phase history.

## Acceptance

- A dated review names observed issues, accountable next steps, and a measured operating cost baseline.
- New phase IDs are append-only and each proposed feature has an understandable user benefit.
- This phase ends after the agreed review; ongoing operations are assigned to people/processes rather than an endless task.

## Verification and evidence

- Reconcile incident/support observations with operational data and consent policy.
- Review the revised roadmap and rerun planning validation.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/engineering/handoff.md](../../engineering/handoff.md)
- [docs/architecture/operations-and-scaling.md](../../architecture/operations-and-scaling.md)

## Commit target

`docs(product): review launch evidence and prioritize the next phases`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
