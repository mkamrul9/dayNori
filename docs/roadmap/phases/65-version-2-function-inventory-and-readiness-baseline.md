# Phase 65 — Version 2 function inventory and readiness baseline

Group: V2 readiness and design. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [64 — Version 2 product and delivery planning](64-version-2-product-and-delivery-planning.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- docs/roadmap/v2
- tests/e2e
- tests/performance
- docs/phase-reports

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Enumerate actual route, UI, contract and provider actions into a versioned feature register with platform, entry point, evidence and blocker fields.
2. Exercise available synthetic create/save/reopen/search/account-isolation journeys; record current visual, accessibility and performance baselines without repairing unrelated modules.
3. Map each action to its repair phase, Help article and tour treatment; flag prerequisites needing a bounded split before implementation.

## Acceptance

- All feature families and actual lower-level actions are accounted for; untested, unavailable and failed functions are distinguishable.
- Fresh screenshots and timings identify revision, platform, viewport and synthetic data; historical evidence is labeled.
- Known data-loss, authorization, mobile and provider gaps have reproducible next steps, with no invented authenticated/device results.

## Verification and evidence

- Run existing relevant core/e2e scripts against the nominated local environment and record exact outcomes.
- Validate feature coverage references and manually inspect available desktop/narrow-web views; record physical-device/provider access limits.

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
- [docs/phase-reports/phase-60.md](../../phase-reports/phase-60.md)

## Commit target

`docs(readiness): inventory functions and baseline Version 2 gaps`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
