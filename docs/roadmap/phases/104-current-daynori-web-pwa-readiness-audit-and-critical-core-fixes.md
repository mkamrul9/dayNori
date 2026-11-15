# Phase 104 — Current Daynori web/PWA readiness audit and critical core fixes

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [102 — Authorized Version 2 publication and live verification](102-authorized-version-2-publication-and-live-verification.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web
- apps/api
- tests/e2e
- docs/roadmap
- docs/phase-reports

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Audit real user journeys for sign-up/sign-in, workspace isolation, note/task/routine/journal create-save-reopen, search, offline reopen, and support.
2. Compare current commit and dirty tree with the Phase 102 packaged candidate.
3. Present gated features, especially Ask Nori, truthfully with clear explanations instead of looking available and failing on submit.
4. Fix reproducible defects and record other defects with owners and gates in the function register.

## Acceptance

- All 8 real user journeys pass with synthetic accounts and verified responses.
- Gated Ask Nori assistant is presented truthfully with disabled inputs and explanatory links under DEF-V2-008.
- Release candidate diff is documented and function register barriers are reconciled.
- No deployment or release readiness claimed from local tests.

## Verification and evidence

- pnpm vitest run tests/e2e/phase104-v2-web-pwa-audit-journeys.test.ts
- node scripts/phase60-web-production-smoke.mjs
- pnpm validate:function-register
- node scripts/validate-planning.mjs

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
- [docs/decisions/0104-current-web-pwa-readiness-audit-and-critical-core-fixes.md](../../decisions/0104-current-web-pwa-readiness-audit-and-critical-core-fixes.md)
- [docs/phase-reports/phase-102.md](../../phase-reports/phase-102.md)

## Commit target

`test(release): audit web/PWA readiness and present gated assistant truthfully`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
