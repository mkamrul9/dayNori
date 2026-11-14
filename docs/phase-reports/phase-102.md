# Phase 102: Authorized Version 2 publication and live verification

## Identity and scope

- Phase: [102 — Authorized Version 2 publication and live verification](../roadmap/phases/102-authorized-version-2-publication-and-live-verification.md).
- Status: **blocked** — Local launch preparation, candidate package rebuild (`2.0.0-rc2`), smallest viable release proposal (Bounded Web/PWA Beta), read-only evidence reconciliation, and operational rehearsals delivered. Publication, store submission, beta cohort invitations, production deployment, paid infrastructure spending, and live provider calls remain strictly blocked pending explicit owner authorization.
  - Smallest viable release proposal: evaluated and proposed **Bounded Web/PWA Beta** (78 verified core actions) as an immediate release candidate decoupled from Android signing keys and physical TalkBack dependencies, while keeping high-risk modules fail-closed.
  - Decoupled scope architecture:
    - **Track A (Smallest Viable Web Beta)**: 78 verified core actions enabled; 31 gated actions fail-closed (Vault, Rooms, AI, Billing). Applicable gates: `OWNER-RELEASE-AUTH`, `DEF-V2-001`, `DEF-V2-013`.
    - **Track B (Independent Android Track)**: Google Play Internal Testing target; kept visible on its own track without blocking web beta. Applicable gates: `OWNER-SIGNING-KEYS`, `DEF-V2-011`.
    - **Track C (Full Version 2 Scope)**: 109 total actions. Gated on external vault audit (`DEF-V2-004`), staffed rooms moderation (`DEF-V2-006`), live AI provider budget (`DEF-V2-008`), Play billing (`DEF-V2-007`), native push (`DEF-V2-002`), and Drive sync (`DEF-V2-005`).
  - Distributable artifact packaging:
    - **Active Candidate**: packaged complete deployable web application bundle from clean candidate commit `5073928` into `artifacts/release/daynori-web-v2.0.0-rc2.tar.gz` (size: 1,824,687 bytes; SHA-256: `6a5b1284ae091be85afa5029e03031a53e2478c47aafb3b963e930fdc8357b3f`, `BUILD_ID`: `yRuRLPiYS9_7enP16RawT`), clearly distinguished from individual PWA asset hashes (`manifest.json`, `sw.js`, `offline-shell.html`, `offline-shell.js`, brand icons).
    - **Historical Predecessor Baseline**: `artifacts/release/daynori-web-v2.0.0-rc1.tar.gz` (size: 1,823,845 bytes; SHA-256: `663cc566011eecf6c78e1bfc99ca7e1ed6defb3c92ea59b6663c46d031801f5c`, commit `5b5c4f8`).
  - Proposed Phase 103 review window handoff: attached a 14-calendar-day post-release review window ($T+0$ to $T+14$) with unassigned Review Lead and privacy-preserving metrics (aggregate uptime, support category tallies, anonymous crash hashes, mutation latency percentiles, tour completion counts, and infrastructure bills). Observations remain pending; Phase 103 remains `planned`.
  - Rehearsal verification: 9 rehearsal scenarios verified in [`tests/e2e/phase102-v2-publication-rehearsal.test.ts`](../../tests/e2e/phase102-v2-publication-rehearsal.test.ts) (9/9 passed in 3.02s).
  - Remaining owner decisions: assembled 9-item concrete approval checklist in [`docs/release/v2-authorized-publication-record.md`](../release/v2-authorized-publication-record.md).
- Contributor/date: Antigravity agent, 2026-11-14 (rebuilt and verified candidate 2.0.0-rc2).
- Base revision/branch: `5073928eb65e33ebccb92e9d0b168f6b030b191c`, `codex/free-core-preview`.
- Hard prerequisites: Phase **101** ([phase-101.md](phase-101.md)).
- Owner Scheduling Authorization: The owner explicitly authorized returning to Phase 102 to rebuild and hash the candidate artifact from clean commit `5073928`, verify hosted preview, production auth redirects, sync, support, rollback, and usability sessions, while keeping all incomplete modules fail-closed and preparing the exact owner decision package ([ADR 0102](../decisions/0102-authorized-version-2-publication-and-live-verification.md)). Standing push authorized under ADR 0074. No unverified production publication, store upload, live provider calls, or deployment claimed.

---

## Result

### Implementation and Verifications Delivered

1. **Smallest Viable Release Proposal (Bounded Web/PWA Beta)**:
   - Formally evaluated a Bounded Web/PWA Beta as the smallest viable initial release, decoupled from Android native requirements and high-risk modules.
   - Enabled scope covers **78 verified core actions**: personal notes (rich text AST, revisions), everyday tasks (priorities, deadlines, keyboard reorder), daily routines (timezone-aware scheduling, occurrences), agenda calendar, guided tours (19 chapters), offline-first SQLite/web storage sync, local attachments, and in-app support feedback.
   - High-risk modules remain strictly fail-closed (403 / UI disabled): Vault (`DEF-V2-004`), Rooms/Chat (`DEF-V2-006`), Live AI Streaming (`DEF-V2-008`), Play Purchases (`DEF-V2-007`).
   - Identified the exact 3 gates applicable to this scope:
     1. `OWNER-RELEASE-AUTH`: Owner launch approval of candidate revision and web target domain.
     2. `DEF-V2-001`: Production Supabase identity provider configuration and redirect URLs.
     3. `DEF-V2-013`: 5 consenting human usability participants ($\ge 4$ unassisted) — can be conducted on the invited 20–50 tester beta cohort.

2. **Decoupled Architecture & Independent Android Track**:
   - The native Android release track is maintained and tracked independently:
     - Blocked gates: `OWNER-SIGNING-KEYS` (release keystore) and `DEF-V2-011` (physical ARM64 TalkBack screen-reader latency profiling).
     - Does **not** block the web beta from launching once approved, while remaining visible so it does not drop off the radar.
   - Full Version 2 gates (`DEF-V2-004`, `DEF-V2-006`, `DEF-V2-008`, `DEF-V2-007`, `DEF-V2-002`, `DEF-V2-005`) remain open for their respective scopes.

3. **Distributable Web Release Artifact Hash vs Individual Asset Hashes**:
   - **Active Candidate Release Artifact (2.0.0-rc2)**: Packaged complete deployable Next.js 15.5.27 production build (`.next`, `public`, `package.json`, `next.config.mjs`) from clean candidate commit `5073928` into `artifacts/release/daynori-web-v2.0.0-rc2.tar.gz` (size: 1,824,687 bytes; SHA-256: `6a5b1284ae091be85afa5029e03031a53e2478c47aafb3b963e930fdc8357b3f`, `BUILD_ID`: `yRuRLPiYS9_7enP16RawT`). Ignored from git via `.gitignore` while preserving immutable cryptographic digests in release records.
   - **Historical Predecessor Baseline (2.0.0-rc1)**: Packaged from commit `5b5c4f8` into `artifacts/release/daynori-web-v2.0.0-rc1.tar.gz` (size: 1,823,845 bytes; SHA-256: `663cc566011eecf6c78e1bfc99ca7e1ed6defb3c92ea59b6663c46d031801f5c`, `BUILD_ID`: `82QG95zkVDUHchcNCcupu`).
   - **Individual PWA Asset Hashes**: Reconciled exact SHA-256 digests for individual client files:
     - `manifest.json`: `417faac1bd5c0d083657a7a69c645a2387c797e1ac60500f462d9db3d280cf40`
     - `sw.js`: `6e243130bed7d29e51c330a378380805f87539798692abe5c4f8127bb1f70cb3`
     - `offline-shell.html`: `1b0bf5f65c8d7330d0560fe41acc73a6a9806e9b7aff5cb60daacfc0fbd009cc`
     - `offline-shell.js`: `69649cdab12d593dc7a9fed5607aba0a22b9e5336e855d6117a9fd0ce0462e4f`
     - `brand/icon-192.png`: `eab6433abbca70b7392ead34a499c1d901bc48fe4e849bfff9ee43b66d6eee64`
     - `brand/icon-512.png`: `dc0ebf905510c9cae68046262c198a76d11fa010bcab53e3c1745bb8467b377e`
     - `brand/icon-maskable-512.png`: `69d0b2d8a9438f3262692ba76aa64a9e547d5d4aab718d6450b6395f5f868835`

4. **Rollout Limits, Budget, and Rollback Procedures**:
   - Proposed hosting: Cloudflare Pages / Vercel Pro with staging on `preview.daynori.com` and production on `app.daynori.com` `[UNDECIDED / PENDING OWNER APPROVAL]`.
   - Cohort size: 20 to 50 invited consenting testers.
   - Monthly operating budget envelope: \$5–\$40/month low tier `[UNDECIDED / PENDING OWNER APPROVAL]`.
   - Permitted synthetic checks: scoped health probes (`/health`, `/v1/status`), CSP nonce header checks, and single synthetic probe account note create, outbox replay, and soft delete. Real user data strictly prohibited.
   - Rollback destination: instant DNS cutover back to preview deploy or static maintenance fallback shell (`offline-shell.html`). Additive database schema enables instant stateless rollbacks without down-migrations.
   - Rollback triggers: sustained p95 latency $>500$ms for 5 min, 5xx server error rate $>1\%$, unhandled data corruption exception, or breach of multi-tenant isolation.

5. **Phase 103 Post-Release Review Window Handoff**:
   - Attached proposed **14-calendar-day review window** ($T+0$ to $T+14$) with unassigned Review Lead and end date (Launch Day $+14$ days).
   - Specified privacy-preserving evaluation dimensions:
     - Reliability & availability: aggregate HTTP 2xx/4xx/5xx status ratios; zero content parsing.
     - Support triage: ingested feedback receipts via `/v1/operator/feedback/reports` with category tallies.
     - Crash telemetry: anonymized stack signatures and synthetic crash hashes without PII.
     - Mutation latency: server-side p50/p95/p99 request timings on core organizer endpoints.
     - Tour friction: Everyday guided tour chapter completion counts without user tracking.
     - Operating cost: edge compute and database resource bills compared to budget envelope.
   - Actual review observations remain strictly **pending** until the approved release runs.
   - Phase 103 status remains **`planned`** in `docs/roadmap/progress.json`; no autonomous monitoring or follow-up code is implemented.

6. **Publication Rehearsals Verification (`tests/e2e/phase102-v2-publication-rehearsal.test.ts`)**:
   - All 9 publication rehearsals passed cleanly (9/9 passed in 3.02s):
     - `PUB-REHEARSAL-01`: Synthetic account login, session validation, and multi-tenant isolation.
     - `PUB-REHEARSAL-02`: Scoped core organizer durable save, cold reopen integrity, and offline outbox sync with optimistic concurrency conflict detection (`baseRevision`).
     - `PUB-REHEARSAL-03`: Customer support feedback ingestion (`POST /v1/workspaces/:workspaceId/feedback/reports`), receipt generation, operator triage access, internal note creation, and status progression to `triaged`.
     - `PUB-REHEARSAL-04`: Privacy lifecycle, cryptographic reauthentication proof verification, account deletion request/confirm, and tombstone suppression (0 accessible rows; no accidental resurrection).
     - `PUB-REHEARSAL-05`: Production fail-closed kill switches (Vault 403, Rooms 403, Billing 403, AI 403), forward-fix schema property (additive migrations), and dynamic UI navigation collapse.
     - `PUB-REHEARSAL-06`: Synthetic reviewer access isolation (`reviewer@daynori.test`): access to core features permitted; operator endpoints and restricted modules strictly forbidden (403).
     - `PUB-REHEARSAL-07`: Publication review record reconciliation, smallest viable release proposal verification, distributable archive hash verification (`daynori-web-v2.0.0-rc2.tar.gz`), barrier register reconciliation, and Phase 103 review window handoff verification.
     - `PUB-REHEARSAL-08`: Production authentication redirect rules, whitelisted OAuth redirect URLs (`https://app.daynori.com/auth/callback` & `https://preview.daynori.com/auth/callback`), and untrusted open-redirect rejection.
     - `PUB-REHEARSAL-09`: Usability session protocol execution and human gate boundary verification (`DEF-V2-013` recorded as fail-closed pending invited beta cohort participants).

7. **Publication Hold Pending Explicit Owner Authorization**:
   - Phase 102 status recorded as **`blocked`** in `docs/roadmap/progress.json`.
   - Assembled the complete 9-item Owner Decision Package in `docs/release/v2-authorized-publication-record.md`.
   - Work stops here. No external deployment, store submission, tester invitations, or spending occurs without separate owner approval.

---

## Acceptance evidence

| Check / Tool | Exact Command | Exit Code | Result Summary |
| :--- | :--- | :--- | :--- |
| **Publication Rehearsal Suite** | `pnpm exec vitest run tests/e2e/phase102-v2-publication-rehearsal.test.ts` | `0` | PASS (9 tests passed in 3.02s) |
| **Operations Rehearsal Suite** | `pnpm exec vitest run tests/e2e/phase101-v2-operations-rehearsal.test.ts` | `0` | PASS (5 tests passed in 980ms) |
| **Candidate Rehearsals Suite** | `pnpm exec vitest run tests/e2e/phase100-v2-candidate-rehearsals.test.ts` | `0` | PASS (8 tests passed in 1.45s) |
| **Web Production Smoke** | `node scripts/phase60-web-production-smoke.mjs` | `0` | PASS (18 checks passed, port 3060) |
| **Android Inspect** | `node scripts/mobile-android-release-path.mjs inspect` | `0` | PASS (targetSdk 36, compileSdk 36, guard present) |
| **Android Exercise Gradle** | `node scripts/mobile-android-release-path.mjs exercise-gradle` | `0` | PASS (:app:tasks pass, :app:assembleRelease fail-closed) |
| **Release Preflight** | `node scripts/release-preflight.mjs --allow-partial-local` | `0` | PASS (20 pass, 0 fail, 13 blocked, 1 unexecuted; releaseEligible=false) |
| **Function Register Check** | `pnpm validate:function-register` | `0` | PASS (109 actions, 13 defects, 22 families) |
| **Planning Validator** | `node scripts/validate-planning.mjs` | `0` | PASS (110 phases, 22 requirements, 481 markdown files) |
| **Secret Scan** | `pnpm audit:secrets` | `0` | PASS (checked 18,390+ files without unapproved secrets) |

---

## Gate-by-Gate Barrier Register (Grouped by Track)

### Track A: Bounded Web/PWA Beta Release Scope (Smallest Viable Release)

| Gate ID | Area | Status | Missing Evidence | Accountable Role | Next Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`OWNER-RELEASE-AUTH`** | Release | **BLOCKED** | Owner launch approval of candidate revision, distributable archive, and web target domains | Project Owner | Review publication record and authorize rollout |
| **`DEF-V2-001`** | Auth | **OPEN** | Production Supabase / Google OAuth identity provider configuration for web domain | Operations Lead | Provision production Supabase project and set allowed redirect URLs |
| **`DEF-V2-013`** | Usability | **BLOCKED** | Live sessions with $\ge 5$ consenting human users ($\ge 4$ unassisted) | UX Researcher / Owner | Execute 5-participant research protocol on invited web beta cohort |

### Track B: Dedicated Android Release Track (Independent Hardware Track)

| Gate ID | Area | Status | Missing Evidence | Accountable Role | Next Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`OWNER-SIGNING-KEYS`** | Release | **BLOCKED** | Authorized Android release keystore & credentials | Release Engineer / Owner | Securely provision `DAYNORI_RELEASE_STORE_*` outside Git |
| **`DEF-V2-011`** | Hardware | **BLOCKED** | Physical ARM64 device startup & TalkBack latency profiling | QA / Accessibility Lead | Run manual checklist on physical Android phone |

### Track C: Full Version 2 Gated Features (Future Public Scope)

| Gate ID | Area | Status | Missing Evidence | Accountable Role | Next Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`DEF-V2-004`** | Security | **BLOCKED** | Independent qualified security review of vault cryptography | Security & Vault Lead | Commission external cryptographic review before enabling Vault |
| **`DEF-V2-008`** | AI / Biometrics | **BLOCKED** | Live LLM provider authorization & biometric Keystore | AI Operations Lead | Authorize synthetic provider testing and token budget before AI streaming |
| **`DEF-V2-002`** | Push | **OPEN** | Native FCM / APNs push notification provider credentials | Mobile Lead | Configure Firebase Cloud Messaging in Google Cloud |
| **`DEF-V2-005`** | Integration | **OPEN** | Google Cloud OAuth production verification for Drive | Product Lead | Submit OAuth verification and consent screen to Google |
| **`DEF-V2-006`** | Moderation | **OPEN** | Staffed moderation officer assignment for rooms/chat | Moderation Officer | Staff moderation queue before rooms launch |
| **`DEF-V2-007`** | Billing | **OPEN** | Play Console merchant setup & commercial pricing | Financial Officer | Complete Google Play merchant registration before in-app purchases |

---

## Remaining owner decisions

1. **Release Candidate Approval**: Formally approve release candidate `2.0.0-rc2` at commit `5073928eb65e33ebccb92e9d0b168f6b030b191c`.
2. **Distributable Web Archive**: Approve distributable package `artifacts/release/daynori-web-v2.0.0-rc2.tar.gz` (SHA-256 `6a5b1284ae091be85afa5029e03031a53e2478c47aafb3b963e930fdc8357b3f`, size: 1,824,687 bytes).
3. **Smallest Viable Release Scope**: Authorize proposed Bounded Web/PWA Beta scope (78 core actions enabled; 31 gated actions fail-closed for Vault, Rooms, AI, Billing).
4. **Web Target Destinations**: Authorize staging (`preview.daynori.com`), production domain (`app.daynori.com`), and edge hosting provider (Cloudflare Pages / Vercel Pro).
5. **Identity Provider Provisioning**: Authorize production Supabase project linking with redirect URLs (`https://app.daynori.com`).
6. **Testing Cohort**: Authorize invitation of 20 to 50 consenting beta testers for usability research (`DEF-V2-013`).
7. **Monthly Operating Budget**: Authorize monthly operating expenditure envelope of \$5–\$40/month.
8. **Rollback Destination & Triggers**: Authorize rollback triggers (latency $>500$ms, 5xx $>1\%$, data corruption) and cutover to static offline fallback shell.
9. **Phase 103 Review Window**: Authorize the 14-calendar-day review window and privacy-preserving metrics framework.

---

## Stop condition

Phase 102 operational preparation, smallest viable release proposal, review records, and local verification are complete. As instructed, work stops here. Phase 102 remains blocked until explicit owner authorization is provided. Phase 103 remains planned and unstarted.
