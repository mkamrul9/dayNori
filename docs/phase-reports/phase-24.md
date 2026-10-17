# Phase 24: Private binary upload lifecycle

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [24 — Private binary upload lifecycle](../roadmap/phases/24-private-binary-upload-lifecycle.md)
- **Status:** `blocked` (Provisional private binary upload lifecycle delivered under owner authorization and verified across Vitest pure domain, inspector, fail-closed malware scanner, quota bounding, durable worker lease jobs, PostgreSQL Row-Level Security, Fastify files REST routes, DaynoriApiClient, and 10 end-to-end integration journeys; completion blocked pending prerequisite Phase 04–06 and Phase 11 physical Android TalkBack hardware, KeyStore release gates, and external production virus scanning engine provisioning).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-17.
- **Base Git revision and branch:** `63f9b40` on `main`.
- **Prerequisites:**
  - [Phase 15 — Folder browsing and organization interfaces](phase-15.md): Folder hierarchy, drag-drop bounds, and organization.
  - [Phase 08 — API contracts and service foundation](phase-08.md): Fastify API foundation, tenant isolation, and contracts.
- **Included scope:**
  - **Database Migration (`infra/supabase/migrations/00020_file_upload_lifecycle_and_quarantine.sql` & `00021_repair_file_lifecycle_jobs_and_grants.sql`)**:
    - Created `app.workspace_storage_usage` tracking `stored_bytes`, `reserved_bytes`, and `max_storage_bytes` (100 MiB default).
    - Revoked direct table writes on `workspace_storage_usage`, `file_items`, `file_versions`, and `upload_reservations` from role `authenticated` to preserve API-owned mutation boundaries.
    - Added composite tenant foreign keys `(folder_id, workspace_id) REFERENCES app.items(id, workspace_id)` and unique constraint on `(file_id, version)` in `app.file_versions`.
    - Created `app.background_jobs` table for durable worker execution with `FOR UPDATE SKIP LOCKED`, exponential backoff, and dead-letter handling.
    - Granted strict PostgreSQL Row-Level Security (RLS) policies to `daynori_runtime`.
  - **Contracts & Curated Allowlist (`packages/contracts/src/api/files.ts` & `index.ts`)**:
    - Defined `ALLOWED_MIME_TYPES` allowlist for standard images, PDFs, text, Markdown, and media.
    - Defined size constants: `MAX_GENERAL_FILE_BYTES = 25 MiB`, `MAX_AUDIO_FILE_BYTES = 50 MiB`, `MAX_CONCURRENT_RESERVATIONS = 5`.
    - Defined expiry constants: `UPLOAD_CAPABILITY_EXPIRY_SECONDS = 7200` (2 hours), `DOWNLOAD_CAPABILITY_EXPIRY_SECONDS = 300` (5 minutes).
    - Defined strict Zod request and response schemas for upload reservation, finalization, status inquiry, cancellation, download capabilities, file items, and workspace storage quota.
  - **Storage Provider & Transport Endpoints (`apps/api/src/modules/files/storageTransfer.ts` & `storageAdapter.ts`)**:
    - Implemented real storage transfer HTTP endpoints (PUT `/v1/storage/upload/:bucket/*` and GET `/v1/storage/download/:bucket/*`) with cryptographic capability token verification, body size bounding (50 MiB), max byte bound enforcement, and 409 conflict detection for `upsert: false`.
    - `MemoryStorageProvider` uses dynamic HTTP transfer endpoints, bounds byte limits, and supports capability revocation.
    - Unconfigured storage returns an honest 503 unavailable state rather than fictional upload URLs or volatile storage.
  - **Content Sniffing & Active Vector Inspection (`apps/api/src/modules/files/inspector.ts`)**:
    - Evaluates binary magic bytes (JPEG, PNG, GIF, WebP, PDF) to determine genuine content type.
    - Validates actual byte length against reservation policy bounds and `maxAllowedBytes`.
    - Detects active script vectors in text and XML/SVG payloads (`<script>`, `javascript:`, `onload=`, `eval(`).
    - Rejects Windows PE executables (`MZ` header), Unix ELF binaries (`\x7FELF`), and shell scripts.
    - Computes cryptographic SHA-256 checksum and compares against client-supplied checksum if provided.
  - **Fail-Closed Malware Scanner (`apps/api/src/modules/files/scanner.ts`)**:
    - `PolicyMalwareScanner` detects standard EICAR antivirus test signatures and embedded reverse shell commands.
    - `ExternalMalwareScanner` provides integration with bounded execution timeout and fail-closed behavior.
    - Records scanner engine/version, scanned byte count, and exact immutable SHA-256 hash without logging user content.
    - Enforces fail-closed semantics: on scanner outage or timeout, throws an explicit unavailable error, blocking verification.
  - **Storage Quota & Concurrency Bounding (`apps/api/src/modules/files/quotaService.ts`)**:
    - Bounds quota at reservation time: verifies `stored_bytes + reserved_bytes + requested_bytes <= max_storage_bytes` before issuing upload capabilities.
    - Filters in-flight exposure strictly by `status IN ('reserved', 'uploaded') AND expires_at > now() AND reconciled = false`.
    - Limits active unfinalized reservations per workspace to `MAX_CONCURRENT_RESERVATIONS` (5).
    - Transitions exposure atomically on finalization (decrements `reserved_bytes` and increments `stored_bytes` by verified size).
    - Accounted exposure is retained until capability expiry or explicit revocation and successful reconciliation.
  - **Files Service & REST Routes (`apps/api/src/modules/files/service.ts`, `apps/api/src/routes/v1/files.ts`)**:
    - Implemented `reserveFileUpload`, `finalizeFileUpload`, `getUploadReservationStatus`, `cancelUploadReservation`, `getFileDownloadCapability`, `getFileItem`, `deleteFileItem`, and `reconcileExpiredReservations`.
    - Enforces explicit lifecycle transitions (`reserved` -> `quarantined` -> `verified`/`rejected`).
    - Applies mutation receipts with canonical payload hash to ensure durable idempotent retries.
    - Prevents caller-supplied `fileId` hijacking by checking existing items.
    - Generates unpredictable, server-controlled object paths: `${workspaceId}/${fileId}/${versionId}/${crypto.randomBytes(16).toString('hex')}`.
    - Synchronizes file mutations to change feed outbox (`file` entity events with revision tracking and sync sequence advancement).
    - Configured `errorHandler.ts` mapping: `QUOTA_EXCEEDED` (400), `RATE_LIMITED` (429), `CONFLICT` (409), `VALIDATION_FAILED` (400), `STORAGE_UNAVAILABLE` (503).
  - **Durable Background Worker (`apps/worker/src/worker.ts`)**:
    - Implemented `DaynoriWorker` decoupled from API internal paths, executing jobs against `app.background_jobs` using `SELECT ... FOR UPDATE SKIP LOCKED`.
    - Supports bounded retries, exponential backoff, dead-letter state, and restart recovery.
    - Enqueues durable `file_deletion` jobs so database rollbacks cannot desynchronize storage bytes.
  - **Client Synchronization Projections & Local Adapters (`@daynori/sync`, `apps/web`, `apps/mobile`)**:
    - Added `FileItemSchema` and `files` array to `SyncBootstrapResponseSchema` and `bootstrap` service.
    - Extended Web `IndexedDbLocalRepository` (schema v7) with `files` store, version tracking, and `listFiles`.
    - Extended Mobile `SqliteLocalRepository` (migration v8) with `files` table, `upsertFileDirect`, `getFile`, and `listFiles`.
    - Bound mobile journal snippet toggle to remote `updateUserPreferences` with offline retry.
- **Excluded/deferred scope:**
  - Physical Android TalkBack and hardware KeyStore release gates remain blocked pending physical hardware testing.
  - Live external enterprise virus scanning daemon integration (fail-closed policy scanner verified in place).
  - UI surfaces for file browsing, folder attachment listing, and image/document preview modals are implemented in Phase 25.
  - Chunked multipart resumable upload protocol (TUS) is deferred to future large-file media phases.

## Result

Delivered the private binary upload lifecycle, quarantine verification pipeline, and durable storage transport. Every uploaded binary is isolated under an unpredictable server-generated object path, validated for magic bytes, checked for active content vectors, verified against malware policies, and bounded by storage quotas before being exposed for download through short-lived 300-second authorized URLs.

## Acceptance evidence

| Acceptance Condition                                                         | Verification Method                                                    | Result                                                                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1. Binary availability gated by ownership, integrity, size, and safety       | `tests/integration/phase24-binary-upload.test.ts` (Journey 1, 3, 4, 5) | Passed. Files remain quarantined until magic bytes match, size is within bounds, checksum matches, and malware scan is clean.   |
| 2. Object paths cannot be guessed to download another workspace's files      | `tests/integration/phase24-binary-upload.test.ts` (Journey 7)          | Passed. Cross-workspace attempts to download or query metadata return 404. Object paths use random 128-bit hex tokens.          |
| 3. Quota bounded at reservation time; temporary storage cannot exceed limits | `tests/integration/phase24-binary-upload.test.ts` (Journey 2)          | Passed. Attempts exceeding 100 MiB quota are rejected at reservation time; concurrent active reservations strictly capped at 5. |
| 4. MIME spoofing & active content rejected                                   | `tests/integration/phase24-binary-upload.test.ts` (Journey 3)          | Passed. PE executables masked as PNG and SVG files with embedded `<script>` tags are rejected with HTTP 400.                    |
| 5. Fail-closed malware scanning policy                                       | `tests/integration/phase24-binary-upload.test.ts` (Journey 5)          | Passed. EICAR test signatures are rejected; scanner outage triggers fail-closed error preventing verification.                  |
| 6. Idempotent finalization & strict overwrite prevention                     | `tests/integration/phase24-binary-upload.test.ts` (Journey 6)          | Passed. Re-finalizing returns identical file metadata; direct storage overwrite with `upsert: false` throws 409 conflict.       |
| 7. Expiry horizon, worker lease, and orphan cleanup                          | `tests/integration/phase24-binary-upload.test.ts` (Journey 8)          | Passed. Expired abandoned reservations are cleaned up by `DaynoriWorker` with lease locking; quota is reconciled.               |
| 8. Real HTTP upload transport & byte bounding                                | `tests/integration/phase24-binary-upload.test.ts` (Journey 1, 2)       | Passed. Verified PUT/GET transfer endpoints bound bytes, verify tokens, and enforce quota.                                      |
| 9. Multi-tenant synchronization projections                                  | `tests/integration/phase24-binary-upload.test.ts` (Journey 9, 10)      | Passed. Bootstrap and sync projections replicate file records to Web IndexedDB and Mobile SQLite; preference sync retries.      |

### Commands Run

```bash
# 1. Phase 24 Integration Tests (10 journeys)
pnpm vitest run tests/integration/phase24-binary-upload.test.ts
# Exit code: 0
# Output: 10 passed (10) in 975ms

# 2. Files Module Unit Tests
pnpm vitest run apps/api/src/modules/files/files.test.ts
# Exit code: 0
# Output: 11 passed (11) in 9ms

# 3. Worker Unit Tests
pnpm vitest run apps/worker/src/worker.test.ts
# Exit code: 0
# Output: 6 passed (6) in 6ms

# 4. Full Repository Test Suite
pnpm vitest run
# Exit code: 0
# Output: 43 test files passed, 584 tests passed (100% pass rate)

# 5. Strict Monorepo Typecheck
pnpm typecheck
# Exit code: 0
# Output: Scope: 13 workspace projects, all passed with 0 errors

# 6. Monorepo ESLint
pnpm lint
# Exit code: 0
# Output: 0 errors, 0 warnings

# 7. Code Formatting Check
pnpm format:check
# Exit code: 0
# Output: All matched files use Prettier code style!

# 8. Secret Scanning Audit
node scripts/scan-secrets.mjs
# Exit code: 0
# Output: Secret scanning passed: checked 1674 files without detecting unapproved secrets.

# 9. Planning & Roadmap Validation
node scripts/validate-planning.mjs
# Exit code: 0
# Output: Planning validation passed: 64 phases, 22 mapped requirements, 182 Markdown files.

# 10. Git Diff Check
git diff --check
# Exit code: 0
# Output: Clean (no trailing whitespace or conflict markers)
```

## Defects, limitations and recovery

- **Physical Hardware Release Gates**: Physical Android TalkBack screen reader verification and hardware Android KeyStore validation remain blocked pending access to physical hardware devices.
- **External Scanning Daemon**: Production virus scanning daemon infrastructure is not deployed locally; fail-closed scanning policy and error handling are verified in code and integration tests.
- **Rollback / Forward-Fix**: Database migrations `00020_file_upload_lifecycle_and_quarantine.sql` and `00021_repair_file_lifecycle_jobs_and_grants.sql` create additive tables and constraints with cascading foreign keys to `app.workspaces(id)` and `app.items(id)`. Forward-fixes or rollbacks can drop or alter these tables without impacting existing tasks, notes, or routines.

## Documentation and Git review

- **ADRs**: [ADR-0030: Private Binary Upload Lifecycle, Storage Quotas, and Quarantine Verification](../decisions/0030-private-binary-upload-lifecycle.md).
- **CHANGELOG.md**: Updated with Phase 24 entries and repairs.
- **progress.json**: Phase 24 status recorded as `blocked` (software verified; hardware and external scanning release gates blocked).
- **Git Diff**:
  - `apps/api/src/modules/files/`: Core files domain, inspection, malware scanning, storage adapter, storage transfer routes, quota service, and service implementation.
  - `apps/api/src/modules/sync/`: Sync bootstrap and incremental projections for files.
  - `apps/api/src/routes/v1/files.ts`: Fastify route handlers with RLS tenant context.
  - `apps/api/src/plugins/errorHandler.ts`: API error code mappings for quota, validation, and storage availability.
  - `apps/api/src/server.ts`: Route registration.
  - `apps/worker/src/worker.ts`: Decoupled worker lease locking and durable job processing.
  - `infra/supabase/migrations/00020_file_upload_lifecycle_and_quarantine.sql` & `00021_repair_file_lifecycle_jobs_and_grants.sql`: Schema migration and RLS policies.
  - `packages/contracts/src/api/files.ts` & `sync.ts`: Zod schemas and constants.
  - `packages/sync/`: File record port definitions and sync models.
  - `apps/web/src/data/indexedDbRepository.ts`: IndexedDB files storage and queries.
  - `apps/mobile/src/data/sqliteRepository.ts`: SQLite files table and preferences sync.
  - `tests/integration/phase24-binary-upload.test.ts`: 10 end-to-end integration test journeys.
- **Intended commit message:** `fix(files): repair storage transport, quota accounting, and worker lifecycle`

## Handoff

The next eligible phase is **Phase 25 — Files, folders, and safe previews** ([docs/roadmap/phases/25-files-folders-and-safe-previews.md](../roadmap/phases/25-files-folders-and-safe-previews.md)), which will build UI browsing, folder attachment listing, and preview interfaces on top of the verified upload pipeline delivered in Phase 24.
