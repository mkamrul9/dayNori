# Phase 38 — Controlled private beta

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [37 — Core quality and usability release gate](37-core-quality-and-usability-release-gate.md)
- [02 — Continuous checks and contributor automation](02-continuous-checks-and-contributor-automation.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- infra/deployment
- apps/mobile release config
- apps/web release config
- docs/phase-reports

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Prepare isolated staging/beta environments, limited access, feature flags, rollback, redacted monitoring, and support feedback flow.
2. Produce signed internal Android builds and a private web beta; deployment and account prerequisites require the owner's authorized target.
3. Run an agreed beta observation period and triage findings into bounded follow-up phases before widening access.

## Acceptance

- Only intended testers can access the beta and visible features match shipped scope.
- Rollback and operational alert routes are exercised.
- Beta evidence names unresolved issues and does not label the app publicly production-ready.

## Verification and evidence

- Run deployed smoke tests, signed-build installation, auth callbacks, reminders, and restoration drills.
- Record user/device coverage and feedback actions; if external prerequisites are missing, keep the gate pending.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/engineering/release-gates.md](../../engineering/release-gates.md)
- [docs/architecture/operations-and-scaling.md](../../architecture/operations-and-scaling.md)

## Commit target

`chore(beta): prepare and validate the private organizer release`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
