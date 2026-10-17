# Phase 25: Files, folders, and safe previews

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [25 — Files, folders, and safe previews](../roadmap/phases/25-files-folders-and-safe-previews.md)
- **Status:** `blocked` (Software implementation, UI components, offline caching, and integration test suite delivered and verified 100% locally; completion status recorded as `blocked` in `docs/roadmap/progress.json` pending physical Android TalkBack hardware and KeyStore release gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-17.
- **Base Git revision and branch:** `e1f02c9` on `main`.
- **Prerequisites:**
  - [Phase 24 — Private binary upload lifecycle](phase-24.md): Quota reservation, quarantine verification pipeline, storage adapter, and Fastify REST routes.
  - [Phase 15 — Folder browsing and organization interfaces](phase-15.md): Folder hierarchy navigation, path breadcrumbs, and drag-drop boundaries.
- **Included scope:**
  - **Contracts & Content Inspection (`packages/contracts`, `apps/api`)**:
    - Added `'application/msword'` (.doc) to `ALLOWED_MIME_TYPES` alongside `.docx` in `packages/contracts/src/api/files.ts`.
    - Added OLE Compound File Binary (`D0 CF 11 E0 A1 B1 1A E1`) sniffing in `apps/api/src/modules/files/inspector.ts` to detect legacy Word documents securely.
  - **Pure Domain Operations (`packages/domain/src/files.ts`)**:
    - Implemented `getFilePreviewKind(mimeType)` categorizing files into `image`, `pdf`, `office`, `text`, `audio`, or `unsupported`.
    - Implemented `isSafeToPreview(quarantineStatus, mimeType)`: only permits verified, supported kinds; strictly blocks previewing quarantined, rejected, or deleted files.
    - Implemented `formatByteSize(bytes)`: human-readable byte sizing (B, KB, MB, GB).
    - Implemented `computeStorageUsage(stored, reserved, max)`: computes progress percentage, formatted labels, and limit threshold warnings.
    - Implemented `getOfflineBinaryCacheKey(accountId, workspaceId, fileId, version)`: returns `${accountId}:${workspaceId}:${fileId}:v${version}`.
    - Added 5 domain tests in `packages/domain/src/domain.test.ts`.
  - **Web UI Primitives (`packages/ui-web`)**:
    - `StorageUsageBar.tsx`: Accessible HTML5 progress bar with live announcements and warning indicators for 80% threshold and 100% capacity.
    - `FileUploadDialog.tsx`: Modal upload dialog featuring folder target selector, drag-and-drop zone, size checks, live XHR progress bar, cancellation via `AbortController`, and quarantine rejection alert banners.
    - `FilePreviewDialog.tsx`: Safe preview modal with image viewport, PDF frame, office document metadata breakdown (format, byte size, version, checksum) + safe download button (explicitly avoiding in-app office editing claims), offline toggle, and rejection notices.
    - Added 6 unit tests in `packages/ui-web/src/ui-web.test.ts`.
  - **Mobile UI Primitives (`packages/ui-mobile`)**:
    - `MobileStorageUsageBar.tsx`: React Native progress bar styled with design tokens and accessibility announcements.
    - `MobileFileUploadSheet.tsx`: Bottom sheet for file picking, folder destination selection, upload progress, abort cancellation, and rejection feedback.
    - `MobileFilePreviewSheet.tsx`: Bottom sheet providing safe previews for images, PDF viewing guidance, office document metadata breakdown + download action, and offline pinning.
    - Added 3 unit tests in `packages/ui-mobile/src/ui-mobile.test.ts`.
  - **Offline Binary Caches (`apps/web`, `apps/mobile`)**:
    - `apps/web/src/data/offlineFileCache.ts` (`OfflineFileCache`): IndexedDB storage with in-memory fallback for test runners.
    - `apps/mobile/src/data/offlineFileCache.ts` (`MobileOfflineFileCache`): Mobile binary cache.
    - Both caches enforce strict `${accountId}:${workspaceId}:${fileId}:v${version}` namespacing, SHA-256 integrity verification (`computeBufferSha256`), automatic eviction upon bit rot / byte tampering, and context clearance on account switch or logout.
  - **Web App Integration (`apps/web`)**:
    - `apps/web/src/app/library/page.tsx`: Integrated `StorageUsageBar`, `+ Upload File` button opening `FileUploadDialog`, leaf item click opening `FilePreviewDialog`, direct XHR upload with progress, `finalizeFileUpload`, and offline availability toggling.
    - Supported `?create=file` and `?type=files` URL parameters.
    - Created `apps/web/src/app/files/page.tsx` redirecting cleanly to `/library?type=files`.
    - Updated `apps/web/src/components/AppModals.tsx` with Files search destination and quick-create action.
  - **Mobile App Integration (`apps/mobile`)**:
    - `apps/mobile/src/views/LibraryView.tsx`: Integrated `MobileStorageUsageBar`, `+ Upload` button, file item press opening `MobileFilePreviewSheet`, and `MobileFileUploadSheet`.
    - Updated `apps/mobile/src/navigation/types.ts` and `CreateSheet.tsx` with File creation pill.
  - **Integration Test Suite (`tests/integration/phase25-files-previews.test.ts`)**:
    - 7 comprehensive journeys covering folder placement ("Software > Guides" and "Government jobs > Applications"), safe previews (images, PDFs, office metadata), quarantine / rejection enforcement, storage quota visibility and bounding, cancellation and retry, offline caching with SHA-256 integrity eviction, and multi-tenant workspace isolation.
- **Excluded/deferred scope:**
  - Physical Android TalkBack and hardware KeyStore release gates remain recorded as `blocked` in `docs/roadmap/progress.json` and phase reports, pending physical testing equipment.
  - In-browser or in-app Microsoft Office editing is strictly out of scope and forbidden to be claimed; office documents provide verified format metadata and safe download fallbacks.
  - Next Phase 26 (Cloud sync protocol and engine) remains untouched.

## Result

Delivered complete, safe, and accessible file and folder organization, safe isolated previews, storage usage visibility, and verified offline file availability across Web and Mobile surfaces. All 606 automated tests across the workspace pass 100%.

## Acceptance evidence

| Acceptance Condition                                                              | Verification Method                                                                                   | Result                                                                                                                                                                                          |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Files organize cleanly into workspace folder hierarchies across Web and Mobile | `tests/integration/phase25-files-previews.test.ts` (Journey 1)                                        | Passed. Uploads into "Software > Guides" and "Government jobs > Applications" associate correct `folderId`, persist through finalization, and download with exact byte integrity.               |
| 2. Safe isolated previews across formats; office editing never falsely claimed    | `tests/integration/phase25-files-previews.test.ts` (Journey 2), `ui-web.test.ts`, `ui-mobile.test.ts` | Passed. Images and PDFs preview safely; office formats (.docx, .doc) display structured metadata (size, version, checksum) + safe download button without in-app editing claims.                |
| 3. Quarantined & rejected files strictly block previews and downloads             | `tests/integration/phase25-files-previews.test.ts` (Journey 3)                                        | Passed. Signature mismatch or scanning failures fail finalization with 400 Bad Request; files are never marked verified; download capability requests fail; preview is blocked by domain rules. |
| 4. Storage quota visibility and exceeded quota enforcement                        | `tests/integration/phase25-files-previews.test.ts` (Journey 4), `packages/domain/src/domain.test.ts`  | Passed. `computeStorageUsage` accurately formats bytes and computes percentages; reservations exceeding maximum quota fail cleanly with 400/409.                                                |
| 5. Upload cancellation and retry without orphan records                           | `tests/integration/phase25-files-previews.test.ts` (Journey 5)                                        | Passed. In-flight abort calls `cancelFileUploadReservation` to reconcile reserved exposure immediately; subsequent retry succeeds without duplicate records.                                    |
| 6. Offline file availability, cache namespacing, and integrity eviction           | `tests/integration/phase25-files-previews.test.ts` (Journey 6)                                        | Passed. Cache keys are namespaced `${accountId}:${workspaceId}:${fileId}:v${version}`; SHA-256 mismatch triggers automatic eviction; switching workspaces purges cached entries.                |
| 7. Multi-tenant workspace isolation                                               | `tests/integration/phase25-files-previews.test.ts` (Journey 7)                                        | Passed. Unauthorized users cannot download cross-workspace files, query file metadata, or inspect foreign storage quotas (returns 404/403).                                                     |

## Verification commands and output

1. **Pure Domain Tests (`@daynori/domain`)**:
   `pnpm --filter @daynori/domain test` -> 51 passed (51).
2. **UI Web Tests (`@daynori/ui-web`)**:
   `pnpm --filter @daynori/ui-web test` -> 42 passed (42).
3. **UI Mobile Tests (`@daynori/ui-mobile`)**:
   `pnpm --filter @daynori/ui-mobile test` -> 9 passed (9).
4. **Integration Test Suite (`tests/integration/phase25-files-previews.test.ts`)**:
   `pnpm vitest run tests/integration/phase25-files-previews.test.ts` -> 7 passed (7).
5. **Full Monorepo Test Suite**:
   `pnpm vitest run` -> 44 test files passed (44), 606 tests passed (606).
6. **Typecheck Quality Gate**:
   `pnpm typecheck` -> Exited 0 across all 13 workspace projects.
7. **Lint Quality Gate**:
   `pnpm lint` -> Exited 0 with 0 errors and 0 warnings.
8. **Format Quality Gate**:
   `pnpm format:check` -> Exited 0; all matched files use Prettier style.
9. **Secrets Scanning**:
   `node scripts/scan-secrets.mjs` -> Passed: checked 1685 files without detecting unapproved secrets.
10. **Planning Validation**:
    `node scripts/validate-planning.mjs` -> Planning validation passed: 64 phases, 22 mapped requirements, 182 Markdown files.
