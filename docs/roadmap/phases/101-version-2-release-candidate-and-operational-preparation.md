# Phase 101 — Version 2 release candidate and operational preparation

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [100 — Full Version 2 beta and readiness reconciliation](100-full-version-2-beta-and-readiness-reconciliation.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- docs/release
- infra/deployment
- scripts
- apps/mobile
- docs/engineering

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Prepare reproducible web/PWA and signed Android candidates with inspected identity/build assets, version scheme and migration/rollback procedures.
2. Recheck current official store/browser/provider policies, privacy/consent/retention disclosures, support/contact and approved hosting/worker operating cost.
3. Complete concrete release checklist, metadata/object restore evidence, kill switches, synthetic reviewer access and deployment package for owner review.

## Acceptance

- Candidate artifacts and claims match the full scoped feature manifest; required signatures/device/provider/legacy gates have current evidence.
- Current policies are checked for the actual account/market and source dates are recorded.
- No publication, real charges, store upload or paid provisioning occurs merely from release preparation.

## Verification and evidence

- Run current release preflight/Android artifact inspection, affected builds and candidate smoke/rehearsal checks.
- Review version compatibility, backup restore, support ownership, operating budget and exact proposed rollout/rollback destinations.

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
- [docs/decisions/0057-public-release-preflight-and-first-publication.md](../../decisions/0057-public-release-preflight-and-first-publication.md)

## Commit target

`chore(release): prepare the verified Version 2 candidate`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
