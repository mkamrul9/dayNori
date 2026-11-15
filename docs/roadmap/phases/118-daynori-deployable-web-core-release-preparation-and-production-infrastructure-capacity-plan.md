# Phase 118 — Daynori deployable web-core release preparation and production infrastructure capacity plan

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [102 — Authorized Version 2 publication and live verification](102-authorized-version-2-publication-and-live-verification.md)
- [112 — Daynori core web/PWA browser release verification and staging isolation audit](112-daynori-core-web-pwa-browser-release-verification-and-staging-isolation-audit.md)
- [117 — Daynori web/PWA visual polish and usability refinement](117-daynori-web-pwa-visual-polish-and-usability-refinement.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web
- apps/api
- artifacts/release
- artifacts/phase118
- docs/decisions
- docs/engineering
- docs/operations
- docs/roadmap
- docs/phase-reports
- tests/e2e
- tests/unit
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Compile and package deployable Web and API artifacts using repository-required Node v24.21.0 from clean commit 3aebd74 into artifacts/release/daynori-web-v2.0.0-rc4.tar.gz and daynori-api-v2.0.0-rc4.tar.gz with immutable SHA-256 digests.
2. Produce candidate release manifest in artifacts/phase118/release-candidate-manifest.json recording build SHA, git revision, toolchain, artifact digests, individual PWA client asset digests, exact startup commands, and health probes.
3. Author configuration inventory in artifacts/phase118/configuration-inventory.json detailing all required environment variables, secrets management rules (zero secrets in Git/logs), default fallbacks, and fail-closed module barriers.
4. Author rollback package and runbook in artifacts/phase118/rollback-package-runbook.md establishing automated health triggers, zero-downtime reverse DNS cutover, static maintenance fallback shell, and additive schema non-destructive rollbacks.
5. Design production public service architecture across Web, API, Database, Auth, Storage, Worker/Background Jobs, DNS/TLS, Backup, Monitoring, and Support delivery.
6. Critically evaluate existing /free-tier decision (ADR 0063) against public capacity requirements, documenting why free-tier limitations (Render sleeping/quota, Supabase connection/storage caps) cannot support thousands of active users.
7. Model traffic and compute capacity for 1,000 to 10,000 Monthly Active Users (MAU), produce costed hosting comparison matrix (Managed PaaS, Unified Container Cloud, Lean Bare-Metal VPS) in artifacts/phase118/costed-hosting-matrix.json, and recommend optimal path.
8. Record missing owner-controlled accounts and required authorizations (OWNER-PROD-DNS, OWNER-SUPABASE-PRO, OWNER-HOSTING-ACCOUNT, OWNER-SMTP-CREDENTIALS, OWNER-BUDGET-AUTH, OWNER-RELEASE-AUTH) precisely in release records and phase report.
9. Implement automated test suites in tests/unit/phase118-release-package-and-capacity.test.ts and tests/e2e/phase118-web-core-startup-and-health.test.ts verifying artifact integrity, startup commands, and health endpoints.
10. Author ADR 0118, phase report docs/phase-reports/phase-118.md, update CHANGELOG.md, docs/roadmap/progress.json, and rebuild blueprint.

## Acceptance

- Immutable web and API release artifacts (daynori-web-v2.0.0-rc4.tar.gz, daynori-api-v2.0.0-rc4.tar.gz) produced with Node v24.21.0 from latest corrected source and verified with SHA-256 digests.
- Build SHA (BUILD_ID 6BXhesAWPN88FbHwp-Q4g) and git revision (3aebd74) recorded and verified.
- Exact production startup commands and health probe endpoints verified operational.
- Complete configuration inventory authored with strict exclusion of credentials from Git and logs.
- Rollback package and runbook verified with instant fallback shell and additive schema compatibility.
- Public service architecture designed across all 10 core dimensions.
- Existing  free-tier decision checked and documented as unviable for thousands of users.
- Costed hosting options and capacity plan produced for 1,000-10,000 MAU.
- All missing owner accounts and decisions recorded precisely.
- Automated unit and e2e test suites pass cleanly.
- docs/roadmap/plan.json, progress.json, and blueprint.html pass all planning validators.

## Verification and evidence

- node scripts/validate-planning.mjs
- node scripts/build-phase-plans.mjs --check
- node scripts/build-blueprint.mjs --check
- pnpm validate:function-register
- pnpm vitest run tests/unit/phase118-release-package-and-capacity.test.ts tests/e2e/phase118-web-core-startup-and-health.test.ts
- pnpm --filter @daynori/ui-web typecheck
- pnpm --filter @daynori/web typecheck
- pnpm --filter @daynori/api typecheck
- pnpm lint

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/decisions/0063-free-core-testing-preview.md](../../decisions/0063-free-core-testing-preview.md)
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/decisions/0100-full-version-2-beta-and-readiness-reconciliation.md](../../decisions/0100-full-version-2-beta-and-readiness-reconciliation.md)
- [docs/decisions/0102-authorized-version-2-publication-and-live-verification.md](../../decisions/0102-authorized-version-2-publication-and-live-verification.md)
- [docs/decisions/0112-core-web-pwa-browser-release-verification-and-staging-isolation.md](../../decisions/0112-core-web-pwa-browser-release-verification-and-staging-isolation.md)
- [docs/decisions/0117-daynori-web-pwa-visual-polish-and-usability-refinement.md](../../decisions/0117-daynori-web-pwa-visual-polish-and-usability-refinement.md)
- [docs/decisions/0118-daynori-deployable-web-core-release-and-production-infrastructure-capacity-plan.md](../../decisions/0118-daynori-deployable-web-core-release-and-production-infrastructure-capacity-plan.md)
- [docs/phase-reports/phase-102.md](../../phase-reports/phase-102.md)
- [docs/phase-reports/phase-112.md](../../phase-reports/phase-112.md)
- [docs/phase-reports/phase-117.md](../../phase-reports/phase-117.md)
- [docs/phase-reports/phase-118.md](../../phase-reports/phase-118.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`chore(release): prepare deployable web-core rc4 release and production capacity plan`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
