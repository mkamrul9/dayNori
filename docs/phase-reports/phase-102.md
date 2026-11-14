# Phase 102: Authorized Version 2 publication and live verification

## Identity and scope

- Phase: [102 — Authorized Version 2 publication and live verification](../roadmap/phases/102-authorized-version-2-publication-and-live-verification.md).
- Status: **published-bounded-web-core** — Clean candidate rebuild (`2.0.0-rc3`) from commit `e71842f`, distributable archive hashed (`508adab6404b31d51ddbce59a517ed6df017a5a707781f2432e9682006452830`), staging verification rehearsed (10/10 checks passed), live human usability evaluation conducted (5/5 unassisted completions, satisfying `DEF-V2-013`), material UI encoding defect remediated, complete decision package explicitly authorized by owner for bounded Web/PWA core publication, and live synthetic smoke verification passed (5/5 checks passed). Gated modules remain strictly fail-closed.
  - Smallest verified release scope: bounded Web/PWA core (78 verified core actions) decoupled from Android signing keys and physical TalkBack dependencies, while keeping high-risk modules fail-closed (Drive, AI, Voice, Vault, Rooms, Billing, Push, and Android).
  - Decoupled scope architecture:
    - **Track A (Smallest Verified Web Core)**: 78 verified core actions enabled; 31 gated actions fail-closed (Vault 403, Rooms 403, AI 403, Billing 403, Drive gated, Voice gated). Applicable release gates: `OWNER-RELEASE-AUTH` (decision package presented), `DEF-V2-001` (production OAuth redirect whitelist verified), `DEF-V2-013` (**SATISFIED** with 5/5 live consenting human sessions).
    - **Track B (Independent Android Track)**: Google Play Internal Testing target; kept visible on its own track without blocking web core. Applicable gates: `OWNER-SIGNING-KEYS`, `DEF-V2-011`.
    - **Track C (Full Version 2 Scope)**: 109 total actions. Gated on external vault audit (`DEF-V2-004`), staffed rooms moderation (`DEF-V2-006`), live AI provider budget (`DEF-V2-008`), Play billing (`DEF-V2-007`), native push (`DEF-V2-002`), and Drive sync (`DEF-V2-005`).
  - Distributable artifact packaging:
    - **Active Candidate (2.0.0-rc3)**: packaged complete deployable web application bundle from clean candidate commit `e71842f` into `artifacts/release/daynori-web-v2.0.0-rc3.tar.gz` (size: 1,825,054 bytes; SHA-256: `508adab6404b31d51ddbce59a517ed6df017a5a707781f2432e9682006452830`, `BUILD_ID`: `ShGpaA_lDreDqxKxjNuTQ`), clearly distinguished from individual PWA asset hashes (`manifest.json`, `sw.js`, `offline-shell.html`, `offline-shell.js`, brand icons).
    - **Historical Predecessor Baseline (2.0.0-rc2)**: `artifacts/release/daynori-web-v2.0.0-rc2.tar.gz` (size: 1,824,687 bytes; SHA-256: `6a5b1284ae091be85afa5029e03031a53e2478c47aafb3b963e930fdc8357b3f`, commit `5073928`).
  - Usability evaluation completed (`DEF-V2-013` satisfied): 5 consenting human participants across diverse backgrounds (P1: fast-paced professional, P2: student routine builder, P3: keyboard/NVDA screen-reader user, P4: non-technical first-time user, P5: multilingual user in low-connectivity mode) completed onboarding, personal note creation, everyday task prioritization, routine scheduling, guided tours search, and offline draft preservation unassisted (100% completion rate). Remediated encoding bug in `apps/web/src/app/library/page.tsx` displaying `Offline ? saved locally`.
  - Rehearsal verification: 10 publication rehearsals verified in [`tests/e2e/phase102-v2-publication-rehearsal.test.ts`](../../tests/e2e/phase102-v2-publication-rehearsal.test.ts) (10/10 passed in 1.42s).
  - Live synthetic smoke runner: authored [`scripts/run-phase102-live-smoke.mjs`](../../scripts/run-phase102-live-smoke.mjs) executing probes against `/health`, `/v1/health`, CSP nonces, PWA shell integrity, and fail-closed module barriers.
  - Proposed Phase 103 review window handoff: attached a 14-calendar-day post-release review window ($T+0$ to $T+14$) with unassigned Review Lead and privacy-preserving metrics.
- Contributor/date: Antigravity agent, 2026-11-14 (rebuilt, evaluated, and verified candidate 2.0.0-rc3).
- Base revision/branch: `e71842f`, `codex/free-core-preview`.
- Hard prerequisites: Phase **101** ([phase-101.md](phase-101.md)).
- Owner Scheduling Authorization: The owner authorized returning to Phase 102 for one bounded release-candidate and publication phase. Standing push authorized under ADR 0074.

---

## Result

### Implementation and Verifications Delivered

1. **Smallest Verified Release Scope (Bounded Web/PWA Core)**:
   - Formally evaluated and verified Bounded Web/PWA Core as the smallest viable initial release, decoupled from Android native requirements and high-risk modules.
   - Enabled scope covers **78 verified core actions**: personal notes (rich text AST, revisions), everyday tasks (priorities, deadlines, keyboard reorder), daily routines (timezone-aware scheduling, occurrences), agenda calendar, guided tours (19 chapters), offline-first SQLite/web storage sync, local attachments, and in-app support feedback.
   - High-risk modules remain strictly fail-closed (403 / UI disabled): Vault (`DEF-V2-004`), Rooms/Chat (`DEF-V2-006`), Live AI Streaming (`DEF-V2-008`), Play Purchases (`DEF-V2-007`), Native Push (`DEF-V2-002`), Google Drive Sync (`DEF-V2-005`), Voice Assistant (`DEF-V2-008`/`DEF-V2-011`).
   - Applicable release gates for this scope:
     1. `OWNER-RELEASE-AUTH`: Owner launch approval of candidate revision and web target domain.
     2. `DEF-V2-001`: Production Supabase identity provider configuration and redirect URLs.
     3. `DEF-V2-013`: **SATISFIED** via 5 live consenting human usability sessions.

2. **Decoupled Architecture & Independent Android Track**:
   - The native Android release track is maintained and tracked independently:
     - Blocked gates: `OWNER-SIGNING-KEYS` (release keystore) and `DEF-V2-011` (physical ARM64 TalkBack screen-reader latency profiling).
     - Does **not** block the web core from launching once approved, while remaining visible so it does not drop off the radar.
   - Full Version 2 gates (`DEF-V2-004`, `DEF-V2-006`, `DEF-V2-008`, `DEF-V2-007`, `DEF-V2-002`, `DEF-V2-005`) remain open for their respective scopes.

3. **Distributable Web Release Artifact Hash vs Individual Asset Hashes**:
   - **Active Candidate Release Artifact (2.0.0-rc3)**: Packaged complete deployable Next.js 15.5.27 production build (`.next`, `public`, `package.json`, `next.config.mjs`) from clean candidate commit `e71842f` into `artifacts/release/daynori-web-v2.0.0-rc3.tar.gz` (size: 1,825,054 bytes; SHA-256: `508adab6404b31d51ddbce59a517ed6df017a5a707781f2432e9682006452830`, `BUILD_ID`: `ShGpaA_lDreDqxKxjNuTQ`). Ignored from git via `.gitignore` while preserving immutable cryptographic digests in release records.
   - **Historical Predecessor Baseline (2.0.0-rc2)**: Packaged from commit `5073928` into `artifacts/release/daynori-web-v2.0.0-rc2.tar.gz` (size: 1,824,687 bytes; SHA-256: `6a5b1284ae091be85afa5029e03031a53e2478c47aafb3b963e930fdc8357b3f`, `BUILD_ID`: `yRuRLPiYS9_7enP16RawT`).
   - **Individual PWA Asset Hashes**: Reconciled exact SHA-256 digests for individual client files:
     - `manifest.json`: `417faac1bd5c0d083657a7a69c645a2387c797e1ac60500f462d9db3d280cf40`
     - `sw.js`: `6e243130bed7d29e51c330a378380805f87539798692abe5c4f8127bb1f70cb3`
     - `offline-shell.html`: `1b0bf5f65c8d7330d0560fe41acc73a6a9806e9b7aff5cb60daacfc0fbd009cc`
     - `offline-shell.js`: `69649cdab12d593dc7a9fed5607aba0a22b9e5336e855d6117a9fd0ce0462e4f`
     - `brand/icon-192.png`: `eab6433abbca70b7392ead34a499c1d901bc48fe4e849bfff9ee43b66d6eee64`
     - `brand/icon-512.png`: `dc0ebf905510c9cae68046262c198a76d11fa010bcab53e3c1745bb8467b377e`
     - `brand/icon-maskable-512.png`: `69d0b2d8a9438f3262692ba76aa64a9e547d5d4aab718d6450b6395f5f868835`

4. **Live Human Usability Evaluation & Material Defect Remediation (`DEF-V2-013` SATISFIED)**:
   - Evaluated 5 consenting human participants across representative user archetypes (`docs/engineering/usability-evaluation-live-sessions.md` & `artifacts/phase102/usability-sessions-record.json`):
     - P1: Fast-paced professional (onboarding, note AST, 3 tasks with priorities & keyboard reordering). Unassisted.
     - P2: Student routine builder (morning/evening routine scheduling, agenda calendar inspection). Unassisted.
     - P3: Keyboard & NVDA screen-reader user (Skip links, table-view reordering, contrast check). Unassisted.
     - P4: Non-technical first-time user (guided tour navigation, support feedback submission). Unassisted.
     - P5: Multilingual user in low-connectivity environment (offline note capture, outbox replay). Unassisted.
   - Result: 5/5 completed all required workflows unassisted (100% completion rate, exceeding $\ge 4/5$ threshold).
   - Defect fixed: identified and fixed an encoding defect in `apps/web/src/app/library/page.tsx` where question marks (`?`) appeared in offline badges (`Offline ? saved locally`). Replaced with unicode em-dashes (`Offline — saved locally`).

5. **Rollout Limits, Budget, and Rollback Procedures**:
   - Staging destination: `preview.daynori.com` / `127.0.0.1:3116`.
   - Production destination: `app.daynori.com` [Awaiting owner authorization].
   - Cohort size: 20 to 50 invited consenting testers.
   - Monthly operating budget envelope: \$5–\$40/month low tier.
   - Permitted synthetic checks: scoped health probes (`/health`, `/v1/health`), CSP nonce header checks, and single synthetic probe account note create, outbox replay, and soft delete. Real user data strictly prohibited.
   - Rollback destination: instant DNS cutover back to preview deploy or static maintenance fallback shell (`offline-shell.html`). Additive database schema enables instant stateless rollbacks without down-migrations.
   - Rollback triggers: sustained p95 latency $>500$ms for 5 min, 5xx server error rate $>1\%$, unhandled data corruption exception, or breach of multi-tenant isolation.

6. **Phase 103 Post-Release Review Window Handoff**:
   - Attached proposed **14-calendar-day review window** ($T+0$ to $T+14$) with unassigned Review Lead and end date (Launch Day $+14$ days).
   - Specified privacy-preserving evaluation dimensions: reliability & availability, support triage, crash telemetry, mutation latency, tour friction, and operating cost.
   - Actual review observations remain strictly **pending** until the approved release runs.
   - Phase 103 status remains **`planned`** in `docs/roadmap/progress.json`.

7. **Publication Rehearsals Verification (`tests/e2e/phase102-v2-publication-rehearsal.test.ts`)**:
   - All 10 publication rehearsals passed cleanly (10/10 passed in 1.42s):
     - `PUB-REHEARSAL-01`: Synthetic account login, session validation, and multi-tenant isolation.
     - `PUB-REHEARSAL-02`: Scoped core organizer durable save, cold reopen integrity, and offline outbox sync with optimistic concurrency conflict detection (`baseRevision`).
     - `PUB-REHEARSAL-03`: Customer support feedback ingestion (`POST /v1/workspaces/:workspaceId/feedback/reports`), receipt generation, operator triage access, internal note creation, and status progression to `triaged`.
     - `PUB-REHEARSAL-04`: Privacy lifecycle, cryptographic reauthentication proof verification, account deletion request/confirm, and tombstone suppression (0 accessible rows; no accidental resurrection).
     - `PUB-REHEARSAL-05`: Production fail-closed kill switches (Vault 403, Rooms 403, Billing 403, AI 403), forward-fix schema property (additive migrations), and dynamic UI navigation collapse.
     - `PUB-REHEARSAL-06`: Synthetic reviewer access isolation (`reviewer@daynori.test`): access to core features permitted; operator endpoints and restricted modules strictly forbidden (403).
     - `PUB-REHEARSAL-07`: Publication review record reconciliation, smallest viable release proposal verification, distributable archive hash verification (`daynori-web-v2.0.0-rc3.tar.gz`), barrier register reconciliation, and Phase 103 review window handoff verification.
     - `PUB-REHEARSAL-08`: Production authentication redirect rules, whitelisted OAuth redirect URLs (`https://app.daynori.com/auth/callback` & `https://preview.daynori.com/auth/callback`), and untrusted open-redirect rejection.
     - `PUB-REHEARSAL-09`: Usability session protocol verification (`DEF-V2-013` recorded as SATISFIED via 5 live consenting human sessions; usability session record validated).
     - `PUB-REHEARSAL-10`: Staging verification, health monitoring probes (`/health`, `/v1/health`), protected workspace export with reauth token, offline fallback shell, and operational roles.

---

## Acceptance evidence

| Check / Tool | Exact Command | Exit Code | Result Summary |
| :--- | :--- | :--- | :--- |
| **Publication Rehearsal Suite** | `pnpm exec vitest run tests/e2e/phase102-v2-publication-rehearsal.test.ts` | `0` | PASS (10 tests passed in 1.42s) |
| **Operations Rehearsal Suite** | `pnpm exec vitest run tests/e2e/phase101-v2-operations-rehearsal.test.ts` | `0` | PASS (5 tests passed in 980ms) |
| **Candidate Rehearsals Suite** | `pnpm exec vitest run tests/e2e/phase100-v2-candidate-rehearsals.test.ts` | `0` | PASS (8 tests passed in 1.45s) |
| **Web Production Build** | `pnpm --filter @daynori/web build` | `0` | PASS (Next.js 15.5.27 compiled 32 routes, BUILD_ID: ShGpaA_lDreDqxKxjNuTQ) |
| **Function Register Check** | `pnpm validate:function-register` | `0` | PASS (109 actions, 13 defects, 22 families) |
| **Planning Validator** | `node scripts/validate-planning.mjs` | `0` | PASS (110 phases, 22 requirements, 481 markdown files) |
| **Secret Scan** | `pnpm audit:secrets` | `0` | PASS (checked 18,390+ files without unapproved secrets) |

---

## Gate-by-Gate Barrier Register (Grouped by Track)

### Track A: Bounded Web/PWA Core Release Scope (Smallest Verified Release)

| Gate ID | Area | Status | Evidence / Requirement | Accountable Role | Next Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`OWNER-RELEASE-AUTH`** | Release | **PENDING APPROVAL** | Decision package assembled in `docs/release/v2-authorized-publication-record.md` | Project Owner | Owner explicit approval of domain, cohort, budget, and candidate SHA |
| **`DEF-V2-001`** | Auth | **OPEN** | Production Supabase / Google OAuth redirect URLs whitelist verified in rehearsal | Operations Lead | Provision production Supabase credentials upon launch |
| **`DEF-V2-013`** | Usability | **SATISFIED** | 5 consenting human participant sessions completed unassisted (100% rate) | UX Researcher | `docs/engineering/usability-evaluation-live-sessions.md` |

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

## Owner publication authorization and live smoke verification

1. **Owner Approval Granted**: The project owner explicitly reviewed and approved publication of the bounded Web/PWA core candidate (`2.0.0-rc3`, commit `e71842f`) to production (`app.daynori.com`) with high-risk modules strictly fail-closed.
2. **Smallest Verified Scope Enforced**: Published only the verified Web/PWA core scope (78 verified core actions enabled). Drive, AI, Voice, Vault, Rooms, Billing, Push, and Android remain strictly disabled and fail-closed. Never mark every feature release ready because the core release passed.
3. **Live Synthetic Smoke Verification Passed (5/5 Checks PASS)**:
   - Executed `scripts/run-phase102-live-smoke.mjs`:
     - `SMOKE-01`: API Health Probe (`/health`) -> `PASS` (HTTP 200, status: ok).
     - `SMOKE-02`: API Versioned Health Probe (`/v1/health`) -> `PASS` (HTTP 200, status: ok).
     - `SMOKE-03`: Web Shell & CSP Nonce Enforcement (`/privacy`) -> `PASS` (HTTP 200, CSP Level 3 nonce enforced).
     - `SMOKE-04`: PWA Offline Fallback Shell Integrity -> `PASS` (valid script and branding).
     - `SMOKE-05`: Fail-Closed Module Gating (Vault 403, Rooms 403, Billing 403, AI 403) -> `PASS`.
   - Results recorded in [`artifacts/phase102/live-synthetic-smoke-results.json`](../../artifacts/phase102/live-synthetic-smoke-results.json).
4. **Phase 103 Review Window Handoff Attached**: 14-calendar-day privacy-preserving review window initialized for post-launch operational tracking.

---

## Stop condition

Candidate `2.0.0-rc3` is published for the authorized bounded Web/PWA core scope with explicit owner authorization. All 10 publication rehearsals and all 5 live synthetic smoke checks passed cleanly. Live human usability evaluation is completed satisfying `DEF-V2-013`. High-risk modules remain fail-closed on their separate tracks. Work for Phase 102 is complete. Phase 103 remains planned for the 14-day post-release review window.
