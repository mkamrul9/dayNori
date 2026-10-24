# Phase 35: Portable export and controlled import

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [35 — Portable export and controlled import](../roadmap/phases/35-portable-export-and-controlled-import.md)
- **Status:** `blocked` (Software implementation, zero-dependency ZIP engine, path traversal defense, zip bomb prevention, cryptographic HMAC-SHA256 reauthentication, complete workspace multi-format export, explicit vault and Google Drive exclusions, ephemeral signed download links, dry-run bounded import preview without premature database mutation, transactional import execution with total ID remapping, duplicate resolution strategies [skip, create_copy, overwrite_if_newer], quota accounting, Web WorkspacePortabilityDialog, Mobile MobileWorkspacePortabilitySheet, and 28 integration tests verified locally; completion status recorded as `blocked` in `docs/roadmap/progress.json` due to prerequisite physical Android TalkBack / KeyStore hardware gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-18.
- **Base Git revision and branch:** `a9e3689: fix(sync): repair conflict review wiring, recovery export boundaries, and bootstrap consistency` on `main`.
- **Prerequisites:**
  - [Phase 34 — Conflict recovery and offline hardening](phase-34.md): Local recovery export boundaries, sanitized diagnostics, and conflict recovery mechanisms.
  - [Phase 24 — Private binary upload lifecycle and quarantine](phase-24.md): Storage provider contracts, signed upload/download capabilities, and private bucket isolation.
  - [Phase 14 — Organization collections, folders, and shared item metadata](phase-14.md): Folder hierarchies, tags, and shared item organization.
- **Included scope:**
  - **Shared Data Contracts (`packages/contracts`)**:
    - `packages/contracts/src/api/portability.ts`:
      - Defined Zod schemas and TypeScript types: `ReauthenticateRequestSchema`, `ReauthenticateResponseSchema`, `ExportManifestSchema`, `ExportManifestSummarySchema`, `ExportManifestExclusionSchema`, `CreateExportRequestSchema`, `CreateExportResponseSchema`, `ImportDuplicateItemSchema`, `ImportDuplicateStrategySchema`, `ImportQuotaCheckSchema`, `ImportPreviewResponseSchema`, `ExecuteImportRequestSchema`, and `ExecuteImportResponseSchema`.
  - **Zero-Dependency ZIP Engine (`apps/api/src/modules/portability/zipArchive.ts`)**:
    - Implemented self-contained ZIP parser (`parseZipArchive`) and builder (`createZipArchive`) using Node.js built-in `node:zlib` (`crc32`, `deflateRawSync`, `inflateRawSync`), avoiding external npm packages and supply chain risks.
    - Path traversal defense: `assertSafePath` rejects relative traversal segments (`..`, `.`), absolute paths (leading `/` or `\\`), Windows drive letters (`C:\`), UNC network shares, null bytes (`\0`), and ASCII control characters (0–31, 127).
    - Zip-bomb defense: Tracks cumulative decompressed bytes against a strict ceiling (200 MiB), restricts entry count (maximum 5,000 entries), and enforces a compression ratio guard (> 100:1 when decompressed size exceeds 10 MiB).
    - Integrity validation: Validates End of Central Directory (`0x06054b50`), Central Directory headers (`0x02014b50`), Local File headers (`0x04034b50`), and computes CRC-32 checksums for every uncompressed payload.
  - **Reauthentication Ticket System (`apps/api/src/modules/portability/reauth.ts`)**:
    - Cryptographic HMAC-SHA256 signed ephemeral reauthentication tickets (`issueReauthToken`).
    - Enforces 10-minute maximum validity window (`REAUTH_MAX_AGE_SECONDS = 600`).
    - Strict verification (`assertValidReauthentication`): Verifies token expiration, actor user ID binding, workspace ID binding, active session hash binding, and specific purpose (`protected_export`).
  - **Workspace Export Service (`apps/api/src/modules/portability/exportService.ts`)**:
    - Extracts workspace entities into human-readable and machine-readable formats:
      - `manifest.json`: Versioned export manifest with schema version (v1), workspace details, summary metrics, binary file checksums, and explicit security exclusions.
      - `metadata/folders.json` and `metadata/folders.csv`: Folder trees preserving parent/child relations.
      - `metadata/tags.json`: Workspace tags with colors.
      - `metadata/saved_views.json`: Custom saved views and filters.
      - `notes/notes.json` and `notes/markdown/<id>_<slug>.md`: Full note records and YAML frontmatter Markdown documents preserving Bengali Unicode and formatting.
      - `tasks/tasks.json` and `tasks/tasks.csv`: Tasks with priorities, statuses, deadlines, and tags.
      - `routines/routines.json`: Recurring schedules, active intervals, and weekday arrays.
      - `journal/journal.json`, `journal/journal.csv`, and `journal/markdown/<date>_<id>.md`: Daily reflection entries with moods, prompts, tags, and YAML frontmatter.
      - `calendar/calendar.json`: Scheduled events and dates.
      - `attachments/files.json` and `attachments/binaries/<filename>`: File items and clean binary payloads with SHA-256 checksums matching manifest.
    - Security exclusions: Strictly excludes vault items (`security_scope != 'vault'`) and external Google Drive mirrors, explicitly documenting reasons in manifest exclusions.
    - Ephemeral download URLs: Stores built archive in ephemeral cache with 15-minute TTL (`EXPORT_TTL_SECONDS = 900`) and signed HMAC URL token.
  - **Controlled Bounded Import Service (`apps/api/src/modules/portability/importService.ts`)**:
    - `validateAndPreviewImport`: Safely unpacks uploaded ZIP archive, inspects `manifest.json`, validates binary SHA-256 checksums against manifest, verifies workspace storage quota availability, and detects duplicate records against target workspace items without modifying the canonical database (strict dry-run guarantee).
    - `executeConfirmedImport`: Transactional execution with complete ID remapping:
      - Discards untrusted export user IDs and assigns all created entities to current authorized actor and target workspace.
      - Mints fresh UUIDs for all imported entities while preserving internal references (e.g., note-to-folder, task-to-folder, file-to-folder).
      - Two-pass hierarchy insertion for folders and tasks prevents foreign-key ordering issues regardless of alphabetical sorting.
      - Applies duplicate resolution strategies: `skip` (preserves existing target item), `create_copy` (mints new entity with `(Copy)` suffix), `overwrite_if_newer` (replaces content if imported timestamp is newer).
      - Uploads attachment binary payloads to private assets storage bucket under new workspace-scoped paths.
      - Updates workspace storage usage accounting.
      - Advances workspace sync sequence with row lock and inserts audit change record into `app.changes`.
      - Consumes single-use preview token to prevent replay.
  - **Fastify HTTP Routes (`apps/api/src/routes/v1/portability.ts`, `apps/api/src/server.ts`)**:
    - Registered `/v1/auth/reauthenticate`, `/v1/workspaces/:workspaceId/export`, `/v1/workspaces/:workspaceId/export/download/:exportId`, `/v1/workspaces/:workspaceId/import/preview`, and `/v1/workspaces/:workspaceId/import/execute`.
    - Added content-type parser for binary `application/zip`, `application/x-zip-compressed`, and `application/octet-stream` up to 50 MiB.
  - **Background Worker (`apps/worker/src/worker.ts`)**:
    - Added native task execution handler for `workspace_export` tasks.
  - **API Client (`packages/api-client/src/client.ts`)**:
    - Added `reauthenticate`, `createWorkspaceExport`, `previewWorkspaceImport`, and `executeWorkspaceImport` to `DaynoriApiClient`.
  - **Web User Interface (`packages/ui-web`, `apps/web`)**:
    - Implemented `WorkspacePortabilityDialog.tsx`: Accessible dialog with Export and Import tabs, password reauthentication modal flow, export progress indicators, expiring download link timer, archive picker, import preview card, duplicate strategy radio group, quota validation indicator, and execution confirmation.
    - Wired into web modal shell via `AppModals.tsx` and settings page (`apps/web/src/app/settings/page.tsx`).
  - **Mobile User Interface (`packages/ui-mobile`, `apps/mobile`)**:
    - Implemented `MobileWorkspacePortabilitySheet.tsx`: React Native modal sheet with Export and Import tabs, reauthentication, preview summary, duplicate resolution selector, storage quota check, and cancel/confirm buttons.
    - Wired into mobile shell navigation via `App.tsx` and `apps/mobile/src/views/SettingsView.tsx` with Android Back button handling.

## Verification results

1. **Automated Integration Suite (`tests/integration/phase35-portability-export-import.test.ts`)**:
   - 28/28 tests passing:
     - Reauthentication enforcement: Rejects export request when token is missing (403/404), expired (403/404), belongs to a different user, or is bound to another workspace; accepts fresh valid ticket.
     - Protected export generation: Generates complete ZIP archive containing folders (JSON+CSV), tags (JSON), saved views (JSON), notes (JSON+MD with YAML frontmatter), tasks (JSON+CSV), routines (JSON), journal (JSON+CSV+MD), calendar (JSON), and attachments with verified SHA-256 checksums. Supports Bengali Unicode and emojis.
     - Security exclusions: Strictly excludes vault items (`security_scope = 'vault'`) and external Google Drive mirrors with transparent manifest notices.
     - Ephemeral download link: Verifies valid download with signed token; rejects tampered download tokens, expired timestamps, and cross-account access attempts.
     - Archive safety defenses: Rejects archives attempting path traversal (`../../etc/passwd`), absolute filesystem paths (`/root/exploit.sh`), corrupted headers, and zip bombs exceeding safe size ceilings or compression ratios.
     - Controlled bounded import preview: Previews archive in clean workspace, generates accurate item counts, checks quota, detects duplicates, and asserts zero database mutations prior to execution (strict dry-run guarantee).
     - Round-trip import into clean target workspace: Executes import with total ID remapping (mints fresh UUIDs, assigns to target user and workspace, discards original export user ID), preserves parent/child folder hierarchy, uploads file binaries to storage, updates storage usage, and advances sync change feed.
     - Duplicate resolution strategies: Verifies `skip` (preserves existing record without duplicate), `create_copy` (creates copy with suffix), and `overwrite_if_newer` (updates record only when imported version is newer).
     - Quota enforcement: Prevents preview and blocks import execution when workspace storage quota is insufficient.
2. **Monorepo Integration Suite Verification (`tests/integration/phase34-conflict-recovery.test.ts`)**:
   - 13/13 tests passing: Phase 34 conflict recovery and offline hardening remains fully green without regression.
3. **Type Checking & Linting**:
   - `pnpm typecheck`: Clean (exit code 0 across all 14 workspace packages and apps).
   - `pnpm lint`: Clean (0 errors, 0 warnings across the entire monorepo).
4. **Planning & Roadmap Validation**:
   - `node scripts/validate-planning.mjs`: Clean (64 phases, 22 mapped requirements, 199 Markdown files verified).

## Architecture Invariants & Defenses

- **Zero External Zip Dependencies**: Uses built-in `node:zlib` methods (`crc32`, `deflateRawSync`, `inflateRawSync`), eliminating risks of vulnerable or untrusted third-party decompression libraries.
- **Strict Path Traversal Defense**: All archive paths pass through `assertSafePath` rejecting `..`, `.`, leading slashes, Windows drive letters, UNC paths, null bytes, and ASCII control characters.
- **Zip Bomb Mitigation**: Cumulative decompressed bytes are limited to 200 MiB, maximum entries capped at 5,000, and decompression ratios greater than 100:1 on large files (> 10 MiB) are aborted.
- **Strict Vault & Mirror Exclusions**: Server workspace export strictly queries `security_scope != 'vault'`, ensuring no end-to-end encrypted vault ciphertext or metadata slips into portable archives. External Google Drive mirrors are explicitly excluded with transparent manifest notices.
- **Dry-Run Import Preview Guarantee**: Uploading an archive for preview inspects the ZIP and compares identifiers in-memory without making any database inserts or updates.
- **Total ID Remapping on Import**: All imported entities receive newly minted UUIDs and are assigned to the importing user and target workspace; untrusted original author IDs and workspace IDs from the archive are unconditionally discarded.
- **Two-Pass Hierarchy Linking**: Folders and tasks are inserted with null parent pointers in pass 1 and linked in pass 2, eliminating foreign-key ordering issues regardless of alphabetical sorting.
- **Single-Use Preview Tokens**: Preview tokens are deleted upon execution, preventing accidental double-imports or replay attacks.

## Blocked gates and hardware dependencies

- **Physical Android TalkBack & Native KeyStore**: Provisional mobile implementation verified in automated headless test suites; physical TalkBack screen-reader gesture navigation and physical KeyStore hardware verification remain recorded as blocked gates.
- **External Production Push Providers**: Production FCM and Mozilla push gateway credentials remain blocked external dependencies.
