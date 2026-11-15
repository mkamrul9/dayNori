# Phase 123 — Daynori release-evidence audit, claims reclassification, candidate inventory, and preflight reconciliation

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

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- artifacts/phase119
- artifacts/phase120
- artifacts/phase121
- artifacts/phase122
- artifacts/phase123
- docs/decisions
- docs/phase-reports
- docs/release
- docs/roadmap
- scripts
- tests/release
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Audit actual assertions in Phase 119, 120, 121, and 122 scripts against all reported claims across reports, JSON artifacts, and release records.
2. Reclassify page-presence checks as page checks (not authenticated journeys), health-request runs as health-request runs (not proof of 10,000-user capacity), and the backup runbook check as documentation verification (not a live restore drill).
3. Update Phase 119, 120, 121, and 122 reports, evidence JSON artifacts, and release records to strictly reflect reclassified claims.
4. Inventory the dirty working tree and identify all modified source and schema files absent from candidate 2.0.0-rc5 archives (notably packages/ui-web/src/Dialog.tsx and moderation migrations).
5. Execute candidate preflight verification via scripts/release-preflight.mjs, recording exact invariant counts (20 pass, 0 fail, 13 blocked, 1 unexecuted) and cataloging remaining gates.
6. Author ADR 0123, phase report docs/phase-reports/phase-123.md, automated test suite tests/release/phase123-claims-reclassification-and-audit.test.ts, update CHANGELOG.md, docs/roadmap/progress.json, and validate planning.

## Acceptance

- Empirical assertions in Phase 119, 120, 121, and 122 audited and claims truthfully reclassified across all reports and JSON artifacts.
- Page checks, health-request runs, and runbook documentation verification strictly distinguished from authenticated journeys, restore drills, and 10k capacity proof.
- Exhaustive inventory of dirty working tree produced, documenting changes absent from rc5.
- Preflight executed and reconciled with 13 blocked gates (including evidence-backupRecoveryEvidence and evidence-ownerApproval).
- Automated test suite tests/release/phase123-claims-reclassification-and-audit.test.ts passes cleanly.
- docs/roadmap/plan.json, progress.json, and blueprint.html pass all planning validators.

## Verification and evidence

- pnpm vitest run tests/release/phase123-claims-reclassification-and-audit.test.ts
- node scripts/release-preflight.mjs --allow-partial-local
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
- [docs/decisions/0057-public-release-preflight-and-first-publication.md](../../decisions/0057-public-release-preflight-and-first-publication.md)
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/decisions/0101-version-2-release-candidate-and-operational-preparation.md](../../decisions/0101-version-2-release-candidate-and-operational-preparation.md)
- [docs/decisions/0102-authorized-version-2-publication-and-live-verification.md](../../decisions/0102-authorized-version-2-publication-and-live-verification.md)
- [docs/decisions/0118-daynori-deployable-web-core-release-and-production-infrastructure-capacity-plan.md](../../decisions/0118-daynori-deployable-web-core-release-and-production-infrastructure-capacity-plan.md)
- [docs/decisions/0119-authorized-https-staging-deployment-and-browser-journey-audit.md](../../decisions/0119-authorized-https-staging-deployment-and-browser-journey-audit.md)
- [docs/decisions/0120-production-security-privacy-review-and-remediation.md](../../decisions/0120-production-security-privacy-review-and-remediation.md)
- [docs/decisions/0121-production-scale-load-testing-and-capacity-envelope.md](../../decisions/0121-production-scale-load-testing-and-capacity-envelope.md)
- [docs/decisions/0122-production-launch-package-and-owner-authorization-governance.md](../../decisions/0122-production-launch-package-and-owner-authorization-governance.md)
- [docs/decisions/0123-release-evidence-audit-claims-reclassification-and-preflight.md](../../decisions/0123-release-evidence-audit-claims-reclassification-and-preflight.md)
- [docs/phase-reports/phase-119.md](../../phase-reports/phase-119.md)
- [docs/phase-reports/phase-120.md](../../phase-reports/phase-120.md)
- [docs/phase-reports/phase-121.md](../../phase-reports/phase-121.md)
- [docs/phase-reports/phase-122.md](../../phase-reports/phase-122.md)
- [docs/phase-reports/phase-123.md](../../phase-reports/phase-123.md)

## Commit target

`chore(release): audit release evidence, reclassify claims, and reconcile candidate preflight`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
