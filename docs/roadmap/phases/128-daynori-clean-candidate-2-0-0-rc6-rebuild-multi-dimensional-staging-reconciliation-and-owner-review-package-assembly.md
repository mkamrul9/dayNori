# Phase 128 — Daynori clean candidate 2.0.0-rc6 rebuild, multi-dimensional staging reconciliation, and owner review package assembly

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [102 — Authorized Version 2 publication and live verification](102-authorized-version-2-publication-and-live-verification.md)
- [112 — Daynori core web/PWA browser release verification and staging isolation audit](112-daynori-core-web-pwa-browser-release-verification-and-staging-isolation-audit.md)
- [118 — Daynori deployable web-core release preparation and production infrastructure capacity plan](118-daynori-deployable-web-core-release-preparation-and-production-infrastructure-capacity-plan.md)
- [119 — Daynori authorized HTTPS staging deployment verification and browser journey audit](119-daynori-authorized-https-staging-deployment-verification-and-browser-journey-audit.md)
- [120 — Daynori production-focused security and privacy review and vulnerability remediation of the enabled web core](120-daynori-production-focused-security-and-privacy-review-and-vulnerability-remediation-of-the-enabled-web-core.md)
- [121 — Daynori production-scale load testing, performance profiling, and capacity envelope verification for 1,000 to 10,000 users](121-daynori-production-scale-load-testing-performance-profiling-and-capacity-envelope-verification-for-1-000-to-10-000-users.md)
- [122 — Daynori production release-candidate launch package, owner authorization reconciliation, and staged rollout governance](122-daynori-production-release-candidate-launch-package-owner-authorization-reconciliation-and-staged-rollout-governance.md)
- [123 — Daynori release-evidence audit, claims reclassification, candidate inventory, and preflight reconciliation](123-daynori-release-evidence-audit-claims-reclassification-candidate-inventory-and-preflight-reconciliation.md)
- [124 — Daynori proxy trust, rate limiter ingress hardening, and spoofing defense verification](124-daynori-proxy-trust-rate-limiter-ingress-hardening-and-spoofing-defense-verification.md)
- [125 — Daynori multi-user authenticated staging journeys, tenant isolation, and robust CDP verification](125-daynori-multi-user-authenticated-staging-journeys-tenant-isolation-and-robust-cdp-verification.md)
- [126 — Daynori database backup and restore drill, compatible artifact rollback, monitoring alerts verification, and operations staffing audit](126-daynori-database-backup-and-restore-drill-compatible-artifact-rollback-monitoring-alerts-verification-and-operations-staffing-audit.md)
- [127 — Daynori authenticated transactional load testing, database pool saturation profiling, and empirical capacity envelope verification](127-daynori-authenticated-transactional-load-testing-database-pool-saturation-profiling-and-empirical-capacity-envelope-verification.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- artifacts/phase128
- artifacts/release
- docs/decisions
- docs/phase-reports
- docs/release
- scripts
- tests/release
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Rebuild clean release candidate 2.0.0-rc6 incorporating all approved fixes postdating rc5 using Node 24.21.0 requirement (^24.21.0).
2. Package immutable distributable archives (daynori-web-v2.0.0-rc6.tar.gz and daynori-api-v2.0.0-rc6.tar.gz), verify cryptographic SHA-256 digests, and author manifest artifacts/release/candidate-2.0.0-rc6-manifest.json.
3. Execute current release preflight (scripts/release-preflight.mjs) and verify full regression test suites across all four verification dimensions.
4. Reconcile hosted staging deployment and synthesize empirical staging evidence across user journeys (Phase 125), security ingress (Phase 124), disaster recovery (Phase 126), and capacity envelope (Phase 127).
5. Assemble reviewable Owner Review Package in artifacts/phase128/candidate-rc6-review-package.json and reconcile release records docs/release/v2-authorized-publication-record.md and docs/release/v2-owner-review-package.md.
6. Present production domain, hosting accounts, monthly budget, initial cohort, named operators, rollback procedure, and remaining disabled features for owner approval.
7. Author ADR 0128, phase report docs/phase-reports/phase-128.md, and automated test suite tests/release/phase128-candidate-rc6-and-owner-package.test.ts.

## Acceptance

- Clean release candidate 2.0.0-rc6 archives exist, match manifest SHA-256 hashes and file sizes, and compile cleanly.
- Candidate preflight reports zero failures and truthfully tracks external blocked gates.
- All 46 automated regression tests pass across user journeys, security ingress, recovery drill, capacity envelope, and release package suites.
- Owner Review Package presents concrete production domain, hosting accounts, monthly budget (–/mo), initial cohort (25–50 users), named operational roles, zero-loss rollback, and fail-closed feature boundaries.
- Public publication remains strictly blocked pending explicit affirmative owner launch authorization under OWNER-RELEASE-AUTH.
- docs/roadmap/plan.json, progress.json, and blueprint.html pass all planning validators.

## Verification and evidence

- pnpm vitest run tests/release/phase128-candidate-rc6-and-owner-package.test.ts
- node scripts/validate-planning.mjs
- pnpm validate:function-register

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
- [docs/release/v2-authorized-publication-record.md](../../release/v2-authorized-publication-record.md)
- [docs/release/v2-owner-review-package.md](../../release/v2-owner-review-package.md)
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/decisions/0122-production-launch-package-and-owner-authorization-governance.md](../../decisions/0122-production-launch-package-and-owner-authorization-governance.md)
- [docs/decisions/0123-release-evidence-audit-claims-reclassification-and-preflight.md](../../decisions/0123-release-evidence-audit-claims-reclassification-and-preflight.md)
- [docs/decisions/0124-proxy-trust-rate-limiter-hardening-and-spoofing-defense.md](../../decisions/0124-proxy-trust-rate-limiter-hardening-and-spoofing-defense.md)
- [docs/decisions/0125-multi-user-authenticated-staging-verification-and-workspace-isolation.md](../../decisions/0125-multi-user-authenticated-staging-verification-and-workspace-isolation.md)
- [docs/decisions/0126-staging-database-recovery-drill-artifact-rollback-and-staffing-audit.md](../../decisions/0126-staging-database-recovery-drill-artifact-rollback-and-staffing-audit.md)
- [docs/decisions/0127-authenticated-transactional-capacity-and-pool-saturation.md](../../decisions/0127-authenticated-transactional-capacity-and-pool-saturation.md)
- [docs/decisions/0128-clean-candidate-rc6-rebuild-staging-verification-and-owner-package.md](../../decisions/0128-clean-candidate-rc6-rebuild-staging-verification-and-owner-package.md)
- [docs/phase-reports/phase-125.md](../../phase-reports/phase-125.md)
- [docs/phase-reports/phase-126.md](../../phase-reports/phase-126.md)
- [docs/phase-reports/phase-127.md](../../phase-reports/phase-127.md)
- [docs/phase-reports/phase-128.md](../../phase-reports/phase-128.md)

## Commit target

`chore(release): rebuild candidate rc6, verify staging journeys and assemble owner package`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
