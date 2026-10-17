# Phase 24: Private binary upload lifecycle

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [24 — Private binary upload lifecycle](../roadmap/phases/24-private-binary-upload-lifecycle.md)
- **Status:** `blocked` (Provisional private binary upload lifecycle delivered under owner authorization and verified across Vitest pure domain, inspector, fail-closed malware scanner, quota bounding, worker lease jobs, PostgreSQL Row-Level Security, Fastify files REST routes, DaynoriApiClient, and 8 end-to-end integration journeys; completion blocked pending prerequisite Phase 04–06 and Phase 11 physical Android TalkBack hardware and KeyStore release gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-17.
- **Base Git revision and branch:** `63f9b40` on `main`.
- **Prerequisites:**
  - [Phase 15 — Folder browsing and organization interfaces](phase-15.md): Folder hierarchy, drag-drop bounds, and organization.
  - [Phase 08 — API contracts and service foundation](phase-08.md): Fastify API foundation, tenant isolation, and contracts.
- **Included scope:**
  - **Database Migration (`infra/supabase/migrations/00020_file_upload_lifecycle_and_quarantine.sql`)**:
    - Created `app.workspace_storage_usage` tracking `stored_bytes`, `reserved_bytes`, and `max_storage_bytes` (100 MiB default) with RLS restricting viewing to members and editing to editors.
    - Created `app.file_items` (extending `app.items` where `kind = 'file'`) recording quarantine states (`quarantined`, `verified`, `rejected`, `deleted`), detected MIME types, checksums, and metadata.
    - Created `app.file_versions` storing immutable revision snapshots.
    - Created `app.upload_reservations` tracking upload capabilities, declared/reserved exposure bytes, 2-hour expiration, and reconciliation state.
    - Configured strict PostgreSQL Row-Level Security (RLS) policies and granted least-privilege permissions to `daynori_runtime` and `authenticated` roles.
  - **Contracts & Curated Allowlist (`packages/contracts/src/api/files.ts` & `index.ts`)**:
    - Defined `ALLOWED_MIME_TYPES` allowlist for standard images, PDFs, text, Markdown, and media.
    - Defined size constants: `MAX_GENERAL_FILE_BYTES = 25 MiB`, `MAX_AUDIO_FILE_BYTES = 50 MiB`, `MAX_CONCURRENT_RESERVATIONS = 5`.
    - Defined expiry constants: `UPLOAD_CAPABILITY_EXPIRY_SECONDS = 7200` (2 hours), `DOWNLOAD_CAPABILITY_EXPIRY_SECONDS = 300` (5 minutes).
    - Defined strict Zod request and response schemas for upload reservation, finalization, status inquiry, cancellation, download capabilities, file items, and workspace storage quota.
  - **Content Sniffing & Active Vector Inspection (`apps/api/src/modules/files/inspector.ts`)**:
    - Evaluates binary magic bytes (JPEG, PNG, GIF, WebP, PDF) to determine genuine content type.
    - Detects active script vectors in text and XML/SVG payloads (`<script>`, `javascript:`, `onload=`, `eval(`).
    - Rejects Windows PE executables (`MZ` header), Unix ELF binaries (`\x7FELF`), and shell scripts.
    - Computes cryptographic SHA-256 checksum and compares against client-supplied checksum if provided.
  - **Fail-Closed Malware Scanner (`apps/api/src/modules/files/scanner.ts`)**:
    - `PolicyMalwareScanner` detects standard EICAR antivirus test signatures and embedded reverse shell commands.
    - Enforces fail-closed semantics: on scanner outage or timeout, throws an explicit unavailable error, blocking verification.
  - **Storage Quota & Concurrency Bounding (`apps/api/src/modules/files/quotaService.ts`)**:
    - Bounds quota at reservation time: verifies `stored_bytes + reserved_bytes + requested_bytes <= max_storage_bytes` before issuing upload capabilities.
    - Limits active unfinalized reservations per workspace to `MAX_CONCURRENT_RESERVATIONS` (5).
    - Transitions exposure atomically on finalization (decrements `reserved_bytes` and increments `stored_bytes` by verified size).
    - Releases exposure immediately on cancellation or security rejection.
  - **Storage Provider Abstraction (`apps/api/src/modules/files/storageAdapter.ts`)**:
    - Defined `StorageProviderContract` supporting signed upload/download capability generation with strict expiry and `upsert: false`.
    - Implemented `MemoryStorageProvider` for isolated, reproducible integration tests.
  - **Files Service & REST Routes (`apps/api/src/modules/files/service.ts`, `apps/api/src/routes/v1/files.ts`)**:
    - Implemented `reserveFileUpload`, `finalizeFileUpload`, `getUploadReservationStatus`, `cancelUploadReservation`, `getFileDownloadCapability`, `getFileItem`, `deleteFileItem`, and `reconcileExpiredReservations`.
    - Generates unpredictable, server-controlled object paths: `${workspaceId}/${fileId}/${versionId}/${crypto.randomBytes(16).toString('hex')}`.
    - Synchronizes file mutations to change feed outbox (`file` entity events with revision tracking and sync sequence advancement).
    - Configured `errorHandler.ts` mapping: `QUOTA_EXCEEDED` (400), `RATE_LIMITED` (429), `CONFLICT` (409), `VALIDATION_FAILED` (400).
  - **Background Worker & Lease Engine (`apps/worker/src/worker.ts`)**:
    - Implemented `DaynoriWorker` with exclusive lease acquisition (30-second TTL) preventing duplicate processing.
    - Implemented `file_scan` and `file_orphan_cleanup` job processing.
  - **Client SDK (`packages/api-client/src/client.ts`)**:
    - Added typed methods to `DaynoriApiClient`: `getWorkspaceStorageQuota`, `reserveFileUpload`, `finalizeFileUpload`, `getFileUploadStatus`, `cancelFileUploadReservation`, `getFileDownloadCapability`, `getFileMetadata`, `deleteFile`.
- **Excluded/deferred scope:**
  - Physical Android TalkBack and hardware KeyStore release gates remain blocked pending physical hardware testing.
  - UI surfaces for file browsing, folder attachment listing, and image/document preview modals are deferred to Phase 25.
  - Chunked multipart resumable upload protocol (TUS) is deferred to future large-file media phases.

## Result

Delivered the private binary upload lifecycle and quarantine verification pipeline. Every uploaded binary is isolated under an unpredictable server-generated object path, validated for magic bytes, checked for active content vectors, verified against malware policies, and bounded by storage quotas before being exposed for download through short-lived 300-second authorized URLs.

## Acceptance evidence

| Acceptance Condition                                                         | Verification Method                                                    | Result                                                                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1. Binary availability gated by ownership, integrity, size, and safety       | `tests/integration/phase24-binary-upload.test.ts` (Journey 1, 3, 4, 5) | Passed. Files remain quarantined until magic bytes match, size is within bounds, checksum matches, and malware scan is clean.   |
| 2. Object paths cannot be guessed to download another workspace's files      | `tests/integration/phase24-binary-upload.test.ts` (Journey 7)          | Passed. Cross-workspace attempts to download or query metadata return 404. Object paths use random 128-bit hex tokens.          |
| 3. Quota bounded at reservation time; temporary storage cannot exceed limits | `tests/integration/phase24-binary-upload.test.ts` (Journey 2)          | Passed. Attempts exceeding 100 MiB quota are rejected at reservation time; concurrent active reservations strictly capped at 5. |
| 4. MIME spoofing & active content rejected                                   | `tests/integration/phase24-binary-upload.test.ts` (Journey 3)          | Passed. PE executables masked as PNG and SVG files with embedded `<script>` tags are rejected with HTTP 400.                    |
| 5. Fail-closed malware scanning policy                                       | `tests/integration/phase24-binary-upload.test.ts` (Journey 5)          | Passed. EICAR test signatures are rejected; scanner outage triggers fail-closed error preventing verification.                  |
| 6. Idempotent finalization & strict overwrite prevention                     | `tests/integration/phase24-binary-upload.test.ts` (Journey 6)          | Passed. Re-finalizing returns identical file metadata; direct storage overwrite with `upsert: false` throws.                    |
| 7. Expiry horizon, worker lease, and orphan cleanup                          | `tests/integration/phase24-binary-upload.test.ts` (Journey 8)          | Passed. Expired abandoned reservations are cleaned up by `DaynoriWorker` with lease locking; quota is reconciled.               |

### Commands Run

```bash
# 1. Phase 24 Integration Tests
pnpm vitest run tests/integration/phase24-binary-upload.test.ts
# Exit code: 0
# Output: 8 passed (8) in 661ms

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
# Output: 43 test files passed, 582 tests passed (100% pass rate)

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
# Output: Secret scanning passed: checked 1669 files without detecting unapproved secrets.

# 9. Planning & Roadmap Validation
node scripts/validate-planning.mjs
# Exit code: 0
# Output: Planning validation passed: 64 phases, 22 mapped requirements, 180 Markdown files.

# 10. Git Diff Check
git diff --check
# Exit code: 0
# Output: Clean (no trailing whitespace or conflict markers)
```

## Defects, limitations and recovery

- **Physical Hardware Release Gates**: Physical Android TalkBack screen reader verification and hardware Android KeyStore validation remain blocked pending access to physical hardware devices. Provisional software implementation is verified.
- **Rollback / Forward-Fix**: Database migration `00020_file_upload_lifecycle_and_quarantine.sql` creates additive tables (`workspace_storage_usage`, `file_items`, `file_versions`, `upload_reservations`) with cascading foreign keys to `app.workspaces(id)` and `app.items(id)`. Forward-fixes or rollbacks can drop or alter these tables without impacting existing tasks, notes, or routines.

## Documentation and Git review

- **ADRs**: [ADR-0030: Private Binary Upload Lifecycle, Storage Quotas, and Quarantine Verification](../decisions/0030-private-binary-upload-lifecycle.md).
- **CHANGELOG.md**: Updated with Phase 24 entries.
- **progress.json**: Updated Phase 24 status to `blocked` (provisional software verified; hardware release gates blocked).
- **Git Diff**:
  - `apps/api/src/modules/files/`: Core files domain, inspection, malware scanning, storage adapter, quota service, and service implementation.
  - `apps/api/src/routes/v1/files.ts`: Fastify route handlers with RLS tenant context.
  - `apps/api/src/plugins/errorHandler.ts`: API error code mappings for quota and file validation errors.
  - `apps/api/src/server.ts`: Route registration.
  - `apps/worker/src/worker.ts`: Worker lease locking and job processing.
  - `infra/supabase/migrations/00020_file_upload_lifecycle_and_quarantine.sql`: Schema migration and RLS policies.
  - `packages/contracts/src/api/files.ts`: Zod schemas and constants.
  - `packages/api-client/src/client.ts`: API client methods.
  - `tests/integration/phase24-binary-upload.test.ts`: 8 end-to-end integration test journeys.
- **Intended commit message:** `feat(files): add private verified uploads and storage lifecycle`

## Handoff

The next eligible phase is **Phase 25 — Files, folders, and safe previews** ([docs/roadmap/phases/25-files-folders-and-safe-previews.md](../roadmap/phases/25-files-folders-and-safe-previews.md)), which will build UI browsing, folder attachment listing, and preview interfaces on top of the verified upload pipeline delivered in Phase 24. Stop here; do not begin Phase 25.
