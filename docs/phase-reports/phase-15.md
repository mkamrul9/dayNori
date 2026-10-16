# Phase 15: Folder browsing and organization interfaces

Group: Foundation and sync. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [15 — Folder browsing and organization interfaces](../roadmap/phases/15-folder-browsing-and-organization-interfaces.md)
- **Status:** `blocked` (Provisional folder browsing and library interfaces delivered and verified across PostgreSQL, Fastify API, production browser CDP with real IndexedDB, and mobile; completion blocked pending prerequisite Phase 04–06 and Phase 11 physical Android TalkBack hardware verification; Phase 16 follows).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-15.
- **Base Git revision and branch:** `a5772c0` on `main`.
- **Prerequisites:**
  - [Phase 14 — Collections, folders, and shared item metadata](phase-14.md): Canonical workspace hierarchy, typed folder metadata, depth limits, cycle prevention, deletion policies, sparse ranking, and workspace tags.
  - Prerequisite repairs (committed in `a5772c0`): Sync bootstrap organization projection, durable REST mutation receipts, database hierarchy validation triggers (`00013_enforce_folder_hierarchy_triggers.sql`), item header hygiene, and precise subtree undo restoration.
- **Included scope:**
  - **Web Library Interface (`apps/web/src/app/library/page.tsx`):**
    - Canonical workspace hierarchy browsing starting from root/Inbox (`parentId === null`) with drill-down into nested subfolders.
    - Accessible breadcrumb navigation (`BreadcrumbNav`) with semantic `<nav aria-label="Breadcrumb">`, `<ol>`/`<li>`, `aria-current="page"`, visible focus ring, and dedicated "Up to parent" action (`aria-label="Up to <parent>"`).
    - Mixed item listing within folders combining child subfolders, notes, tasks, routines, and journals, styled with semantic `ItemTypeBadge` components.
    - Non-destructive module view filters (`All Items`, `Notes`, `Knowledge`, `Files`, `Tasks`) projecting content without altering folder parentage or item ordering.
    - Comprehensive folder CRUD:
      - Create folder dialog with name, hex color, icon, parent picker, and depth check (`MAX_FOLDER_DEPTH = 5`).
      - Rename folder dialog with inline metadata editing.
      - Move folder dialog with client-side cycle prevention (`detectCycle`) disabling circular target folders.
      - Delete folder dialog offering explicit choice between `preserve_to_parent` (reparent direct children to parent/Inbox) and `trash_subtree` (atomically tombstone folder and all descendants).
      - Archive / Unarchive folder toggle with visibility filtering.
    - Pointer/touch and keyboard reordering: Explicit ▲ / ▼ reorder buttons plus `Alt+ArrowUp` / `Alt+ArrowDown` keyboard shortcuts with polite `aria-live` screen-reader announcements.
    - Reversible action undo: Floating undo toast with 10-second countdown timer and optimistic revision checks to avoid clobbering concurrent server changes.
    - Decoupled state indicators: Distinct local device persistence badge (`Saved on device` backed by `IndexedDbLocalRepository` when trusted-device consent is present) and cloud synchronization status (`Synced`, `Syncing`, `Offline`, `Conflict`, `Error`).
    - Large folder pagination: Bounded 10 items/page view with keyboard-accessible navigation controls.
    - Canonical sample journeys: "Demo Journeys" seeder creating "Software" (with Guides and Projects subfolders, mixed note/file/task items) and "Government Jobs" (with Applications subfolder, checklist and reference notes).
    - Responsive 320px mobile reflow: Full WCAG 1.4.10 compliance with zero horizontal scrollbars or element clipping.
  - **Mobile Library Interface (`apps/mobile/src/views/LibraryView.tsx`):**
    - Touch-first folder browsing supporting root and nested levels.
    - Accessible mobile breadcrumb (`MobileBreadcrumb`) with 48dp touch targets and Up navigation.
    - Filter tabs (`all`, `notes`, `knowledge`, `files`) preserving backward-compatible testIDs (`library-filter-${key}`).
    - Mixed item cards with semantic `MobileTypeBadge`.
    - Bottom action sheets for folder creation, renaming, and deletion (with subtree option).
    - Touch reordering buttons (▲ / ▼) with 48dp minimum touch targets.
    - Floating undo notification banner for reversible operations.
    - Local storage status and cloud sync status indicators.
    - Built-in loader for Software and Government Jobs sample journeys.
  - **Shared UI Components (`packages/ui-web` & `packages/ui-mobile`):**
    - `packages/ui-web/src/BreadcrumbNav.tsx`
    - `packages/ui-web/src/ItemTypeBadge.tsx`
    - `packages/ui-mobile/src/MobileBreadcrumb.tsx`
    - `packages/ui-mobile/src/MobileTypeBadge.tsx`
- **Excluded/deferred scope:**
  - Note, todo, and journal content editors — deferred to Phase 16+.
  - Encrypted sensitive vault access and biometric unlocking — deferred to Phases 44–47 (R-VAULT gate).
  - Physical Android TalkBack and hardware KeyStore release gates (Phases 04, 06, 09, 11, 13, 14, 15) remain blocked pending physical hardware availability.

## Result

Delivered the complete Phase 15 folder browsing and library organization interfaces across `apps/web`, `apps/mobile`, `packages/ui-web`, and `packages/ui-mobile`.

Verified against real PostgreSQL, Fastify API, production browser CDP with real IndexedDB, and mobile component tests:

1. **Software & Government Jobs Journeys**: Successfully browsed, created, and organized canonical folders and items in both Web and Mobile interfaces.
2. **Accessible Breadcrumbs & Navigation**: Validated semantic `<nav aria-label="Breadcrumb">`, `<ol>`/`<li>`, `aria-current="page"`, visible focus ring, and dedicated Up button navigation.
3. **Mixed Items & Non-Destructive Filtering**: Verified folders list subfolders and mixed items (notes, tasks, routines, journals) together with clear type badges; module filter tabs filter visible items without modifying folder hierarchy.
4. **Accessible Reordering**: Validated pointer reorder buttons, keyboard shortcuts (`Alt+Up` / `Alt+Down`), and screen-reader `aria-live` announcements.
5. **Folder Lifecycle & Undo**: Validated creation with depth enforcement (`depth <= 5`), move with cycle detection, archive toggle, and deletion (`preserve_to_parent` vs `trash_subtree`) with 10-second undo countdown and revision verification.
6. **Decoupled Local vs Cloud State**: Validated local IndexedDB persistence indicator alongside cloud sync status.
7. **Responsive Reflow**: Validated clean layout down to 320px viewport width without horizontal overflow.

## Acceptance evidence

| Acceptance Condition                              | Verification Method                                                                                                         | Location / Artifact                                         | Result                                                                            |
| :------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------- | :-------------------------------------------------------------------------------- |
| **Software & Government Jobs Canonical Journeys** | Integration tests creating and organizing canonical folders, subfolders, and mixed items via API                            | `tests/integration/phase15-folder-browsing-library.test.ts` | **PASS**: Software and Government Jobs hierarchies created and verified cleanly.  |
| **Nested Subfolders & Depth Limits**              | Verify multi-level drill-down and depth limit enforcement (`MAX_FOLDER_DEPTH = 5`)                                          | `tests/integration/phase15-folder-browsing-library.test.ts` | **PASS**: Subfolders up to depth 5 created; excessive depths rejected.            |
| **Mixed Item Organization**                       | Verify folders contain mixed notes, tasks, routines, and files side by side                                                 | `tests/integration/phase15-folder-browsing-library.test.ts` | **PASS**: All item types stored and retrieved in same folder with correct badges. |
| **Non-Destructive Module View Filtering**         | Query folder contents filtered by module type (`notes`, `knowledge`, `files`, `tasks`); verify no items moved or reparented | `tests/integration/phase15-folder-browsing-library.test.ts` | **PASS**: Filtered queries return subsets without altering canonical parentage.   |
| **Sibling Reordering with Sparse Ranks**          | Reorder siblings using fractional ranks and verify sibling rebalancing endpoint                                             | `tests/integration/phase15-folder-browsing-library.test.ts` | **PASS**: Ranks updated and rebalanced with uniform 1000-step spacing.            |
| **Revision Precondition Conflict Rejection**      | Attempt update with mismatched base revision; verify HTTP 409 conflict returned                                             | `tests/integration/phase15-folder-browsing-library.test.ts` | **PASS**: HTTP 409 conflict returned on stale revision precondition.              |
| **Subtree Trash and Precise Undo**                | Delete folder subtree with `trash_subtree`, verify tombstoning, and restore precisely                                       | `tests/integration/phase15-folder-browsing-library.test.ts` | **PASS**: Subtree tombstoned atomically and restored with exact parentage.        |
| **Durable REST Idempotency**                      | Submit folder creation request with `x-operation-id`; resubmit identical request                                            | `tests/integration/phase15-folder-browsing-library.test.ts` | **PASS**: Second request returns cached receipt without duplicating folder.       |
| **Web E2E Browser Journeys (Suite 7)**            | Chrome CDP tests verifying breadcrumbs, drill-down, mixed items, filtering, folder dialogs, and CDP text insertion          | `scripts/test-web-e2e.mjs`                                  | **PASS**: All 45 browser tests passed across 7 test suites.                       |
| **WCAG 320px Mobile Reflow**                      | Chrome CDP resize to 320x640; verify zero horizontal scrollbar (`scrollWidth === clientWidth`)                              | `scripts/test-web-e2e.mjs`                                  | **PASS**: Width 320px verified with zero horizontal overflow.                     |
| **Mobile Library Unit & Component Tests**         | React Native MiniTestRenderer tests for mounting, filter switching, drilldown, Up navigation, and reordering                | `apps/mobile/src/mobile.test.ts`                            | **PASS**: All mobile tests passed cleanly.                                        |
| **Full Monorepo Unit/Integration Suite**          | Vitest run across 31 test files and 366 tests                                                                               | `pnpm test`                                                 | **PASS**: 31/31 files passed, 366/366 tests passed.                               |
| **Strict Typecheck & Lint**                       | Strict TypeScript across 13 workspace projects and zero ESLint warnings/errors                                              | `pnpm typecheck` & `pnpm lint`                              | **PASS**: 0 typecheck errors, 0 lint warnings/errors.                             |
| **Code Formatting**                               | Prettier formatting check across all files                                                                                  | `pnpm format:check`                                         | **PASS**: All files match Prettier style.                                         |
| **Roadmap Planning Validation**                   | Automated validator checking 64 phases, 22 requirements, local links                                                        | `node scripts/validate-planning.mjs`                        | **PASS**: Planning validation passed cleanly.                                     |
| **Secret Audit**                                  | Custom repository secret scanner checking all files and git diffs                                                           | `node scripts/scan-secrets.mjs`                             | **PASS**: 0 secrets detected across 1584 files.                                   |

## Defects, limitations and recovery

- **Prerequisite Defects Resolved (Committed in `a5772c0`):**
  - Sync bootstrap now includes active organization items (folders, tags, item links).
  - Durable REST mutation receipts recorded for all organization write operations.
  - Database hierarchy validation triggers enforced in `00013_enforce_folder_hierarchy_triggers.sql`.
  - Item headers include proper sync revision and checksum hygiene.
  - Subtree trash undo restores exact prior parentage without orphaning children.
- **Hardware Gates Blocked:**
  - Physical Android execution and TalkBack accessibility navigation on real devices remain blocked due to physical hardware unavailability in the test environment (`scripts/test-android-e2e.mjs` logs `ACCEPTANCE BLOCKED`).
  - Software emulation, React Native unit rendering, and Chrome CDP headless journeys provide verification in the interim.
- **Rollback and Recovery:**
  - All folder mutations are recorded in the monotonic change feed (`app.changes`) and outbox intents (`app.outbox_intents`).
  - Client state gracefully falls back to local IndexedDB persistence when the API server is unavailable.

## Documentation and Git review

- **Updated Architecture Documentation:**
  - Published [ADR-0021: Folder Browsing and Library Interfaces](../decisions/0021-folder-browsing-and-library-interfaces.md).
  - Updated [ADR Index](../decisions/README.md) linking ADR-0021.
- **Roadmap & Changelog:**
  - Updated `CHANGELOG.md` with Phase 15 release notes.
  - Updated `docs/roadmap/progress.json` setting Phase 15 status to `blocked` with explicit notes on software completeness and hardware gates.
- **Git Hygiene:**
  - `git diff --check` passed with zero whitespace or line-ending errors.
  - Secret scan passed with 0 unapproved secrets across 1584 files.
  - Conventional commit subject: `feat(library): add accessible folder browsing and organization`.

## Handoff

- **Next Eligible Phase:**
  - [Phase 16 — Typed note domain and persistence](../roadmap/phases/16-typed-note-domain-and-persistence.md): Core note-taking domain logic, block structure, and persistence.
- **Stop Condition:** Work on Phase 15 is complete; stop before beginning Phase 16 as instructed.
