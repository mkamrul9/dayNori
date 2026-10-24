# ADR-0029: Journal Writing and Reflection Interfaces

## Status

Accepted (Provisional Phase 23 writing and reflection interfaces delivered under owner authorization and verified across Vitest unit tests, monorepo typecheck, build validation, and multi-client integration test suites; physical Android TalkBack hardware and hardware KeyStore release gates remain explicitly blocked).

## Context

Phase 23 implements the focused writing and reflection interfaces for the Daynori ecosystem ([docs/roadmap/phases/23-journal-writing-and-reflection-interfaces.md](../roadmap/phases/23-journal-writing-and-reflection-interfaces.md)), building upon the foundation established in Phase 22 ([ADR-0028](0028-journal-entries-and-privacy-defaults.md)) and Phase 17 ([ADR-0023](0023-focused-note-editor-and-autosave.md)), satisfying product requirement **R-JOURNAL** in [docs/product/requirements.md](../product/requirements.md) and journey patterns in [docs/design/journeys.md](../design/journeys.md).

Prior to this phase, journal interfaces on web and mobile were synthetic mock demonstrations using in-memory state, hardcoded dates, simulated empty states, and generic textareas. Furthermore, five prerequisite foundation defects (A–E) in bootstrap persistence, concurrency locking, null synchronization, log canary coverage, and cursor validation required resolution and local verification before client writing surfaces could connect reliably to the production runtime.

Key requirements for Phase 23:

1. **Calm, Focused Writing Surface**:
   - Provide a clean, distraction-free writing environment that reuses the proven block document model (`NoteDocument`) from Phase 16/17, preserving formatting, selections, multiline text, and Bengali (Bangla) Unicode script bit-for-bit.
   - Blank writing by default, with an optional, non-intrusive reflection template tray that can be clearly dismissed.
   - Optional title, non-clinical mood pills (`great`, `good`, `okay`, `difficult`, `reflective`), tags, and canonical folder placement.
2. **Dated Timeline & Multi-Entry Chronology**:
   - Support day navigation (Previous Day, Next Day, Today button, date jump) and timeline overview.
   - Support multiple distinct entries per calendar day (e.g. morning intentions, afternoon reflections, evening recap).
   - First-class backdating with visual badge indicators (`isEntryBackdated`), never shifting historical calendar dates or server timestamps.
   - Seamlessly reopen and edit existing entries directly from day or timeline views.
3. **Journal-Scoped Search & Privacy Snippet Suppression**:
   - Provide an explicit search entry point labeled "Scope: Journal only".
   - Honor account privacy preferences (`suppressBodySnippets: true` by default) so body text is not exposed in public spaces or shoulder-surfing environments. Allow explicit manual toggle to unhide snippets when desired.
   - Provide honest fallback titles via `resolveJournalTitle(title, entryDate, plainText)` when title is absent.
4. **Draft Persistence & Interruption Recovery**:
   - Persist recoverable drafts atomically during typing and before unload or navigation transitions.
   - When reopening the app or writing surface after an interruption or restart, gently present draft recovery options ("Resume Writing" / "Discard").
   - Timestamp and version protection: ensure older server or sync responses cannot overwrite newer typing.
5. **Namespace Account Isolation**:
   - Ensure account and workspace transitions close previous repositories, stop sync engines, and reset local view state so stale asynchronous callbacks cannot leak journal content across accounts.
6. **No Streak Pressure or Unverified Claims**:
   - No forced mood scoring, streak counters, clinical diagnostic evaluations, or unverified client-side encryption claims (encryption is reserved strictly for Vault in Phases 44–47).

## Decision

### 1. Reusable Web Writing Interface (`JournalEditor` in `@daynori/ui-web`)

- Created `JournalEditor` component in `packages/ui-web/src/JournalEditor.tsx`, composing the rich block `NoteEditor`.
- Features:
  - Header with calendar date input (`type="date"`), authoring timezone indicator, and backdated indicator badge (`data-testid="journal-backdated-badge"`).
  - Non-clinical mood pill selector with toggleable selection and clear button (`data-testid="journal-mood-*"`, `data-testid="journal-clear-mood-btn"`).
  - Tags chips bar with inline adder and remove controls (`data-testid="journal-tag-*"`).
  - Dismissible reflection prompt tray (`data-testid="journal-toggle-prompts-btn"`) populated with templates from `REFLECTION_TEMPLATES`.
  - Dual save status indicators ("Saved on this device" and cloud sync status).
  - Explicit conflict resolution banner (`data-testid="conflict-banner"`) providing deterministic choices (`keep_server`, `keep_local`, `save_copy`).
  - Exported from `@daynori/ui-web` and verified in SSR and DOM tests.

### 2. Web Journal Application (`apps/web/src/app/journal/page.tsx`)

- Replaced in-memory demo state with real `IndexedDbLocalRepository` and `createWebSyncEngine`.
- Enforced active namespace reference guarding (`activeNamespaceRef = { userId, workspaceId }`) on all asynchronous operations, teardown on account switch, and unauthenticated protection gate (`EmptyState id="journal-auth-required"`).
- Implemented day and timeline navigation with date offset calculations, today jump, and entry counts.
- Implemented journal-scoped search with privacy snippet suppression (toggling body snippets while preserving title, date, mood, and tags).
- Implemented atomic transaction persistence via `repo.saveItemTransaction` (creating `ItemHeaderRecord`, `JournalEntryRecord`, and `PendingMutationRecord` atomically) and draft management (`repo.saveDraft`, `repo.deleteDraft`).
- Supported lifecycle operations: edit in-place, move to Trash (`trashJournalEntry`), and restore from Trash (`restoreJournalEntry`).

### 3. Mobile Journal Experience (`apps/mobile/src/views/JournalView.tsx` & `apps/mobile/App.tsx`)

- Updated `apps/mobile/App.tsx` to pass `repository`, `syncEngine`, `workspaceId`, `userId`, and `isOnline` to `JournalView`.
- In `apps/mobile/src/views/JournalView.tsx`:
  - Retained unauthenticated gate card preserving required test accessibility labels (`"Authentication Required for Journal"` and `"Authenticate with synthetic account"`).
  - Connected authenticated state to `SqliteLocalRepository` and `SyncEngine`, with in-memory fallback for standalone test environments.
  - Implemented day navigation stepper (◀, ▶, Today jump, past date badge).
  - Implemented journal-scoped search with snippet privacy toggle (`"Show snippets"` / `"Hide snippets"`).
  - Implemented writing sheet supporting optional title, mood selection pills, tag chips, reflection template selection, and multiline body.
  - Implemented atomic save and trash actions via `saveItemTransaction`.

### 4. Integration Verification (`tests/integration/phase23-journal-writing.test.ts`)

- Created 6 comprehensive integration journeys verifying:
  1. Offline writing, draft interruption, restart, draft recovery, local atomic commit, and eventual sync to server with Bangla Unicode bit-for-bit preservation.
  2. Long documents, rapid edits, conflict detection on stale revision, and deterministic resolution.
  3. Backdating, multiple entries per calendar day, date-filtered query pagination, and trash/restore lifecycle.
  4. Multi-client bootstrap and expired cursor reset with complete snapshot consistency.
  5. Privacy defaults, fallback titles via `resolveJournalTitle`, namespace account isolation, and complete serialized log canary sanitization.
  6. `SqliteLocalRepository` journal persistence, reflection template instantiation, and prompt mapping.

## Consequences

### Positive

- Replaces all hardcoded demo journal behavior with production-grade offline-first persistence and real multi-client synchronization.
- Users can write multiple entries per day, backdate freely, and recover drafts after unexpected browser or app closures.
- Respects privacy defaults: journal contents are hidden from generic agenda overviews, and body snippets are suppressed by default in timeline and search views.
- Strict typing across monorepo packages with zero TypeScript errors or broad `any` casts.
- Clean conventional commit separation between prerequisite foundation repairs (`fix(journal)`) and Phase 23 feature delivery (`feat(journal)`).

### Trade-offs & Limitations

- Physical Android device evidence, TalkBack screen reader verification on real hardware, and hardware KeyStore gate remain pending hardware availability and must stay explicitly blocked.
- Advanced rich formatting on mobile currently relies on multiline text input; full WYSIWYG mobile rich text block editor remains scheduled for subsequent mobile iterations.

## Revisit Triggers

- Physical Android test hardware becomes available for TalkBack and biometric release gate verification.
- Vault encryption architecture implementation (Phases 44–47) introducing client-side zero-knowledge encryption envelopes.
