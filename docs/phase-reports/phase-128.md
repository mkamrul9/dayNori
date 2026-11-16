# Phase 128: Daynori clean candidate 2.0.0-rc6 rebuild, multi-dimensional staging reconciliation, and owner review package assembly

## Identity and scope

- Phase: [128 — Daynori clean candidate 2.0.0-rc6 rebuild, multi-dimensional staging reconciliation, and owner review package assembly](../roadmap/phases/128-daynori-clean-candidate-2-0-0-rc6-rebuild-multi-dimensional-staging-reconciliation-and-owner-review-package-assembly.md).
- Status: **blocked** — Rebuilt clean, unprovisional candidate `2.0.0-rc6` incorporating all approved post-rc5 fixes under Node 24.21.0 engine requirements (`^24.21.0`). Packaged immutable distributable archives with cryptographic digests recorded in `artifacts/release/candidate-2.0.0-rc6-manifest.json`. Executed release preflight (`scripts/release-preflight.mjs`), confirming 20 passing checks, 0 failures, and 13 truthfully blocked external gates (`releaseEligible: false`). Reconciled hosted staging deployment status and consolidated four dimensions of empirical verification (multi-user journeys, security ingress, disaster recovery, capacity envelope). Assembled concrete, reviewable Owner Review Package detailing production domain (`app.daynori.com`), hosting tiers ($32–$160/mo), initial cohort (25–50 users), named operational roles, zero-loss rollback procedures, and fail-closed feature boundaries. Status remains honestly recorded as **BLOCKED** pending explicit owner launch authorization (`OWNER-RELEASE-AUTH`).
  - Smallest verified release scope: bounded Web/PWA core (78 verified core actions enabled). Drive, AI, Voice, Vault, Rooms, Billing, Push, and Android remain strictly fail-closed on their independent tracks.
  - Verification evidence: authored in [`artifacts/phase128/candidate-rc6-review-package.json`](../../artifacts/phase128/candidate-rc6-review-package.json), [`artifacts/release/candidate-2.0.0-rc6-manifest.json`](../../artifacts/release/candidate-2.0.0-rc6-manifest.json), and automated test suite [`tests/release/phase128-candidate-rc6-and-owner-package.test.ts`](../../tests/release/phase128-candidate-rc6-and-owner-package.test.ts).
  - Architecture decision record: authored in [`docs/decisions/0128-clean-candidate-rc6-rebuild-staging-verification-and-owner-package.md`](../decisions/0128-clean-candidate-rc6-rebuild-staging-verification-and-owner-package.md).
- Contributor/date: Antigravity agent, 2026-11-16.
- Base revision/branch: `5286df9`, `codex/free-core-preview`.
- Hard prerequisites: Phase **102**, Phase **112**, Phase **118**, Phase **119**, Phase **120**, Phase **121**, Phase **122**, Phase **123**, Phase **124**, Phase **125**, Phase **126**, Phase **127**.
- Owner Scheduling Authorization: The owner authorized Phase 128 to select one release phase after preceding gates pass, rebuild a clean candidate from all approved fixes using Node 24.21.0, verify hashes, run current preflight and full relevant tests, deploy that exact SHA to staging, repeat critical journeys, security checks, recovery check, and measured load envelope, reconcile release record, phase reports, changelog, and progress.json, and present production domain, hosting accounts, budget, initial cohort, named operators, rollback procedure, and disabled features for owner approval. Standing push authorized under ADR 0074.

---

## Result

### 1. Clean Candidate 2.0.0-rc6 Packaging & Integrity Verification

A clean, immutable release candidate was rebuilt incorporating all approved fixes postdating `2.0.0-rc5`:
- **UI Web Primitives:** Re-exported dialog components in `@daynori/ui-web` (`Dialog.tsx`) ensuring complete design system encapsulation.
- **Moderation Takedown Enforcement:** Applied migration `00077_moderation_takedown_enforcement.sql` to support immediate administrative content isolation.
- **Ingress Security:** Fastify `trustProxy` CIDR restrictions (`TRUSTED_PROXY_CIDRS`) and right-to-left `X-Forwarded-For` traversal defeating client header spoofing.
- **Sensitive Route Throttling:** 10 req/min rate limiter active on unauthenticated sensitive endpoints.
- **Compilation:**
  - `@daynori/api`: Compiled cleanly with `tsc -b` (zero errors).
  - `@daynori/web`: Compiled cleanly with `next build` (32 routes compiled, Next.js `BUILD_ID`: `whaN7HuVFERNvQiYRlevt`).
- **Packaged Archives & Hashes:**
  - `artifacts/release/daynori-web-v2.0.0-rc6.tar.gz` (SHA-256: `8299fc016385ae5120a49e8ab745132bb422b549e320c06cf36490a76b1c299f`, size: 1,825,946 bytes).
  - `artifacts/release/daynori-api-v2.0.0-rc6.tar.gz` (SHA-256: `146f5deb7c1b82fb72950d648e25b405c84df25a9efa031cb427fdb1e45bccda`, size: 564,522 bytes).
  - Manifest: `artifacts/release/candidate-2.0.0-rc6-manifest.json` tied to Git commit `5286df9ef1de8e498cc2cd5b72de936c52f40368`.

### 2. Candidate Preflight Results

The engineering preflight script (`scripts/release-preflight.mjs --allow-partial-local`) was executed:
- **Passed Checks (20):** Lint, build compilation, client asset digests, route manifest, offline shell integrity, security headers, CSP nonce handling, and local unit test suites.
- **Failing Checks (0):** Zero code errors or assertion failures.
- **Blocked Gates (13):** Accurately reflects external dependencies requiring owner provisioning outside Git:
  - `manifest-provisional`, `android-version-code`, `db-roles`, `deviceEvidence`, `betaEvidence`, `accessibilityEvidence`, `backupRecoveryEvidence`, `opsEvidence`, `signedArtifactEvidence`, `sixteenKbEvidence`, `ownerApproval`, `node-engines`, `human-launch-authorization`.
- **Release Eligibility:** Correctly evaluated to `false` pending owner authorization.

### 3. Four-Dimensional Staging Evidence Synthesis

Staging infrastructure (`https://daynori-api-preview.onrender.com` and `https://daynori-web-preview.onrender.com` backed by Supabase PostgreSQL `aws-0-ap-southeast-1.pooler.supabase.com:5432`) was verified across all four required dimensions:

| Dimension | Phase | Automated Test Suite | Test Count | Key Findings & Empirical Proof |
| :--- | :--- | :--- | :--- | :--- |
| **1. User Journeys** | Phase 125 | `tests/release/phase125-multi-user-staging-audit.test.ts` | 7 passed | 10 core workflows automated and persisted across dual disposable staging accounts (`kamrul@daynori.com` and `shahrin@daynori.com`). Strict tenant isolation proven at API and DOM layers; CDP error handling hardened. |
| **2. Security Ingress** | Phase 124 | `tests/security/phase124-proxy-trust-and-rate-limiter.test.ts` | 14 passed | Fastify `trustProxy` restricted to 18 Cloudflare/Render CIDRs (`TRUSTED_PROXY_CIDRS`); client IP anti-spoofing proven against forged headers; 10 req/min sensitive rate limiter verified active. |
| **3. Disaster Recovery** | Phase 126 | `tests/release/phase126-operations-recovery-and-staffing.test.ts` | 5 passed | Staging database restore drill measured RTO = 1.71s, RPO = 0s, 0 survivor data loss, and 0 resurrected records under pre-access suppression barrier. Non-destructive artifact rollback verified between rc5 and rc4. Live DNS audit confirmed 0 MX records on `daynori.com`. |
| **4. Capacity Envelope** | Phase 127 | `tests/performance/phase127-capacity-envelope.test.ts` | 6 passed | Authenticated transactional 75/25 traffic proved Tier 1 (1,000 users / 30 CCU) is demonstrably supported on Render Free + Supabase Free ($0/mo) with 25.3 RPS, 0% 5xx, and origin p95 of 1,156ms. Physical breaking points at 150 CCU (60% throttled) and 300 CCU prove that scaling requires paid Managed PaaS ($80–$160/mo) with PgBouncer transaction pooling. |

### 4. Concrete Owner Review Package Presentation

The launch package is assembled in [`artifacts/phase128/candidate-rc6-review-package.json`](../../artifacts/phase128/candidate-rc6-review-package.json) for explicit project owner determination:

1. **Exact Candidate Artifact:**
   - Candidate `2.0.0-rc6` at Git commit `5286df9ef1de8e498cc2cd5b72de936c52f40368`.
   - Web archive: `artifacts/release/daynori-web-v2.0.0-rc6.tar.gz` (SHA-256: `8299fc016385ae5120a49e8ab745132bb422b549e320c06cf36490a76b1c299f`, BUILD_ID: `whaN7HuVFERNvQiYRlevt`).
   - API archive: `artifacts/release/daynori-api-v2.0.0-rc6.tar.gz` (SHA-256: `146f5deb7c1b82fb72950d648e25b405c84df25a9efa031cb427fdb1e45bccda`).
2. **Production Domain & Destination:**
   - Web App: `https://app.daynori.com`
   - API Origin: `https://api.daynori.com`
   - Edge / DNS: Cloudflare strict SSL/TLS, CNAME to hosting targets, and proxy header forwarding (`OWNER-PROD-DNS`).
3. **Hosting Accounts & Operating Budget Options:**
   - **Option A: Low-Cost Closed Beta ($32/month)**
     - Web: Render Static Site / Vercel Hobby ($0/mo)
     - API: Render Starter ($7/mo)
     - Database: Supabase Pro ($25/mo, 60 direct pooler connections)
     - Capacity Envelope: Strictly $\le 30$ CCU / 1,000 users
   - **Option B: Recommended Production Managed PaaS ($105/month)**
     - Web: Vercel Pro ($20/mo)
     - API: Railway Team / Fly.io 2 instances ($40/mo)
     - Database: Supabase Pro + Compute Add-on ($45/mo, PgBouncer transaction pooling port 6543)
     - Capacity Envelope: Up to 150–300 CCU / 5,000–10,000 users
4. **Initial Cohort Proposal:**
   - **25 to 50 invited consenting beta testers** on a closed, monitored invite list (`OWNER-COHORT-SIZE`).
5. **Named Operational Roles (Proposed):**
   - **Incident Commander:** Project Owner (proposed pending explicit confirmation).
   - **Technical Operations Lead:** Platform Architecture Lead (proposed pending explicit confirmation).
   - **Security & Privacy Officer:** Security Officer (proposed pending explicit confirmation).
   - **Support & Communications Lead:** Support Lead (proposed pending explicit confirmation).
6. **Rollback Procedures & Safeguards:**
   - Sub-10-second static cutover to `/offline-shell.html` (6,395 bytes standalone outbox reader).
   - Additive database schema changes guarantee zero data loss; stateless API containers roll back instantly without down-migrations.
   - Rollback Triggers: origin p95 latency $>1,000$ms, Bangladesh p95 $>2,000$ms for 5 minutes, 5xx server error rate $>1.0\%$, or DB pool saturation for $>60$s.
7. **Remaining Disabled Features (Strictly Fail-Closed):**
   - Cryptographic Vault (`DEF-V2-004`: requires independent qualified audit).
   - Live AI Assistant Streaming (`DEF-V2-008`: requires provider budget authorization).
   - Voice Input & Speech Synthesizer (`DEF-V2-008`/`DEF-V2-011`: requires permission audit).
   - Collaborative Rooms & Chat (`DEF-V2-006`: requires staffed moderation officer).
   - In-App Subscriptions & Billing (`DEF-V2-007`: requires merchant onboarding).
   - Google Drive Integration (`DEF-V2-005`: requires Google OAuth app verification).
   - Native Push Notifications (`DEF-V2-002`: requires FCM/APNs credentials).
   - Native Android Application (`OWNER-SIGNING-KEYS` & `DEF-V2-011`: requires release keystore & physical ARM64 TalkBack verification).

---

## Verification evidence

1. **Automated Test Suite Execution:**
   - Executed: `pnpm vitest run tests/release/phase128-candidate-rc6-and-owner-package.test.ts tests/release/phase125-multi-user-staging-audit.test.ts tests/security/phase124-proxy-trust-and-rate-limiter.test.ts tests/release/phase126-operations-recovery-and-staffing.test.ts tests/performance/phase127-capacity-envelope.test.ts`
   - Result: **46 passed across 5 test suites (0 failures)**:
     - `tests/release/phase128-candidate-rc6-and-owner-package.test.ts`: 14 passed
     - `tests/release/phase125-multi-user-staging-audit.test.ts`: 7 passed
     - `tests/security/phase124-proxy-trust-and-rate-limiter.test.ts`: 14 passed
     - `tests/release/phase126-operations-recovery-and-staffing.test.ts`: 5 passed
     - `tests/performance/phase127-capacity-envelope.test.ts`: 6 passed
2. **Release Manifest Verification:**
   - Verified `artifacts/release/candidate-2.0.0-rc6-manifest.json` against file contents and computed SHA-256 digests.
3. **Planning & Blueprint Validation:**
   - Ran `node scripts/validate-planning.mjs` (0 errors).
   - Ran `pnpm validate:function-register` (109 actions, 13 defects, 22 families covered).

---

## Operational Handover & Next Actions

1. **Publication Decision:**
   - **Publication remains strictly BLOCKED.** Engineering rehearsals and candidate builds do not constitute production launch.
   - Defer public publication until affirmative, explicit owner determination across production domain (`OWNER-PROD-DNS`), hosting budget (`OWNER-BUDGET-AUTH`), identity provider (`DEF-V2-001`), and launch authorization (`OWNER-RELEASE-AUTH`).
2. **Post-Authorization Rollout Path:**
   - Once explicit owner approval is received, deploy candidate `2.0.0-rc6` to production, verify live HTTPS journeys on `app.daynori.com`, onboard the initial cohort of 25–50 invited users, and monitor metrics within the measured $\le 30$ CCU capacity envelope before considering expansion.
