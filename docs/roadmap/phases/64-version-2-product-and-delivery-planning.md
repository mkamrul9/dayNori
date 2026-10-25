# Phase 64 — Version 2 product and delivery planning

Group: V2 readiness and design. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- No prior phase.

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- docs/roadmap
- docs/decisions
- docs/phase-reports
- README.md
- CHANGELOG.md
- docs/blueprint.html
- scripts/build-blueprint.mjs

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Inspect the preview evidence, existing roadmap and relevant source surfaces; distinguish reported problems from freshly verified behavior.
2. Research primary design and notification references; specify the simpler visual/mobile experience, full action-based learning, support, AI/voice and original companion.
3. Append bounded V2 phases with coverage, dependencies, acceptance and handoff rules; preserve all V1 definitions/statuses and do not implement the app.

## Acceptance

- Every owner request, including professional icons and no app-authored emoji, has a specification and delivery phase.
- The readiness caveat, PWA notification limits, existing gates and full-scope completion rule are explicit.
- Canonical/generated plans, progress, report and changelog agree; Phase 65 is selectable but unstarted.

## Verification and evidence

- Run planning and generated-artifact validation, changed-file formatting, secret scanning and git diff --check.
- Verify original phase definitions and status entries are unchanged; review all staged paths before one local docs commit.

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
- [docs/decisions/0067-version-two-planning-and-release-boundaries.md](../../decisions/0067-version-two-planning-and-release-boundaries.md)
- [docs/roadmap/v2/antigravity-handoff.md](../v2/antigravity-handoff.md)

## Commit target

`docs(planning): define the Version 2 experience and delivery roadmap`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
