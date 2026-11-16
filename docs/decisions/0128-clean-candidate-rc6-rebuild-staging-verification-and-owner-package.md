# ADR 0128: Clean Release Candidate 2.0.0-rc6 Rebuild, Multi-Dimensional Staging Reconciliation & Owner Review Package Assembly

- **Status:** Accepted
- **Date:** 2026-11-16
- **Deciders:** Project Owner, Platform Architecture Lead, Technical Operations Lead
- **Consulted:** Infrastructure Contributors, Security Officer, Quality Engineering Lead
- **Informed:** Core Product Stakeholders

---

## 1. Context and Problem Statement

Following the completion of the five foundational release-evidence gates:
1. **Phase 123:** Release evidence audit, claims reclassification, and dirty-tree inventory.
2. **Phase 124:** Ingress security hardening (`TRUSTED_PROXY_CIDRS`, client IP anti-spoofing, 10 req/min rate limiter).
3. **Phase 125:** Dual-user authenticated staging journeys, tenant isolation proof, and hardened CDP automation.
4. **Phase 126:** Live staging database backup and restore drill (RTO 1.71s, RPO 0s, 0 data loss), artifact rollback verification, DNS mailbox audit, and operational staffing audit.
5. **Phase 127:** Authenticated transactional capacity load testing ($\le 30$ CCU safe envelope, breaking points at 150/300 CCU, Bangladesh latency profiling).

The repository required a clean, unified release phase under `AGENTS.md` to:
- Rebuild a clean, unprovisional release candidate from all approved fixes incorporating Node 24.21.0 engine requirements (`^24.21.0`).
- Cryptographically verify candidate archive digests and manifest records.
- Run the latest engineering preflight (`scripts/release-preflight.mjs`) and execute full regression test suites.
- Reconcile hosted staging deployment status and verify four dimensions of staging evidence:
  1. Real multi-user authenticated journeys and workspace isolation.
  2. Ingress proxy trust and anti-spoofing brute-force throttling.
  3. Disaster recovery (database restore drill and non-destructive artifact rollback).
  4. Measured transactional capacity envelope and pool saturation boundaries.
- Reconcile all release governance documents (`v2-authorized-publication-record.md`, `v2-owner-review-package.md`), phase reports, and planning records.
- Assemble a concrete, reviewable Owner Review Package detailing:
  - Exact production destination (`app.daynori.com` / `api.daynori.com`).
  - Target hosting accounts and monthly operating budgets ($32–$160/mo).
  - Initial invited beta cohort size (25–50 users).
  - Named operational roles (proposed pending explicit owner assignment).
  - Sub-10-second zero-data-loss rollback procedure.
  - Fail-closed boundaries for all unreleased modules.
- Enforce the foundational release rule: **Publication remains strictly blocked until explicit, affirmative project owner authorization.**

---

## 2. Technical Decisions & Invariants

### 2.1 Clean Release Candidate 2.0.0-rc6 Packaging
The clean candidate incorporates all code improvements postdating `2.0.0-rc5`:
- **UI Web Primitives:** Re-exported dialog components in `@daynori/ui-web` (`Dialog.tsx`) ensuring complete design system encapsulation.
- **Moderation Takedown Enforcement:** Applied migration `00077_moderation_takedown_enforcement.sql` to support immediate administrative content isolation.
- **Ingress Security:** Fastify `trustProxy` CIDR restrictions (`TRUSTED_PROXY_CIDRS`) and right-to-left `X-Forwarded-For` traversal defeating client header spoofing.
- **Sensitive Route Throttling:** 10 req/min rate limiter active on unauthenticated sensitive endpoints.
- **Compilation & Bundling:**
  - `@daynori/api`: Compiled cleanly with `tsc -b` (zero errors).
  - `@daynori/web`: Compiled cleanly with `next build` (32 routes compiled, Next.js `BUILD_ID`: `whaN7HuVFERNvQiYRlevt`).
  - Archives packaged via `scripts/package-release-rc6.mjs`:
    - `artifacts/release/daynori-web-v2.0.0-rc6.tar.gz` (SHA-256: `8299fc016385ae5120a49e8ab745132bb422b549e320c06cf36490a76b1c299f`, 1,825,946 bytes).
    - `artifacts/release/daynori-api-v2.0.0-rc6.tar.gz` (SHA-256: `146f5deb7c1b82fb72950d648e25b405c84df25a9efa031cb427fdb1e45bccda`, 564,522 bytes).
  - Verified manifest: `artifacts/release/candidate-2.0.0-rc6-manifest.json` tied to Git commit `5286df9ef1de8e498cc2cd5b72de936c52f40368`.

### 2.2 Preflight Check Truthfulness
The candidate preflight check (`scripts/release-preflight.mjs --allow-partial-local`) confirms:
- **20 Passing Checks:** Lint, build compilation, client asset digests, route manifest, offline shell integrity, security headers, CSP nonce handling, and local unit test suites.
- **0 Failing Checks:** Zero code regressions or assertion failures.
- **13 Honestly Blocked Gates:** External dependencies requiring owner credentials or physical resources remain blocked as designed:
  - `manifest-provisional` (production release manifest requires owner sign-off).
  - `android-version-code` & `signedArtifactEvidence` (release keystore absent outside Git).
  - `deviceEvidence` & `accessibilityEvidence` (physical ARM64 TalkBack testing).
  - `backupRecoveryEvidence` (cloud continuous WAL streaming/PITR on paid database).
  - `opsEvidence` (DNS MX records and automated alerting webhook integration).
  - `ownerApproval` & `human-launch-authorization` (explicit owner launch determination).
- `releaseEligible`: Correctly evaluates to `false`.

### 2.3 Four-Dimensional Staging Evidence Synthesis
1. **User Journeys (Phase 125):** 7/7 automated tests passed. 10 core workflows verified across dual disposable staging accounts (`kamrul@daynori.com` and `shahrin@daynori.com`). Strict tenant isolation proven at API and DOM layers.
2. **Security Ingress (Phase 124):** 14/14 automated tests passed. 18 Cloudflare/Render CIDRs enforced. Forged proxy headers cannot bypass throttling. 10 req/min brute-force limit active.
3. **Disaster Recovery & Operations (Phase 126):** 5/5 automated tests passed. Staging database restore drill measured RTO = 1.71s, RPO = 0s, 0 survivor data loss, and 0 resurrected records. Artifact rollback between rc5 and rc4 proven non-destructive. Live DNS audit confirms 0 MX records on `daynori.com`.
4. **Capacity Envelope (Phase 127):** 6/6 automated tests passed. Authenticated transactional 75/25 traffic proved Tier 1 (1,000 users / 30 CCU) is demonstrably supported on Render Free + Supabase Free ($0/mo) with 25.3 RPS, 0% 5xx, and origin p95 of 1,156ms. Physical breaking points at 150 CCU (60% throttled) and 300 CCU prove that scaling requires paid Managed PaaS ($80–$160/mo) with PgBouncer transaction pooling.

---

## 3. Concrete Owner Review Package

The project owner is presented with the following concrete decision package:

### 3.1 Production Destination
- **Web Client:** `https://app.daynori.com`
- **API Origin:** `https://api.daynori.com`
- **DNS / Edge:** Cloudflare with strict SSL/TLS, CNAME to hosting targets, and strict proxy header forwarding.

### 3.2 Hosting Accounts & Operating Budget Options
- **Option A: Low-Cost Closed Beta ($32/month)**
  - Web: Render Static Site / Vercel Hobby ($0/mo)
  - API: Render Starter ($7/mo)
  - Database: Supabase Pro ($25/mo, 60 direct pooler connections)
  - Envelope: Strictly $\le 30$ CCU / 1,000 users
- **Option B: Recommended Production Managed PaaS ($105/month)**
  - Web: Vercel Pro ($20/mo)
  - API: Railway Team / Fly.io 2 instances ($40/mo)
  - Database: Supabase Pro + Compute Add-on ($45/mo, PgBouncer transaction pooling port 6543)
  - Envelope: Up to 150–300 CCU / 5,000–10,000 users

### 3.3 Initial Cohort Size
- **25 to 50 invited beta users** on a closed, monitored invite list. Expansion occurs only within the measured safe operating envelope.

### 3.4 Named Operational Roles (Proposed)
- **Incident Commander:** Project Owner (proposed pending explicit confirmation).
- **Technical Operations Lead:** Platform Architecture Lead (proposed pending explicit confirmation).
- **Security & Privacy Officer:** Security Officer (proposed pending explicit confirmation).
- **Support & Communications Lead:** Support Lead (proposed pending explicit confirmation).

### 3.5 Rollback Procedures & Safeguards
- **Emergency Static Cutover:** Sub-10-second DNS/CDN failover to `/offline-shell.html` (6,395 bytes standalone outbox reader).
- **Additive Database Migrations:** Schema changes are strictly non-destructive; stateless containers roll back instantly without data loss.
- **Rollback Triggers:**
  - Sustained origin p95 latency $>1,000$ms or Bangladesh end-user p95 $>2,000$ms for 5 consecutive minutes.
  - 5xx server error rate $>1.0\%$ over any 5-minute rolling window.
  - Database connection pool saturation reaching 100% for $>60$ seconds.

### 3.6 Remaining Disabled Features (Strictly Fail-Closed)
- Cryptographic Vault (`DEF-V2-004`: requires independent qualified audit).
- Live AI Assistant Streaming (`DEF-V2-008`: requires provider budget authorization).
- Voice Input & Speech Synthesizer (`DEF-V2-008`/`DEF-V2-011`: requires permission audit).
- Collaborative Rooms & Chat (`DEF-V2-006`: requires staffed moderation officer).
- In-App Subscriptions & Billing (`DEF-V2-007`: requires merchant onboarding).
- Google Drive Integration (`DEF-V2-005`: requires Google OAuth app verification).
- Native Push Notifications (`DEF-V2-002`: requires FCM/APNs credentials).
- Native Android Application (`OWNER-SIGNING-KEYS` & `DEF-V2-011`: requires release keystore & physical ARM64 TalkBack verification).

---

## 4. Consequences and Release Gate Invariants

1. **Clean Packaging Certified:** Candidate `2.0.0-rc6` is fully packaged, hashed, and verified.
2. **Multi-Dimensional Staging Evidence Established:** User journeys, security ingress, disaster recovery, and capacity bounds are backed by empirical test execution.
3. **Publication Strictly Blocked:** Neither local tests, staging rehearsals, nor automated candidate builds constitute public launch approval. Deployment to production occurs only after affirmative project owner sign-off.
