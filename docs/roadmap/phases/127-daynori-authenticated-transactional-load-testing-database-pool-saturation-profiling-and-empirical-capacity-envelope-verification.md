# Phase 127 — Daynori authenticated transactional load testing, database pool saturation profiling, and empirical capacity envelope verification

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

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- artifacts/phase127
- docs/decisions
- docs/phase-reports
- docs/release
- scripts
- tests/performance
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Execute authenticated create/read/update/search/sync traffic against production-like staging infrastructure (daynori-api-preview.onrender.com and daynori-web-preview.onrender.com backed by Supabase PostgreSQL aws-0-ap-southeast-1.pooler.supabase.com:5432).
2. Evaluate stated peak concurrency for proposed 1,000-user (30 CCU / 10 RPS), 5,000-user (150 CCU / 45 RPS), and 10,000-user (300 CCU / 90 RPS) scenarios across a representative 75% read / 25% write productivity mix.
3. Profile database connection pool saturation, event-loop lag, and process rate-limiting triggers across ramp, sustained soak, spike burst, and boundary runs.
4. Emulate realistic Bangladesh network conditions (95ms base RTT across SEA-ME-WE 4/5 cables, Gaussian jitter, cellular packet loss).
5. Establish measured safe operating envelope (<= 30 CCU on Render Free + Supabase Free), operational warning/critical alert thresholds, scaling runbooks, and automated rollback triggers.
6. Author ADR 0127, phase report docs/phase-reports/phase-127.md, results artifacts artifacts/phase127/load-test-results.json and capacity-envelope-matrix.json, and automated performance test suite tests/performance/phase127-capacity-envelope.test.ts.

## Acceptance

- Authenticated transactional load testing is executed without substituting health requests or simulated network delays for real user operations.
- Tier 1 (1,000 Users / 30 CCU) is empirically proven demonstrably supported on Render Free + Supabase Free with 0% 5xx server errors and safe database connection pool utilization.
- Physical breaking points and failure boundaries are empirically captured at 150 CCU and 300 CCU, establishing the strict requirement for paid Managed PaaS (Supabase Pro with PgBouncer connection pooling and multi-instance compute).
- All test artifacts in staging database are cleanly purged during teardown.
- Automated performance test suite tests/performance/phase127-capacity-envelope.test.ts passes all tests.
- docs/roadmap/plan.json, progress.json, and blueprint.html pass all planning validators.

## Verification and evidence

- pnpm vitest run tests/performance/phase127-capacity-envelope.test.ts
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
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/decisions/0121-production-scale-load-testing-and-capacity-envelope.md](../../decisions/0121-production-scale-load-testing-and-capacity-envelope.md)
- [docs/decisions/0122-production-launch-package-and-owner-authorization-governance.md](../../decisions/0122-production-launch-package-and-owner-authorization-governance.md)
- [docs/decisions/0123-release-evidence-audit-claims-reclassification-and-preflight.md](../../decisions/0123-release-evidence-audit-claims-reclassification-and-preflight.md)
- [docs/decisions/0124-proxy-trust-rate-limiter-hardening-and-spoofing-defense.md](../../decisions/0124-proxy-trust-rate-limiter-hardening-and-spoofing-defense.md)
- [docs/decisions/0125-multi-user-authenticated-staging-verification-and-workspace-isolation.md](../../decisions/0125-multi-user-authenticated-staging-verification-and-workspace-isolation.md)
- [docs/decisions/0126-staging-database-recovery-drill-artifact-rollback-and-staffing-audit.md](../../decisions/0126-staging-database-recovery-drill-artifact-rollback-and-staffing-audit.md)
- [docs/decisions/0127-authenticated-transactional-capacity-and-pool-saturation.md](../../decisions/0127-authenticated-transactional-capacity-and-pool-saturation.md)
- [docs/phase-reports/phase-121.md](../../phase-reports/phase-121.md)
- [docs/phase-reports/phase-123.md](../../phase-reports/phase-123.md)
- [docs/phase-reports/phase-125.md](../../phase-reports/phase-125.md)
- [docs/phase-reports/phase-126.md](../../phase-reports/phase-126.md)
- [docs/phase-reports/phase-127.md](../../phase-reports/phase-127.md)

## Commit target

`perf(capacity): verify authenticated transactional throughput and pool saturation envelope`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
