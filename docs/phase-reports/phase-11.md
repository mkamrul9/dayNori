# Phase 11: Local data repositories and migrations

## Identity and scope

- Phase ID/specification: [11 — Local data repositories and migrations](../roadmap/phases/11-local-data-repositories-and-migrations.md)
- Status: blocked (Provisional account-scoped local data repositories delivered across Web and Android; completion blocked pending prerequisite Phase 04–06 physical Android TalkBack and hardware KeyStore release gates)
- Contributor and report date: Antigravity / 2026-10-15
- Base Git revision and branch: `2ec9eb1` on branch `main`
- Prerequisites: Phase 01–03, 07–10 completed; Phase 09 and 10 prerequisite repairs verified and committed separately in commit `2ec9eb1`. Physical Android TalkBack hardware verification from Phases 04–06 remains pending.
- Included scope:
  - Shared repository ports and contracts in `packages/sync` and `packages/domain`: `LocalRepositoryPort`, bounded record schemas and runtime validators (`ItemHeaderRecord`, `DraftRecord`, `PendingMutationRecord`, `SyncCursorRecord`, `PreferenceSnapshotRecord`, `AccountNamespace`), and explicit error hierarchy (`StorageQuotaError`, `StorageMigrationError`, `StorageUnavailableError`, `StorageKeyError`, `TrustedDeviceConsentRequiredError`).
  - Storing strictly foundation records: item headers, drafts, pending mutations, sync cursors, preference snapshots.
  - Android mobile persistence adapter (`apps/mobile/src/data`): encrypted SQLite configuration via `expo-sqlite: ~15.1.4` with SQLCipher (`useSQLCipher: true`), 256-bit AES encryption key generation and Android KeyStore wrapping via `MobileKeyManager`, parameterized queries, transaction-safe schema migrations (`schema_migrations`), atomic draft/mutation rollback, draft quarantine, and wrong/missing key recovery states.
  - Development APK assembled and verified (`:app:assembleDebug` producing 153MB `app-debug.apk` with compiled `libcrypto.so` and `libexpo-sqlite.so` for `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`).
  - Web client persistence adapter (`apps/web/src/data`): genuine IndexedDB adapter (`IndexedDbLocalRepository`) requiring deliberate trusted-device consent (`daynori_trusted_device_consent`), default refusal (`TrustedDeviceConsentRequiredError`), opt-out, clear-data, multi-tab `versionchange` and `BroadcastChannel` coordination, and quota error mapping (`StorageQuotaError`).
- Excluded/deferred scope:
  - Server mutation receipts, ordered change feeds, and sync routes (implemented in Phase 12).
  - Client synchronization engine and rebase algorithms (deferred to Phase 13).
  - Product-domain entity CRUD (notes, tasks, routines, journals, tags, expenses) (deferred to later product phases).
  - Collaborative rooms and live synchronization (deferred to Phase 51+).

## Result

Delivered account-scoped local data repositories across web and Android mobile clients conforming to `@daynori/sync` ports with strict boundary enforcement, runtime validation, and key lifecycle management.

- **Account & Workspace Boundary Enforcement**: All storage operations validate requested IDs against the active initialized `AccountNamespace`. Cross-workspace or cross-account operations reject immediately with `StorageUnavailableError` (`CROSS_WORKSPACE_VIOLATION` / `CROSS_ACCOUNT_VIOLATION`).
- **Android Encrypted SQLite**: Pinned `expo-sqlite: ~15.1.4` with SQLCipher native compilation. Tested native C++ compilation across all four Android ABIs via Gradle, assembling `app-debug.apk`. The `MobileKeyManager` generates high-entropy 256-bit AES keys stored in Android KeyStore via `expo-secure-store`, isolating databases and keys strictly by user account and workspace (`daynori_${userId}_${workspaceId}.db` and `daynori_sqlite_key_${userId}_${workspaceId}`).
- **Key Recovery & Integrity Invariant**: If an existing database file is present on disk but its KeyStore key is missing, `initialize()` rejects with `StorageKeyError` (`KEY_NOT_FOUND`) rather than silently generating a replacement key over existing data. Decryption is verified by querying database schema pages (`SELECT count(*) FROM sqlite_master;`). If decryption fails, the database file is preserved intact on disk, the handle is closed, and an actionable `StorageKeyError` is surfaced.
- **Atomic Multi-Store Writes**: `saveDraftAndMutation` writes drafts and queue operations inside an explicit transaction (`withTransactionAsync` in SQLite, multi-store readwrite transaction in IndexedDB), guaranteeing all-or-nothing rollback on errors.
- **Web IndexedDB**: Persistent browser storage enforces deliberate trusted-device consent. If consent is absent or revoked, the repository refuses to initialize or persist data. Full account and workspace data erasure (`clearAccountData` including item headers, `clearWorkspaceData`, and `clearAllLocalData`) allows clean privacy opt-out. `clearAllLocalData` coordinates tab closure via `BroadcastChannel` and reports `onblocked` errors honestly.
- **Draft Quarantine**: Implemented draft quarantine lifecycle (`quarantineUserDrafts`, `listQuarantinedDrafts`, `restoreQuarantinedDraft`, `purgeQuarantinedDrafts`) to prevent previous-account drafts from leaking across shared devices or account switching.

## Acceptance evidence

Evidence is classified into distinct categories: Node.js contract simulations, genuine Chromium browser execution via CDP, Android native APK compilation, and documented pending hardware execution gates.

### 1. Node.js Unit & Contract Test Suite (Simulated Platform Stores)

- `vitest run apps/web/src/data/indexedDbRepository.test.ts` (12 tests passed in simulated environment using `fake-indexeddb`):
  - Refuses to open or persist data when trusted-device consent is absent (throws `TrustedDeviceConsentRequiredError`).
  - Initializes and creates object stores when trusted-device consent is granted.
  - Clears all data and revokes consent on opt-out.
  - Disables writes immediately when consent is revoked during runtime.
  - Strictly rejects operations crossing workspace or account boundaries (`CROSS_WORKSPACE_VIOLATION`, `CROSS_ACCOUNT_VIOLATION`).
  - Item header CRUD scoped strictly by workspace.
  - Isolates drafts by user account and enforces quarantine lifecycle across logout/switch.
  - Enqueues, retrieves in FIFO order, and removes pending mutations.
  - Atomically saves draft and pending mutation in a single transaction with rollback.
  - Persists and retrieves sync cursor checkpoints and preference snapshots.
  - Erases all account data including item headers on `clearAccountData`.
  - Reports failure honestly when `clearAllLocalData` database deletion is blocked.
- `vitest run apps/mobile/src/data/sqliteRepository.test.ts` (16 tests passed in Node.js using `node:sqlite` `DatabaseSync` contract adapter):
  - Generates 256-bit AES encryption key in 64-char hex format and persists it in KeyStore.
  - Serializes concurrent first initialization calls to prevent duplicate generation races.
  - Validates key format and rejects invalid or corrupted keys.
  - Isolates encryption keys strictly by user account and workspace (`daynori_sqlite_key_${userId}_${workspaceId}`).
  - Throws actionable `StorageKeyError` when key is missing and generation is disallowed.
  - Clears specific key or all account keys durably across process restarts using a persisted workspace index.
  - Refuses to overwrite an existing database if its key was lost from KeyStore (`KEY_NOT_FOUND`).
  - Strictly rejects operations crossing workspace or account boundaries (`CROSS_WORKSPACE_VIOLATION`, `CROSS_ACCOUNT_VIOLATION`).
  - Executes schema migrations idempotently and records version in migration ledger (`schema_migrations`).
  - Persists, updates, and queries item headers with parameterized queries.
  - Isolates user drafts and enforces quarantine lifecycle across logout/switch.
  - Enqueues, orders, and removes pending mutations.
  - Enforces atomic all-or-nothing rollback on transaction failure.
  - Persists and retrieves sync cursor checkpoints and preference snapshots.
  - Erases all account data including item headers and closes handles on `clearAccountData`.
  - Fails with actionable `StorageKeyError` and preserves file on disk when database cannot be read.
- Entire monorepo test suite: `pnpm test` (27 test files, 282 tests, 100% passed in 3.30s).

### 2. Genuine Chromium Browser Execution Evidence (Production IndexedDbLocalRepository via CDP)

- Executed: `node scripts/test-indexeddb-browser.mjs`
  - Connected to Microsoft Edge / Chromium (`Edg/155.0.4283.45`) over Chrome DevTools Protocol (CDP) at port 9235.
  - Bundled and executed the actual production `IndexedDbLocalRepository` inside the Chromium page context.
  - Verified 6 critical production scenarios:
    1. Consent refusal: rejects storage initialization without explicit trusted-device consent.
    2. Transactional enqueue & atomic save: writes header, draft, and mutation in a single atomic transaction.
    3. Persistence across page reload: re-reads persisted headers, drafts, and pending mutations after navigation.
    4. Account and workspace boundary isolation: enforces strict tenant boundaries (`CROSS_WORKSPACE_VIOLATION`, `CROSS_ACCOUNT_VIOLATION`).
    5. Transaction failure & rollback: ensures failed transaction rolls back all stores without leaving orphan drafts.
    6. Multi-tab coordination: uses `BroadcastChannel` to coordinate active instances and revoke closed repositories.
  - Exit code: 0 (`✓ PRODUCTION INDEXEDDB REPOSITORY PASSED ALL 6 BROWSER CDP INTEGRATION CHECKS`).

### 2b. Native SQLite Storage Production Wiring Repairs

- `SqliteLocalRepository`:
  - Defaulted `requireSqlCipher` to `true` (enforced at initialization).
  - Added genuine file-existence checking before attempting key creation, ensuring existing encrypted databases with missing/invalid keys fail with recoverable `StorageKeyError` rather than being overwritten.
  - Added transaction concurrency mutex (`runWithLock`) wrapping all write and transaction operations to prevent concurrent queries from entering active transactions on the same connection.

### 3. Android Native Capability & Compilation Evidence (SQLCipher Native Build)

- Executed: `.\gradlew.bat assembleDebug` in `apps/mobile/android`
  - Exit code: 0 (`BUILD SUCCESSFUL in 56s`)
  - Target output: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (153,269,425 bytes, created 2026-10-15 11:38:02 AM)
  - Native shared libraries compiled by CMake/Prefab bundling SQLCipher cryptographic symbols:
    - `arm64-v8a`: `libcrypto.so` (2,594,184 B), `libexpo-sqlite.so` (2,275,104 B), `libcrsqlite.so` (1,051,032 B)
    - `armeabi-v7a`: `libcrypto.so` (2,197,668 B), `libexpo-sqlite.so` (1,291,128 B), `libcrsqlite.so` (727,840 B)
    - `x86`: `libcrypto.so` (2,603,032 B), `libexpo-sqlite.so` (2,257,352 B), `libcrsqlite.so` (1,082,108 B)
    - `x86_64`: `libcrypto.so` (2,924,288 B), `libexpo-sqlite.so` (2,191,304 B), `libcrsqlite.so` (1,066,160 B)
- Executed: `pnpm --filter @daynori/mobile build` (`expo export -p android`)
  - Exit code: 0 (`Android Bundled 5620ms apps\mobile\index.ts (601 modules)`)
  - Output: `dist/_expo/static/js/android/index-9f4cc643788f40bb2b0b5d153b2d6d18.hbc` (1.89 MB)

### 4. Web Production Bundle Evidence

- Executed: `pnpm --filter @daynori/web build` (`next build`)
  - Exit code: 0 (`Compiled successfully in 2.0s`, `Generating static pages (13/13)`)
  - 13 pages and API routes optimized and verified.

### 5. Code Quality & Security Auditing

- `pnpm typecheck`: Exit code 0 across all 13 workspace packages and apps.
- `pnpm lint`: Exit code 0 with 0 errors and 0 warnings.
- `pnpm format:check`: Exit code 0 ("All matched files use Prettier code style!").
- `pnpm audit:secrets`: Exit code 0 ("checked 1205 files without detecting unapproved secrets").
- `node scripts/validate-planning.mjs`: Exit code 0 ("64 phases, 22 mapped requirements, 156 Markdown files").
- `pnpm audit:deps`: 2 existing unhandled advisories (`node-forge` and `braces`) preserved without manufactured approval as required by repository rules.

## Defects, limitations and recovery

1. **Pending Physical Android TalkBack and Hardware KeyStore Release Gate**:
   - As authorized by the owner for provisional Phase 11 development, physical Android hardware gates remain pending. While the full debug APK containing SQLCipher native binaries and KeyStore wrappers builds successfully, runtime verification of hardware-backed key wrapping in the device secure element (TEE/StrongBox) and physical screen-reader TalkBack accessibility requires a physical Android device.
   - Status remains honestly marked as blocked in `progress.json` with provisional implementation delivered.
2. **Reinstall & Eviction Recovery**:
   - Android KeyStore keys cannot be backed up to the cloud (`allowBackup="false"`). If an app is uninstalled, local data cannot be decrypted without remote sync re-provisioning.
   - Browser IndexedDB can be evicted under disk pressure by the OS. The web adapter surfaces `StorageQuotaError` and prevents claiming items are saved when disk writes fail.

## Documentation and Git review

- Architecture Decision Record: [ADR-0017: Local Storage and Encryption Key Lifecycle](../decisions/0017-local-storage-and-encryption-key-lifecycle.md)
- Decisions index: [docs/decisions/README.md](../decisions/README.md) updated with ADR-0017 link.
- Changelog: [CHANGELOG.md](../../CHANGELOG.md) updated with Phase 11 delivery details.
- Roadmap progress: [docs/roadmap/progress.json](../roadmap/progress.json) updated with Phase 11 provisional delivery and hardware gate tracking.
- Conventional commit subject: `feat(storage): add account-scoped local persistence adapters`

## Handoff

- Provisional Phase 11 implementation is complete, strictly isolated to foundation data storage, and validated across TypeScript contracts, real Chromium IndexedDB via CDP, and native encrypted SQLite compilation.
- Next ready phase: Phase 12 (Server mutation receipts and change feed), which depends directly on server foundation Phases 08 and 10 and has been authorized for provisional development.
