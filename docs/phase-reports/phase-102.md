# Phase 102: Authorized Version 2 publication and live verification

## Identity and scope

- Phase: [102 — Authorized Version 2 publication and live verification](../roadmap/phases/102-authorized-version-2-publication-and-live-verification.md).
- Status: **blocked** — Local launch preparation, read-only evidence reconciliation, and operational rehearsals delivered. Publication, store submission, beta cohort invitations, production deployment, paid infrastructure spending, and live provider calls remain strictly blocked pending explicit owner authorization.
  - Owner publication review record: authored [`docs/release/v2-authorized-publication-record.md`](../release/v2-authorized-publication-record.md) and machine-readable [`artifacts/phase102/publication-review-record.json`](../../artifacts/phase102/publication-review-record.json).
  - Scope separation: bounded personal beta (78 verified core actions) clearly distinguished from full Version 2 (109 actions; vault, rooms, live AI streaming, in-app billing remain gated).
  - Surface readiness recorded independently:
    - Web / PWA: **READY FOR PROVISIONED HOSTING** (build, smoke, PWA manifest, service worker, offline shell, CSP, legal endpoints verified; domain and hosting compute line items unapproved).
    - Android Client: **NOT READY FOR RELEASE PACKAGING** (prebuild and tasks verified, signing guard active; release keystore blocked `OWNER-SIGNING-KEYS`, physical TalkBack blocked `DEF-V2-011`).
  - Barrier register reconciliation: all 11 gates tracked with current evidence, accountable roles, and next concrete actions.
  - Disposable launch rehearsals: 7 rehearsal scenarios executed in [`tests/e2e/phase102-v2-publication-rehearsal.test.ts`](../../tests/e2e/phase102-v2-publication-rehearsal.test.ts) (all 7 passed: login/tenant isolation, durable save/reopen/outbox sync, support feedback ingestion and operator triage, privacy lifecycle and tombstone suppression, fail-closed kill switches and forward-fix rollback, synthetic reviewer isolation, publication record invariants).
  - Explicit owner authorization hold: identified exact candidate, destinations, rollout limits, operating budget, and permitted live checks required before execution.
- Contributor/date: Antigravity agent, 2026-11-10.
- Base revision/branch: `5b5c4f8cbb8002a77f87b114174bd5db81867af7`, `codex/free-core-preview`.
- Hard prerequisites: Phase **101** ([phase-101.md](phase-101.md)).
- Owner Scheduling Authorization: The owner explicitly authorized Phase 102 local launch preparation and read-only evidence reconciliation before Phase 101 final acceptance ([ADR 0102](../decisions/0102-authorized-version-2-publication-and-live-verification.md)). Standing push authorized under ADR 0074. No unverified production publication, store upload, live provider calls, or deployment claimed.

---

## Result

### Implementation and Verifications Delivered

1. **Owner Publication Review Record**:
   - Authored canonical review record [`docs/release/v2-authorized-publication-record.md`](../release/v2-authorized-publication-record.md) and machine-readable register [`artifacts/phase102/publication-review-record.json`](../../artifacts/phase102/publication-review-record.json).
   - Reconciled candidate revision `5b5c4f8cbb8002a77f87b114174bd5db81867af7` (label `2.0.0-rc1`) with exact SHA-256 asset hashes for web PWA manifest, service worker, offline shell, and brand icons.
   - Accurately labeled Android local test artifact (`artifacts/release/app-debug-arm64.apk`, SHA-256 `0379f71c...`) as non-distributable.
   - Explicitly flagged every undecided field as `[UNDECIDED / PENDING OWNER APPROVAL]` or `[UNDECIDED / UNASSIGNED]`.

2. **Independent Surface Readiness Classification**:
   - **Web / PWA**: Ready for provisioned hosting. Verified reproducible Next.js 15.5.27 build (32 routes), 18/18 production smoke checks passed, strict nonce-based CSP, and standalone offline shell fallback. Target domain (`app.daynori.com`) and hosting compute remain unapproved.
   - **Android Client**: Not ready for release packaging. Verified Gradle prebuild and task configuration; release packaging fails closed without credentials via `withReleaseSigningGuard`. Release signing blocked (`OWNER-SIGNING-KEYS`); physical ARM64 TalkBack screen-reader latency profiling blocked (`DEF-V2-011`).

3. **Gate-by-Gate Barrier Register**:
   - Reconciled all 11 release and defect gates (`OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`, `DEF-V2-013`, `DEF-V2-011`, `DEF-V2-004`, `DEF-V2-008`, `DEF-V2-001`, `DEF-V2-002`, `DEF-V2-005`, `DEF-V2-006`, `DEF-V2-007`).
   - Assigned accountable roles, missing evidence descriptions, and next concrete actions for each gate.
   - Reaffirmed that signing credentials and provider keys must be provisioned securely outside Git and reports.

4. **Disposable Launch & Rollback Rehearsals (`tests/e2e/phase102-v2-publication-rehearsal.test.ts`)**:
   - Rehearsed 7 end-to-end launch verification scenarios in an isolated test environment (7/7 passed):
     - `PUB-REHEARSAL-01`: Synthetic account login, session validation, and multi-tenant isolation.
     - `PUB-REHEARSAL-02`: Scoped core organizer durable save, cold reopen integrity, and offline outbox sync with optimistic concurrency conflict detection (`baseRevision`).
     - `PUB-REHEARSAL-03`: Customer support feedback ingestion (`POST /v1/workspaces/:workspaceId/feedback/reports`), receipt generation, operator triage access, internal note creation, and status progression to `triaged`.
     - `PUB-REHEARSAL-04`: Privacy lifecycle, cryptographic reauthentication proof verification, account deletion request/confirm, and tombstone suppression (0 accessible rows; no accidental resurrection).
     - `PUB-REHEARSAL-05`: Production fail-closed kill switches (Vault 403, Rooms 403, Billing 403, AI 403), forward-fix schema property (additive migrations), and dynamic UI navigation collapse.
     - `PUB-REHEARSAL-06`: Synthetic reviewer access isolation (`reviewer@daynori.test`): access to core features permitted; operator endpoints and restricted modules strictly forbidden (403).
     - `PUB-REHEARSAL-07`: Publication review record reconciliation and barrier register verification.

5. **Explicit Owner Authorization Hold**:
   - Documented the exact approval checklist required before execution: candidate revision, release scope (bounded beta), web destination, Android Play track (Internal vs Closed testing), monthly operating budget, release signing keystore, and permitted live synthetic checks.
   - Status kept strictly as **`blocked`** in `docs/roadmap/progress.json`.

---

## Acceptance evidence

| Check / Tool | Exact Command | Exit Code | Result Summary |
| :--- | :--- | :--- | :--- |
| **Publication Rehearsal Suite** | `pnpm exec vitest run tests/e2e/phase102-v2-publication-rehearsal.test.ts` | `0` | PASS (7 tests passed in 1.23s) |
| **Operations Rehearsal Suite** | `pnpm exec vitest run tests/e2e/phase101-v2-operations-rehearsal.test.ts` | `0` | PASS (5 tests passed in 980ms) |
| **Candidate Rehearsals Suite** | `pnpm exec vitest run tests/e2e/phase100-v2-candidate-rehearsals.test.ts` | `0` | PASS (8 tests passed in 1.45s) |
| **Web Production Smoke** | `node scripts/phase60-web-production-smoke.mjs` | `0` | PASS (18 checks passed, port 3060) |
| **Android Inspect** | `node scripts/mobile-android-release-path.mjs inspect` | `0` | PASS (targetSdk 36, compileSdk 36, guard present) |
| **Android Exercise Gradle** | `node scripts/mobile-android-release-path.mjs exercise-gradle` | `0` | PASS (:app:tasks pass, :app:assembleRelease fail-closed) |
| **Release Preflight** | `node scripts/release-preflight.mjs --allow-partial-local` | `0` | PASS (20 pass, 0 fail, 13 blocked, 1 unexecuted; releaseEligible=false) |
| **Function Register Check** | `pnpm validate:function-register` | `0` | PASS (109 actions, 13 defects, 22 families) |
| **Planning Validator** | `pnpm validate:planning` | `0` | PASS (104 phases, 22 requirements) |
| **Secret Scan** | `pnpm audit:secrets` | `0` | PASS (checked 18,390+ files without unapproved secrets) |

---

## Gate-by-Gate Barrier Register

| Gate ID | Area | Status | Missing Evidence | Accountable Role | Next Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`OWNER-SIGNING-KEYS`** | Release | **BLOCKED** | Authorized Android release keystore & credentials | Release Engineer / Owner | Securely provision `DAYNORI_RELEASE_STORE_*` outside Git |
| **`OWNER-RELEASE-AUTH`** | Release | **BLOCKED** | Owner launch approval of candidate and destinations | Project Owner | Review publication record and authorize rollout |
| **`DEF-V2-013`** | Usability | **BLOCKED** | Live sessions with $\ge 5$ consenting human users ($\ge 4$ unassisted) | UX Researcher / Owner | Execute 5-participant research protocol |
| **`DEF-V2-011`** | Hardware | **BLOCKED** | Physical ARM64 device startup & TalkBack latency profiling | QA / Accessibility Lead | Run manual checklist on physical Android device |
| **`DEF-V2-004`** | Security | **BLOCKED** | Independent qualified security review of vault cryptography | Security & Vault Lead | Commission external cryptographic audit |
| **`DEF-V2-008`** | AI / Biometrics | **BLOCKED** | Live LLM provider authorization & biometric Keystore | AI Operations Lead | Authorize synthetic provider test & token budget |
| **`DEF-V2-001`** | Auth | **OPEN** | Production Supabase / Google OAuth identity provider | Operations Lead | Provision production Supabase project |
| **`DEF-V2-002`** | Push | **OPEN** | Native FCM / APNs push notification provider credentials | Mobile Lead | Configure Firebase Cloud Messaging in Google Cloud |
| **`DEF-V2-005`** | Integration | **OPEN** | Google Cloud OAuth production verification for Drive | Product Lead | Submit OAuth verification and consent screen |
| **`DEF-V2-006`** | Moderation | **OPEN** | Staffed moderation officer assignment for rooms/chat | Moderation Officer | Staff moderation queue before rooms launch |
| **`DEF-V2-007`** | Billing | **OPEN** | Play Console merchant setup & commercial pricing | Financial Officer | Complete Play Console merchant registration |

---

## Remaining owner decisions

1. **Candidate Approval**: Formally approve release candidate `2.0.0-rc1` at commit `5b5c4f8cbb8002a77f87b114174bd5db81867af7`.
2. **Release Envelope Selection**: Confirm proposed Bounded Personal Beta scope (78 actions enabled; Vault, Rooms, AI, Billing gated).
3. **Web Target Determination**: Authorize production hosting provider and configure `app.daynori.com` DNS.
4. **Android Track Determination**: Select target Play track (Internal Testing Track vs Closed Testing Track).
5. **Operating Budget Approval**: Formally authorize hosting, compute, and database line items (\$5–\$40/mo low tier).
6. **Release Keystore Provisioning**: Provide release keystore file and credentials securely outside Git.
7. **Human Usability & Physical Hardware Sessions**: Authorize live participant study (`DEF-V2-013`) and physical ARM64 testing (`DEF-V2-011`).

---

## Stop condition

Phase 102 operational preparation, review records, and local verification are complete. As instructed, work stops here. Phase 102 remains blocked until explicit owner authorization is provided. Phase 103 remains unstarted.
