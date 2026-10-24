# ADR-0031: Safe Document Previews, Storage Usage Visibility, and Offline Availability

## Status

Accepted (Provisional Phase 25 delivery verified across pure domain classifications, web and mobile UI primitives, offline binary cache stores, DaynoriApiClient integrations, and 7 end-to-end integration journeys; physical Android TalkBack hardware and KeyStore release gates remain explicitly recorded as blocked without software defects blamed on hardware).

## Context

Phase 25 builds directly upon Phase 24's authoritative private binary upload lifecycle and storage quota accounting ([docs/roadmap/phases/25-files-folders-and-safe-previews.md](../roadmap/phases/25-files-folders-and-safe-previews.md)), fulfilling product requirement **R-STORAGE** in [docs/product/requirements.md](../product/requirements.md) and adhering to the multi-tenant isolation and security constraints in [docs/architecture/security-and-vault.md](../architecture/security-and-vault.md).

Key architectural requirements and safety considerations addressed:

1. **Organized Upload Placement**:
   - Files must integrate cleanly into the workspace folder hierarchy across both Web and Mobile interfaces (e.g. "Software > Guides" and "Government jobs > Applications").
   - Folder associations are strictly verified at reservation time and re-validated upon finalization to prevent cross-workspace tampering or folder hijacking.

2. **Safe Isolated Previews & The Office Document Boundary**:
   - Renderable file formats (JPEG, PNG, WebP, GIF, PDF) must be displayed in isolated, accessible preview dialogs/sheets with keyboard focus management and screen-reader announcements.
   - **Office Document Constraint**: The system must NEVER claim inline in-browser or in-app editing of Microsoft Office documents (Word `.docx`/`.doc`, Excel `.xlsx`). Office documents render rich verified metadata (detected MIME format, formatted size, version, verified timestamp, SHA-256 checksum) alongside an accessible download action.
   - **Quarantine and Rejection Enforcement**: Files in `quarantined`, `rejected`, or `deleted` state must NEVER be rendered in previews or issued download capabilities.

3. **Storage Usage Visibility**:
   - Users require clear, responsive visibility into their workspace storage consumption (stored bytes, reserved exposure, and maximum storage quota).
   - Visual progress bars (`StorageUsageBar` and `MobileStorageUsageBar`) warn users as storage approaches limits (>= 80%) or reaches capacity (100%).

4. **Upload Cancellation & Retry Without Orphan Records**:
   - Users must be able to cancel in-flight uploads gracefully using client-side `AbortSignal` / `AbortController`.
   - Cancellation must explicitly invoke `cancelFileUploadReservation` to reconcile temporary quota exposure immediately and prevent stranded reservations.
   - Retrying after cancellation must issue fresh reservations without leaving corrupted or duplicate item headers in the workspace library.

5. **Offline File Availability & Cryptographic Integrity**:
   - Users need the ability to pin verified documents for offline access across Web (`IndexedDB`) and Mobile (`MobileOfflineFileCache`).
   - Cache keys must be strictly namespaced by `${accountId}:${workspaceId}:${fileId}:v${version}` to eliminate cross-account or cross-workspace collision.
   - Binary retrievals verify cryptographic integrity against the server's recorded SHA-256 checksum. If byte tampering or corruption is detected, the corrupted entry is automatically evicted and an integrity error is raised.
   - Switching accounts or workspaces immediately clears cached files for that context.

6. **Multi-Tenant Workspace Scoping**:
   - Every file download, preview request, metadata query, and quota check must be strictly scoped to the authenticated user's authorized workspace membership. Cross-workspace access attempts return 404 or 403.

## Decision

### 1. Pure Domain Logic & Preview Strategy (`packages/domain/src/files.ts`)

- Implemented `getFilePreviewKind(mimeType: string): FilePreviewKind` returning `'image'`, `'pdf'`, `'office'`, `'text'`, `'audio'`, or `'unsupported'`.
- Implemented `isSafeToPreview(quarantineStatus: FileQuarantineStatus, mimeType?: string): boolean` requiring `quarantineStatus === 'verified'`, non-empty MIME type, and a supported preview kind. Quarantined or rejected files strictly return `false`.
- Implemented `computeStorageUsage(storedBytes, reservedBytes, maxBytes): StorageUsageSummary` computing percentage, formatting byte sizes, and setting threshold flags (`isNearLimit`, `isExceeded`).
- Implemented `getOfflineBinaryCacheKey(accountId, workspaceId, fileId, version): string` returning `${accountId}:${workspaceId}:${fileId}:v${version}`.
- Added 5 pure domain unit tests covering all functions.

### 2. Contracts & OLE CFB Detection (`packages/contracts`, `apps/api`)

- Added `'application/msword'` (.doc) to `ALLOWED_MIME_TYPES` in `packages/contracts/src/api/files.ts`.
- Added OLE Compound File Binary (`D0 CF 11 E0 A1 B1 1A E1`) sniffing in `apps/api/src/modules/files/inspector.ts` to detect legacy Microsoft Word files safely.

### 3. Web UI Components (`packages/ui-web`)

- Created `StorageUsageBar.tsx`: Accessible HTML5 `<progress>` bar with ARIA live announcements, storage breakdowns, and warning styles.
- Created `FileUploadDialog.tsx`: Modal dialog with drag-and-drop zone, file size check, folder selection, XHR progress tracking, cancel button with AbortController, and quarantine rejection alerts.
- Created `FilePreviewDialog.tsx`: Dialog with safe rendering for images and PDFs, metadata display with safe download button for office documents, offline availability toggle, and rejection banners.
- Added 6 unit tests in `packages/ui-web/src/ui-web.test.ts`.

### 4. Mobile UI Components (`packages/ui-mobile`)

- Created `MobileStorageUsageBar.tsx`: React Native progress bar with token-based theme colors and accessibility announcements.
- Created `MobileFileUploadSheet.tsx`: Modal bottom sheet with folder selection, progress bar, upload cancellation, and rejection feedback.
- Created `MobileFilePreviewSheet.tsx`: Safe preview sheet rendering images, PDF notice, office document metadata, and offline toggling.
- Added 3 unit tests in `packages/ui-mobile/src/ui-mobile.test.ts`.

### 5. Offline Storage & Integrity Verification (`apps/web`, `apps/mobile`)

- Created `apps/web/src/data/offlineFileCache.ts` (`OfflineFileCache`) backed by IndexedDB with an in-memory fallback for headless test environments.
- Created `apps/mobile/src/data/offlineFileCache.ts` (`MobileOfflineFileCache`).
- Both caches enforce:
  - Cache key format: `${accountId}:${workspaceId}:${fileId}:v${version}`
  - Checksum validation on store: Verifies input `ArrayBuffer` against expected SHA-256.
  - Checksum validation on read: Verifies retrieved binary; evicts entry immediately on mismatch (`OFFLINE_FILE_CORRUPTED`).
  - Workspace and account clearance routines: `clearWorkspace` and `clearAccount`.

### 6. Web & Mobile Application Integration

- `apps/web/src/app/library/page.tsx`:
  - Integrated `StorageUsageBar` displaying live workspace quota from `apiClient.getWorkspaceStorageQuota`.
  - Added `+ Upload File` button opening `FileUploadDialog` with signed upload capabilities via XHR.
  - Handled leaf item clicks on files to open `FilePreviewDialog`.
  - Supported URL parameters `?create=file` and `?type=files`.
  - Created `apps/web/src/app/files/page.tsx` redirecting to `/library?type=files`.
  - Updated `AppModals.tsx` with Files search destination and quick-create option.
- `apps/mobile/src/views/LibraryView.tsx`:
  - Added `MobileStorageUsageBar` and `+ Upload` button in subfolder section.
  - Wired file items press to `MobileFilePreviewSheet`.
  - Integrated `MobileFileUploadSheet` for picking and uploading files.
  - Updated `CreateSheet.tsx` with File creation pill.

### 7. End-to-End Integration Verification (`tests/integration/phase25-files-previews.test.ts`)

- 7 comprehensive integration tests passing 100%:
  - Journey 1: Organized uploads into "Software > Guides" and "Government jobs > Applications", download retrieval, byte integrity match.
  - Journey 2: Safe previews across images, PDFs, office documents (metadata + download without editing claim), and OLE CFB Word docs.
  - Journey 3: Quarantined & rejected files strictly block preview and download capabilities.
  - Journey 4: Storage quota visibility, calculation accuracy, and exceeded quota rejection.
  - Journey 5: Upload cancellation via abort and clean retry without duplicate records.
  - Journey 6: Offline availability, `${accountId}:${workspaceId}:${fileId}:v${version}` namespacing, corruption eviction, and workspace cleanup.
  - Journey 7: Multi-tenant workspace isolation (cross-workspace downloads and quota access return 404/403).

## Consequences

- **Positive**:
  - Full end-to-end file organization, upload, preview, and offline availability experience delivered across Web and Mobile.
  - Strict security guarantee: No unverified or quarantined files can be previewed or downloaded.
  - Clear user expectations: Office documents display verified metadata and safe downloads without falsely promising in-app editing.
  - Local caching is resilient and cryptographically verified against bit rot or tampering.
- **Negative / Blocked**:
  - Physical Android TalkBack and hardware KeyStore release gates remain recorded as `blocked` in `docs/roadmap/progress.json` and phase reports, pending physical testing equipment.
