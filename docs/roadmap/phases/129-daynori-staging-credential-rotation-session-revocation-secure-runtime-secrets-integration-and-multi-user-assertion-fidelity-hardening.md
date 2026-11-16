# Phase 129 — Daynori staging credential rotation, session revocation, secure runtime secrets integration, and multi-user assertion fidelity hardening

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [125 — Daynori multi-user authenticated staging journeys, tenant isolation, and robust CDP verification](125-daynori-multi-user-authenticated-staging-journeys-tenant-isolation-and-robust-cdp-verification.md)
- [127 — Daynori authenticated transactional load testing, database pool saturation profiling, and empirical capacity envelope verification](127-daynori-authenticated-transactional-load-testing-database-pool-saturation-profiling-and-empirical-capacity-envelope-verification.md)
- [128 — Daynori clean candidate 2.0.0-rc6 rebuild, multi-dimensional staging reconciliation, and owner review package assembly](128-daynori-clean-candidate-2-0-0-rc6-rebuild-multi-dimensional-staging-reconciliation-and-owner-review-package-assembly.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- artifacts/phase125
- artifacts/phase129
- docs/decisions
- docs/phase-reports
- docs/roadmap
- scripts
- tests/release
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Immediately rotate staging account credentials for User A and User B in hosted Supabase database using high-entropy random secrets and crypt(..., gen_salt('bf', 10)).
2. Revoke all active sessions (44 rows) and refresh tokens (50 rows) in auth.sessions and auth.refresh_tokens, and inspect staging access logs in auth.audit_log_entries (recording audit in artifacts/phase129/staging-access-log-audit.json).
3. Remove plaintext credentials from scripts/run-phase125-multi-user-staging-audit.mjs and scripts/run-phase127-capacity-load-test.mjs, replacing with getStagingCredentials() resolving from environment variables or gitignored local secrets without printing or committing secrets or rewriting Git history.
4. Harden Phase 125 multi-user staging assertions: strictly assert successful outcomes for auth (201 signup probe, 200 recovery probe); fail UI verification if specific newly created item is absent after reload; eliminate hardcoded unconditional uiVerified/apiVerified assignments.
5. Accurately categorize workflows into ui_and_api (9 journeys) and api_only (1 protocol test: offline draft, revision conflict, and network conditions).
6. Empirically execute hardened staging verification against live deployed HTTPS staging, updating artifacts/phase125/staging-verification-results.json and screenshots.
7. Expand and verify automated regression test suite tests/release/phase125-multi-user-staging-audit.test.ts (10 passing tests) and author ADR 0129 and phase report docs/phase-reports/phase-129.md.

## Acceptance

- Zero plaintext credentials committed in test harness scripts; runtime helper getStagingCredentials() resolves credentials securely or fails closed.
- Staging account credentials rotated with high-entropy cryptographic secrets, sessions revoked (44 sessions, 50 refresh tokens), and audit logged.
- Strict assertions enforced: recovery and signup fail if not 200/201; UI verification asserts specific newly created item persistence in DOM after reload; booleans are computed dynamically.
- Summary and workflow artifacts distinguish ui_and_api journeys from api_only protocol tests.
- Automated regression test suite tests/release/phase125-multi-user-staging-audit.test.ts passes all 10 tests, and all 49 release regression tests pass.
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
- [docs/decisions/0125-multi-user-authenticated-staging-verification-and-workspace-isolation.md](../../decisions/0125-multi-user-authenticated-staging-verification-and-workspace-isolation.md)
- [docs/decisions/0127-authenticated-transactional-capacity-and-pool-saturation.md](../../decisions/0127-authenticated-transactional-capacity-and-pool-saturation.md)
- [docs/decisions/0128-clean-candidate-rc6-rebuild-staging-verification-and-owner-package.md](../../decisions/0128-clean-candidate-rc6-rebuild-staging-verification-and-owner-package.md)
- [docs/decisions/0129-staging-credential-rotation-session-revocation-and-assertion-hardening.md](../../decisions/0129-staging-credential-rotation-session-revocation-and-assertion-hardening.md)
- [docs/phase-reports/phase-125.md](../../phase-reports/phase-125.md)
- [docs/phase-reports/phase-127.md](../../phase-reports/phase-127.md)
- [docs/phase-reports/phase-128.md](../../phase-reports/phase-128.md)
- [docs/phase-reports/phase-129.md](../../phase-reports/phase-129.md)

## Commit target

`fix(security): rotate staging credentials, revoke sessions and harden assertion fidelity`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
