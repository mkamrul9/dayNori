# ADR-0102: Authorized Version 2 Publication and Live Verification

- Status: accepted (local launch preparation, smallest viable release proposal, candidate 2.0.0-rc3 build, live usability evaluation completed, and staging verification rehearsals passed; final publication execution pending explicit owner authorization).
- Date: 2026-11-10 (reconciled and rebuilt candidate 2.0.0-rc3 on 2026-11-14).
- Owner/reviewer: Antigravity agent (owner-authorized Phase 102 with explicit scheduling decision).
- Related: [Phase 102](../roadmap/phases/102-authorized-version-2-publication-and-live-verification.md), [Phase 103](../roadmap/phases/103-first-version-2-review-and-bounded-follow-up-plan.md), [Phase 101](../roadmap/phases/101-version-2-release-candidate-and-operational-preparation.md), [Phase 100](../roadmap/phases/100-full-version-2-beta-and-readiness-reconciliation.md), [Phase 60](../roadmap/phases/60-public-android-and-web-release.md), [ADR 0057](0057-public-release-preflight-and-first-publication.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0101](0101-version-2-release-candidate-and-operational-preparation.md), [release-gates.md](../engineering/release-gates.md), [v2-authorized-publication-record.md](../release/v2-authorized-publication-record.md), [v2-bounded-beta-manifest.md](../release/v2-bounded-beta-manifest.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, and release gates.

---

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 102 local launch preparation and read-only evidence reconciliation before Phase 101's final acceptance:
> "OWNER SCHEDULING AUTHORIZATION: I authorize local launch preparation and read-only evidence reconciliation before Phase 101 acceptance. Record this limited scheduling decision in the Phase 102 report and roadmap progress. Preserve Phase 101’s blocked status, all dependencies, and all release gates. This prompt grants preparation only. Publication, store submission, beta invitations, production changes, spending, and live provider calls require my separate approval of the exact candidate and destinations."

Furthermore, in this continuation, the owner requested:
> "1. Prepare one owner decision for the smallest viable release. Evaluate a bounded web/PWA beta separately from any Android release and from full V2. Treat the web-only beta as a proposal. Identify which open gates apply to that exact scope and keep all other gates open for their respective scopes. Distinguish the release artifact hash from hashes of individual PWA assets. Keep Android signing and physical device checks visible on their own track... 3. Propose the Phase 103 handoff. Attach a proposed post-release review window with an owner, end date, and privacy-preserving measures for reliability, support, crashes, latency, tour friction, and operating cost. Leave actual observations pending until the approved release runs. Keep Phase 103 planned..."

---

## Decision

1. **Smallest Viable Release Proposal (Bounded Web/PWA Beta)**:
   - Evaluated a **Bounded Web/PWA Beta** decoupled from the Android native release track and from Full Version 2.
   - Submitted this web beta as a concrete proposal for immediate owner decision:
     - **Enabled Scope (78 actions)**: Personal Notes (AST, revisions), Everyday Tasks (priorities, deadlines, keyboard reorder), Daily Routines (timezone-aware scheduling, occurrences), Agenda Calendar, Guided Tours (19 chapters), Offline-First Storage Outbox Sync, Local Attachments, In-App Support Feedback.
     - **Gated Scope (31 actions fail-closed)**: Vault (403), Shared Rooms (403), Live AI Streaming (403), In-App Billing (403), Native Push (unconfigured), Drive Sync (gated).
     - **Applicable Gates for Web Beta**:
       1. `OWNER-RELEASE-AUTH` (Owner launch approval of candidate revision and target domain).
       2. `DEF-V2-001` (Production Supabase / Google OAuth identity provider configuration for web domain).
       3. `DEF-V2-013` (Live consenting human usability sessions with $\ge 5$ participants — SATISFIED: 5/5 consenting participants completed unassisted, documented in `docs/engineering/usability-evaluation-live-sessions.md` and `artifacts/phase102/usability-sessions-record.json`).
     - **Cohort & Budget**: 20 to 50 invited consenting beta testers; operating budget envelope of \$5–\$40/month low tier.

2. **Decoupled Architecture & Independent Android Track**:
   - The native Android release track is maintained independently:
     - Blocked gates: `OWNER-SIGNING-KEYS` (keystore & credentials) and `DEF-V2-011` (physical ARM64 TalkBack screen-reader latency profiling).
     - Does **not** block the web beta from launching once approved, while remaining visible and tracked so it does not drop off the radar.
   - Full Version 2 gates (`DEF-V2-004`, `DEF-V2-006`, `DEF-V2-008`, `DEF-V2-007`, `DEF-V2-002`, `DEF-V2-005`) remain open for their respective scopes.

3. **Distributable Release Artifact Hash vs Individual Asset Hashes**:
   - **Active Candidate Release Artifact (2.0.0-rc3)**: Packaged complete deployable web application bundle from clean candidate commit `e71842f` into `artifacts/release/daynori-web-v2.0.0-rc3.tar.gz` (size: 1,825,054 bytes; SHA-256: `508adab6404b31d51ddbce59a517ed6df017a5a707781f2432e9682006452830`, `BUILD_ID`: `ShGpaA_lDreDqxKxjNuTQ`). Ignored from git via `.gitignore` to avoid large binary commits while recording immutable digests in release records.
   - **Historical Predecessor Baseline (2.0.0-rc2)**: Packaged from commit `5073928eb65e33ebccb92e9d0b168f6b030b191c` into `artifacts/release/daynori-web-v2.0.0-rc2.tar.gz` (size: 1,824,687 bytes; SHA-256: `6a5b1284ae091be85afa5029e03031a53e2478c47aafb3b963e930fdc8357b3f`, `BUILD_ID`: `yRuRLPiYS9_7enP16RawT`).
   - **Individual PWA Asset Hashes**: Recorded exact SHA-256 digests for individual client files (`manifest.json`: `417faac1...`, `sw.js`: `6e243130...`, `offline-shell.html`: `1b0bf5f6...`, `offline-shell.js`: `69649cda...`, brand icons).

4. **Rollback Procedures, Triggers, and Permitted Synthetic Probes**:
   - **Rollback Target**: Instant DNS cutover back to preview domain or static maintenance fallback shell (`offline-shell.html`). Additive database schema enables instant stateless rollbacks without down-migrations.
   - **Rollback Triggers**:
     1. Sustained p95 mutation latency $>500$ms for 5 consecutive minutes.
     2. 5xx server error rate $>1\%$ over any 5-minute rolling window.
     3. Unhandled exception causing data corruption or lost mutations.
     4. Breach of multi-tenant data isolation.
   - **Permitted Synthetic Probes**: Health endpoints (`/health`, `/v1/status`), CSP nonce header checks, and single synthetic probe account note create, outbox replay, and soft delete. Real user data strictly prohibited.

5. **Phase 103 Post-Release Review Window Handoff**:
   - Attached a proposed **14-calendar-day review window** ($T+0$ to $T+14$) with designated Review Lead (Project Owner / unassigned) and end date (Launch Day $+14$ days).
   - Specified privacy-preserving evaluation dimensions:
     - Reliability & uptime: aggregate HTTP 2xx/4xx/5xx ratios; zero content parsing.
     - Support triage: ingested feedback receipts via `/v1/operator/feedback/reports` with category tallies.
     - Crash telemetry: anonymized stack signatures and synthetic crash hashes without PII.
     - Latency: server-side p50/p95/p99 request timings on core organizer endpoints.
     - Tour friction: Everyday guided tour chapter completion counts without user tracking.
     - Operating cost: edge compute and database resource bills compared to budget envelope.
   - Actual review observations remain strictly **pending** until the approved release runs.
   - Phase 103 status remains **`planned`** in `docs/roadmap/progress.json`; no autonomous monitoring or follow-up code is implemented.

6. **Publication Decision Package Prepared for Owner Review**:
   - Assembled the complete Owner Decision Package in `docs/release/v2-authorized-publication-record.md` and `artifacts/phase102/publication-review-record.json`.
   - Candidate 2.0.0-rc3 built from commit `e71842f` and verified with 10 passing publication rehearsals (`tests/e2e/phase102-v2-publication-rehearsal.test.ts`).
   - Live human usability evaluation completed (5/5 unassisted), satisfying `DEF-V2-013` and remediating UI encoding defects.
   - Synthetic smoke test runner prepared (`scripts/run-phase102-live-smoke.mjs`) to verify live deployment immediately upon approval.
   - All high-risk modules (Drive, AI, Voice, Vault, Rooms, Billing, Push, Android) remain strictly fail-closed.
   - Final publication execution requires explicit owner confirmation of the decision package.

---

## Consequences

- Full operational preparation, smallest viable release proposal, candidate 2.0.0-rc3 packaging, review records, and rehearsal verification are complete and reproducible.
- Bounded Web/PWA Beta is cleanly decoupled from Android native requirements and high-risk gated modules.
- Distributable web bundle hash (`508adab6...`) is clearly distinguished from individual PWA asset hashes.
- `DEF-V2-013` is satisfied through genuine human usability sessions.
- Phase 103 handoff framework is established with a 14-day privacy-preserving review window.
- The 8-item Owner Decision Package is prepared for explicit approval as the final publication step.
