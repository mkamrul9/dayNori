# ADR-0101: Version 2 Release Candidate and Operational Preparation

- Status: accepted (local candidate builds and operational rehearsals only; publication blocked).
- Date: 2026-11-10.
- Owner/reviewer: Antigravity agent (owner-authorized Phase 101 with explicit scheduling exception).
- Related: [Phase 101](../roadmap/phases/101-version-2-release-candidate-and-operational-preparation.md), [Phase 100](../roadmap/phases/100-full-version-2-beta-and-readiness-reconciliation.md), [Phase 60](../roadmap/phases/60-public-android-and-web-release.md), [ADR 0057](0057-public-release-preflight-and-first-publication.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0100](0100-full-version-2-beta-and-readiness-reconciliation.md), [release-gates.md](../engineering/release-gates.md), [v2-release-candidate-manifest.md](../release/v2-release-candidate-manifest.md), [v2-owner-review-package.md](../release/v2-owner-review-package.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, and release gates.

---

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 101 local builds, artifact inspection, operational rehearsals, and release-package preparation before Phase 100's final acceptance:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 101 local builds, artifact inspection, operational rehearsals, and release-package preparation before Phase 100’s final acceptance. Record this limited scheduling exception in an ADR and roadmap progress. Preserve Phase 100’s blocked status, the dependency, and all outstanding gates. The bounded beta remains a proposal. This authorization does not approve beta invitations, publication, store uploads, production deployment, paid provisioning, live provider calls, or real charges."

---

## Decision

1. **Resolution of DEF-V2-013 Tracking Discrepancy**:
   - Registered `DEF-V2-013` (*Live consenting human participant usability evaluation remains open*) directly in `docs/roadmap/v2/function-register.json`.
   - Verified that `pnpm validate:function-register` passes with 109 actions, 13 defects, and 22 feature families covered.
   - Preserved Phase 99 5-persona usability run as synthetic simulation only; live human review remains open pending live sessions with at least 5 representative consenting participants ($\ge 4$ unassisted).

2. **Candidate Manifest & Verification**:
   - Reconciled the proposed bounded beta against full Version 2. Produced candidate manifest `docs/release/v2-release-candidate-manifest.md` and machine-readable `artifacts/phase101/candidate-manifest.json`.
   - Built reproducible Next.js 15 production web/PWA candidate; verified manifest, service worker, offline shell, and icons with SHA-256 hashes.
   - Evaluated Android Gradle release path with `withReleaseSigningGuard`: verified fail-closed refusal of `:app:assembleRelease` without credentials, target API 36, and applicationId `com.daynori.app`. Release signing is recorded as **blocked** (`OWNER-SIGNING-KEYS`). Debug test artifacts are accurately labeled.

3. **Operational Rehearsals**:
   - Executed 5 operational rehearsals in `tests/e2e/phase101-v2-operations-rehearsal.test.ts` (all 5 passed):
     - `OP-REHEARSAL-01`: Idempotent schema migration and forward-fix invariant.
     - `OP-REHEARSAL-02`: Offline mutation outbox persistence and conflict-fenced replay.
     - `OP-REHEARSAL-03`: Stored object binary checksum tracking, quarantine verification, and deletion suppression (tombstone preservation).
     - `OP-REHEARSAL-04`: Production kill switches for Vault, Rooms, Billing, and AI Assistant fail closed (403); shell adapts dynamically.
     - `OP-REHEARSAL-05`: Synthetic reviewer account (`reviewer@daynori.test`) isolated from operator routes (403) and cross-tenant data.

4. **Owner Review Package Assembly**:
   - Created `docs/release/v2-owner-review-package.md` incorporating:
     - Policy reviews (Google Play target API 36, 16KB alignment, UGC, AI, billing, account deletion; Apple App Store; browsers) with source links and review date 2026-11-10.
     - Rollout and rollback destinations (internal/closed testing track selection; forward-fix strategy).
     - Operating cost projections (\$5–\$40/mo low tier; \$90–\$215/mo medium tier) explicitly marked unapproved.
     - Operational roles (Release Engineer, Security Lead, Moderation Officer, Support Operator, AI Lead) explicitly marked unassigned.
     - Synthetic reviewer access instructions and pre-publication checklist.

5. **Release Gate Boundary Preservation**:
   - Kept Phase 101 recorded as **`blocked`** in `docs/roadmap/progress.json`.
   - No publication, real charges, store uploads, beta cohort invitations, live provider calls, or paid infrastructure provisioning occurred.

---

## Consequences

- Full Version 2 release candidate materials and rehearsal evidence are completely assembled for owner evaluation.
- All outstanding security (`DEF-V2-004`), hardware (`DEF-V2-011`), AI provider (`DEF-V2-008`), and usability (`DEF-V2-013`) gates remain honestly open and enforced.
- Phase 102 remains unstarted until the owner reviews the package and explicitly authorizes release destinations.
