# Phase 37: Core quality and usability release gate

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [37 — Core quality and usability release gate](../roadmap/phases/37-core-quality-and-usability-release-gate.md)
- **Status:** `blocked` (Core quality, usability, end-to-end organizer journeys, performance budgets, and security boundaries verified in automated and synthetic environments; release gate decision is explicitly `blocked` pending physical Android TalkBack hardware, native KeyStore signing, live VAPID/FCM push notification delivery, and production store credentials).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-18.
- **Base Git revision and branch:** `b7c91c7: fix(lifecycle): repair deletion confirmation, membership boundaries, durable purge, and public verification` on `main`.
- **Prerequisites:**
  - [Phase 31 — First-use tutorial and progressive discovery](phase-31.md): First-run onboarding, step completion, and interest selection.
  - [Phase 33 — Global authorized search and filters](phase-33.md): Full-text and trigram authorized search, filters, and privacy suppression.
  - [Phase 34 — Conflict recovery and offline hardening](phase-34.md): 3-way merge, conflict resolution, offline queue durability, and local recovery.
  - [Phase 35 — Portable export and controlled import](phase-35.md): Zero-dependency ZIP portability, total ID remapping, duplicate strategies, and reauthentication.
  - [Phase 36 — Account deletion backup and recovery lifecycle](phase-36.md): Two-step deletion, session revocation, collaborative content reassignment, blob purge, suppression ledger, and disaster recovery.
- **Included scope:**
  - **Prerequisite Repairs (Commit `b7c91c7`)**:
    - Migration 00037 restoring strict current-membership Row-Level Security policies on `app.items`, eliminating unconstrained `created_by` access and enforcing `workspace_id = current_workspace_id()`.
    - Bound `expectedWorkspaceId` in workspace-deletion reauthentication proof verification.
    - Repaired `confirmAccountDeletion` to verify initiating `session_hash`, enforce cancellation deadline freshness, execute atomic state transition, revoke provider-side tokens, and handle duplicate confirmations idempotently.
    - Implemented real enumeration-safe public deletion verification workflow with rate-limiting, HMAC-signed verification tokens, and confirmation endpoint.
    - Repaired worker blob purge job to throw on storage failures and treat 404/NoSuchKey as idempotent success.
  - **Core Application Journeys (`tests/e2e/core-organizer-journeys.test.ts`)**:
    - Implemented 13 comprehensive end-to-end journeys covering:
      1. Sign up/sign in, provision once, skip/resume/replay onboarding.
      2. Capture a bilingual Bangla/English note, interrupt, reopen, and recover exact AST content.
      3. Create folders, organize mixed records, move items, trash and restore.
      4. Create one-off deadline and recurring routine; verify distinct behavior across midnight/timezones.
      5. Complete, skip, undo, and review routine occurrence history.
      6. Write multiple journal entries on one date and verify privacy settings.
      7. Upload, scan, preview, download, and handle file transfers.
      8. Create and edit knowledge guides, tags, links, backlinks, and saved views.
      9. Customize Today and verify cross-device preference sync.
      10. Search online/offline and open canonical results.
      11. Edit concurrently, review conflicts, keep both versions, restart, and reconnect.
      12. Export/import a representative workspace and verify content and binary checksums.
      13. Delete disposable accounts/workspaces and verify database, storage, worker, and auth revocation.
  - **Browser E2E Runner (`scripts/test-web-e2e.mjs`)**:
    - Updated Suite 4 Part C with real `TodayView` DOM elements, added Next.js API BFF proxy bypass for public routes, and added Suite 6 for Core Organizer Journeys & Public Deletion Form.
    - Verified 50/50 tests passing via Edge CDP with visual screenshot artifacts.
  - **Android E2E Runner (`scripts/test-android-e2e.mjs`)**:
    - Validated compiled APK exists (146.17 MB), accurately reported release gate BLOCKED due to unavailable physical Android device or emulator.
  - **Performance Release Gate Benchmarks (`tests/performance/performance.test.ts`)**:
    - Implemented 4 performance benchmarks:
      - Benchmark 1: Local save acknowledgment latency (p95 <= 100ms) -> Passed (~15ms per save).
      - Benchmark 2: 10,000-record virtualized keyset pagination (<150ms p95, mean <80ms, heap growth <25MB) -> Passed (~30ms per page, heap growth ~6.5MB).
      - Benchmark 3: 100 concurrent read/mutation operations across 20 workers (read p95 < 300ms, mutation p95 < 500ms) -> Passed (read p95: 14.8ms, mutation p95: 110.2ms).
      - Benchmark 4: Worker queue poll and SKIP LOCKED lease acquisition (<75ms p95) -> Passed (p95: 38.6ms).
  - **Full Monorepo Quality & Security Audits**:
    - 60 test files and 874 tests passing (100%).
    - Clean TypeScript compilation across all 13 workspace projects (`pnpm typecheck`).
    - Clean ESLint check (`pnpm lint`).
    - Secret scanning verified 1,840 repository files without unapproved secrets (`pnpm audit:secrets`).
    - Dependency vulnerability audit reports 2 unapproved transitive development-only advisories (`node-forge` and `braces`) awaiting human owner review in `docs/security/pending-exception-proposals.md`.
- **Excluded/deferred scope (Hardware & Production Release Gates)**:
  - Physical Android TalkBack screen-reader gesture navigation and physical touch exploration.
  - Native hardware Android KeyStore cryptographic enclave signing.
  - Production FCM and Mozilla Web Push live delivery credentials.
  - Production store submission and live production deployment.

## Acceptance evidence

### Acceptance Matrix

| Requirement / Scenario | Platform / Target | Command / Artifact | Observed Result | Release Gate Status |
| :--- | :--- | :--- | :--- | :--- |
| **Prerequisite: Deletion Confirmation & Scope** | Node / Fastify / Supabase | `vitest run tests/integration/phase37-prerequisite-repairs.test.ts` | 9/9 passed. Enforces session hash, cancellation deadline, workspace scope, atomic consumption, duplicate idempotency. | **PASS** (Automated) |
| **Prerequisite: Strict Membership Authorization** | Supabase Migration 00037 | `vitest run tests/integration/phase37-prerequisite-repairs.test.ts` | 9/9 passed. Replaced unconstrained creator SELECT/UPDATE/DELETE with strict workspace membership checks. | **PASS** (Automated) |
| **Prerequisite: Durable Blob Purge** | Fastify / Worker / S3 | `vitest run tests/integration/phase37-prerequisite-repairs.test.ts` | 9/9 passed. Worker throws on storage down / non-404 errors; treats 404/NoSuchKey as idempotent success. | **PASS** (Automated) |
| **Prerequisite: Public Deletion Verification** | Fastify Public Route | `vitest run tests/integration/phase37-prerequisite-repairs.test.ts` | 9/9 passed. Enumeration-safe dispatch of HMAC verification tokens and confirmation route. | **PASS** (Automated) |
| **Organizer Journey 1: Onboarding Lifecycle** | API / Client SDK | `vitest run tests/e2e/core-organizer-journeys.test.ts` | Passed. Provision once, step through onboarding, skip, resume, replay interests. | **PASS** (Automated) |
| **Organizer Journey 2: Bilingual Note Recovery** | API / AST / DB | `vitest run tests/e2e/core-organizer-journeys.test.ts` | Passed. Preserves English & Bengali Unicode AST, formatting, interrupt/reopen recovery. | **PASS** (Automated) |
| **Organizer Journey 3: Folders, Move, Trash** | API / DB / RLS | `vitest run tests/e2e/core-organizer-journeys.test.ts` | Passed. Circular hierarchy prevention, move, soft-delete to trash, restore to original parent. | **PASS** (Automated) |
| **Organizer Journey 4: Calendar & Routines** | API / Routines / Feed | `vitest run tests/e2e/core-organizer-journeys.test.ts` | Passed. Midnight recurrence, timezone independence, feed date range aggregation. | **PASS** (Automated) |
| **Organizer Journey 5: Routine History & Undo** | API / State Machine | `vitest run tests/e2e/core-organizer-journeys.test.ts` | Passed. Complete occurrence, skip, undo toast transition, immutable history. | **PASS** (Automated) |
| **Organizer Journey 6: Journal Privacy & Multi-Entry** | API / Journal / RLS | `vitest run tests/e2e/core-organizer-journeys.test.ts` | Passed. Multiple entries on same date, reflection prompts, privacy defaults. | **PASS** (Automated) |
| **Organizer Journey 7: Binary Uploads & Quarantine** | Storage / Worker / API | `vitest run tests/e2e/core-organizer-journeys.test.ts` | Passed. Private upload, quarantine scanning, verified download, interrupted upload abort. | **PASS** (Automated) |
| **Organizer Journey 8: Knowledge Guides & Backlinks**| API / Knowledge / Views | `vitest run tests/e2e/core-organizer-journeys.test.ts` | Passed. Guides, tags, bidirectional wiki-links, backlink resolution, saved views. | **PASS** (Automated) |
| **Organizer Journey 9: Today Layout Cross-Device** | API / Preferences | `vitest run tests/e2e/core-organizer-journeys.test.ts` | Passed. Home layout section order, visibility toggle, cross-device sync. | **PASS** (Automated) |
| **Organizer Journey 10: Authorized Search** | API / FTS / Trigram | `vitest run tests/e2e/core-organizer-journeys.test.ts` | Passed. Exact canonical result matching, cross-tenant isolation, vault exclusion. | **PASS** (Automated) |
| **Organizer Journey 11: Concurrent Edit Conflicts** | Sync / 3-Way Merge | `vitest run tests/e2e/core-organizer-journeys.test.ts` | Passed. 3-way merge conflict detection, branch preservation, client recovery. | **PASS** (Automated) |
| **Organizer Journey 12: Workspace Export / Import** | Portability / ZIP Engine | `vitest run tests/e2e/core-organizer-journeys.test.ts` | Passed. Zero-dependency ZIP export, complete ID remapping, duplicate resolution, byte checksums. | **PASS** (Automated) |
| **Organizer Journey 13: Deletion Purge & Revocation**| Lifecycle / Worker / Auth | `vitest run tests/e2e/core-organizer-journeys.test.ts` | Passed. Permanent erasure, token revocation, suppression ledger tombstone, blob purge. | **PASS** (Automated) |
| **Browser E2E: Interactive Web Journeys** | Next.js / Edge CDP | `node scripts/test-web-e2e.mjs` | 50/50 assertions passed (100%). Visual artifacts generated in `artifacts/web-e2e/`. | **PASS** (Automated) |
| **Android E2E: App Compilation & Launch** | React Native / Expo APK | `node scripts/test-android-e2e.mjs` | APK compiled (146.17 MB). Release gate reported BLOCKED due to unavailable physical hardware. | **BLOCKED** (Missing Hardware) |
| **Accessibility: TalkBack Gestures & Audio** | Physical Android Device | Manual TalkBack runbook | Unavailable without physical hardware. Headless tests verified labels & semantics. | **BLOCKED** (Missing Hardware) |
| **Security: Native Hardware KeyStore Enclave** | Android KeyStore / TEE | Native Android integration | Unavailable without physical hardware. Headless mock verified software contract. | **BLOCKED** (Missing Hardware) |
| **Push Delivery: Live FCM & Web Push** | Google FCM / Mozilla Gateway | Remote push delivery | Unavailable without production credentials. Local mock verified encrypted payloads. | **BLOCKED** (Missing Credentials) |
| **Performance: Local Save Acknowledgment** | Node / IndexedDB / Memory | `vitest run tests/performance` | p95 <= 100ms budget: observed ~15ms per save. | **PASS** (Benchmark 1) |
| **Performance: 10,000-Record Keyset Pagination** | PostgreSQL / Fastify | `vitest run tests/performance` | p95 < 150ms, mean < 80ms, heap < 25MB: observed mean ~30ms, heap growth ~6.5MB. | **PASS** (Benchmark 2) |
| **Performance: 100 Concurrent Operations** | 20 Workers / Fastify Pool | `vitest run tests/performance` | Read p95 < 300ms (14.8ms), Mutation p95 < 500ms (110.2ms). | **PASS** (Benchmark 3) |
| **Performance: Worker SKIP LOCKED Lease** | PostgreSQL / Worker | `vitest run tests/performance` | p95 < 75ms budget: observed 38.6ms p95. | **PASS** (Benchmark 4) |
| **Monorepo Test Suite** | Vitest / All Packages | `pnpm test:unit` | 60/60 test files and 874/874 tests passing (100%). | **PASS** (Automated) |
| **Type Integrity** | TypeScript Compiler | `pnpm typecheck` | Clean across all 13 workspace projects (0 errors). | **PASS** (Automated) |
| **Lint & Formatting** | ESLint & Prettier | `pnpm lint && git diff --check` | Clean (0 errors, 0 warnings, 0 whitespace defects). | **PASS** (Automated) |
| **Secret Scanning** | Gitleaks regex scanner | `pnpm audit:secrets` | 1,840 files checked without detecting unapproved secrets. | **PASS** (Automated) |
| **Dependency Vulnerabilities** | pnpm audit / audit script | `pnpm audit:deps` | 2 unapproved transitive dev-only advisories (`node-forge`, `braces`) awaiting owner approval. | **BLOCKED** (Policy Fail-Closed) |

### Visual Artifacts

Generated during Browser E2E verification via Edge CDP:
- `artifacts/web-e2e/today-light-desktop.png`: Today view in light theme with routines and task items.
- `artifacts/web-e2e/today-dark-desktop.png`: Today view in dark theme.
- `artifacts/web-e2e/today-light-mobile-320px.png`: Today view responsive layout at 320px mobile width.
- `artifacts/web-e2e/library-root-desktop.png`: Library view with folders and documents.
- `artifacts/web-e2e/library-software-desktop.png`: Library subfolder navigation and breadcrumb hierarchy.
- `artifacts/web-e2e/library-guides-mixed-items.png`: Library mixed records and knowledge guides.
- `artifacts/web-e2e/library-mobile-320px.png`: Library view responsive layout at 320px mobile width.
- `artifacts/web-e2e/plan-calendar-desktop.png`: Plan calendar month and deadline grid.
- `artifacts/web-e2e/settings-bangla-desktop.png`: Settings surface with localization readiness.
- `artifacts/web-e2e/account-deletion-desktop.png`: Google Play compliant public account deletion form.
- `artifacts/web-e2e/journal-reflection-desktop.png`: Journal reflection writing surface.

## Defects, limitations and recovery

### Release Gate Status: BLOCKED

Phase 37 verification confirms that all software components, database migrations, security boundaries, and performance targets function correctly. However, per repository rules (`AGENTS.md`) and the Phase 37 specification:
> "Phase 37 must remain blocked until every required gate has genuine evidence. Do not deploy a beta, invite testers, submit to stores, or delete production data."

### Precise Evidence Required to Unblock Release

1. **Physical Android TalkBack Hardware Verification**:
   - Verification of TalkBack screen-reader gesture navigation, accessible touch targets, and accessibility announcements on a physical Android device.
2. **Native Hardware Android KeyStore Verification**:
   - Verification of private key generation and hardware-backed biometric authentication inside the Android hardware security module / TEE.
3. **Production Push Provider Credentials**:
   - Live delivery verification of VAPID Web Push (Mozilla/Chrome push services) and Android FCM push notifications using production service accounts.
4. **Owner Review of Build-Time Dependency Advisories**:
   - Human project owner review and signed approval evidence in `docs/security/approvals/` for transitive build-time advisories `GHSA-86w9-cpqp-85rv` (`node-forge`) and `GHSA-vfj7-8cjw-p6xm` (`braces`), documented in `docs/security/pending-exception-proposals.md`.
5. **App Store & Cloud Infrastructure Deployment**:
   - Google Play Console credentials and production staging environment for controlled beta distribution.

## Documentation and Git review

- **Updated documents:**
  - `docs/phase-reports/phase-37.md` (this report).
  - `docs/roadmap/progress.json`: Phase 37 recorded as `blocked` with complete documented blockers; `activePhase: null`, `nextPhase: null`.
  - `CHANGELOG.md`: Updated with Phase 37 release gate verification details.
- **`git diff --check`:** Clean (0 whitespace errors or conflict markers).
- **Intended conventional commit subject:** `test(core): verify organizer quality and release readiness`.

## Handoff

Phase 37 is verified and recorded as `blocked`. Stop before Phase 38. Do NOT deploy a beta, invite testers, or submit to app stores.
