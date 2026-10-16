# ADR-0021: Folder Browsing and Library Interfaces

## Status

Accepted (Provisional folder browsing and library interfaces delivered across Web and Mobile; verified against PostgreSQL, Fastify API, production browser CDP with real IndexedDB, and mobile unit/component tests; physical Android hardware and TalkBack verification remain pending).

## Context

Phase 15 delivers the user-facing folder browsing, navigation, and organization interfaces for Daynori across both Web (`apps/web/src/app/library/page.tsx`) and Mobile (`apps/mobile/src/views/LibraryView.tsx`).

Building on the unified organization data model established in [ADR-0020](0020-workspace-folders-and-organization.md) and client synchronization engine in [ADR-0019](0019-shared-client-sync-engine.md), the user interfaces must satisfy key accessibility, usability, and architecture requirements:

1. **Canonical Hierarchy as Source of Truth**: The workspace folder hierarchy is the single canonical organization structure. Browsing starts at the root / Inbox (`parentId === null`) and traverses recursively into subfolders.
2. **Accessible Breadcrumb Navigation**: Deep nesting requires clear orientation. Navigation must provide semantic breadcrumbs (`<nav aria-label="Breadcrumb">`, `<ol>`/`<li>`, `aria-current="page"`) and a direct "Up to parent" action so users can always ascend one level without guessing path history.
3. **Mixed Item Lists**: Inboxes and folders contain mixed items (notes, tasks, routines, journals) alongside child subfolders. Items are not siloed into separate tabs by default; instead, semantic badges (`ItemTypeBadge`, `MobileTypeBadge`) indicate item kind with accessible labels and high contrast.
4. **Non-Destructive Module View Filters**: Filter tabs (`All Items`, `Notes`, `Knowledge`, `Files`, `Tasks`) project and filter visible content in-place without moving, reparenting, or mutating any item or folder.
5. **Pointer and Keyboard Reordering**: In addition to pointer/touch interactions, reordering must provide complete keyboard alternatives (`Alt+Up` / `Alt+Down` and explicit Up/Down action buttons) with `aria-live` screen-reader announcements describing the new position.
6. **Reversible Actions and Explicit Undo**: Destructive actions (archiving, trashing with `preserve_to_parent` or `trash_subtree`) display a floating undo toast with a 10-second countdown and optimistic revision checks to avoid clobbering concurrent mutations.
7. **Decoupled Local vs Cloud State**: In alignment with [ADR-0017](0017-local-storage-and-encryption-key-lifecycle.md) and [ADR-0019](0019-shared-client-sync-engine.md), the UI explicitly separates local device persistence (`Saved on device` via `IndexedDbLocalRepository` when trusted-device consent is present) from cloud synchronization status (`Synced`, `Syncing`, `Offline`, `Conflict`, `Error`).
8. **Large Folder Scalability & Bounded Views**: Large folders must remain usable without blocking navigation; pagination or bounded rendering limits list length to maintain 60fps rendering and fast navigation.
9. **Responsive Design & Mobile Reflow**: The interface must reflow smoothly down to 320px viewport width without horizontal scrollbars or clipping (WCAG 1.4.10 Reflow).

## Decision

### 1. Shared UI Components (`packages/ui-web` & `packages/ui-mobile`)

We created lightweight, accessible, platform-tailored components:

- `packages/ui-web/src/BreadcrumbNav.tsx`:
  - Renders `<nav aria-label="Breadcrumb">` containing an ordered list `<ol>` of breadcrumb segments.
  - The current segment is marked with `aria-current="page"`.
  - Includes a dedicated "Up" navigation button (`aria-label="Up to <parent>"`) with a visible focus ring for rapid keyboard navigation.
- `packages/ui-web/src/ItemTypeBadge.tsx`:
  - Visual and screen-reader indicator for item kinds (`folder`, `note`, `task`, `routine`, `journal`).
  - Uses design token colors and icons with high-contrast text and explicit `aria-label`.
- `packages/ui-mobile/src/MobileBreadcrumb.tsx`:
  - Accessible mobile breadcrumb trail with touch-friendly targets (minimum 48dp).
  - Includes an Up button and horizontally scrollable segment row with `accessibilityRole="button"`.
- `packages/ui-mobile/src/MobileTypeBadge.tsx`:
  - Mobile badge component displaying type label and tint matching design token semantics.

### 2. Web Library Implementation (`apps/web/src/app/library/page.tsx`)

- **State & Data Loading**:
  - Automatically detects trusted-device consent (`localStorage.getItem('daynori_trusted_device') === 'true'`). When active, initializes and loads state from `IndexedDbLocalRepository` before pulling from the Fastify API.
  - Maintains `currentFolderId` (null for workspace root/Inbox) and resolves active breadcrumbs by walking the folder tree upward.
- **Folder CRUD Operations**:
  - **Create Folder**: Dialog validates non-empty name, optional hex color, icon, and parent folder. Enforces `MAX_FOLDER_DEPTH = 5` client-side before calling the API.
  - **Rename Folder**: Inline dialog updates folder name and metadata.
  - **Move Folder**: Move dialog displays eligible target folders, using `detectCycle` to disable any target that is the folder itself or a descendant.
  - **Delete Folder**: Modal offers explicit radio choice between `preserve_to_parent` (orphaned items reparented to parent or Inbox) and `trash_subtree` (entire subtree recursively tombstoned).
  - **Archive / Unarchive**: Toggles `is_archived` status with filter visibility control.
- **Keyboard & Touch Reordering**:
  - Sibling items and folders support reordering via explicit ▲ / ▼ buttons and `Alt+ArrowUp` / `Alt+ArrowDown` keyboard shortcuts.
  - An `aria-live="polite"` region announces position changes (e.g., `"Moved Software to position 1 of 3"`).
- **Undo Toast with Revision Checks**:
  - Deletions and moves store an undo action payload and display a floating toast with a 10-second countdown.
  - Executing undo checks the item's `revision` to prevent overwriting subsequent concurrent modifications.
- **Canonical Journeys**:
  - "Demo Journeys" button seeds canonical "Software" (with Guides and Projects subfolders, mixed note/file/task items) and "Government Jobs" (with Applications subfolder, checklist and reference notes) sample journeys, validating cross-module organization.

### 3. Mobile Library Implementation (`apps/mobile/src/views/LibraryView.tsx`)

- Provides an equivalent touch-first experience using React Native components:
  - Drill-down folder navigation with `MobileBreadcrumb` and Up button.
  - Module filter tabs (`all`, `notes`, `knowledge`, `files`) with testID attributes (`library-filter-${key}`).
  - Bottom action sheets for folder creation, renaming, and deletion (with subtree option).
  - Explicit reordering buttons (▲ / ▼) with 48dp minimum touch targets.
  - Floating undo notification banner for reversible operations.
  - Offline status and local synchronization indicators.

## Consequences

### Positive

- **Consistent Cross-Platform Organization**: Web and Mobile share identical hierarchy concepts, depth limits (`MAX_FOLDER_DEPTH = 5`), cycle detection, and delete policies.
- **Full WCAG Accessibility**: Semantic breadcrumbs, visible focus states, 48dp touch targets, keyboard reordering (`Alt+Up`/`Alt+Down`), screen-reader live announcements, and horizontal reflow at 320px width without clipping.
- **Non-Destructive Projection**: Users can view items by module type without disrupting the canonical folder structure.
- **Reversible Safety**: Explicit deletion policies and 10-second undo toasts protect users against accidental data loss.
- **Sync & Storage Harmony**: Seamlessly coordinates with `IndexedDbLocalRepository` and `SyncEngine` with decoupled local persistence and cloud sync status.

### Neutral / Tradeoffs

- Bounded pagination (10 items/page on web) adds pagination controls for folders with many items, trading infinite scroll complexity for predictable performance and keyboard focus management.
- Sibling reordering relies on sparse rank updates; when gaps become small, server-side sibling rebalancing (`/rebalance`) redistributes ranks.

### Negative / Pending Gates

- **Physical Android Release Gates Blocked**: Verification on physical Android devices with TalkBack screen reader and hardware KeyStore remains blocked due to physical hardware unavailability in the execution environment. Software emulation and headless CDP testing provide verification in the interim.
