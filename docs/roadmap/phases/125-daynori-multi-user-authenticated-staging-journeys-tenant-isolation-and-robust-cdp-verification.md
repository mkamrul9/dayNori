# Phase 125 — Daynori multi-user authenticated staging journeys, tenant isolation, and robust CDP verification

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

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- artifacts/phase125
- docs/decisions
- docs/phase-reports
- scripts
- tests/release
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Re-architect the headless Chrome DevTools Protocol client to eliminate error suppression, reject promises on protocol errors, and throw on JavaScript evaluation exceptions.
2. Target the deployed HTTPS staging environment exclusively, failing closed if non-HTTPS or localhost endpoints are configured.
3. Authenticate two distinct disposable staging accounts (User A and User B) and verify session hydration in both browser and API contexts.
4. Automate 10 core end-to-end user workflows asserting data persistence across both UI and API (Auth lifecycle, note persistence, task deadline/completion, routine occurrence, journal reflection, workspace search, offline draft/reconnect/conflict, support submission, tenant isolation, and account deletion).
5. Empirically prove workspace tenant isolation by verifying cross-tenant API requests return 404/403 and verifying User A's data is strictly absent from User B's DOM.
6. Apply prerequisite staging database migrations (00075 and 00076) and document Supabase Free Tier mailer rate-limiting boundaries.
7. Capture full-size PNG screenshots for all 10 verified workflows and record deployed commit SHA and metadata in artifacts/phase125/staging-verification-results.json.
8. Author ADR 0125, phase report docs/phase-reports/phase-125.md, and automated regression test suite tests/release/phase125-multi-user-staging-audit.test.ts.

## Acceptance

- All 10 user workflows pass against live staging with both uiVerified and apiVerified true.
- RobustCdpClient strictly rejects promises on command timeouts/errors and throws on evaluation exceptions.
- Tenant isolation is proven: cross-tenant API queries return 404 Not Found and one user's private data is absent from the other user's rendered DOM.
- Optimistic concurrency conflict handling is proven via 409 REVISION_CONFLICT on stale baseRevision.
- Full-size PNG screenshots exist for all 10 journeys in artifacts/phase125/screenshots/.
- Automated regression test suite tests/release/phase125-multi-user-staging-audit.test.ts passes all tests.
- docs/roadmap/plan.json, progress.json, and blueprint.html pass all planning validators.

## Verification and evidence

- pnpm vitest run tests/release/phase125-multi-user-staging-audit.test.ts
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
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/decisions/0119-authorized-https-staging-deployment-and-browser-journey-audit.md](../../decisions/0119-authorized-https-staging-deployment-and-browser-journey-audit.md)
- [docs/decisions/0123-release-evidence-audit-claims-reclassification-and-preflight.md](../../decisions/0123-release-evidence-audit-claims-reclassification-and-preflight.md)
- [docs/decisions/0124-proxy-trust-rate-limiter-hardening-and-spoofing-defense.md](../../decisions/0124-proxy-trust-rate-limiter-hardening-and-spoofing-defense.md)
- [docs/decisions/0125-multi-user-authenticated-staging-verification-and-workspace-isolation.md](../../decisions/0125-multi-user-authenticated-staging-verification-and-workspace-isolation.md)
- [docs/phase-reports/phase-119.md](../../phase-reports/phase-119.md)
- [docs/phase-reports/phase-123.md](../../phase-reports/phase-123.md)
- [docs/phase-reports/phase-124.md](../../phase-reports/phase-124.md)
- [docs/phase-reports/phase-125.md](../../phase-reports/phase-125.md)

## Commit target

`chore(release): verify multi-user authenticated staging journeys and tenant isolation`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
