# Phase 11: Local data repositories and migrations

## Identity and scope

- Phase ID/specification: [11 — Local data repositories and migrations](../roadmap/phases/11-local-data-repositories-and-migrations.md)
- Status: blocked (Provisional account-scoped local data repositories delivered across Web and Android; completion blocked pending prerequisite Phase 04–06 physical Android TalkBack and hardware KeyStore release gates)
- Contributor and report date: Antigravity / 2026-10-15
- Base Git revision and branch: `2ec9eb1` on branch `main`
- Prerequisites: Phase 01–03, 07–10 completed; Phase 09 and 10 prerequisite repairs verified and committed separately in commit `2ec9eb1`. Physical Android TalkBack hardware verification from Phases 04–06 remains pending.
- Included scope:
  - Shared repository ports and contracts in `packages/sync` and `packages/domain`: `LocalRepositoryPort`, bounded record schemas (`ItemHeaderRecord`, `DraftRecord`, `PendingMutationRecord`, `SyncCursorRecord`, `PreferenceSnapshotRecord`, `AccountNamespace`), and explicit error hierarchy (`StorageQuotaError`, `StorageMigrationError`, `StorageUnavailableError`, `StorageKeyError`, `TrustedDeviceConsentRequiredError`).
  - Storing strictly foundation records: item headers, drafts, pending mutations, sync cursors, preference snapshots.
  - Android mobile persistence adapter (`apps/mobile/src/data`): genuine encrypted SQLite configuration via `expo-sqlite: ~15.1.4` with SQLCipher (`useSQLCipher: true`), 256-bit AES encryption key generation and Android KeyStore wrapping via `MobileKeyManager`, parameterized queries, transaction-safe schema migrations (`schema_migrations`), atomic draft/mutation rollback, draft quarantine, and wrong/missing key recovery states.
  - Development APK assembled and verified (`:app:assembleDebug` producing 153MB `app-debug.apk` with compiled `libcrypto.so` and `libexpo-sqlite.so` for `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`).
  - Web client persistence adapter (`apps/web/src/data`): genuine IndexedDB adapter (`IndexedDbLocalRepository`) requiring deliberate trusted-device consent (`daynori_trusted_device_consent`), default refusal (`TrustedDeviceConsentRequiredError`), opt-out, clear-data, multi-tab versionchange coordination, and quota error mapping (`StorageQuotaError`).
- Excluded/deferred scope:
  - Network synchronization, sync engines, change feeds, and server mutation receipts (deferred to Phase 12).
  - Product-domain entity CRUD (notes, tasks, routines, journals, tags, expenses) (deferred to Phase 13+).
  - Collaborative rooms and live synchronization (deferred to Phase 51+).

## Result

Delivered account-scoped local data repositories across web and Android mobile clients conforming to `@daynori/sync` ports.

- **Android Encrypted SQLite**: Pinned `expo-sqlite: ~15.1.4` with SQLCipher native compilation. Tested native C++ compilation across all four Android ABIs via Gradle, assembling `app-debug.apk`. The `MobileKeyManager` generates high-entropy 256-bit AES keys stored in Android KeyStore via `expo-secure-store`, isolating databases and keys strictly by user account and workspace (`daynori_${userId}_${workspaceId}.db` and `daynori_sqlite_key_${userId}_${workspaceId}`).
- **Key Recovery & Integrity Invariant**: If a database key is lost, mismatched, or corrupted, the database file is preserved intact on disk and the adapter surfaces an actionable `StorageKeyError`. The database is never silently deleted or overwritten with a new key.
- **Atomic Multi-Store Writes**: `saveDraftAndMutation` writes drafts and queue operations inside an explicit transaction (`withTransactionAsync` in SQLite, multi-store readwrite transaction in IndexedDB), guaranteeing all-or-nothing rollback on errors.
- **Web IndexedDB**: Persistent browser storage enforces deliberate trusted-device consent. If consent is absent, the repository refuses to initialize or persist data. Full account and workspace data erasure (`clearAccountData`, `clearWorkspaceData`, and `clearAllLocalData`) allows clean privacy opt-out.
- **Draft Quarantine**: Implemented draft quarantine lifecycle (`quarantineUserDrafts`, `listQuarantinedDrafts`, `restoreQuarantinedDraft`, `purgeQuarantinedDrafts`) to prevent previous-account drafts from leaking across shared devices or account switching.

## Acceptance evidence

### 1. Automated Unit & Contract Test Suite

- `vitest run apps/web/src/data/indexedDbRepository.test.ts` (13 passed in 39ms):
  - Refuses to open or persist data when trusted-device consent is absent (throws `TrustedDeviceConsentRequiredError`).
  - Initializes and creates object stores when trusted-device consent is granted.
  - Clears all data and revokes consent on opt-out.
  - Item header CRUD scoped strictly by workspace.
  - Isolates drafts by user account and prevents cross-user access.
  - Quarantines drafts on account switch/logout and allows recovery or purging.
  - Enqueues, retrieves, and removes pending mutations preserving order.
  - Atomically saves draft and pending mutation in a single transaction.
  - Persists and retrieves sync cursor checkpoints and preference snapshots.
  - Clears all data scoped to a specific workspace while leaving others intact.
  - Clears all user-scoped records on account erasure.
  - Maps QuotaExceededError into `StorageQuotaError` and avoids false saved indicator.
- `vitest run apps/mobile/src/data/sqliteRepository.test.ts` (14 passed in 80ms):
  - Generates a 256-bit AES encryption key and persists it in KeyStore.
  - Isolates encryption keys strictly by user account and workspace (`daynori_sqlite_key_${userId}_${workspaceId}`).
  - Throws actionable `StorageKeyError` when key is missing and generation is disallowed.
  - Clears specific key or all account keys upon account removal.
  - Executes schema migrations idempotently and records version in migration ledger (`schema_migrations`).
  - Persists, updates, and queries item headers with parameterized queries.
  - Isolates user drafts and enforces quarantine lifecycle across logout/switch.
  - Enqueues, orders, and removes pending mutations.
  - Enforces atomic all-or-nothing rollback on transaction failure.
  - Persists and retrieves sync cursor checkpoints and preference snapshots.
  - Persists SQLite database to disk file isolated by account and workspace.
  - Fails with actionable `StorageKeyError` and preserves file on disk when key is invalid or database cannot be decrypted.
  - Demonstrates ciphertext inspection where synthetic private markers are not present in encrypted byte streams.
- Entire monorepo test suite: `pnpm test` (27 test files, 281 tests, 100% passed in 3.43s).

### 2. Android Native Capability & Compilation Evidence

- Executed: `.\gradlew.bat assembleDebug` in `apps/mobile/android`
  - Exit code: 0 (`BUILD SUCCESSFUL in 56s`)
  - Target output: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (153,269,425 bytes, created 2026-10-15 11:38:02 AM)
  - Native shared libraries compiled by CMake/Prefab:
    - `arm64-v8a`: `libcrypto.so` (2,594,184 B), `libexpo-sqlite.so` (2,275,104 B), `libcrsqlite.so` (1,051,032 B)
    - `armeabi-v7a`: `libcrypto.so` (2,197,668 B), `libexpo-sqlite.so` (1,291,128 B), `libcrsqlite.so` (727,840 B)
    - `x86`: `libcrypto.so` (2,603,032 B), `libexpo-sqlite.so` (2,257,352 B), `libcrsqlite.so` (1,082,108 B)
    - `x86_64`: `libcrypto.so` (2,924,288 B), `libexpo-sqlite.so` (2,191,304 B), `libcrsqlite.so` (1,066,160 B)
- Executed: `pnpm --filter @daynori/mobile build` (`expo export -p android`)
  - Exit code: 0 (`Android Bundled 5620ms apps\mobile\index.ts (601 modules)`)
  - Output: `dist/_expo/static/js/android/index-9f4cc643788f40bb2b0b5d153b2d6d18.hbc` (1.89 MB)

### 3. Web Production Bundle Evidence

- Executed: `pnpm --filter @daynori/web build` (`next build`)
  - Exit code: 0 (`Compiled successfully in 2.0s`, `Generating static pages (13/13)`)
  - 13 pages and API routes optimized and verified.

### 4. Code Quality & Security Auditing

- `pnpm typecheck`: Exit code 0 across all 13 workspace packages and apps.
- `pnpm lint`: Exit code 0 with 0 errors and 0 warnings.
- `pnpm format:check`: Exit code 0 ("All matched files use Prettier code style!").
- `pnpm audit:secrets`: Exit code 0 ("checked 1203 files without detecting unapproved secrets").
- `node scripts/validate-planning.mjs`: Exit code 0 ("64 phases, 22 mapped requirements, 154 Markdown files").
- `pnpm audit:deps`: 2 existing unhandled advisories (`node-forge` and `braces`) preserved without manufactured approval as required by repository rules.

## Defects, limitations and recovery

1. **Pending Physical Android TalkBack and Hardware KeyStore Release Gate**:
   - As authorized by the owner for provisional Phase 11 development, physical Android hardware gates remain pending. While the full debug APK containing SQLCipher native binaries and KeyStore wrappers builds successfully, verification of physical hardware key wrapping in the device secure element (TEE/StrongBox) and physical screen-reader talkback accessibility requires a physical Android device.
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

- Provisional Phase 11 implementation is complete, strictly isolated to foundation data storage, and validated across TypeScript contracts, real IndexedDB, and native encrypted SQLite compilation.
- Next required action: Hardware-device testing on a physical Android handset with TalkBack enabled to verify native accessibility and hardware KeyStore backing, satisfying the release gates for Phases 04, 06, 09, 10, and 11 before Phase 12 synchronization development begins.
