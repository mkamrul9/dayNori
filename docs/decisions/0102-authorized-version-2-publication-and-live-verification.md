# ADR-0102: Authorized Version 2 Publication and Live Verification

- Status: accepted (local launch preparation and evidence reconciliation only; publication blocked).
- Date: 2026-11-10.
- Owner/reviewer: Antigravity agent (owner-authorized Phase 102 with explicit scheduling decision).
- Related: [Phase 102](../roadmap/phases/102-authorized-version-2-publication-and-live-verification.md), [Phase 101](../roadmap/phases/101-version-2-release-candidate-and-operational-preparation.md), [Phase 100](../roadmap/phases/100-full-version-2-beta-and-readiness-reconciliation.md), [Phase 60](../roadmap/phases/60-public-android-and-web-release.md), [ADR 0057](0057-public-release-preflight-and-first-publication.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0101](0101-version-2-release-candidate-and-operational-preparation.md), [release-gates.md](../engineering/release-gates.md), [v2-authorized-publication-record.md](../release/v2-authorized-publication-record.md), [v2-owner-review-package.md](../release/v2-owner-review-package.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, and release gates.

---

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 102 local launch preparation and read-only evidence reconciliation before Phase 101's final acceptance:
> "OWNER SCHEDULING AUTHORIZATION: I authorize local launch preparation and read-only evidence reconciliation before Phase 101 acceptance. Record this limited scheduling decision in the Phase 102 report and roadmap progress. Preserve Phase 101’s blocked status, all dependencies, and all release gates. This prompt grants preparation only. Publication, store submission, beta invitations, production changes, spending, and live provider calls require my separate approval of the exact candidate and destinations."

---

## Decision

1. **Owner Publication Review Record Assembly**:
   - Authored the canonical Version 2 Authorized Publication Record (`docs/release/v2-authorized-publication-record.md`) and companion machine-readable register (`artifacts/phase102/publication-review-record.json`).
   - Clearly separated the proposed **Bounded Personal Beta** (78 verified core actions: notes, tasks, routines, calendar, guided tours, local files) from **Full Version 2** (includes gated modules: vault, rooms, live AI streaming, in-app billing).
   - Documented exact candidate revision (`5b5c4f8cbb8002a77f87b114174bd5db81867af7`, candidate label `2.0.0-rc1`) and SHA-256 artifact hashes for web PWA assets (manifest, service worker, offline shell, brand icons) and Android debug test artifacts.
   - Flagged every undecided parameter as `[UNDECIDED / PENDING OWNER APPROVAL]`:
     - Web deployment destination (`preview.daynori.com` -> `app.daynori.com` on Cloudflare Pages / Vercel Pro).
     - Android Play Store distribution track (Internal Testing Track vs Closed Testing Track).
     - Staged rollout limits (first release cannot use percentage rollouts; restricted to invited cohorts).
     - Rollback destinations (client forward-fix code $N+1$; server additive schema; instant DNS/worker rollback; runtime feature kill switches).
     - Named operational roles (Release Engineer, Security & Vault Lead, Moderation Officer, Support Triage Operator, AI Operations Lead).

2. **Independent Surface Readiness Classification**:
   - **Web / PWA Readiness**: **READY FOR PROVISIONED HOSTING**
     - Production build verified (Next.js 15.5.27, 32 routes).
     - Production smoke verified (`scripts/phase60-web-production-smoke.mjs`, 18/18 checks passed).
     - PWA offline shell, service worker caching, legal endpoints, CSP nonces verified.
     - Production domain and hosting compute line items remain unapproved.
   - **Android Client Readiness**: **NOT READY FOR RELEASE PACKAGING**
     - Gradle prebuild and release path verified (`withReleaseSigningGuard`).
     - Release task `:app:assembleRelease` fails closed without credentials.
     - Blocked on production release keystore (`OWNER-SIGNING-KEYS`) and physical ARM64 TalkBack verification (`DEF-V2-011`).

3. **Gate-by-Gate Barrier Register Reconciliation**:
   - Tracked all 11 release and defect gates (`OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`, `DEF-V2-013`, `DEF-V2-011`, `DEF-V2-004`, `DEF-V2-008`, `DEF-V2-001`, `DEF-V2-002`, `DEF-V2-005`, `DEF-V2-006`, `DEF-V2-007`).
   - For every gate, established its current status, exact missing evidence, accountable role, and next concrete action.
   - Reaffirmed that signing credentials and secrets must be provisioned securely outside of Git, logs, and public reports.

4. **Disposable Launch & Rollback Rehearsals (`tests/e2e/phase102-v2-publication-rehearsal.test.ts`)**:
   - Rehearsed 6 end-to-end launch verification scenarios in an isolated test environment (all passed):
     - `PUB-REHEARSAL-01`: Synthetic account login, session validation, and multi-tenant isolation.
     - `PUB-REHEARSAL-02`: Scoped core organizer durable save, cold session reopen, and offline outbox sync with optimistic concurrency conflict detection (`baseRevision`).
     - `PUB-REHEARSAL-03`: Customer support feedback ingestion (`POST /v1/workspaces/:workspaceId/feedback/reports`), receipt generation, operator triage access, internal note creation, and status progression to `triaged`.
     - `PUB-REHEARSAL-04`: Privacy lifecycle, cryptographic reauthentication proof verification, account deletion request/confirm, and tombstone suppression (0 accessible rows; no accidental resurrection).
     - `PUB-REHEARSAL-05`: Production fail-closed kill switches (Vault 403, Rooms 403, Billing 403, AI 403), forward-fix schema property (additive migrations), and dynamic UI navigation collapse.
     - `PUB-REHEARSAL-06`: Synthetic reviewer access isolation (`reviewer@daynori.test`): access to core features permitted; operator endpoints and restricted modules strictly forbidden (403).

5. **Publication Hold Pending Explicit Owner Authorization**:
   - Phase 102 status recorded as **`blocked`** in `docs/roadmap/progress.json`.
   - Identified exactly what the owner must approve before any publication:
     - Exact candidate artifact and hashes (`2.0.0-rc1` at `5b5c4f8`).
     - Web deployment destination and hosting provider.
     - Android distribution track (Internal vs Closed testing).
     - Rollout limits and participant invite list.
     - Permitted live synthetic checks.
   - If authorized in a subsequent turn, execution must follow the approved rollout strictly, verify served builds independently, monitor agreed stop signals, and follow forward-fix rollback procedures if triggered.

---

## Consequences

- Full operational preparation, review records, and rehearsal verification are complete and reproducible.
- No store upload, beta invitation, production deployment, DNS change, live provider call, or cloud expense has occurred.
- Phase 102 remains blocked until the owner reviews the publication record and explicitly authorizes release destinations.
- Phase 103 remains unstarted.
