# Phase 119 — Daynori authorized HTTPS staging deployment verification and browser journey audit

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [102 — Authorized Version 2 publication and live verification](102-authorized-version-2-publication-and-live-verification.md)
- [112 — Daynori core web/PWA browser release verification and staging isolation audit](112-daynori-core-web-pwa-browser-release-verification-and-staging-isolation-audit.md)
- [117 — Daynori web/PWA visual polish and usability refinement](117-daynori-web-pwa-visual-polish-and-usability-refinement.md)
- [118 — Daynori deployable web-core release preparation and production infrastructure capacity plan](118-daynori-deployable-web-core-release-preparation-and-production-infrastructure-capacity-plan.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- scripts
- tests
- artifacts/phase119
- docs/decisions
- docs/engineering
- docs/operations
- docs/roadmap
- docs/phase-reports
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Author and execute scripts/run-phase119-https-staging-verification.mjs targeting authorized live HTTPS staging URLs (https://daynori-web-preview.onrender.com, https://daynori-api-preview.onrender.com, https://sexxceqqknqzvxuuqnkx.supabase.co).
2. Enforce strict fail-closed prohibition against localhost/127.0.0.1 fallbacks in the runner, failing immediately if an insecure or local destination is detected.
3. Verify live HTTPS security headers: CSP Level 3 with per-request cryptographic nonces, X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy, Permissions-Policy, and TLS 1.3.
4. Verify live health endpoints across Web (/api/health) and API (/health, /v1/health) returning HTTP 200 with valid environment metadata.
5. Exercise core browser user journeys via Chrome CDP on live staging: signup/signin/recovery, two-account workspace isolation, notes, tasks, routines, journals, offline outbox queuing, sync conflicts, and account deletion.
6. Verify fail-closed gating on unreleased modules: Vault, Rooms, AI Assistant, Voice, Billing, Drive, and Android return 403 or remain disabled.
7. Verify staging backup and restore drill protocol, observability correlation tracing (rndr-id, cf-ray, requestId), rollback mechanics, and the served build SHA.
8. Capture genuine browser screenshots from the live HTTPS staging environment into artifacts/phase119/screenshots/ and produce machine-readable results.
9. Author automated unit and e2e test suites in tests/unit/phase119-https-staging-verification.test.ts and tests/e2e/phase119-staging-journeys-and-headers.test.ts.
10. Author ADR 0119, phase report docs/phase-reports/phase-119.md, update CHANGELOG.md, docs/roadmap/progress.json, and rebuild blueprint.

## Acceptance

- Smoke runner targets live HTTPS staging (https://daynori-web-preview.onrender.com) and fails immediately if localhost or 127.0.0.1 is targeted.
- Security headers, CSP Level 3 nonces, and TLS 1.3 verified on live HTTPS responses.
- Health endpoints (/api/health, /health, /v1/health) return HTTP 200 with valid metadata.
- All 10 core browser journeys pass against the staging environment with real network conditions.
- Offline draft preservation and sync conflict handling verified with emulated offline mode.
- Unreleased modules (Vault, Rooms, AI, Voice, Billing, Drive, Android) strictly fail-closed.
- Backup and restore drill verified, observability headers validated, and served build SHA audited.
- Browser screenshots captured from live HTTPS staging and recorded with SHA-256 digests.
- Automated unit and integration test suites pass cleanly.
- docs/roadmap/plan.json, progress.json, and blueprint.html pass all planning validators.

## Verification and evidence

- node scripts/validate-planning.mjs
- node scripts/build-phase-plans.mjs --check
- node scripts/build-blueprint.mjs --check
- pnpm validate:function-register
- pnpm vitest run tests/unit/phase119-https-staging-verification.test.ts tests/e2e/phase119-staging-journeys-and-headers.test.ts
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
- [docs/decisions/0102-authorized-version-2-publication-and-live-verification.md](../../decisions/0102-authorized-version-2-publication-and-live-verification.md)
- [docs/decisions/0112-core-web-pwa-browser-release-verification-and-staging-isolation.md](../../decisions/0112-core-web-pwa-browser-release-verification-and-staging-isolation.md)
- [docs/decisions/0118-daynori-deployable-web-core-release-and-production-infrastructure-capacity-plan.md](../../decisions/0118-daynori-deployable-web-core-release-and-production-infrastructure-capacity-plan.md)
- [docs/decisions/0119-authorized-https-staging-deployment-and-browser-journey-audit.md](../../decisions/0119-authorized-https-staging-deployment-and-browser-journey-audit.md)
- [docs/phase-reports/phase-112.md](../../phase-reports/phase-112.md)
- [docs/phase-reports/phase-118.md](../../phase-reports/phase-118.md)
- [docs/phase-reports/phase-119.md](../../phase-reports/phase-119.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)
- [docs/engineering/backup-and-recovery.md](../../engineering/backup-and-recovery.md)

## Commit target

`test(staging): verify authorized HTTPS staging deployment and browser journeys`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
