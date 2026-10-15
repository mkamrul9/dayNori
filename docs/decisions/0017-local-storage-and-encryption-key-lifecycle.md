# ADR-0017: Local Storage and Encryption Key Lifecycle

## Status

Accepted (Provisional implementation delivered; physical Android TalkBack and hardware KeyStore acceptance gates pending verification under Phase 04 / Phase 11 hardware release gates).

## Context

Phase 11 introduces account-scoped local data repositories for Daynori across mobile (Android) and web. Under the local-first architecture ([ADR-0004](0004-offline-command-sync.md) and [ADR-0009](0009-offline-storage-and-session-persistence.md)), clients require offline-durable persistence for foundation records: item headers, drafts, pending mutations, sync cursors, and preference snapshots.

The storage subsystem must satisfy strict security, privacy, and integrity requirements:

1. **Android Native Storage**: Must use genuine SQLCipher encrypted SQLite (`expo-sqlite` with native C++ crypto modules) rather than plaintext SQLite or in-memory simulations.
2. **Key Protection**: Encryption keys must be generated with cryptographically secure entropy, wrapped by Android KeyStore via `expo-secure-store`, and strictly isolated per user account and workspace namespace.
3. **Web Storage**: Must use genuine browser IndexedDB with explicit, opt-in trusted-device consent, default refusal, opt-out, multi-tab versionchange and BroadcastChannel coordination, and quota error propagation.
4. **Draft Safety & Quarantine**: Local uncommitted drafts from previous accounts must never be visible to or replayable by subsequent accounts on shared devices.
5. **Key Invalidation & File Preservation**: When a key is missing, wrong, or invalidated, the system must produce an actionable recovery state (`StorageKeyError`) without silently deleting the existing database or generating a replacement key over existing ciphertext.
6. **Namespace & Boundary Enforcement**: Every operation must be validated against the active initialized namespace. Cross-workspace or cross-account calls must be rejected immediately.

## Threat Model & Security Boundaries

### 1. Lost or Stolen Physical Device

- **Threat**: An adversary obtains physical possession of an Android device and attempts to extract user notes, journals, or pending mutations via raw filesystem dump or ADB backup.
- **Mitigation**: SQLCipher encrypts all database pages using 256-bit AES in CBC mode with HMAC-SHA512 integrity checks. The master encryption key is generated on-device with 256-bit cryptographic entropy and stored in Android KeyStore (hardware-backed TEE/StrongBox where available). `android:allowBackup="false"` in `AndroidManifest.xml` prevents ADB and cloud backup extraction of KeyStore keys or database files.
- **Residual Risk**: A compromised OS (rooted device with kernel-level memory dumping while the database connection is open and key is in RAM) could extract keys. This is mitigated by runtime tamper detection and explicit vault encryption gates for high-sensitivity content in later phases.

### 2. Multi-User / Shared Browser or Device

- **Threat**: Multiple family members or colleagues share an Android tablet or desktop browser. A second user logging in could access private drafts or pending operations left by the first user.
- **Mitigation**:
  - **Android**: Separate physical database files and KeyStore aliases per account and workspace (`daynori_${userId}_${workspaceId}.db` and `daynori_sqlite_key_${userId}_${workspaceId}`).
  - **Web**: Explicit trusted-device consent (`daynori_trusted_device_consent`) required before any persistent storage is created. Uncommitted drafts from previous sessions are quarantined under `drafts.isQuarantined = true` upon logout or account switch, preventing unauthorized display.
  - **Data Erasure**: Explicit `clearWorkspaceData` and `clearAccountData` operations purge records (including item headers) upon account removal.
  - **Namespace Validation**: All reads, writes, mutations, and cursors validate that requested IDs match the active `AccountNamespace`.

### 3. Key Loss & Invalidation

- **Threat**: The user reinstalls the app, clears app data, or OS biometrics change, causing KeyStore key eviction.
- **Policy**: If an existing database file exists on disk but cannot be opened with the KeyStore key (`file is not a database` or `KEY_NOT_FOUND`), the adapter **MUST NOT** silently delete the file or create a fresh database overwriting it with a replacement key. It throws an explicit `StorageKeyError`, entering an actionable recovery flow where the user is informed of key loss and given an explicit choice before destructive replacement. Decryption is verified by touching actual database schema pages (`SELECT count(*) FROM sqlite_master;`).

## Decision

### 1. Shared Persistence Contracts (`packages/sync`)

- Ports and models defined in `@daynori/sync`:
  - `LocalRepositoryPort`: Common asynchronous port covering item headers, drafts & quarantine, pending mutation queue, atomic multi-store writes, sync cursors, preference snapshots, and boundary erasure.
  - Bounded typed record models and runtime validators: `ItemHeaderRecord`, `DraftRecord`, `PendingMutationRecord`, `SyncCursorRecord`, `PreferenceSnapshotRecord`, `AccountNamespace`.
  - Explicit error hierarchy: `StorageQuotaError`, `StorageMigrationError`, `StorageUnavailableError`, `StorageKeyError`, `TrustedDeviceConsentRequiredError`.

### 2. Android Encrypted SQLite Adapter (`apps/mobile`)

- Configured pinned `expo-sqlite: ~15.1.4` with `useSQLCipher: true` via config plugin in `app.json`.
- Verified native compilation: Gradle C++ CMake build produces `libcrypto.so` (OpenSSL) and `libexpo-sqlite.so` with SQLCipher across all target ABIs (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`), packaged into `app-debug.apk`.
- Key lifecycle managed by `MobileKeyManager`:
  - Generates 256-bit cryptographically secure keys via standard crypto API.
  - Validates key format (64 hex characters) and serializes concurrent first initialization calls.
  - Persists keys in Android KeyStore via `expo-secure-store` with `WHEN_UNLOCKED` accessibility.
  - Durably tracks workspace keys per account in a persistent index, enabling clean erasure across app restarts.
  - Namespaces keys per account and workspace: `daynori_sqlite_key_${userId}_${workspaceId}`.
- Database access managed by `SqliteLocalRepository`:
  - Enforces active namespace on every operation (`CROSS_WORKSPACE_VIOLATION`, `CROSS_ACCOUNT_VIOLATION`).
  - Verifies database file existence: if file exists without KeyStore key, rejects with `KEY_NOT_FOUND`.
  - Applies `PRAGMA key = '<key>';` immediately after opening database.
  - Verifies decryption by querying schema pages (`SELECT count(*) FROM sqlite_master;`).
  - Manages schema migrations via `schema_migrations` ledger in atomic transactions.
  - Atomicity: `saveDraftAndMutation` executes within `withTransactionAsync`, ensuring all-or-nothing rollback on disk or constraint errors.
  - Zero false saved indicators: "Saved on this device" is never returned or asserted before the SQLite transaction successfully commits.

### 3. Web IndexedDB Adapter (`apps/web`)

- Managed by `IndexedDbLocalRepository`:
  - Checks `getTrustedDeviceConsent()` prior to opening IndexedDB (`daynori_web_storage`, v1).
  - Default refusal: Throws `TrustedDeviceConsentRequiredError` if consent has not been explicitly granted via `setTrustedDeviceConsent(true)`.
  - ObjectStores: `item_headers`, `drafts`, `pending_mutations`, `sync_cursors`, `preference_snapshots`.
  - Multi-tab coordination: Subscribes to `db.onversionchange` and `BroadcastChannel` (`daynori_storage_coordination`) to close active connections when other tabs upgrade or revoke consent.
  - Explicit clear: `clearAllLocalData()` deletes all IndexedDB stores, reports `onblocked` errors honestly, and revokes trusted-device consent.

## Consequences & Tradeoffs

### Positive

- Genuine native SQLCipher encryption on Android prevents offline plaintext extraction from lost or stolen devices.
- Hardware-backed KeyStore wrapping eliminates hardcoded or derive-only keys.
- Full parity between Web and Mobile data repository contracts ensures portable domain logic.
- Atomic multi-store writes eliminate orphaned drafts or mutations.
- Strict namespace enforcement prevents cross-workspace data leakage.

### Limitations & Remaining Gates

- **Physical Device Release Gate**: While the native capability build (`assembleDebug` producing 153MB `app-debug.apk`) compiles native SQLCipher shared libraries, end-to-end verification on a physical Android hardware device (TalkBack accessibility, hardware Keystore backing, and raw byte dumping from physical storage) remains pending as authorized for provisional development.
- **Reinstall Data Loss**: Because encryption keys are stored exclusively in Android KeyStore without cloud backup (`allowBackup="false"`), uninstalling the application or clearing OS app storage permanently destroys the encryption key. Prior local databases on device become unrecoverable without remote sync re-provisioning.
