# Changelog

## Phase 15 — Folder browsing and organization interfaces — 2026-10-15

- **Web Library Interface (`apps/web`):**
  - Implemented folder browsing with root/Inbox view (`parentId === null`) and drill-down into nested subfolders.
  - Added accessible `BreadcrumbNav` component with `<nav aria-label="Breadcrumb">`, `<ol>`/`<li>`, `aria-current="page"`, visible focus ring, and dedicated Up button navigation.
  - Displayed mixed folder contents containing child folders, notes, tasks, routines, and journals with semantic `ItemTypeBadge` components.
  - Added non-destructive module view filters (`All Items`, `Notes`, `Knowledge`, `Files`, `Tasks`) projecting content without altering folder hierarchy.
  - Implemented folder CRUD operations: Create folder dialog with depth enforcement (`MAX_FOLDER_DEPTH = 5`), color, icon, and parent selection; Rename dialog; Move dialog with cycle prevention (`detectCycle`); Delete dialog supporting both `preserve_to_parent` and `trash_subtree` policies; Archive/Unarchive toggle.
  - Supported accessible reordering via touch/pointer buttons (▲ / ▼) and keyboard shortcuts (`Alt+Up` / `Alt+Down`) with polite `aria-live` screen-reader announcements.
  - Added floating undo toast with 10-second countdown and optimistic revision check for reversible actions.
  - Decoupled local persistence indicator (`Saved on device` via `IndexedDbLocalRepository` when trusted-device consent is granted) from cloud sync status (`Synced`, `Syncing`, `Offline`, `Conflict`, `Error`).
  - Added bounded 10 items/page pagination for large folders and demo journeys seeder for Software and Government Jobs research fixtures.
  - Ensured full WCAG 1.4.10 mobile reflow compliance at 320px viewport width without horizontal scrollbars.
- **Mobile Library Interface (`apps/mobile`):**
  - Implemented mobile folder browsing with root and nested drilldown navigation.
  - Added `MobileBreadcrumb` with Up button navigation and 48dp touch targets.
  - Implemented module filter tabs (`all`, `notes`, `knowledge`, `files`) preserving backward-compatible testIDs (`library-filter-${key}`).
  - Displayed mixed items with semantic `MobileTypeBadge` cards.
  - Added bottom action sheets for folder creation, renaming, and deletion (with subtree option).
  - Implemented touch reordering buttons (▲ / ▼) with 48dp minimum touch targets.
  - Added floating undo notification banner for reversible operations.
  - Displayed local storage status and cloud synchronization badges.
  - Integrated sample journey loader for Software and Government Jobs journeys.
- **Shared UI Components (`packages/ui-web`, `packages/ui-mobile`):**
  - Added `BreadcrumbNav` and `ItemTypeBadge` to `@daynori/ui-web`.
  - Added `MobileBreadcrumb` and `MobileTypeBadge` to `@daynori/ui-mobile`.
- **Decision Record:**
  - Published [ADR-0021: Folder Browsing and Library Interfaces](docs/decisions/0021-folder-browsing-and-library-interfaces.md).

## Phase 14 — Collections, folders, and shared item metadata — 2026-10-15

- **Unified Workspace Folder Hierarchy (`infra/supabase`, `packages/contracts`, `apps/api`):**
  - Applied migration `00012_organization_folders_and_metadata.sql` introducing `app.folders`, `app.tags`, `app.item_tags`, `app.item_links`, and PL/pgSQL invariant validation function `app.validate_folder_parent`.
  - Folders share unified `app.items` core table with `kind = 'folder'`, security scope (`standard` / `vault`), archive and pin states, rank, and revision tracking.
  - Implemented strict depth bound (`MAX_FOLDER_DEPTH = 5`) and cycle prevention walking ancestor links, enforced transactionally at both domain and database trigger levels.
  - Subtree moves verify that `target_parent_depth + subtree_depth <= 5` preventing descendants from exceeding max depth.
  - Defined explicit folder deletion policies:
    - `preserve_to_parent`: Moves direct child folders and items to parent (or Inbox if deleted folder was root).
    - `trash_subtree`: Recursively tombstones the folder and all its descendant items and folders (`deleted_at = now()`).
  - Implemented safe restoration (`restoreFolder`), reparenting to root if former parent is deleted.
- **Inbox Semantics & Common Item Metadata:**
  - Defined `folder_id = NULL` as workspace Inbox; newly captured items default to Inbox and items can be moved freely between Inbox and folders.
  - Extended generic item creation routes and sync push dispatches to validate folder invariants (parent folder existence, deleted status, kind, security scope).
- **Sparse Ranking & Rebalancing (`packages/domain`, `apps/api`):**
  - Sibling items and folders ordered by sparse lexicographical rank strings with UUID tie-breakers.
  - Added sibling rebalancing endpoint (`/v1/workspaces/:workspaceId/folders/rebalance`) to redistribute sibling ranks with step 1000.
- **Workspace-Scoped Tags & Item Links:**
  - Case-insensitive unique tags per workspace (`app.tags` with unique index on `(workspace_id, lower(name))`).
  - Many-to-many join in `app.item_tags` attaching and detaching tags to items without copying or duplicating item feature bodies.
  - Directed item links in `app.item_links` with self-link prevention and same-workspace validation.
- **Sync & Outbox Integration:**
  - Folder operations emit ordered events in `app.changes` and outbox intents in `app.outbox_intents`.
  - Active folders included in `syncBootstrap` snapshot items.
- **Performance Benchmark:**
  - Validated recursive hierarchy query performance with `EXPLAIN (ANALYZE, BUFFERS)` on a 310-folder synthetic hierarchy, confirming execution time of ~1.5ms (budget < 100ms).
- **Decision Record:**
  - Published [ADR-0020: Workspace Folders, Collections, and Shared Item Metadata](docs/decisions/0020-workspace-folders-and-organization.md).

## Phase 13 — Shared Client Synchronization Engine — 2026-10-15

- **Shared Synchronization State Machine (`packages/sync`):**
  - Implemented `SyncEngine` with atomic local projection/draft saving (`saveItem`) and immutable mutation enqueuing.
  - Decoupled state indicators: separated local device persistence (`savedOnDevice`) from cloud synchronization status (`cloudSyncStatus`: `'synced'`, `'syncing'`, `'saved_locally'`, `'offline'`, `'conflict'`, `'error'`, `'needs_attention'`).
  - Added dependency-aware queue draining: automatically resolves and sorts pending mutations topologically by `dependencyOperationIds` before dispatching in batches of up to 50 operations.
  - Implemented transactional acknowledgment: retains pending mutations in local storage until durable receipts are committed locally.
  - Bounded exponential backoff with jitter and cancellation on network errors.
  - Paginated incremental pulls (up to 100 changes per batch) with out-of-order revision protection and tombstone preservation.
  - Implemented safe snapshot reset (`resetAndBootstrap`) when encountering HTTP 409 `SYNC_RESET_REQUIRED`, reconstructing local projection from a fresh snapshot while strictly preserving unsent local drafts, pending mutations, and conflicts.
  - Explicit conflict lifecycle: detected conflicts are exposed via `ConflictRecord`; user resolution (`keep_local`, `keep_server`, `custom`) mints fresh operation IDs with updated base revisions rather than silently overwriting or reusing rejected IDs.
  - Operational diagnostics: `getDiagnostics()` exposes metrics (queue length, in-flight count, failures, sync sequence, epoch) while strictly excluding user text, secrets, tokens, or encryption keys.
- **Multi-Tab Browser Coordination (`packages/sync`):**
  - Implemented `BroadcastChannelTabCoordinator` with heartbeat-based leader election (1000ms heartbeat, 3000ms lease) and resignation broadcast.
  - Follower tabs forward manual and automatic sync requests to the active leader; leader crashes trigger promotion of follower within 1000ms.
  - Provided `SingleProcessCoordinator` for single-instance native mobile applications.
- **Platform Adapters & Verification (`apps/web`, `apps/mobile`, `tests/integration`):**
  - Created web platform adapter in `apps/web/src/data/syncAdapter.ts` (`createWebSyncEngine`).
  - Created mobile platform adapter in `apps/mobile/src/data/syncAdapter.ts` (`createMobileSyncEngine`).
  - Added comprehensive integration test suite `tests/integration/phase13-client-sync-engine.test.ts` covering 7 core fault journeys against real PostgreSQL and Fastify API server.
  - Published [ADR-0019: Shared Client Synchronization Engine](docs/decisions/0019-shared-client-sync-engine.md).

## Hardening & Defect Repairs (Phases 11 & 12) — 2026-10-15

- **Phase 11 Storage & Verification Hardening (`apps/mobile` & `scripts`):**
  - Updated `SqliteLocalRepository` to enforce `requireSqlCipher: true` by default and perform genuine file-existence checks before creating keys, protecting existing encrypted data.
  - Added transaction concurrency mutex (`runWithLock`) to `SqliteLocalRepository` preventing interleaving of concurrent queries into active transactions.
  - Rewrote Chromium browser CDP verification script (`scripts/test-indexeddb-browser.mjs`) to load and verify the actual production `IndexedDbLocalRepository` across consent, atomicity, persistence, tenant isolation, rollback, and multi-tab coordination.
- **Phase 12 Protocol & Receipt Defect Repairs (`apps/api`, `packages/contracts`, `infra/supabase`):**
  - Implemented deterministic topological dependency ordering in `pushBatch` with 3-color DFS cycle detection and terminal failure persistence (`DEPENDENCY_CYCLE`, `DEPENDENCY_MISSING`, `DEPENDENCY_FAILED`).
  - Added receipt rechecking after acquiring workspace sync lock, ensuring identical concurrent creates return the same committed receipt.
  - Narrowed duplicate-key recovery strictly to the mutation receipts uniqueness constraint (`uq_mutation_receipts_actor_device_op`).
  - Enforced recursive key-sorted canonical hashing over command versions, dependencies, and payloads.
  - Updated `bootstrap` to return full projection representation (`revision`, `rank`, `isArchived`, `isPinned`, `securityScope`) under `REPEATABLE READ` snapshot isolation.
  - Fixed nullable updates: explicitly clearing `folderId` via `null` works.
  - Preserved tombstone semantics: updating a deleted item returns terminal rejection `ENTITY_TOMBSTONED`.
  - Integrated REST API item mutations (`POST` / `DELETE`) into the change feed sequence and outbox intents.
  - Applied migration `00011_repair_receipt_rls.sql` repairing receipt RLS to require active workspace viewer membership, and rotated access epochs on workspace membership mutations.

## Phase 12 — Server mutation receipts and change feed — 2026-10-15

- **PostgreSQL Commit-Safe Sequence & Ordered Change Feed (`infra/supabase` & `apps/api`):**
  - Applied migration `00010_server_mutation_receipts_and_change_feed.sql` introducing `app.workspace_sync_state`, `app.mutation_receipts`, `app.changes`, and `app.outbox_intents`.
  - Implemented row-lock protocol on `app.workspace_sync_state` held inside the PostgreSQL transaction until commit (`SELECT ... FOR UPDATE`), serializing mutations strictly within the target workspace and ensuring monotonic gapless sequences matching commit order.
  - Implemented ordered change feed `app.changes` indexed by `(workspace_id, seq ASC)` with tombstones (`is_tombstone = true`) retained across the 90-day offline horizon.
- **Durable Mutation Receipts & Canonical Idempotency (`apps/api`):**
  - Created `app.mutation_receipts` with uniqueness constraint on `(actor_user_id, device_id, operation_id)`.
  - Implemented deterministic key sorting and SHA-256 payload digest (`computeCanonicalPayloadHash`).
  - Safe replay handling: sequential or concurrent retries with identical payload return the existing durable receipt without allocating a new sequence or creating duplicate change records.
  - Reused operation IDs with altered payloads or target workspaces are rejected with `IDEMPOTENCY_KEY_REUSED`.
- **Sync Endpoints & Protocol (`packages/contracts`, `apps/api`, `packages/api-client`):**
  - Added batch push endpoint `POST /v1/sync/push` supporting up to 50 commands with independent per-command transaction isolation and partial batch failure reporting.
  - Added incremental pull endpoint `GET /v1/sync/pull` supporting bounded pagination and opaque checkpoint cursors.
  - Added snapshot bootstrap endpoint `GET /v1/sync/bootstrap` pairing active items with the high-watermark cursor `next_change_seq - 1`.
  - Implemented 90-day horizon and access epoch cursor expiration (`SYNC_RESET_REQUIRED`), directing clients to perform a safe snapshot reset while preserving local unsent drafts.
  - Implemented foundation sync commands: `createItem`, `updateItem`, `archiveItem`, `unarchiveItem`, `pinItem`, `unpinItem`, `trashItem`, and `restoreItem`.
  - Added client methods (`syncPush`, `syncPull`, `syncBootstrap`) in `DaynoriApiClient`.
- **Architecture Documentation & Verification:**
  - Published [ADR-0018: Commit-Safe Change Ordering and Durable Mutation Receipts](docs/decisions/0018-commit-safe-change-ordering-and-mutation-receipts.md).
  - Verified against real PostgreSQL with 18 integration tests in `tests/integration/phase12-sync-receipts-change-feed.test.ts`.
  - Synchronized OpenAPI 3.0.3 canonical specification without drift (`tests/contract/contract.test.ts`).

## Phase 11 — Local Data Repositories and Migrations — 2026-10-15

- **Shared Persistence Ports & Contracts (`packages/sync` & `packages/domain`):**
  - Defined `LocalRepositoryPort` interface for unified local data persistence across platforms.
  - Specified foundation data models and runtime validators with payload bounds: `ItemHeaderRecord`, `DraftRecord`, `PendingMutationRecord`, `SyncCursorRecord`, `PreferenceSnapshotRecord`, and `AccountNamespace`.
  - Established typed error hierarchy: `StorageQuotaError`, `StorageMigrationError`, `StorageUnavailableError`, `StorageKeyError`, and `TrustedDeviceConsentRequiredError`.
- **Android Encrypted SQLite Repository (`apps/mobile`):**
  - Pinned `expo-sqlite: ~15.1.4` with SQLCipher configuration plugin (`useSQLCipher: true`).
  - Compiled and verified native OpenSSL and SQLCipher C++ shared libraries (`libcrypto.so` and `libexpo-sqlite.so`) across all target ABIs (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) into `app-debug.apk`.
  - Implemented `MobileKeyManager` wrapping Android KeyStore (`expo-secure-store`) generating and protecting 256-bit AES encryption keys per account and workspace (`daynori_sqlite_key_${userId}_${workspaceId}`).
  - Serialized concurrent first initialization, validated 64-char hex key format, and tracked known workspace keys in persistent KeyStore index for restart-safe key erasure.
  - Implemented `SqliteLocalRepository` with parameterized queries, schema migrations (`schema_migrations`), atomic multi-store writes via `withTransactionAsync`, and draft quarantine.
  - Enforced key safety invariant: existing databases missing keys reject initialization with `StorageKeyError` (`KEY_NOT_FOUND`) rather than overwriting with a new key.
  - Decryption verified by querying database schema pages (`SELECT count(*) FROM sqlite_master;`).
  - Enforced strict account and workspace boundaries on every operation (`CROSS_WORKSPACE_VIOLATION`, `CROSS_ACCOUNT_VIOLATION`).
  - Complete account data erasure clears item headers, drafts, mutations, cursors, and KeyStore keys.
- **Web IndexedDB Repository (`apps/web`):**
  - Implemented `IndexedDbLocalRepository` against genuine IndexedDB (`daynori_web_storage`, v1).
  - Enforced deliberate trusted-device consent (`daynori_trusted_device_consent`), defaulting to refusal (`TrustedDeviceConsentRequiredError`) if ungranted.
  - Enforced strict account and workspace boundaries on every operation (`CROSS_WORKSPACE_VIOLATION`, `CROSS_ACCOUNT_VIOLATION`).
  - Complete account erasure clears item headers along with user drafts, mutations, cursors, and preferences.
  - Handled multi-tab coordination (`BroadcastChannel` and `versionchange` event listeners), honest `onblocked` error reporting, and mapped browser quota errors to `StorageQuotaError`.
  - Verified genuine Chromium browser execution via CDP (`scripts/test-indexeddb-browser.mjs`).
- **Architecture & Quality:**
  - Published [ADR-0017: Local Storage and Encryption Key Lifecycle](docs/decisions/0017-local-storage-and-encryption-key-lifecycle.md).
  - Authored contract test suites with 28 passed tests across simulated platform stores and genuine Chromium browser execution via CDP.

- **Provider-Bound Flow Initiation & Anti-Replay Callbacks (Phase 09 Repair):**
  - Added `POST /api/auth/initiate` route in web application, creating encrypted/SameSite `daynori_pkce_verifier` cookie binding state, code challenge, and timestamp.
  - Rewrote web auth callback route (`/api/auth/callback`) to reject unsolicited raw tokens (`unsolicited_token_rejected`), require flow cookie (`no_initiated_flow`), verify state challenge, and consume cookie one-time.
  - Hardened Android `MobileProviderAuthAdapter` to persist pending flow parameters (`state`, `nonce`, `codeVerifier`) in OS-backed secure storage (`SEC_KEY_PENDING_FLOW`), enabling secure cold-start recovery across process death and rejecting replayed/unsolicited callbacks.
- **Atomic Optimistic Concurrency Control (Phase 10 Repair):**
  - Replaced TOCTOU read-then-update pattern in `workspaceRepository.updateProfilePreferences` with atomic SQL predicate: `WHERE id = $1 AND ($7::bigint IS NULL OR revision = $7::bigint)`.
  - Added concurrent race test verifying two simultaneous requests with identical `expectedRevision`: exactly one passes (200) and the second fails (409 Conflict) without overwriting.
- **Legacy Workspace Reconciliation Ledger & Preflight (Phase 10 Repair):**
  - Applied migration `00009_legacy_workspace_reconciliation_and_ownership.sql` establishing `app.legacy_workspace_reconciliation_inventory` to record all duplicate personal workspaces affected by Migration 00008 as `quarantined_pending_review`.
  - Created procedure `app.reconcile_legacy_workspace()` for reviewed disposition (`archive`, `confirm_room`, `restore_as_personal_backup`).
  - Created preflight verification script `scripts/preflight-database.mjs` verifying zero unreviewed duplicate workspaces before runtime boot.
- **Personal Workspace Owner-Only Invariant (Phase 10 Repair):**
  - Added PostgreSQL trigger `trg_enforce_personal_workspace_ownership` on `app.workspace_memberships` physically blocking adding any user other than the owner to a personal workspace.
  - Enforced owner-only constraint in API `POST /v1/workspaces/:workspaceId/members` (400 Validation Error).
  - Kept room creation and sharing inaccessible in user interfaces until planned Phase 51.
- **Architecture Documentation:**
  - Published [ADR-0016: Personal Workspace Ownership, Concurrency Control, and Legacy Reconciliation](docs/decisions/0016-personal-workspace-ownership-concurrency-and-legacy-reconciliation.md).

## Phase 10 — Personal workspace and preferences — 2026-10-15

- **Database-Enforced Personal Workspace Uniqueness & Idempotent Provisioning:**
  - Applied migration `00008_personal_workspace_and_preferences.sql` adding partial unique index `idx_workspaces_personal_owner` on `app.workspaces(owner_id) WHERE kind = 'personal'`.
  - Reconciled existing duplicate workspaces to `kind = 'room'` with suffix ` (Legacy Room)`.
  - Added atomic idempotent provisioning `POST /v1/workspaces/provision` returning 201 on initial creation and 200 on repeated calls, without overwriting custom display names or preferences (`ON CONFLICT (id) DO UPDATE SET updated_at = app.profiles.updated_at`).
  - Enforced single personal workspace constraint: attempting to create a second personal workspace via `POST /v1/workspaces` returns 409 `ConflictError`.
- **User Preferences & Optimistic Concurrency Control:**
  - Added domain invariants for IANA time zones (`Intl.DateTimeFormat`), BCP 47 locales (`Intl.Locale`), and week start days (`monday`, `sunday`, `saturday`).
  - Separated preferences schema version (`preferences_schema_version = 1`) from optimistic concurrency sequence (`revision`).
  - Added `GET /v1/users/me/preferences` and `PATCH /v1/users/me/preferences` endpoints with revision conflict detection returning 409 Conflict when concurrent updates occur.
  - Hardened Fastify error handling to return 400 for `ValidationError` and 409 for `ConflictError`.
- **Web Client Integration (`apps/web`):**
  - Added route handlers `POST /api/workspaces/provision` and `GET/PATCH /api/users/preferences` protected with double-submit CSRF validation and SameSite cookies.
  - Extended `AuthContext` with workspace provisioning, preferences loading/saving, and cache synchronization.
  - Updated `apps/web/src/app/settings/page.tsx` with Personal Workspace status card, IANA time zone selector, locale selector, week start radio group, compact mode toggle, loading spinners, and concurrency conflict warning banner.
- **Mobile Client Integration (`apps/mobile`):**
  - Extended `MobileProviderAuthAdapter` with `provisionPersonalWorkspace`, `getPreferences`, `updatePreferences`, and `getAccessToken`.
  - Persisted `workspaceId` in OS-backed KeyStore (`expo-secure-store` / `SEC_KEY_WORKSPACE_ID`) and restored on cold restart. Purged on sign-out.
  - Updated `apps/mobile/src/views/SettingsView.tsx` with Section 5b: Personal Workspace status card, week start radio buttons (48dp touch targets), and time zone display.
- **Client SDK & Contracts:**
  - Added workspace and preferences methods to `@daynori/api-client` (`provisionPersonalWorkspace`, `getPersonalWorkspace`, `getUserPreferences`, `updateUserPreferences`, `ApiConflictError`).
  - Added `ProfileSchema`, `ProvisionWorkspaceRequestSchema`, `ProvisionWorkspaceResponseSchema`, `UpdatePreferencesRequestSchema`, `ProfileResponseSchema`, `WeekStartSchema`, and `DisplayPreferencesSchema` to `@daynori/contracts`.

## Phase 09 Authentication Defect Repairs & Security Hardening — 2026-10-15

- **Removed Automatic Simulated Authentication from Runtime:**
  - Removed in-memory `mockUsers`, `localAccounts`, and `hash_<password>` from normal application runtime in `apps/web/src/auth/session.ts` and `apps/mobile/src/auth/providerAdapter.ts`.
  - Outages and rejected credentials fail safely with descriptive errors, without fabricating accounts or tokens.
  - Test doubles are strictly injected via constructors/options and are unavailable to standard runtime.
- **Genuine Callbacks & Flow Binding:**
  - Web callback route (`apps/web/src/app/api/auth/callback/route.ts`) performs genuine authorization code exchange (`exchangeCodeForSession`) and provider token verification, eliminating synthetic cookie manufacturing.
  - Mobile deep link handler (`apps/mobile/src/auth/providerAdapter.ts`) strictly requires matching initiated flow state/nonce (`initiateAuthFlow`), anti-replay validation, and genuine provider code/token verification.
- **Session Verification Before Trusting Identity:**
  - Replaced unverified base64 decoding with real provider verification (`GET /auth/v1/user`) and API `JwtVerifier`.
  - Restored mobile sessions verify access token with provider on cold start, attempting refresh if expired, before exposing private state.
- **Completed Native Secure Storage:**
  - Declared `expo-secure-store` in `apps/mobile/package.json` and linked native Android modules.
  - Rebuilt Android development APK (`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`) with `expo-secure-store` compiled in.
  - Hardened `SecureStorageAdapter` to propagate actionable `SecureStorageError` on storage/module failures and restricted in-memory storage strictly to test environments (`NODE_ENV === 'test'`).
  - Handled failed credential deletion on sign-out explicitly: flags session as revoked so cold start cannot silently restore a signed-out account.
- **Real Refresh, Recovery, and Logout:**
  - Both web and mobile sign-out routes call `POST /auth/v1/logout` to revoke sessions at the provider before clearing local state.
  - Verified refresh token rotation and password recovery email capture in Mailpit (`http://127.0.0.1:54324`).
- **Live Supabase Stack Verification:**
  - Verified real user registration, ES256 asymmetric signature verification via JWKS, and logout revocation through live GoTrue v2.197.0 container daemon.
  - Replaced fabricated workspace IDs with explicit `workspaceId: null` ("workspace not provisioned") state pending Phase 10 provisioning.
  - Sanitized evidence and logs by redacting all usable tokens and credentials.

## Phase 09 — Authentication across web and Android — 2026-10-14

- **Selected Authentication Provider & Journey:**
  - Implemented email/password authentication lifecycle: sign-up, verification, sign-in, recovery, refresh, and sign-out, documented in [ADR-0015](docs/decisions/0015-authentication-across-web-and-android.md).
- **Web Same-Origin Session Layer (`apps/web`):**
  - Built same-origin Route Handlers under `/api/auth/*` (`session`, `sign-in`, `sign-up`, `sign-out`, `refresh`, `recover`, `callback`).
  - Stored tokens exclusively in `HttpOnly`, `Secure`, `SameSite=Lax` cookies (`daynori_access_token`, `daynori_refresh_token`, `daynori_csrf_token`).
  - Enforced double-submit CSRF token validation and `Origin` header whitelisting for all state-changing writes.
  - Kept refresh tokens strictly out of `localStorage`, `sessionStorage`, and client DOM state.
  - Applied `Cache-Control: private, no-store, no-cache, must-revalidate` to prevent CDN or shared proxy caching of sensitive user identity.
  - Added multi-tab session synchronization via `BroadcastChannel` (`LOGIN`, `LOGOUT`, `SESSION_REPLACED`).
  - Added in-flight request cancellation via `AbortController` on session replacement and logout.
  - Implemented accessible tabbed `AuthModal` dialog component with ARIA attributes and keyboard navigation.
  - Enforced protected destination gating on `/journal` preserving target navigation.
- **Android OS-Backed Secure Storage & Provider Adapter (`apps/mobile`):**
  - Implemented `SecureStorageAdapter` backed by `expo-secure-store` (Android KeyStore) for session secret persistence.
  - Created `MobileProviderAuthAdapter` replacing synthetic dummy adapter in standard runtime.
  - Implemented anti-replay and anti-injection deep link callback verification requiring valid nonces and allowlisted schemes (`daynori://`).
  - Added cold start and process restart session restoration from OS secure storage.
  - Implemented `DraftQuarantineManager`: uncommitted drafts are quarantined by account ID on logout, strictly preventing cross-tenant leakage.
  - Preserved pending protected navigation upon authentication.
- **Shared Contracts (`packages/contracts`):**
  - Added Zod schemas for sign-in, sign-up, recovery, session, callbacks, quarantined drafts in `packages/contracts/src/auth.ts`.
  - Added open redirect defense helper `validateAuthRedirectUrl` and CSRF helpers (`generateCsrfToken`, `verifyCsrfToken`).
- **Phase Reports & Roadmaps:**
  - Created [Phase 09 Report](docs/phase-reports/phase-09.md) documenting delivered journeys, acceptance evidence, and exact remaining gates (real Supabase Auth container daemon on host and physical Android TalkBack hardware verification).
  - Updated `docs/roadmap/progress.json` reflecting provisional Phase 09 development under authorized waiver.

## Phase 08 & 07 Defect Repairs & Security Hardening — 2026-10-14

- **Phase 07 Storage Policies & Identity Context Repair:**
  - Implemented executable, versioned private-storage RLS policies for `storage.objects` and `storage.buckets` in `infra/supabase/policies/storage.sql` and migration `00007_storage_policies_and_context.sql`.
  - Updated identity resolution `app.current_user_id()` to resolve `COALESCE(app.current_user_id, request.jwt.claim.sub, auth.uid())` without requiring custom transaction variables.
  - Added `app.storage_extract_workspace_id(name)` rejecting path traversal (`..` and leading `/`) and malformed object names.
  - Verified 28 security tests in `tests/security/tenant-isolation.test.ts` (bucket privacy, cross-workspace path rejection, path traversal rejection, malformed name rejection).
- **Phase 08 Service Foundation & JWT Hardening:**
  - Tightened JWT verifier (`apps/api/src/auth/jwt.ts`): rejected ID tokens (`token_use !== 'access'`), rejected anonymous sessions (`is_anonymous: true`), enforced mandatory `role === 'authenticated'` without defaulting, rejected forbidden roles (`anon`, `service_role`, `supabase_admin`), enforced UUID `sub` format and `exp` claims.
  - Added support for HS256 symmetric secret verification with explicit allowlist matching.
  - Bounded and sanitized incoming `x-request-id` headers (max 64 characters, `^[a-zA-Z0-9_-]{1,64}$`), replacing unsuitable or oversized values with random UUIDs.
  - Hardened logging and error handlers: redacted unhandled error messages, stack traces, and database connection strings in `SafeLogger`.
  - Fixed boundary error contracts: malformed JSON returns consistent 400 `VALIDATION_FAILED`; response-schema failures treated as 500 server errors via `ResponseValidationError`.
  - Bound keyset pagination cursors to workspace and filter context (`kind`), with max length 256 characters.
  - Generated OpenAPI 3.0 specification dynamically from canonical shared Zod schemas (`packages/contracts/src/api/openapi.ts`) and added drift check tests.
  - Enforced 2s connection timeout probe in readiness route (`/v1/ready`) and made server startup fail fast when authentication is unconfigured in standard mode.
  - Expanded `apps/api/src/api.test.ts` to 38 passing tests (193 tests total across monorepo).

## Phase 08 — API contracts and service foundation — 2026-10-14

- Implemented versioned Fastify HTTP REST API service in `apps/api` following `/v1` conventions (`/v1/health`, `/v1/ready`, `/v1/openapi.json`, `/v1/workspaces`, `/v1/workspaces/:workspaceId/members`, `/v1/workspaces/:workspaceId/items`).
- Defined canonical shared contracts in `packages/contracts/src/api/` (`common.ts`, `health.ts`, `workspace.ts`, `membership.ts`, `item.ts`) with strict mutation validation rejecting unknown fields and standardized error envelopes.
- Built maintained-library JWT verification via `jose` in `apps/api/src/auth/jwt.ts`: RS256/EdDSA algorithm allowlists, claims validation (`iss`, `aud`, `exp`, `nbf`, `sub`), JWKS key rotation, and strict rejection of administrative/service/anonymous credentials as user sessions.
- Enforced multi-tenant authorization: derived actor identity strictly from verified token claims; enforced workspace membership checks; bound requests to transaction-local PostgreSQL tenant contexts (`withTenantContext` and `withUserContext`).
- Implemented consistent HTTP 404 responses for unauthorized workspaces and nonexistent objects, preventing private workspace ID enumeration.
- Built keyset pagination with stable ordering `(created_at, id)` and opaque base64url cursor encoding.
- Added process-local in-memory sliding-window rate limiter with `Retry-After` header and actor/IP budgeting.
- Implemented safe structured logging with recursive credential and token redaction.
- Built fully typed client in `packages/api-client` with Zod response parsing, `AbortSignal` cancellation support, typed error hierarchy, and keyset pagination async generator (`paginateItems`).
- Documented decisions in [ADR-0014: Authenticated API service, contracts, and tenant-scoped authorization](docs/decisions/0014-authenticated-api-service-and-contracts.md).
- Verified 26 tests in `apps/api/src/api.test.ts` and 8 tests in `packages/api-client/src/client.test.ts` (175 tests passing across monorepo).

## Phase 07 — PostgreSQL and tenant isolation foundation (Security Repairs & Foundation) — 2026-10-14

- Established PostgreSQL schema migrations (`infra/supabase/migrations/` 00001 through 00006) defining tenant tables: `profiles`, `workspaces`, `workspace_memberships`, `items`, `audit_events`, and `storage_objects`.
- Repaired membership privilege escalation in `memberships_insert` policy (migration 00003 & 00006): restricted initial owner bootstrap exclusively to legitimate workspace creators on unpopulated workspaces, strictly rejecting unauthorized self-enrollment into existing workspaces.
- Replaced broad schema grants: revoked administrative table access (including `app.schema_migrations`) from `daynori_runtime` role; granted explicit least-privilege permissions only to tenant application tables.
- Corrected composite folder deletion constraint: implemented `ON DELETE SET NULL (folder_id)` preserving non-null `workspace_id` tenant key.
- Hardened connection pooling in `apps/api/src/db/client.ts`: transaction rollbacks and cleanup failures actively discard/destroy the pooled client (`client.release(true)`) to prevent poisoned connection reuse.
- Added migration advisory locking (`pg_advisory_lock`) in `infra/supabase/migrator.ts` to serialize concurrent migration runs safely.
- Removed hardcoded credentials from codebase; integrated `.env` environment loading with `.env.example`; rotated local development runtime role secret.
- Documented declarative Supabase storage bucket policies in `infra/supabase/policies/storage.sql` and `infra/supabase/policies/README.md` (recording local binary storage service enforcement as an acceptance gap until Phase 10+).
- Verified 22 integration tests in `tests/security/tenant-isolation.test.ts` against real local PostgreSQL 17 instance (`daynori_test`), verifying empty dedicated database reproduction from zero, rollback recovery, and tenant isolation.
- Updated [ADR-0013: PostgreSQL tenant isolation, row-level security, and migration foundations](docs/decisions/0013-postgresql-tenant-isolation-and-rls.md).

## Phase 05 and Phase 06 navigation corrections — 2026-10-14

- **Phase 05 (Web Navigation Repairs):**
  - Added user-accessible Character Key Shortcut toggles (`shortcutsEnabled`) in `ShellContext.tsx` and Settings Section 5 (`/settings`) conforming to WCAG 2.1.4 (Character Key Shortcuts), allowing users to disable single-character shortcuts while preserving `Escape`.
  - Added automated browser CDP tests in `scripts/test-web-e2e.mjs` verifying single-character key suppression and re-enabling across 32 headless Edge checks.
  - Corrected handoff documentation in `docs/phase-reports/phase-05.md` clarifying product persistence belongs to Phase 10+ and Phase 07 delivers PostgreSQL tenant isolation foundation.
- **Phase 06 (Android Navigation Repairs):**
  - Rewrote `scripts/test-android-e2e.mjs` to separate preflight from on-device E2E; runner reports missing hardware/emulator as `BLOCKED_MISSING_PREREQUISITE` and exits non-zero (exit code 1) instead of substituting unit tests.
  - Created lightweight hook-supporting mounted component evaluator in `apps/mobile/src/test-render.ts` to execute interactive mounted component tests across `TodayView`, `PlanView`, `LibraryView`, `JournalView`, `SettingsView`, and `CreateSheet` without adding conflicting external dependencies.
  - Hardened deep link authentication in `apps/mobile/App.tsx`: eliminated synthetic login calls on external `auth` deep links; provider authentication remains deferred to Phase 09.
  - Enforced strict scheme whitelist (`daynori://`, `https://app.daynori.com`), bounded identifiers, strict positive integer timestamps, and error token redaction in `packages/contracts/src/routing.ts`.
  - Configured actual Expo scheme `daynori` and Android intent filters for custom scheme and app links in `apps/mobile/app.json` and `AndroidManifest.xml`.
  - Restricted synthetic login controls in `SettingsView.tsx` to an explicit development review mode (`devReviewMode`), defaulting runtime strictly to unauthenticated.
  - Resolved Windows MAX_PATH (>260 chars) Ninja build failure in `apps/mobile/android/build.gradle` for `expo-modules-core` and verified fresh debug APK compilation (128.4 MB).

- Implemented native bottom navigation bar in `@daynori/ui-mobile/MobileNavigationBar` with four labeled parent destinations: Today, Plan, Library, and Journal, maintaining >= 48dp touch targets.
- Built Plan segmented sub-views for Tasks, Routines, and Calendar (Calendar projection under Plan).
- Built Library view with canonical folder breadcrumb (`Workspace > Software`), module filter chips (All Items, Notes, Knowledge, Files), and folder action buttons.
- Integrated protected destination gating for Journal via `MobileAuthAdapter` (defaults strictly unauthenticated; unauthenticated access renders an authentication requirement screen and queues pending destination).
- Added consistent top `MobileHeader` with contextual titles, Search action, Create action, and Settings/Help action.
- Built accessible Search modal sheet and Create quick-capture sheet with input draft preservation across shell navigation.
- Added Settings destination with Light/Dark theme toggle, 100%–200% font scaling, OS reduced motion status indicator, Bangla (বাংলা) script readability preview with 1.6 line-height, and link to preserved Phase 04 Component Gallery.
- Implemented Android hardware Back button handling (`BackHandler`): dismisses open sheets, returns from child views to parent tab, returns to Today from other tabs, and exits cleanly from Today.
- Implemented `AppState` lifecycle handling to preserve navigation state and uncommitted drafts across background and resume transitions.
- Defined typed route contracts in `@daynori/contracts` (`NotificationPayloadSchema`, `FilePayloadSchema`, `AuthPayloadSchema`) with strict safe identifier validation rejecting path traversal and SQL injections.
- Implemented cold-start and warm-start deep-link handling with 5-second idempotent deduplication.
- Replaced `test:e2e:android` placeholder in `package.json` with real runner in `scripts/test-android-e2e.mjs`.
- Compiled fresh Android development APK (`app-debug.apk`, 128.4 MB) via Gradle `assembleDebug`.
- Retained Phase 06 status as `blocked` in `docs/roadmap/progress.json` pending physical Android TalkBack hardware verification.

## Phase 04 corrective revision — 2026-10-14 (Findings F03–F10 Remediation)

- Added semantic action danger tokens (`danger`, `dangerHover`, `dangerLabel`) in `packages/design-tokens` for light theme (`#B3261E`/`#FFFFFF`, 6.54:1) and dark theme (`#F2B8B5`/`#381615`, 9.51:1); wired `Button` and `MobileButton` to consume them, resolving F03.
- Updated `ListRow` and `MobileListRow` selected metadata color to `palette.text.secondary`, achieving 5.37:1 contrast on light subtle surface and 7.24:1 on dark subtle surface, resolving F04.
- Corrected web `ListRow` ARIA semantics from invalid `aria-selected` to `role="button"` with `aria-pressed={selected}`; verified keyboard Enter/Space activation and toggle state exposure, resolving F05.
- Hardened `TextField` description references in `packages/ui-web` to reference only rendered elements (`errorMessage ? errorId : helperText ? helperId : null`) while preserving caller-provided `aria-describedby` IDs; added unit tests for error recovery and description merging, resolving F06.
- Fixed narrow-screen text clipping and enabled font scaling up to 200%: enabled text wrapping (`overflowWrap: 'anywhere'`) on list rows, wrapped the contrast table in an accessible horizontally scrollable container (`role="region"`), and added `--daynori-text-scale` CSS variable for real font scaling; verified reflow at 320px viewport with zero document horizontal overflow, resolving F07.
- Enlarged `MobileModalSheet` close button touch target to 48dp minimum (`touchTargets.mobileMin: 48`); added `ScrollView` and `KeyboardAvoidingView` to support safe-area, enlarged content, and keyboard avoidance, resolving F08.
- Added dynamic OS reduced motion support to `MobileModalSheet` using React Native's `AccessibilityInfo.isReduceMotionEnabled()` and `reduceMotionChanged` listener, disabling slide animations when enabled, resolving F09.
- Hardened automated browser verification runner `tests/spikes/browser/run-primitives.mjs` using Chrome DevTools Protocol against headless Microsoft Edge, testing the actual mounted Next.js React application at `http://127.0.0.1:3000/review` across 11 assertions (contrast, aria-pressed, keyboard activation, description binding, dialog focus trap, 150% font scale, 320px reflow); clearly labeled `tests/spikes/browser/primitives-real.html` as a synthetic prototype harness, resolving F10.
- Reconciled Phase 04 verification status: retained `in_progress` in `docs/phase-reports/phase-04.md` and `docs/roadmap/progress.json` pending physical Android TalkBack hardware verification.

## Phase 01 corrective revision — 2026-10-14 (Finding F01 Remediation)

- Resolved Expo CLI / `tar@7.5.22` default export incompatibility by adding `patches/tar@7.5.22.patch` via `pnpm.patchedDependencies`, exporting `default = exports` on CommonJS output while preserving tar security patches.
- Hardened `apps/mobile/package.json` `prebuild` script to assert `android/build.gradle` generation and fail closed on generation errors.
- Verified native Android project generation from clean state and compiled development APK (`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`, 128.4 MB) via `.\gradlew.bat assembleDebug`.

## Phase 02 corrective revision — 2026-10-14 (Finding F02 Remediation)

- Investigated upstream releases on npm for `node-forge` (`1.4.0`) and `braces` (`3.0.3`); confirmed no newer/patched releases exist (`patchedVersions: "<0.0.0"`).
- Maintained strict fail-closed enforcement of `scripts/audit-dependencies.mjs` without inventing human approvals or self-authorizing exceptions.
- Documented exact dependency tree, blocker assessment, and human owner approval requirements in `docs/security/pending-exception-proposals.md` and `docs/phase-reports/phase-02.md`.

## Phase 03 corrective revision — 2026-10-14 (Finding F10 Part 1 Remediation)

- Corrected IndexedDB error capture in `tests/spikes/browser/indexeddb-real.html` to record `ConstraintError` on duplicate key addition.
- Hardened `tests/spikes/browser/run-edge.mjs` with self-contained server lifecycle, cross-browser discovery, and strict assertions on `window.__results` that fail closed on missing outcomes, timeouts, or experiment errors.
- Verified all three stages (`?run=write`, `?run=verify`, `?run=all`) against headless Microsoft Edge 155 with exit code 0.

## Phase 05 — 2026-10-14 (Provisional web shell implementation)

- Built the responsive web navigation shell in `apps/web` and `packages/ui-web` matching the information architecture in `docs/design/information-architecture.md`.
- Implemented desktop sidebar navigation (&ge; 1024px), tablet transitions (768px–1023px), and compact mobile bottom navigation (< 768px down to 320px width) with zero horizontal overflow/clipping.
- Built parent routes: Today (`/today` and `/`), Plan (`/plan`), Calendar under Plan (`/plan/calendar`), Library (`/library`), and Journal (`/journal`).
- Provided consistently reachable global controls: Search modal with shortcut `/`, Create item modal with shortcut `c`, Theme toggle (Light/Dark), Help & Shortcuts modal with shortcut `?`, and Workspace Profile modal.
- Added Settings page (`/settings`) supporting theme mode switching, text scaling (100% to 200%), Right-to-Left (RTL) reading direction, and Bengali (বাংলা) font rendering and readability preview with 1.6 line-height.
- Added Help page (`/help`) with accessible keyboard shortcuts reference and landmark structure guide.
- Added accessible 404 page in `apps/web/src/app/not-found.tsx`.
- Preserved Phase 04 component review gallery at `/review`.
- Implemented accessible primitives in `packages/ui-web`: `EmptyState`, `SkipLink`, and `RouteAnnouncer` (with `aria-live="polite"` route change announcements).
- Replaced the root `test:e2e:web` echo placeholder in `package.json` with a real automated browser test script (`scripts/test-web-e2e.mjs`) executing 30 interactive checks in Microsoft Edge via Chrome DevTools Protocol (CDP).
- Tracked Phase 05 status as `blocked` in `docs/roadmap/progress.json` and recorded the provisional implementation in `docs/phase-reports/phase-05.md` pending prerequisite Phase 04 physical Android TalkBack hardware verification.

## Phase 04 — 2026-10-14

- Encoded semantic design tokens in `packages/design-tokens` for light and dark themes (warm paper, dark ink, deep teal, soft amber), spacing, radii, touch targets, focus treatments, motion, and specialized Bangla line-height (`1.6`).
- Implemented WCAG 2.2 relative luminance and contrast ratio calculation utilities and verified all core color pairs meet Level AA requirements (including ink on paper 13.44:1, dark primary on dark surface 14.05:1, and essential UI borders >= 3.0:1).
- Implemented accessible browser UI primitives in `packages/ui-web`: `Button`, `TextField`, `Dialog`, `Feedback`, `ListRow`, `Card` with focus trapping, Escape key closing, and touch targets >= 44px.
- Implemented native mobile UI primitives in `packages/ui-mobile`: `MobileButton`, `MobileTextField`, `MobileModalSheet`, `MobileFeedback`, `MobileListRow`, `MobileCard`, and `theme` with 48dp minimum touch targets.
- Created interactive component review surface in `apps/web/src/app/page.tsx` supporting light/dark theme switching, RTL layout, font scaling, error toggling, dialog focus management, and Bangla script readability.
- Created mobile component gallery in `apps/mobile/App.tsx` displaying all primitives and states.
- Recorded physical Android device TalkBack testing as a remaining hardware gate in `docs/phase-reports/phase-04.md`.

## Phase 03 corrective revision, 2026-10-14

- Relabeled `tests/spikes/` suites as synthetic contract/model tests (`storage-model.synthetic.test.ts`, `native-capabilities-model.synthetic.test.ts`, `platform-policy-model.synthetic.test.ts`) that test contract shapes in-memory rather than actual native hardware or browser storage.
- Added real browser IndexedDB experiment (`tests/spikes/browser/`) and executed via automated Chrome DevTools Protocol against Microsoft Edge 155; observed and recorded transaction rollback on abort, duplicate key constraint failure, schema migration v1->v2 with index creation and data retention, upgrade error rollback, and storage estimate/eviction flags.
- Rechecked primary vendor sources (2026-10-14): removed unsupported 15-minute alarm delivery guarantee in favor of Android 12+ >=10 minute clipping and Doze best-effort delivery; clarified SecureStore adapter 2KB quota vs lack of universal JS limit in Expo; removed fixed CASA dollar figures for Google Drive restricted scopes; and clarified that Node crypto tests do not constitute cryptographic vault approval.
- Updated ADRs 0009 through 0012, `tests/spikes/README.md`, `docs/research/sources.md`, and `docs/phase-reports/phase-03.md`.

## Phase 01-02 corrective revision, 2026-10-14

- Moved the runtime baseline to Node 24.21.0 (Active LTS) and upgraded Next.js to 15.5.x and Vitest to 4.1.x; added overrides for `tar`, `@xmldom/xmldom`, `image-size` and `postcss`.
- Rewrote the dependency audit gate: it now rejects process failures, signals and malformed reports, and matches exceptions by advisory, installed version and dependency path. Removed 40 unapproved exceptions. Two advisories without a patched release remain, so `pnpm audit:deps` fails until the owner approves exceptions (`docs/security/pending-exception-proposals.md`).
- Tests now run the real audit implementation and CLI.

## Phase 03 — 2026-10-13

- Executed platform and integration feasibility spikes under `tests/spikes/`:
  - Validated SQLite vs IndexedDB storage adapters, atomic rollbacks, schema migrations, quota management, and auth session persistence (`sqlite-indexeddb-spike.test.ts`).
  - Evaluated native hardware capabilities: notification channel importance, in-app notification center fallback, SecureStore 2KB size constraints, biometric presence vs vault key separation, 5-minute AAC audio recording limits, and authenticated AES-256-GCM cryptography (`expo-capabilities-spike.test.ts`).
  - Validated platform constraints: Android exact alarm policies (rejecting restricted `USE_EXACT_ALARM`), Web Push requirements, Google Drive least-privilege `drive.file` scope, server-side Google Play Developer API and StoreKit receipt verification, and iOS platform parity (`platform-constraints-spike.test.ts`).
- Created Architecture Decision Records ADR-0009 through ADR-0012 in `docs/decisions/`.
- Updated `docs/roadmap/progress.json` setting Phase 03 to complete and identifying Phase 04 as next eligible phase.

## Phase 02 — 2026-10-13

- Added GitHub Actions continuous integration workflows (`.github/workflows/ci.yml`, `.github/workflows/security.yml`) with minimal token permissions (`contents: read`).
- Created repository secret scanner (`scripts/scan-secrets.mjs`) with output redaction and dependency vulnerability audit wrapper (`scripts/audit-dependencies.mjs`) with granular `.security-exceptions.json` registry enforcing specific advisory GHSAs, expiration, and accountability.
- Added comprehensive synthetic test suite (`tests/security/scanner-synthetic.test.ts`) covering secret detection/redaction, unapproved advisory rejection, unrelated advisories in excepted packages, expired exceptions, and registry service errors.
- Established pull request template (`.github/pull_request_template.md`) and issue templates (`bug_report.md`, `phase_proposal.md`, `config.yml`).
- Documented branch protection rules and protected deployment environment policies in `docs/engineering/contributor-automation.md`.
- Added root `audit`, `audit:deps`, and `audit:secrets` scripts.

## Phase 01 — 2026-10-13

- Configured pnpm monorepo workspace manifests, pinned dependencies, Node LTS configuration, and strict TypeScript rules.
- Replaced reserved directory placeholders with minimal runnable workspaces: `apps/api`, `apps/worker`, `apps/web`, `apps/mobile`, and shared packages (`packages/*`).
- Added Fastify health and smoke endpoints, Next.js web application shell, Expo mobile entrypoint with Metro monorepo resolver, and typed API client.
- Implemented root verification scripts: `build`, `typecheck`, `test`, `test:contract`, `test:integration`, `test:security`, `test:performance`, `lint`, and `format:check`.
- Established verified development startup (`pnpm dev:web`, `pnpm dev:api`, `pnpm dev:worker`, `pnpm dev:mobile`), pinned Node LTS `20.18.3`, and compiled native Expo Android development build APK (`app-debug.apk`) using `expo-dev-client`.

## Phase 00 — 2026-10-13

- Defined the personal organizer product, feature boundaries, provisional brand, and design direction.
- Specified web/mobile architecture, domain model, offline synchronization, integrations, and privacy boundaries.
- Established a granular roadmap, individual phase plans, quality gates, reports, contributor handoff, and repository layout.
- Added executable planning validation. Application implementation starts in Phase 01.
