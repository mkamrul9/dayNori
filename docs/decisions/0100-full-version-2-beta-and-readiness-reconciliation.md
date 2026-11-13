# ADR-0100: Full Version 2 Beta and Readiness Reconciliation

- Status: accepted
- Date: 2026-11-10
- Owner/reviewer: Antigravity agent (owner-authorized Phase 100 with explicit scheduling exception).
- Related: [Phase 100](../roadmap/phases/100-full-version-2-beta-and-readiness-reconciliation.md), [Phase 99](../roadmap/phases/99-accessibility-responsive-and-fresh-user-acceptance.md), [Phase 83](../roadmap/phases/83-developer-feedback-triage-and-verified-support-contact.md), [Phase 84](../roadmap/phases/84-mobile-pwa-push-and-reminder-delivery-proof.md), [Phase 85](../roadmap/phases/85-native-android-reminder-and-notification-readiness.md), [Phase 86](../roadmap/phases/86-vault-review-recovery-and-release-gate-closure.md), [Phase 87](../roadmap/phases/87-google-drive-connection-and-scope-readiness.md), [Phase 88](../roadmap/phases/88-rooms-chat-and-staffed-moderation-readiness.md), [Phase 89](../roadmap/phases/89-billing-entitlements-and-sustainable-plan-readiness.md), [Phase 94](../roadmap/phases/94-structured-organizer-tools-and-multi-action-creation.md), [Phase 95](../roadmap/phases/95-voice-capture-transcription-and-reviewed-creation.md), [Phase 96](../roadmap/phases/96-nori-original-companion-and-assistant-launcher.md), [Phase 98](../roadmap/phases/98-measured-performance-and-resource-optimization.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0099](0099-accessibility-responsive-and-fresh-user-acceptance.md), [release-gates.md](../engineering/release-gates.md), [v2-bounded-beta-manifest.md](../release/v2-bounded-beta-manifest.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, and release gates.

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 100 readiness reconciliation, candidate rehearsals, and beta preparation before final acceptance of its blocked prerequisites:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 100 readiness reconciliation, candidate-build rehearsals, and beta preparation before final acceptance of its blocked prerequisites. Record this limited scheduling exception in an ADR and roadmap progress. Preserve all dependencies and release gates. An external beta launch, narrower release scope, live provider use, spending, and deployment each require separate owner approval."

Phase 100 establishes candidate-build rehearsals across eight critical operational scenarios, reconciles all 109 actions in the Version 2 function register, produces a complete readiness matrix, packages a bounded personal beta manifest for owner review, documents operational roles, and reconciles legacy release gates while strictly preserving all outstanding barrier gates.

## Workload Methodology & Candidate Rehearsal Findings

A comprehensive candidate rehearsal test suite was executed via `tests/e2e/phase100-v2-candidate-rehearsals.test.ts` (8 passing tests, 1143ms) and cataloged in `artifacts/phase100/candidate-rehearsal-results.json`:

1. **REHEARSAL-01 (V1 to V2 Account Upgrade & Schema Evolution)**:
   - Provisioned personal workspace under legacy V1 schema semantics; added baseline notes, tasks, and routines.
   - Upgraded to V2 preferences (theme: dark, Bangla relaxed line-height, hide Journal module).
   - *Measured*: Historical data preserved byte-exact; zero data loss; shell navigation immediately adapted to exactly three primary tabs (`today`, `plan`, `library`).

2. **REHEARSAL-02 (Durable Save, Reopen, and Cold Cache Restart)**:
   - Composed multi-paragraph rich text AST notes and urgent priority tasks.
   - Simulated client process death and in-memory cache purge by instantiating a separate client instance.
   - *Measured*: Reopened notes and tasks retrieved all paragraphs and metadata completely intact without truncation or corruption.

3. **REHEARSAL-03 (Offline Mutation Outbox Queueing & Replay)**:
   - Enqueued optimistic note edits, task completions, and new notes in a simulated client outbox during offline disconnection.
   - Reconnected and sequentially replayed mutations to the API server with optimistic concurrency (`baseRevision`).
   - *Measured*: All mutations acknowledged with 200/201 responses; server revisions updated; zero lost updates.

4. **REHEARSAL-04 (Provider Failure & Graceful Degradation)**:
   - Evaluated fail-closed error handling when external services fail or are unapproved.
   - *Measured*: Unapproved live AI model calls fail closed safely with `AI_PROVIDER_UNAUTHORIZED`; unapproved Drive sync returns `provider_gated`; upstream gateway timeouts return user-safe diagnostic feedback with local caching.

5. **REHEARSAL-05 (Two-Account Workspace Isolation & IDOR Fencing)**:
   - Alice and Bob operated isolated workspaces; Bob attempted cross-tenant read, update, and quota inspection on Alice's workspace items.
   - *Measured*: All cross-tenant attempts rejected with 403/404 via `withTenantContext` RLS enforcement; Alice's data remained completely unmodified.

6. **REHEARSAL-06 (Reporter-to-Operator Support Triage)**:
   - Consumer user submitted bug report (`POST /v1/workspaces/:workspaceId/feedback/reports`).
   - *Measured*: Feedback persisted in `app.operator_feedback_submissions`; unauthenticated request challenged with 401; non-operator rejected with 403; authorized platform operator retrieved feedback triage queue with 200.

7. **REHEARSAL-07 (Guided Tour & Help Chapter Runnability & Gating)**:
   - Evaluated all 25 tour chapters: 10 everyday, 5 advanced, and 4 safe explanatory chapters confirmed runnable.
   - *Measured*: All 6 capability-gated chapters reject safely with `ok: false, code: 'feature_gated'`, preventing tutorial confusion on gated modules.

8. **REHEARSAL-08 (Function Register Reconciliation & Release Gate Barriers)**:
   - Reconciled all 109 function register actions across 22 families (78 verified local, 10 unverified, 21 blocked, 0 release ready).
   - *Measured*: Defect catalog `DEF-V2-001` through `DEF-V2-012` verified; no premature release claims permitted.

## Function Register & Readiness Matrix Reconciliation

The complete readiness matrix was generated in `artifacts/phase100/readiness-matrix.json`:
- **Total Function Actions**: 109 across 22 feature families.
- **Readiness Breakdown**:
  - `verified_local`: 78 actions (71.6%) — core organizer features fully implemented and validated locally.
  - `unverified`: 10 actions (9.2%) — real-provider auth (`DEF-V2-001`), offline search indexing, reminder creation rules, and beginner guide replay.
  - `blocked`: 21 actions (19.3%) — gated behind dedicated release gates (`DEF-V2-002`, `DEF-V2-004`, `DEF-V2-005`, `DEF-V2-006`, `DEF-V2-007`, `DEF-V2-008`).
  - `release_ready`: 0 actions (0.0%) — strict invariant enforced: no action may claim release readiness without complete closure of all release gates.

## Bounded Personal Beta Candidate Package

For owner review, a bounded personal beta package was authored in `docs/release/v2-bounded-beta-manifest.md` and `artifacts/phase100/bounded-beta-package.json`:
- **Proposed Scope**: Focuses exclusively on the offline-first personal workspace (Notes, Tasks, Routines, Calendar, Library, Folders, Scoped Search, Local Help & Tours, Nori vector avatar launcher).
- **Fenced Scope**: Production Vault (`DEF-V2-004`), Live Google Drive (`DEF-V2-005`), Real-user Rooms chat (`DEF-V2-006`), Commercial Billing (`DEF-V2-007`), Live AI Assistant streaming (`DEF-V2-008`), Physical TalkBack (`DEF-V2-011`).
- **Participant Cohort**: 20 to 50 consenting testers using synthetic data only.
- **Deferred Phase 67 Human Gate (`DEF-V2-013`)**: Requires at least 5 representative consenting human participants with at least 4 each capturing/reopening an item and finding Help unassisted before `DEF-V2-013` closes.
- **Operational Roles**: Explicitly documented and marked `unassigned` until officially staffed.

## Legacy Release Gates Reconciliation

- **Gate A (Local foundation)**: **Met** — Strict toolchain, migrations, reproducible builds, local JWT verifier, and package boundaries pass.
- **Gate B (Private personal beta)**: **Provisional / Candidate Ready** — Bounded manifest authored, 8 candidate rehearsals pass, human participant sessions pending `DEF-V2-013`.
- **Gate C (Public web and Google Play readiness)**: **Blocked** — Physical Android ARM64 hardware TalkBack testing (`DEF-V2-011`), signed target API 36 AAB, and operator publication approval unmet.
- **Gate D (Paid product)**: **Gated** — Commercial Play billing disabled (`DEF-V2-007`); free core organizer preserved.

## Consequences & Next Steps

- All 8 candidate rehearsals in `tests/e2e/phase100-v2-candidate-rehearsals.test.ts` pass cleanly in 1143ms.
- Phase 100 artifacts authored in `artifacts/phase100/`: `readiness-matrix.json`, `candidate-rehearsal-results.json`, `evidence-summary.json`, and `bounded-beta-package.json`.
- Bounded beta manifest authored in `docs/release/v2-bounded-beta-manifest.md`.
- Phase 100 report authored in `docs/phase-reports/phase-100.md`.
- Phase 100 status recorded as **blocked** in roadmap metadata pending external gates `DEF-V2-004`, `DEF-V2-008`, `DEF-V2-011`, `DEF-V2-013`, and explicit owner beta launch authorization.
- Conventional commit message reflecting what passed: `docs(readiness): reconcile Version 2 beta readiness and candidate rehearsals`.
- Stop after Phase 100. Leave Phase 101 unstarted.
