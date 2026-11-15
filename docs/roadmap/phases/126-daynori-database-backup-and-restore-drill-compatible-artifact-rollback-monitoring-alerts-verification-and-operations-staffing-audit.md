# Phase 126 — Daynori database backup and restore drill, compatible artifact rollback, monitoring alerts verification, and operations staffing audit

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

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- artifacts/phase126
- docs/decisions
- docs/phase-reports
- docs/release
- scripts
- tests/release
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Execute live database backup and isolated restore drill on the hosted staging PostgreSQL cluster (aws-0-ap-southeast-1.pooler.supabase.com) using disposable survivor and deletion-candidate entities.
2. Measure exact Recovery Time Objective (RTO in ms) and Recovery Point Objective (RPO in seconds) into isolated database daynori_restore_drill.
3. Verify 100% survivor data preservation (0 bytes data loss, canonical JSON checksum match) and zero resurrection leaks via pre-access suppression ledger barrier.
4. Demonstrate non-destructive artifact rollback between release candidate 2.0.0-rc5 and predecessor 2.0.0-rc4 with zero data loss under additive schema invariants.
5. Verify emergency maintenance cutover via standalone offline shell (offline-shell.html) returning HTTP 503 with Retry-After 300.
6. Perform live DNS audit of daynori.com MX records, verifying that support@daynori.com and security@daynori.com have no mail routing and automated pager alerting is unconfigured.
7. Audit operational escalation staffing, confirming designated roles in docs/operations/incident-response-and-support-roster.md remain unassigned.
8. Distinguish configured/tested mechanisms from proposed runbooks and update all release documents while keeping publication strictly blocked.
9. Author ADR 0126, phase report docs/phase-reports/phase-126.md, results artifact artifacts/phase126/operations-drill-results.json, and automated regression test suite tests/release/phase126-operations-recovery-and-staffing.test.ts.

## Acceptance

- Live staging database restore drill passes with measured RTO < 15 minutes, RPO = 0 seconds, 0 bytes survivor data loss, and zero resurrected records.
- Artifact rollback between rc5 and rc4 is demonstrated without schema errors or data loss.
- Emergency offline shell is verified with HTTP 503 and Retry-After 300.
- DNS MX query honestly detects 0 MX records on daynori.com and marks mailboxes unconfigured.
- Automated alerting webhooks and human escalation staffing are honestly audited as unassigned/proposed.
- All release documents are updated with measured results and publication status is recorded as strictly BLOCKED.
- Automated regression test suite tests/release/phase126-operations-recovery-and-staffing.test.ts passes all tests.
- docs/roadmap/plan.json, progress.json, and blueprint.html pass all planning validators.

## Verification and evidence

- pnpm vitest run tests/release/phase126-operations-recovery-and-staffing.test.ts
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
- [docs/engineering/backup-and-recovery.md](../../engineering/backup-and-recovery.md)
- [docs/operations/incident-response-and-support-roster.md](../../operations/incident-response-and-support-roster.md)
- [docs/release/v2-authorized-publication-record.md](../../release/v2-authorized-publication-record.md)
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/decisions/0122-production-launch-package-and-owner-authorization-governance.md](../../decisions/0122-production-launch-package-and-owner-authorization-governance.md)
- [docs/decisions/0123-release-evidence-audit-claims-reclassification-and-preflight.md](../../decisions/0123-release-evidence-audit-claims-reclassification-and-preflight.md)
- [docs/decisions/0125-multi-user-authenticated-staging-verification-and-workspace-isolation.md](../../decisions/0125-multi-user-authenticated-staging-verification-and-workspace-isolation.md)
- [docs/decisions/0126-staging-database-recovery-drill-artifact-rollback-and-staffing-audit.md](../../decisions/0126-staging-database-recovery-drill-artifact-rollback-and-staffing-audit.md)
- [docs/phase-reports/phase-123.md](../../phase-reports/phase-123.md)
- [docs/phase-reports/phase-125.md](../../phase-reports/phase-125.md)
- [docs/phase-reports/phase-126.md](../../phase-reports/phase-126.md)

## Commit target

`chore(operations): execute staging backup drill, verify artifact rollback and audit staffing`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
