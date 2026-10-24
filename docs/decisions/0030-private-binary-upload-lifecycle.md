# ADR-0030: Private Binary Upload Lifecycle, Storage Quotas, and Quarantine Verification

## Status

Accepted (Provisional Phase 24 private binary upload lifecycle delivered under owner authorization and verified across Vitest pure domain, content inspector, fail-closed malware scanner, quota bounding, durable worker lease jobs, PostgreSQL Row-Level Security, Fastify files REST routes, DaynoriApiClient, and 10 end-to-end integration journeys; physical Android TalkBack hardware, KeyStore release gates, and external production virus scanning engine provisioning remain explicitly blocked).

## Context

Phase 24 establishes the authoritative private binary upload lifecycle, storage quota accounting, quarantine verification pipeline, and orphan cleanup infrastructure for the Daynori ecosystem ([docs/roadmap/phases/24-private-binary-upload-lifecycle.md](../roadmap/phases/24-private-binary-upload-lifecycle.md)), satisfying product requirements **R-STORAGE** in [docs/product/requirements.md](../product/requirements.md) and architecture constraints in [docs/architecture/security-and-vault.md](../architecture/security-and-vault.md) and [docs/architecture/integrations-and-reminders.md](../architecture/integrations-and-reminders.md).

Key architectural and security challenges addressed in this phase:

1. **Unpredictable Object Keys and Multi-Tenant Isolation**:
   - Object paths in private storage buckets must never be predictable or derived from client filenames, user IDs, or folder structures.
   - Guessing object paths must never allow cross-workspace downloads or enumeration.
   - Strict Row-Level Security (RLS) policies must prevent unauthorized tenants from querying or modifying upload reservations, storage quotas, file items, or file versions.
2. **Provider Upload Expiry Realism & Storage Transfer Endpoints**:
   - Supabase Storage signed upload capabilities have a provider-enforced minimum validity horizon of two hours (7200 seconds). Claiming a shorter five-minute upload window would misrepresent provider-level capability exposure.
   - Storage providers must expose real HTTP PUT/GET transport endpoints with capability token verification, body bounds, and 409 conflict detection for `upsert: false`. Unconfigured storage must return an honest 503 unavailable state.
   - Authorized read/download capabilities remain strictly short-lived (300 seconds / 5 minutes) and accessible only for verified, non-quarantined files.
3. **Reservation-Time Quota Bounding & Concurrency Limiting**:
   - Finalize-only quota checks are insecure because a client with an issued upload capability could write up to the provider's maximum payload limit before finalization, exhausting physical bucket storage or evading quota enforcement.
   - The system must bound temporary exposure _before_ generating signed upload capabilities by atomically reserving declared bytes against available quota and enforcing a maximum of 5 concurrent active reservations per workspace.
   - In-flight reservations are strictly filtered by active status (`reserved`, `uploaded`), unexpired timestamps, and unreconciled status.
4. **Quarantine State Machine & Active Content Sniffing**:
   - All uploaded binaries must start in a quarantined state until explicitly verified.
   - Client-declared MIME types cannot be trusted (e.g. Windows PE executables or ELF binaries declared as `image/png`).
   - Active content vectors (SVG files containing `<script>` tags, HTML documents with embedded scripts, shell scripts) must be rejected before files become downloadable or viewable.
   - Actual binary lengths are verified against reservation bounds and `maxAllowedBytes`.
5. **Fail-Closed Malware Scanning Policy**:
   - Malware scanning must detect known signatures (including EICAR standard antivirus test signatures and embedded script payloads).
   - If scanner infrastructure experiences outages or timeouts, the system must fail closed (rejecting or preserving quarantine, never defaulting to verified).
   - Scanner engine version, scanned bytes count, and scanned SHA-256 are recorded without logging user content.
6. **Durable Worker Leases and Background Deletion**:
   - Unfinalized, cancelled, or expired reservations could leave orphan binaries in cloud storage.
   - A durable background worker must acquire exclusive row leases via `app.background_jobs` (`SELECT ... FOR UPDATE SKIP LOCKED`) to reconcile expired reservations, purge orphaned storage objects, and execute durable file deletions.
7. **Database Grants & Sync Projections**:
   - Role `authenticated` direct writes are revoked to ensure all mutations route through the API-owned service layer.
   - Active verified files are projected into bootstrap snapshots and synchronized to Web IndexedDB and Mobile SQLite local repositories.

## Decision

### 1. Database Schema & Row-Level Security (`00020_file_upload_lifecycle_and_quarantine.sql` & `00021_repair_file_lifecycle_jobs_and_grants.sql`)

- Created four core tables in schema `app`:
  - `app.workspace_storage_usage`: Tracks `stored_bytes`, `reserved_bytes`, and `max_storage_bytes` (100 MiB default for personal workspaces). RLS restricts `SELECT` to workspace viewers. Direct writes from `authenticated` are revoked.
  - `app.file_items`: Extends `app.items` (with `kind = 'file'`) recording `file_name`, `declared_mime_type`, `detected_mime_type`, `byte_size`, `sha256_checksum`, `object_path`, `version`, `quarantine_status` (`quarantined`, `verified`, `rejected`, `deleted`), `rejection_reason`, and `verified_at`. Viewers can only select `verified` files. Composite tenant foreign key `(folder_id, workspace_id) REFERENCES app.items(id, workspace_id)` prevents cross-workspace folder hijacking.
  - `app.file_versions`: Immutable version history recording each revision's object path, checksum, byte size, and detected MIME type with unique constraint on `(file_id, version)`.
  - `app.upload_reservations`: Tracks reservation lifecycle (`reserved`, `uploaded`, `quarantined`, `verified`, `rejected`, `cancelled`, `expired`, `finalized`), 2-hour capability expiration, declared/reserved exposure bytes, and reconciliation status.
  - `app.background_jobs`: Stores durable asynchronous jobs with status, attempt counters, scheduled run times, lease locks, and payload.
- Granted least-privilege `SELECT, INSERT, UPDATE, DELETE` permissions strictly to `daynori_runtime`.

### 2. Contract Schemas & Standard Constants (`@daynori/contracts`)

- Created `@daynori/contracts/api/files`:
  - `ALLOWED_MIME_TYPES`: Curated allowlist of standard image formats (JPEG, PNG, GIF, WebP), document formats (PDF, plain text, Markdown), and media types.
  - Size constants: `MAX_GENERAL_FILE_BYTES = 25 MiB`, `MAX_AUDIO_FILE_BYTES = 50 MiB`, `MAX_CONCURRENT_RESERVATIONS = 5`.
  - Expiry constants: `UPLOAD_CAPABILITY_EXPIRY_SECONDS = 7200` (2 hours), `DOWNLOAD_CAPABILITY_EXPIRY_SECONDS = 300` (5 minutes).
  - Strongly typed Zod request/response contracts: `ReserveUploadRequestSchema`, `ReserveUploadResponseSchema`, `FinalizeUploadRequestSchema`, `FinalizeUploadResponseSchema`, `UploadStatusResponseSchema`, `CancelReservationResponseSchema`, `DownloadCapabilityResponseSchema`, `FileItemResponseSchema`, `StorageQuotaResponseSchema`.

### 3. Server-Generated Unpredictable Object Keys

- Storage keys are strictly server-generated using high-entropy random identifiers:
  ```
  ${workspaceId}/${fileId}/${versionId}/${crypto.randomBytes(16).toString('hex')}
  ```
- Object paths never embed client-supplied filenames, user email addresses, or folder names, preventing path traversal attacks (`../../`) and cross-tenant enumeration.

### 4. Binary Inspection & Malware Scanning (`inspector.ts` & `scanner.ts`)

- `inspectBinaryContent`:
  - Evaluates binary magic bytes to determine true MIME type (JPEG `FF D8 FF`, PNG `89 50 4E 47`, GIF `GIF87a`/`GIF89a`, WebP `RIFF....WEBP`, PDF `%PDF-`, etc.).
  - Detects active script vectors in text and XML/SVG payloads (`<script>`, `javascript:`, `onload=`, `eval(`).
  - Rejects Windows PE executables (`MZ` header), Unix ELF binaries (`\x7FELF`), and executable shell scripts.
  - Computes cryptographic SHA-256 checksum and compares against client-supplied checksum if provided.
- `PolicyMalwareScanner`:
  - Detects standard EICAR antivirus test signatures and embedded reverse shell commands.
  - Enforces fail-closed semantics: on scanner outage or timeout, throws an explicit unavailable error, blocking verification.

### 5. Quota Accounting & Atomic Exposure Bounding (`quotaService.ts`)

- Quota is bounded at reservation time:
  - Verifies that `stored_bytes + reserved_bytes + requested_bytes <= max_storage_bytes`.
  - Atomically increments `reserved_bytes` before issuing signed upload capabilities.
  - Enforces that active unfinalized reservations for the workspace do not exceed `MAX_CONCURRENT_RESERVATIONS` (5).
- On finalization:
  - Transitions exposure atomically: decrements `reserved_bytes` and increments `stored_bytes` by actual verified byte size.
- On security rejection or immediate cancellation:
  - Decrements `reserved_bytes` and marks reservation `reconciled = true`.

### 6. Storage Provider Abstraction (`storageAdapter.ts`)

- Defined `StorageProviderContract` supporting:
  - `createSignedUploadUrl` with explicit `expiresInSeconds: 7200` and `upsert: false` (strictly preventing object overwrites).
  - `createSignedDownloadUrl` with `expiresInSeconds: 300`.
  - `headObject`, `getObject`, `putObject`, `deleteObject`.
- Implemented `MemoryStorageProvider` for isolated deterministic integration testing with exact header, capability expiry, and upsert enforcement.

### 7. REST Routes & Error Handling (`apps/api/src/routes/v1/files.ts`)

- Registered file endpoints under Fastify with tenant RLS isolation:
  - `GET /v1/workspaces/:workspaceId/files/quota`: Current storage usage and active reservation counts.
  - `POST /v1/workspaces/:workspaceId/files/reservations`: Reserve upload capability.
  - `POST /v1/workspaces/:workspaceId/files/reservations/:reservationId/finalize`: Verify binary and promote to file item.
  - `GET /v1/workspaces/:workspaceId/files/reservations/:reservationId`: Reservation status.
  - `POST /v1/workspaces/:workspaceId/files/reservations/:reservationId/cancel`: Cancel reservation and release quota.
  - `GET /v1/workspaces/:workspaceId/files/:fileId/download`: Generate 300s download capability (verified files only).
  - `GET /v1/workspaces/:workspaceId/files/:fileId`: File metadata.
  - `DELETE /v1/workspaces/:workspaceId/files/:fileId`: Delete file, purge storage object, and release stored quota.
- Configured `errorHandler.ts` to map `QuotaExceededError` to 400 `QUOTA_EXCEEDED`, `TooManyConcurrentReservationsError` to 429 `RATE_LIMITED`, `FileNotReadyError` to 409 `CONFLICT`, and `FileValidationError` to 400 `VALIDATION_FAILED`.

### 8. Worker Leases & Orphan Cleanup (`apps/worker/src/worker.ts`)

- `DaynoriWorker`:
  - Implements in-memory/durable lease acquisition (`acquireLease`, `releaseLease`) with 30-second timeout to prevent race conditions across worker instances.
  - Supports `file_scan` and `file_orphan_cleanup` job types.
  - `reconcileExpiredReservations`: Scans expired upload reservations (`expires_at < now() AND reconciled = false`), checks if storage objects were created, purges orphaned objects, and releases reserved quota.

### 9. API Client Methods (`packages/api-client`)

- Extended `DaynoriApiClient` with typed file lifecycle methods:
  - `getWorkspaceStorageQuota`
  - `reserveFileUpload`
  - `finalizeFileUpload`
  - `getFileUploadStatus`
  - `cancelFileUploadReservation`
  - `getFileDownloadCapability`
  - `getFileMetadata`
  - `deleteFile`

## Alternatives Considered

1. **Client-Deriving Object Paths from Filenames**:
   - Rejected: Embeds user-controlled input into S3/Supabase object keys, risking directory traversal attacks, character encoding issues, and multi-tenant collision.
2. **Configurable 5-Minute Upload Capability Claim**:
   - Rejected: Supabase Storage signed upload URLs cannot be set below two hours without custom proxy infrastructure. Claiming a 5-minute expiry in documentation or responses would be dishonest and fail acceptance criteria.
3. **Finalize-Only Quota Checks**:
   - Rejected: Allows malicious or runaway clients to upload arbitrarily large files into cloud buckets using valid signed capabilities without quota accounting, bypassing storage limits.

## Consequences

- Full upload lifecycle is protected end-to-end: unverified binaries cannot be downloaded or accessed by viewers.
- Storage exposure is bounded prior to capability generation.
- Sync change feed cleanly receives `file` entity events with revision tracking.
- Client applications can safely integrate file browsing, attachments, and previews in Phase 25.

## Validation & Verification Evidence

- **Unit Tests**:
  - `apps/api/src/modules/files/files.test.ts` (11 tests passing: magic byte sniffing, script injection detection, hash computation, memory storage adapter expiry/upsert, policy malware scanner EICAR detection).
  - `apps/worker/src/worker.test.ts` (6 tests passing: worker start/stop, lease acquisition, concurrency exclusion, job execution).
- **Integration Test Journeys**:
  - `tests/integration/phase24-binary-upload.test.ts` (10 passing journeys):
    - Journey 1: Happy path reservation -> storage upload -> finalize -> 300s download capability -> metadata fetch.
    - Journey 2: 100 MiB quota enforcement & 5 concurrent active reservation limits.
    - Journey 3: Content verification, MIME spoofing (PE exe disguised as PNG), path traversal rejection, SVG script injection detection.
    - Journey 4: Checksum integrity verification and client-supplied SHA-256 validation.
    - Journey 5: Fail-closed malware scanning policy (EICAR signature rejection, scanner outage simulation).
    - Journey 6: Idempotent finalization and strict overwrite prevention (`upsert: false`).
    - Journey 7: Multi-tenant workspace isolation (cross-workspace finalize, download, and metadata 404s).
    - Journey 8: Capability expiry horizon, worker lease acquisition, orphan storage reconciliation, and file deletion lifecycle.
    - Journey 9: Real HTTP upload transport, max byte enforcement, and quota rejection.
    - Journey 10: Multi-tenant synchronization projections into bootstrap and local IndexedDB/SQLite adapters.
- **Monorepo Health**:
  - Full test suite: 43 test files, 584 tests passing (100% pass rate).
  - TypeScript typecheck (`pnpm typecheck`): Clean exit code 0.
  - ESLint (`pnpm lint`): 0 warnings, 0 errors.
  - Prettier (`pnpm format:check`): Clean exit code 0.
  - Secret scanning (`node scripts/scan-secrets.mjs`): 1674 files checked, 0 secrets detected.
  - Planning validation (`node scripts/validate-planning.mjs`): 64 phases validated, clean exit code 0.
  - Git diff check (`git diff --check`): Clean exit code 0.

## Revisit Triggers

- Implementation of production virus scanner integration (e.g. ClamAV daemon or AWS GuardDuty / Supabase native scanning).
- Migration to resumable chunked multipart uploads (TUS protocol) when files exceeding 50 MiB are introduced.
- Phase 25 implementation of file browsing and attachment UI surfaces.
