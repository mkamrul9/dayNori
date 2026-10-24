# Phase 23: Journal writing and reflection interfaces

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [23 — Journal writing and reflection interfaces](../roadmap/phases/23-journal-writing-and-reflection-interfaces.md)
- **Status:** `blocked` (Provisional journal writing and reflection interfaces delivered under owner authorization and verified across Vitest unit tests, monorepo typecheck, build validation, and multi-client integration test suites; completion blocked pending prerequisite Phase 04–06 and Phase 11 physical Android TalkBack hardware and KeyStore release gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-17.
- **Base Git revision and branch:** `227a23f` on `main`.
- **Prerequisites:**
  - [Phase 22 — Journal entries and privacy defaults](phase-22.md): Journal domain model, PostgreSQL persistence with RLS, REST API routes, SyncEngine journal integration, and privacy defaults.
  - [Phase 17 — Focused note editor on both platforms](phase-17.md): Distraction-free block document editing, auto-save draft mechanics, and keyboard/touch navigation.
- **Included scope:**
  - **Focused Web Writing Surface (`packages/ui-web/src/JournalEditor.tsx`)**:
    - Created `JournalEditor` component composing rich block `NoteEditor`, supporting date picker, authoring timezone indicator, backdated badge indicator (`isEntryBackdated`), non-clinical mood pills (`great`, `good`, `okay`, `difficult`, `reflective`), tags chips manager, folder placement, dismissible reflection prompt tray (`REFLECTION_TEMPLATES`), dual save indicators, and explicit conflict resolution banner.
    - Preserves complex Bengali (Bangla) Unicode script, multiline text, paragraphs, headings, selections, and composition input bit-for-bit.
  - **Web Journal Page (`apps/web/src/app/journal/page.tsx`)**:
    - Replaced in-memory synthetic demonstration with production authenticated runtime using `useAuth()`, `IndexedDbLocalRepository`, and `createWebSyncEngine`.
    - Guarded account/workspace transitions with active namespace tracking (`activeNamespaceRef`) to prevent stale asynchronous callbacks from exposing another account's journal.
    - Implemented dated timeline with day and month navigation (Previous Day, Next Day, Today jump, date picker), chronological multi-entry listing for individual days, and backdated entry badges.
    - Implemented journal-scoped search (`Scope: Journal only`) with privacy-respecting snippet suppression (`suppressBodySnippets: true` by default), hiding body text in public or shoulder-surfing environments while preserving title, date, mood, and tags.
    - Implemented atomic transaction persistence via `repo.saveItemTransaction` (saving `ItemHeaderRecord`, `JournalEntryRecord`, and `PendingMutationRecord` atomically) and draft management (`repo.saveDraft`, `repo.deleteDraft`).
    - Handled entry lifecycle actions: in-place editing, moving to Trash (`trashJournalEntry`), and restoration (`restoreJournalEntry`).
  - **Mobile Journal Experience (`apps/mobile/src/views/JournalView.tsx` & `apps/mobile/App.tsx`)**:
    - Connected mobile `JournalView` to `SqliteLocalRepository` and `SyncEngine`, with fallback in-memory handling for standalone unit test environments.
    - Retained unauthenticated protection gate preserving required test accessibility labels (`"Authentication Required for Journal"` and `"Authenticate with synthetic account"`).
    - Implemented day navigation stepper (◀, ▶, Today jump, past date badge).
    - Implemented journal-scoped search with snippet privacy toggle (`"Show snippets"` / `"Hide snippets"`).
    - Implemented mobile writing sheet with optional title, mood pills, tag chips, reflection template selection, and multiline body text.
    - Connected mobile app root (`apps/mobile/App.tsx`) to pass `repository`, `syncEngine`, `workspaceId`, `userId`, and `isOnline` to `JournalView`.
  - **Phase 22/23 Experience & Foundation Repairs**:
    - **Web Autosave & Draft Recovery**:
      - Kept editor surface open during autosave, maintaining stable entry and session identity.
      - Wired `onDraftChange` and debounced metadata updates to durable `repo.saveDraft`, saving date, mood, prompts, tags, and document before explicit submission.
      - Retained unsaved content with actionable error display on save failure; drafts are only deleted after confirmed replacement.
    - **Mobile Document AST & Metadata Preservation**:
      - Preserved canonical `NoteDocument` AST, block identities, formatting, folder placement, authoring timezone, and flags without flattening into a single paragraph.
      - Added mobile autosave with debounced draft saving and `AppState` background listener.
      - Draft recovery banner with Recover and Discard flows.
      - Removed production reliance on synthetic login and entries, providing a clear unavailable state when runtime services are uninitialized.
      - Handled save failures cleanly without closing the writing modal.
    - **Privacy Preferences & Account Isolation**:
      - Synchronized `suppressBodySnippets` to `savePreferenceSnapshot`.
      - Suppressing body snippets forces neutral fallback titles (`resolveJournalTitle` returns `Journal entry - YYYY-MM-DD` rather than leaking the first line of private entries).
      - Guarded asynchronous reads, mutations, and subscriptions against stale namespaces on account switch.
    - **Disconnected Interactions & Lifecycle**:
      - Connected sync conflict controls to `SyncEngine.resolveConflict` for `keep_local`, `accept_cloud`, and `save_copy`.
      - Connected folder list from repository and enabled mobile Trash and restore flows.
      - Implemented midnight timer to refresh "Today" across calendar boundaries and timezone changes.
  - **Comprehensive Test Coverage**:
    - Added real-view wiring tests in `apps/mobile/src/views/JournalView.test.ts` (5 tests covering draft recovery, failed save error retention, conflict resolution, privacy preference persistence, and AST preservation through Trash/restore).
    - Added unit tests for `JournalEditor` in `packages/ui-web/src/ui-web.test.ts`.
    - Added mobile unit tests in `apps/mobile/src/mobile.test.ts`.
    - Expanded integration suite in `tests/integration/phase23-journal-writing.test.ts` (7 journeys covering web-to-mobile multi-block AST preservation, privacy title neutrality, and end-to-end sync).
- **Excluded/deferred scope:**
  - Physical Android TalkBack and hardware KeyStore release gates remain blocked pending physical hardware testing.
  - Full native WYSIWYG mobile rich text block editor is scheduled for subsequent mobile editor iterations.
  - Client-side end-to-end encryption belongs strictly to Vault (Phases 44–47); standard journals rely on PostgreSQL RLS and local storage access controls.

## Result

Delivered provisionally verified journal writing and reflection interfaces across Web and Mobile with remaining hardware gates blocked:

1. **Focused, Calm Writing Canvas**:
   - Web users write in `JournalEditor` which reuses the distraction-free `NoteEditor` block canvas.
   - Blank writing by default, with optional prompt tray for reflection templates ("Daily Reflection", "Weekly Review", "Gratitude & Wins").
   - Optional title, non-clinical mood pills, tags, and canonical folder placement.
   - Preserves multiline Bengali (Bangla) text bit-for-bit without lossy flattening.
2. **Robust Draft Recovery & Timestamp Protection**:
   - Local drafts are saved atomically during typing and before unload or navigation.
   - Unsaved drafts survive browser crashes, backgrounding, and restarts, offering clear recovery prompts.
   - Older server save responses cannot overwrite newer typing.
3. **Dated Timeline & Multi-Entry Support**:
   - Users can create multiple entries on the same calendar date without uniqueness constraints.
   - First-class backdating with visual badge indicators (`isEntryBackdated`).
   - Seamless reopening of entries directly from day or timeline views.
4. **Journal-Scoped Search & Privacy Defaults**:
   - Explicit search scope indicator ("Scope: Journal only").
   - By default, reflection body snippets are suppressed (`suppressBodySnippets: true`) to prevent accidental shoulder-surfing exposure.
   - Neutral fallback titles (`resolveJournalTitle`) prevent body snippets from leaking as titles.
   - Users can manually unhide snippets when operating in private environments.

## Verification evidence

### 1. Monorepo Build and Compilation

```bash
$ pnpm build
# Result: 13 projects compiled successfully (tsc -b, Expo Android export, Next.js 15.5.27 production build).
# Exit code: 0
```

### 2. Full Workspace Typecheck

```bash
$ pnpm typecheck
# Result: 13 projects passed tsc --noEmit with 0 errors.
# Exit code: 0
```

### 3. Linting

```bash
$ pnpm lint
# Result: ESLint passed across all files with 0 warnings and 0 errors.
# Exit code: 0
```

### 4. Code Formatting

```bash
$ pnpm format:check
# Result: Prettier checked all workspace files; all matched files use Prettier code style.
# Exit code: 0
```

### 5. Unit & View Wiring Tests

```bash
$ pnpm test:unit
# Result: 41 test files passed (558 tests).
# Key suites:
#   ✓ apps/mobile/src/views/JournalView.test.ts (5 tests: draft recovery, failed save error, conflict resolution, privacy snapshot, AST preservation)
#   ✓ packages/ui-web/src/ui-web.test.ts (35 tests)
#   ✓ apps/mobile/src/mobile.test.ts (29 tests)
#   ✓ packages/domain/src/domain.test.ts
# Exit code: 0
```

### 6. Integration Test Suite

```bash
$ pnpm test:integration
# Result: 15 test files passed (212 tests).
# Key suite:
#   ✓ tests/integration/phase23-journal-writing.test.ts (7 tests)
#     - Journey 1: Offline writing, draft interruption, restart, recovery, sync, and Bangla preservation
#     - Journey 2: Long documents, rapid concurrent edits with conflict detection, and deterministic resolution
#     - Journey 3: Backdating, multiple entries per day, day navigation query filtering, and trash/restore
#     - Journey 4: Multi-client bootstrap and expired cursor reset with complete snapshot consistency
#     - Journey 5: Privacy preferences, account switching, neutral fallback titles, and complete serialized log canary verification
#     - Journey 6: SqliteLocalRepository journal persistence, prompt templates, and draft quarantine
#     - Journey 7: Web-to-mobile rich-document editing without flattening or metadata loss
# Exit code: 0
```

### 7. Security and Planning Audits

```bash
$ node scripts/scan-secrets.mjs
# Result: Checked 1656 files without detecting unapproved secrets.
# Exit code: 0

$ node scripts/validate-planning.mjs
# Result: 64 phases, 22 mapped requirements, 178 Markdown files validated with 0 errors.
# Exit code: 0

$ git diff --check
# Result: 0 whitespace, conflict marker, or indentation errors.
# Exit code: 0
```

## Blocked release gates

1. **Physical Android TalkBack Hardware Verification**:
   - Status: `blocked`
   - Blocker: Physical Android test device with TalkBack screen reader hardware is currently unavailable in this environment.
   - Mitigation: Automated unit and component tests verified `accessibilityLabel`, `accessibilityRole`, minimum touch targets (48px for mobile, 44px for web), and keyboard focus rings.
   - Next action: Run manual TalkBack audit on physical Android hardware prior to beta release.
2. **Hardware KeyStore Cryptographic Evidence**:
   - Status: `blocked`
   - Blocker: Android KeyStore hardware backing is unavailable in emulator/synthetic test environments.
   - Next action: Validate hardware KeyStore key derivation on a physical test device when hardware becomes available.

## Handoff and next phase

Phase 23 is provisionally complete with software requirements implemented and verified against unit and integration suites; physical hardware and KeyStore release gates remain explicitly blocked.
The next phase in the canonical plan is:

- **[Phase 24 — Private binary upload lifecycle](../roadmap/phases/24-private-binary-upload-lifecycle.md)**
