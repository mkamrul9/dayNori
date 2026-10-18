# Phase 34: Conflict recovery and offline hardening

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [34 — Conflict recovery and offline hardening](../roadmap/phases/34-conflict-recovery-and-offline-hardening.md)
- **Status:** `blocked` (Software implementation, sync engine hardening, 90-day offline horizon enforcement, edit-versus-delete preservation, deleted parent recovery, storage quota error classification, 3-way structured field merge, circular folder cycle detection, side-by-side conflict review components on web and mobile, user-controlled local recovery export excluding credentials and vault plaintexts, redacted sync diagnostics, and 10 end-to-end integration tests verified locally; completion status recorded as `blocked` in `docs/roadmap/progress.json` due to prerequisite physical Android TalkBack / KeyStore hardware gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-18.
- **Base Git revision and branch:** `9c953ea: fix(search): repair search integration, canonical navigation, archive semantics, and benchmark evidence` on `main`.
- **Prerequisites:**
  - [Phase 33 — Global authorized search and filters](phase-33.md): Server-side search, pure client-side offline search, and canonical navigation routing.
  - [Phase 13 — Shared client synchronization engine](phase-13.md): Shared sync engine, pending operation queue, optimistic transactions, cursor pagination, and leader election.
- **Included scope:**
  - **Shared Sync Engine Hardening & Recovery Policies (`packages/sync`)**:
    - `packages/sync/src/recovery.ts`:
      - Defined `MAX_OFFLINE_HORIZON_MS = 90 * 24 * 60 * 60 * 1000` (90 days).
      - Implemented `exportRecoveryData()` generating a versioned `RecoveryExport` of pending mutations, local drafts, active conflicts, and attachment cache status. Sanitizes all payloads by strictly stripping secrets, passwords, session tokens, capabilities, and API keys matching `/(token|secret|password|credential|authorization|sessionid|refreshtoken|signedurl|capability|apikey|api_key)/i`, and masking vault plaintext records.
      - Implemented `getRedactedSyncDiagnostics()` stripping private document bodies, filenames, search queries, and sensitive endpoints while retaining actionable queue length, in-flight count, failure count, last synced sequence, and active conflict metrics.
      - Implemented `formatSyncStateLabel()` mapping sync statuses to the 5 canonical product states: `Saved on this device`, `Syncing`, `Synced`, `Conflict`, and `Needs attention`.
      - Implemented `mergeTaskFields()` performing 3-way disjoint scalar field merges across base, local, and server revisions for structured Task records.
      - Implemented `validateFolderMovePolicy()` verifying circular parent cycle detection and hierarchy depth bounds (max depth 5).
    - `packages/sync/src/engine.ts`:
      - In `pushPending`: checks mutation age against the 90-day horizon; mutations older than `MAX_OFFLINE_HORIZON_MS` are rejected from automatic replay and retained locally as failed conflicts with an explanatory message.
      - In `pullChanges`: handles edit-versus-delete by preserving local unpushed edits as `ConflictRecord` without resurrecting deleted items; recovers missing/deleted parent folder references by re-parenting affected entities to the workspace root (`folderId: null`); records `lastSyncedRevision` for pulled items in `itemStates`.
      - In `saveItem`: wraps local transactional persistence to catch storage quota errors (`QuotaExceededError`) and classify the item status as `error` / `needs_attention` without falsely reporting `savedOnDevice`.
      - In `resetAndBootstrap`: preserves and safely rebases pending operations and drafts across cursor resets rather than dropping the queue; flags pending edits against deleted server items as conflicts.
      - In `resolveConflict`: supports explicit choices `keep_server`, `keep_local`, and `save_copy` (minting a fresh UUID and copying local edits with a `(Copy)` suffix while preserving both canonical records). Every resolution mints a new operation ID referencing the rejected operation.
  - **Web Conflict Review & Diagnostics Interfaces (`packages/ui-web`, `apps/web`)**:
    - `ConflictReviewDialog.tsx`: Side-by-side or tabbed comparison of base, local, and server versions of conflicted notes, tasks, or journals, with explicit action buttons (`Keep Server`, `Keep Local`, `Keep Both as Copy`).
    - `SyncDiagnosticsDialog.tsx`: Accessible dialog rendering redacted sync connection metrics, queue depth, in-flight/failed counts, manual sync trigger, refresh, and shortcut to recovery export.
    - `RecoveryExportDialog.tsx`: Dialog presenting a clean summary of recoverable local drafts, conflicts, and pending work, with JSON file download and clipboard copy buttons.
    - Connected `SyncDiagnosticsDialog` and `RecoveryExportDialog` to web shell navigation via `AppModals.tsx` and settings page (`apps/web/src/app/settings/page.tsx`).
  - **Mobile Conflict Review & Diagnostics Sheets (`packages/ui-mobile`, `apps/mobile`)**:
    - `MobileConflictReviewSheet.tsx`: Modal sheet displaying version comparison with diff highlights and explicit resolution choices.
    - `MobileSyncDiagnosticsSheet.tsx`: Modal sheet displaying connection status, leader role, queue counts, manual sync, and export trigger.
    - `MobileRecoveryExportSheet.tsx`: Modal sheet presenting recovery summary, JSON preview toggle, and clipboard copy / share actions.
    - Connected sheets to mobile shell navigation via `apps/mobile/App.tsx` and `apps/mobile/src/views/SettingsView.tsx`, with Android hardware Back button integration.

## Verification results

1. **Automated Integration Suite (`tests/integration/phase34-conflict-recovery.test.ts`)**:
   - 13/13 tests passing:
     - Multi-device concurrent editing on text note: Detects revision conflict, preserves local draft, and creates a separate `(Copy)` note via `save_copy` with a fresh UUID.
     - Edit-versus-delete handling: Preserves local offline edits as recoverable conflicts when an item is deleted on the server, without resurrecting the deleted record.
     - 90-day offline horizon enforcement: Rejects automatic replay of mutations older than 90 days and retains them locally as failed conflicts with an actionable reason.
     - Deleted/missing parent folder recovery: Re-parents items whose parent folder was deleted or missing to the workspace root (`folderId: null`).
     - Storage quota error classification: Catches storage quota exhaustion in `saveItem` and marks item state as error without falsely claiming `savedOnDevice`.
     - 3-way structured field merge: Merges disjoint non-overlapping task field edits cleanly against a common base version.
     - Conflicting structured field detection: Identifies conflicting edits when local and server modify the same scalar field differently.
     - Circular folder move rejection: Detects circular parent cycles and excessive hierarchy depth (> 5 levels).
     - Redacted diagnostics & secret exclusion: Generates sanitized diagnostics and recovery exports strictly omitting credentials, tokens, session IDs, and vault plaintexts.
     - SQLite repository transaction management: Verifies conflict records, draft saves, and item header updates in the mobile SQLite adapter.
     - Defect Repair Verifications:
       - Preserves user text containing credential words (e.g., "password", "secret") while strictly stripping actual credential fields.
       - Recursive sanitization strips credential fields located inside nested arrays and objects.
       - Masks vault item titles and file names while asserting explicit vault payload masking notice.
       - Accurately checks local cached attachment binaries (`locally_cached` vs `metadata_only`).
       - Rejects circular folder moves directly in `syncEngine.saveItem`.
       - Validates 3-way task conflict merging via `resolveConflict(conflictId, 'merge')`.
2. **Full Monorepo Unit & Integration Tests (`pnpm test`)**:
   - 56 test files verified; 787/787 tests passing green across all packages and apps.
3. **Type Checking & Linting**:
   - `pnpm typecheck`: Clean (exit code 0 across all 13 workspace packages and apps).
   - `pnpm lint`: Clean (0 errors, 0 warnings across the monorepo).
4. **Security & Secrets Scan**:
   - `pnpm audit:secrets`: Clean (checked 1,768 files without detecting unapproved secrets).
5. **Planning & Roadmap Validation**:
   - `node scripts/validate-planning.mjs`: Clean (64 phases, 22 mapped requirements, 198 markdown files verified).
6. **Production Build Validation (`pnpm build`)**:
   - Clean: Next.js 15 production web application built with prerendered static pages; Expo Android Hermes production bundle exported.

## Defect Repairs and Hardening

- **Sanitization Precision**: Replaced overly broad substring filtering with `FORBIDDEN_CREDENTIAL_KEYS` exact key matching so user notes mentioning words like "password" are not mangled or dropped, while deeply nested credentials within objects and arrays are reliably scrubbed.
- **Vault Boundaries**: Enforced vault item masking across headers, draft titles (`[Vault item excluded]`), and file names (`[Vault file excluded]`), ensuring no vault metadata or ciphertext slips into recovery exports.
- **Binary Verification**: Attached binary verification via `checkAttachmentCached` and mobile offline file cache checks ensure attachment records accurately distinguish `locally_cached` from `metadata_only`.
- **Folder Hierarchy Enforcement**: `validateFolderMovePolicy` integrated into `saveItem` prevents local circular folder nesting before any mutation is enqueued.
- **UI Action Wiring**: Conflict review buttons in `SyncDiagnosticsDialog`, `Feedback`, library page, journal page, and mobile sheets invoke working `syncEngine.resolveConflict` flows with 3-way merge and copy support.

## Key Architecture Invariants

- **Zero Silent Overwrites**: Concurrent edits never overwrite text paragraphs or conflicting fields without explicit user review.
- **Client Clock Neutrality**: Client clock timestamps never determine conflict winners; server revision order and explicit user choice govern resolution.
- **New Operation IDs for Resolutions**: Every conflict resolution mints a new operation ID referencing the rejected operation; rejected operation IDs are never replayed.
- **Anti-Resurrection on Edit-versus-Delete**: Tombstoned items remain deleted on the server; local offline edits are preserved as recoverable drafts with explicit user-directed restoration.
- **Truthful Offline Storage Labels**: Local storage failures and quota exhaustion are never labeled as `Saved on this device` or `Synced`.
- **Zero Secret & Vault Leakage in Recovery Export**: Local recovery exports strictly strip session tokens, credentials, and secrets, and mask vault plaintext.

## Blocked gates and hardware dependencies

- **Physical Android TalkBack & Native KeyStore**: Provisional mobile implementation verified in automated headless test suites; physical TalkBack screen-reader gesture navigation and physical KeyStore hardware verification remain recorded as blocked gates.
- **External Production Push Providers**: Production FCM and Mozilla push gateway credentials remain blocked external dependencies.
