# Phase 101: Version 2 release candidate and operational preparation

## Identity and scope

- Phase: [101 — Version 2 release candidate and operational preparation](../roadmap/phases/101-version-2-release-candidate-and-operational-preparation.md).
- Status: **blocked** — Release candidate builds, artifact inspection, operational rehearsals, and complete owner review package delivered.
  - Web candidate: reproducible Next.js 15 PWA build verified (`pnpm --filter @daynori/web build`); manifest, service worker, offline shell, and icons inspected with SHA-256 hashes; `phase60-web-production-smoke.mjs` passed (18 checks: CSP, public legal routes, no-session-cookies, dev harness fencing).
  - Android candidate: authoritative Gradle release path verified with `withReleaseSigningGuard`; `:app:tasks` passed without credentials, `:app:assembleRelease` failed closed with `Release signing refused for distributable release task`; target API 36, compile SDK 36, applicationId `com.daynori.app`, versionCode 1; release signing recorded as blocked (`OWNER-SIGNING-KEYS`); debug test artifacts accurately labeled.
  - Operational rehearsals: 5 rehearsals executed in `tests/e2e/phase101-v2-operations-rehearsal.test.ts` (all 5 passed: migration idempotency, mutation outbox recovery, object metadata checksum & deletion suppression, fail-closed kill switches, synthetic reviewer isolation).
  - Canonical tracking: resolved `DEF-V2-013` discrepancy by registering it directly in `docs/roadmap/v2/function-register.json` (`validate:function-register` passed: 109 actions, 13 defects, 22 families); five-person human usability review kept honestly open.
  - Candidate manifest & owner review package: authored `docs/release/v2-release-candidate-manifest.md`, `artifacts/phase101/candidate-manifest.json`, `artifacts/phase101/operations-rehearsal-results.json`, and `docs/release/v2-owner-review-package.md` with policy reviews (Google Play, Apple, browsers), rollout/rollback destinations, operating cost estimates, unassigned operational roles, and reviewer access guide.
  - Release eligibility: `releaseEligible: false` strictly preserved pending owner release signing credentials (`OWNER-SIGNING-KEYS`), physical hardware evidence (`DEF-V2-011`), external vault audit (`DEF-V2-004`), live AI provider authorization (`DEF-V2-008`), live human research (`DEF-V2-013`), and explicit owner launch authorization (`OWNER-RELEASE-AUTH`).
- Contributor/date: Antigravity agent, 2026-11-10.
- Base revision/branch: `bf7a201f89508f267eda07d36c2eb32a62ac36cf`, `codex/free-core-preview`.
- Hard prerequisites: Phase **100** ([phase-100.md](phase-100.md)).
- Owner Scheduling Authorization: The owner explicitly authorized Phase 101 local builds, artifact inspection, operational rehearsals, and release-package preparation before Phase 100 final acceptance ([ADR 0101](../decisions/0101-version-2-release-candidate-and-operational-preparation.md)). Standing push authorized under ADR 0074. No unverified production publication, store upload, live provider calls, or deployment claimed.

---

## Result

### Implementation and Verifications Delivered

1. **DEF-V2-013 Canonical Register Reconciliation**:
   - Registered `DEF-V2-013` (*Live consenting human participant usability evaluation remains open*) into canonical register `docs/roadmap/v2/function-register.json`.
   - Re-ran `pnpm validate:function-register`: validated 109 actions, 13 defects, 22 feature families.
   - Preserved Phase 99 persona simulations as synthetic evidence; five-person consenting human review remains open.

2. **Web / PWA Candidate Build & Smoke Verification**:
   - Built Next.js 15.5.27 production app: fixed unused variables in `apps/web/src/components/AssistantPanel.tsx`; generated 32 static and dynamic routes.
   - Computed SHA-256 hashes for manifest, service worker, offline shell, and brand icons.
   - Ran `node scripts/phase60-web-production-smoke.mjs`: all 18 checks passed (`/privacy`, `/terms`, `/support`, `/account-deletion`, CSP nonce, absence of session cookies on public pages, dev vault harness labeling, query-param flag ignoring).

3. **Android Release Path & Signing Guard Inspection**:
   - Inspected `apps/mobile/android`: targetSdk 36, compileSdk 36, applicationId `com.daynori.app`, versionCode 1, guard present.
   - Ran `node scripts/mobile-android-release-path.mjs prebuild-disposable`: confirmed clean disposable Expo prebuild.
   - Ran `node scripts/mobile-android-release-path.mjs exercise-gradle`: verified `:app:tasks` succeeds without credentials and `:app:assembleRelease` fails closed with explicit error message.
   - Recorded signing status as blocked (`OWNER-SIGNING-KEYS`); debug test artifacts (`app-debug-arm64.apk`, `app-debug-x86_64.apk`) labeled accurately.

4. **Operations & Disaster Recovery Rehearsals (`tests/e2e/phase101-v2-operations-rehearsal.test.ts`)**:
   - `OP-REHEARSAL-01`: Schema migration idempotency and forward-fix invariant verified.
   - `OP-REHEARSAL-02`: Offline mutation outbox persistence, process reload, and reconnect replay with optimistic concurrency (`baseRevision`) verified.
   - `OP-REHEARSAL-03`: Object metadata checksum tracking, quarantine verification to `verified`, and deletion suppression (hard delete from `app.items` leaving 0 rows) verified.
   - `OP-REHEARSAL-04`: Production fail-closed kill switches verified (Vault 403, Rooms 403, Billing 403, AI 403); feature personalization tab collapse verified.
   - `OP-REHEARSAL-05`: Synthetic reviewer access isolation (`reviewer@daynori.test`) verified: report submission 201, operator routes 403, cross-tenant isolation 404/403.

5. **Owner Review Package & Candidate Manifest**:
   - Authored `docs/release/v2-release-candidate-manifest.md` and `artifacts/phase101/candidate-manifest.json` showing enabled (78), unverified (10), and gated (21) feature breakdown.
   - Authored `docs/release/v2-owner-review-package.md` documenting official policy reviews (2026-11-10), rollout/rollback strategy, unapproved operating cost estimates (\$5–\$40/mo low tier), unassigned operational roles, reviewer credentials, and draft release notes.

---

## Acceptance evidence

| Check / Tool | Exact Command | Exit Code | Result Summary |
| :--- | :--- | :--- | :--- |
| **Release Preflight** | `node scripts/release-preflight.mjs --allow-partial-local` | `0` | PASS (20 pass, 0 fail, 13 blocked, 1 unexecuted; releaseEligible=false) |
| **Android Inspect** | `node scripts/mobile-android-release-path.mjs inspect` | `0` | PASS (targetSdk 36, compileSdk 36, guard present) |
| **Android Disposable Prebuild** | `node scripts/mobile-android-release-path.mjs prebuild-disposable` | `0` | PASS (clean disposable prebuild verified) |
| **Android Exercise Gradle** | `node scripts/mobile-android-release-path.mjs exercise-gradle` | `0` | PASS (:app:tasks pass, :app:assembleRelease fail-closed) |
| **Web Production Build** | `pnpm --filter @daynori/web build` | `0` | PASS (32 routes generated) |
| **Web Production Smoke** | `node scripts/phase60-web-production-smoke.mjs` | `0` | PASS (18 checks passed, port 3060) |
| **Local Release Rehearsal** | `node scripts/phase60-local-rehearsal.mjs` | `0` | PASS (15 integration tests passed) |
| **Operations Rehearsals Suite** | `pnpm exec vitest run tests/e2e/phase101-v2-operations-rehearsal.test.ts` | `0` | PASS (5 tests passed in 1.17s) |
| **Candidate Rehearsals Suite** | `pnpm exec vitest run tests/e2e/phase100-v2-candidate-rehearsals.test.ts` | `0` | PASS (8 tests passed in 1.49s) |
| **Function Register Check** | `pnpm validate:function-register` | `0` | PASS (109 actions, 13 defects, 22 families) |
| **Planning Validator** | `pnpm validate:planning` | `0` | PASS (104 phases, 22 requirements) |

---

## Gate-by-Gate Barrier Register

| Gate ID | Area | Status | Missing Evidence | Accountable Role | Next Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`OWNER-SIGNING-KEYS`** | Release | **BLOCKED** | Authorized Android release keystore & credentials | Release Engineer / Owner | Supply `DAYNORI_RELEASE_STORE_*` |
| **`OWNER-RELEASE-AUTH`** | Release | **BLOCKED** | Owner launch approval and track/destination choice | Project Owner | Review package and authorize track |
| **`DEF-V2-004`** | Security | **BLOCKED** | Independent external audit of vault crypto | Security / Vault Lead | Commission external audit |
| **`DEF-V2-008`** | AI / Biometrics | **BLOCKED** | Live LLM provider authorization & biometric Keystore | AI Operations Lead | Authorize synthetic provider test |
| **`DEF-V2-011`** | Hardware | **BLOCKED** | Physical ARM64 device startup & TalkBack profiling | QA / Accessibility Lead | Run test suite on physical Android hardware |
| **`DEF-V2-013`** | Usability | **BLOCKED** | Live sessions with $\ge 5$ consenting human users | UX Researcher / Owner | Execute 5-participant research protocol |
| **`DEF-V2-001`** | Auth | **OPEN** | Production Supabase/OAuth IdP configuration | Operations Lead | Provision production auth tenant |
| **`DEF-V2-002`** | Push | **OPEN** | Native FCM/APNs push provider credentials | Mobile Lead | Configure Firebase Cloud Messaging |
| **`DEF-V2-005`** | Integration | **OPEN** | Google Cloud OAuth production verification | Product Lead | Submit OAuth consent screen to Google |
| **`DEF-V2-006`** | Moderation | **OPEN** | Staffed moderation officer assignment | Moderation Officer | Staff moderation queue before rooms launch |
| **`DEF-V2-007`** | Billing | **OPEN** | Play Console merchant setup & commercial pricing | Financial Officer | Complete Google Play merchant registration |

---

## Remaining owner decisions

1. **Owner Review of Package**: Review [`docs/release/v2-owner-review-package.md`](../release/v2-owner-review-package.md).
2. **Release Track Decision**: Select target track in Google Play Console (Internal Testing Track vs Closed Testing Track).
3. **Release Keystore Provisioning**: Provide release keystore file and credentials outside of Git.
4. **Live Human Usability Sessions**: Authorize and conduct live user research sessions to satisfy `DEF-V2-013`.
5. **Physical Android Hardware Access**: Execute physical ARM64 device testing with TalkBack to satisfy `DEF-V2-011`.
6. **Operating Budget Approval**: Formally authorize hosting, database, and email provider tiers.

---

## Stop condition

Phase 101 is complete and marked `blocked` in `docs/roadmap/progress.json`. Phase 102 remains unstarted until owner authorization.
