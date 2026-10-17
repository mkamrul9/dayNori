# Changelog

## Phase 24 — Private binary upload lifecycle — 2026-10-17

- **Private Storage Schema & Isolation (`infra/supabase`):**
  - Created `app.workspace_storage_usage` tracking stored bytes, reserved exposure, and workspace quota (100 MiB default) with Row-Level Security restricting queries to viewers and updates to editors.
  - Created `app.file_items` (extending `app.items` where `kind = 'file'`) recording quarantine status (`quarantined`, `verified`, `rejected`, `deleted`), detected MIME types, SHA-256 checksums, and verified timestamps.
  - Created `app.file_versions` storing immutable revision history.
  - Created `app.upload_reservations` tracking signed capability issuance, 2-hour provider expiry, and reconciliation status.
- **Contract Schemas & Curated Allowlist (`packages/contracts`):**
  - Added `ALLOWED_MIME_TYPES` allowlist for standard images, PDFs, text, Markdown, and audio.
  - Defined file size and concurrency bounds: `MAX_GENERAL_FILE_BYTES` (25 MiB), `MAX_AUDIO_FILE_BYTES` (50 MiB), `MAX_CONCURRENT_RESERVATIONS` (5).
  - Documented realistic provider expiry horizons: `UPLOAD_CAPABILITY_EXPIRY_SECONDS` (7200 seconds / 2 hours) and short-lived authorized download capabilities `DOWNLOAD_CAPABILITY_EXPIRY_SECONDS` (300 seconds / 5 minutes).
  - Defined Zod schemas for upload reservation, finalization, capability generation, and quota status.
- **Binary Content Inspection & Fail-Closed Malware Policy (`apps/api`):**
  - Implemented `inspectBinaryContent` sniffing true MIME types from magic bytes, rejecting Windows PE executables, Unix ELF binaries, and script vectors in XML/SVG or text payloads.
  - Implemented `PolicyMalwareScanner` detecting standard EICAR test signatures and fail-closed simulation on scanner outages or timeouts.
- **Atomic Quota Accounting & Reservation Exposure Bounding (`apps/api`):**
  - Bounded storage exposure before issuing upload capabilities by atomically checking `stored + reserved + requested <= max` and enforcing maximum 5 concurrent active reservations.
  - Atomically transitioned exposure on finalization and freed reserved bytes on rejection or cancellation.
- **Files Service & REST Routes (`apps/api`):**
  - Generated unpredictable, server-controlled object paths: `${workspaceId}/${fileId}/${versionId}/${crypto.randomBytes(16).toString('hex')}`.
  - Registered Fastify REST routes under `/v1/workspaces/:workspaceId/files` for quota, reservations, finalization, cancellation, download capabilities, metadata, and deletion.
  - Emitted `file` entity events to the workspace sync change outbox with sequence advancement.
- **Worker Leases & Orphan Cleanup (`apps/worker`):**
  - Implemented `DaynoriWorker` lease acquisition engine (30s TTL) preventing multi-worker execution collisions.
  - Handled `file_scan` and `file_orphan_cleanup` jobs, purging abandoned storage objects and reconciling expired reservations.
- **Client SDK (`packages/api-client`):**
  - Extended `DaynoriApiClient` with typed file lifecycle methods (`getWorkspaceStorageQuota`, `reserveFileUpload`, `finalizeFileUpload`, `getFileUploadStatus`, `cancelFileUploadReservation`, `getFileDownloadCapability`, `getFileMetadata`, `deleteFile`).
- **Comprehensive Integration Tests (`tests/integration`):**
  - Added `tests/integration/phase24-binary-upload.test.ts` covering 8 full journeys (happy path, quota/concurrency bounding, MIME spoofing/SVG script rejection, checksum verification, fail-closed malware detection, idempotent finalize, multi-tenant isolation, and worker orphan cleanup).
- **Decision Record:**
  - Published [ADR-0030: Private Binary Upload Lifecycle, Storage Quotas, and Quarantine Verification](docs/decisions/0030-private-binary-upload-lifecycle.md).

## Phase 23 — Journal writing and reflection interfaces — 2026-10-17

- **Focused Web Journal Canvas (`packages/ui-web`, `apps/web`):**
  - Implemented `JournalEditor` providing a calm, distraction-free writing surface composing `NoteEditor`, backdated badge indicator (`isEntryBackdated`), entry date picker, authoring timezone display, non-clinical mood pills (`great`, `good`, `okay`, `difficult`, `reflective`), tag chip management, canonical folder placement, dual save indicator (`"Saved locally"`, `"Synced"`), and conflict banner (`keep_server`, `keep_local`, `save_copy`).
  - Added dismissible reflection prompt tray with canonical reflection templates (`REFLECTION_TEMPLATES`: Daily check-in, Evening reflection, Gratitude & grounding, Weekly review, Hard moments & release) inserting portable AST blocks into the editor.
  - Replaced in-memory web demo with authenticated runtime using `IndexedDbLocalRepository` and `createWebSyncEngine` with active namespace guarding (`activeNamespaceRef`) to isolate account state during asynchronous switches.
  - Added day/month navigation stepper with date jump, multiple entries per day list, and journal-scoped search with snippet privacy suppression (`suppressBodySnippets: true` by default).
  - Repaired web autosave: editor stays open during autosave, allocations maintain stable identity, saves are serialized, newer typing is protected during delayed writes, and metadata-only changes trigger debounced persistence.
  - Implemented durable draft persistence during writing with `onDraftChange` and debounced save; drafts survive crashes and are only cleared after successful durable save.
  - Connected conflict resolution banner directly to `SyncEngine.resolveConflict`.
- **Accessible Mobile Journal Surface (`apps/mobile`):**
  - Connected `JournalView` to `SqliteLocalRepository` and client `SyncEngine` with offline local-first mutation intent creation.
  - Preserved canonical `NoteDocument` AST, block identities, formatting, folder placement, authoring timezone, and flags without destructive flattening to a single paragraph.
  - Implemented real mobile autosave with debounced draft saving and `AppState` background listener.
  - Implemented draft recovery banner with Recover and Discard flows.
  - Removed production reliance on synthetic login and entries, providing a clear unavailable state when runtime services are uninitialized.
  - Added mobile Trash and restore flows with soft-delete filtering.
  - Synchronized `suppressBodySnippets` to `savePreferenceSnapshot` and guarded fallback titles (`resolveJournalTitle` returns neutral date title when snippets are suppressed).
  - Added midnight refresh timer across date and timezone changes.
- **Verification & Wiring Tests (`apps/mobile`, `tests/integration`):**
  - Added real-view wiring test suite `apps/mobile/src/views/JournalView.test.ts` (5 tests verifying draft recovery, writing surface retention on save failure, conflict resolution, privacy snapshot persistence, and AST preservation through Trash/restore).
  - Expanded `tests/integration/phase23-journal-writing.test.ts` to 7 journeys, adding multi-block AST web-to-mobile roundtrip preservation and snippet-suppressed neutral title guarantees.
- **Decision Record:**
  - Published [ADR-0029: Journal Writing, Reflection Prompts, and Local Draft Recovery](docs/decisions/0029-journal-writing-and-reflection-interfaces.md).

## Phase 22 — Journal entries and privacy defaults — 2026-10-16

- **Shared Journal Domain Model & Contracts (`packages/domain`, `packages/contracts`):**
  - Implemented `JournalEntry` entity with stable UUID identity, user-selected calendar date (`entryDate`), authoring timezone (`timezone`), portable AST document (`NoteDocument`), plain text, word/char counts, optional non-clinical mood (`great`, `good`, `okay`, `difficult`, `reflective`), optional reflection prompts (`JournalPromptEntry[]`), tags, draft status, and folder placement.
  - Implemented `isEntryBackdated` to identify intentional backdating by comparing authoring date against current local date in the specified timezone without modifying physical timestamps.
  - Implemented `computeJournalStats` for accurate multilingual word/char counts, preserving multiline text and complex Bengali (Bangla) Unicode script bit-for-bit.
  - Defined strict Zod schemas for entry creation, updates, date-filtered queries, and lifecycle state changes in `@daynori/contracts`.
  - Extended `DisplayPreferencesSchema` with privacy-preserving defaults: `journalPreviewHidden: true` and `suppressBodySnippets: true`.
- **PostgreSQL Persistence & Tenant Isolation (`infra/supabase`):**
  - Applied migration `00019_journal_entries.sql` creating `app.journal_entries` table with foreign key cascading to `app.items(id)`.
  - Configured PostgreSQL Row-Level Security (RLS) policies strictly scoping journal access to personal workspace owners, rejecting access from shared workspaces or collaborative rooms.
- **Fastify API Routes & Sync Dispatcher (`apps/api`):**
  - Implemented transactional REST routes under `/v1/workspaces/:workspaceId/journal` for entry creation, listing, retrieval, updates with optimistic concurrency control (`baseRevision`), archive, trash, and restore.
  - Integrated change feed emission producing `journal_entry` events on workspace sync streams.
- **Privacy Guardrails & Operational Log Sanitization (`apps/api`):**
  - Enhanced `SafeLogger` to redact journal titles, document contents, plain text snippets, moods, and reflection prompt responses from operational logs and error diagnostics with `[REDACTED_JOURNAL_CONTENT]`.
- **Client Storage Adapters & Synchronization (`@daynori/sync`, `apps/web`, `apps/mobile`):**
  - Extended `SyncEngine` with typed journal sync commands and non-destructive conflict recovery (`save_copy` and recovery drafts).
  - Extended Web IndexedDB adapter (`apps/web/src/data/indexedDbRepository.ts`, `DB_VERSION = 6`) with `journal_entries` object store and indices.
  - Extended Mobile SQLite adapter (`apps/mobile/src/data/sqliteRepository.ts`, migration version 7) with `local_journal_entries` table.
- **Journal Foundation & Prerequisite Repairs (Findings A–E):**
  - **Bootstrap Snapshot Fidelity (Finding A):** Added complete, validated `journalEntries` projection to sync bootstrap query, response schema, transport, SyncEngine, and local repositories; guarded against corrupted snapshots without fabricating empty entries.
  - **Concurrency & Lifecycle Protection (Finding B):** Acquired workspace sync locks prior to reading authoritative revisions in journal update, trash, and restore routes; serialized concurrent same-revision writes with 409 Conflict rejection; enriched restoration payloads with full entry projections; implemented idempotent receipt replay protection on trash and restore routes.
  - **Explicit Null Synchronization (Finding C):** Fixed sync pull mapping to distinguish explicit `null` from undefined fields, cleanly clearing titles, moods, folders, prompts, and tags across clients while preserving untouched fields during partial updates.
  - **Privacy Guardrails & Complete Log Sanitization (Finding D):** Enforced controlled operational event messages and extended `SafeLogger` sanitization to titles, documents, reflections, prompts, and errors; asserted complete serialized log entries contain zero canary leaks.
  - **Validation & Non-UTC Semantics (Finding E):** Fixed non-UTC date-only shifts using SQL date-only casting; enforced prompt response bounds (<=5000 chars) with `RangeError`; validated cursors; rejected generic item creation for `journal_entry`; corrected ADR-0028 storage claims and vault phase references (Phases 44–47).
- **Decision Record:**
  - Published [ADR-0028: Journal Entries, Dated Local Semantics, and Privacy Defaults](docs/decisions/0028-journal-entries-and-privacy-defaults.md).

## Phase 21 — Daily routine experience and history — 2026-10-16

- **Shared Domain Logic & Gentle Progress (`packages/domain`):**
  - Implemented `explainWhyDueToday` returning structured human-readable explanations of routine recurrence and due status for any target calendar date.
  - Implemented `calculateGentleProgress` computing non-punitive daily routine metrics (`completedCount`, `skippedCount`, `completionRate`, encouraging message) without streak shaming or forced notifications.
  - Implemented `explainScheduleChangeImpact` explaining immediate vs forward-effective schedule modifications with history preservation guarantees.
- **Accessible Web Components (`packages/ui-web`):**
  - Added `RoutineRow` accessible checklist item with `role="checkbox"`, Done/Skip/Undo/History controls, due explanation notes, and text status badges.
  - Added `RoutineDetailEditor` modal dialog for creating and editing routine schedules, weekdays, scheduled times, IANA timezones, active date ranges, and live schedule impact previews.
  - Added `RoutineHistoryViewer` modal dialog displaying chronological past occurrences, gentle routine overview stats, audit logs, and occurrence reopen controls.
- **Accessible Mobile Components (`packages/ui-mobile`):**
  - Added `MobileRoutineRow` with touch targets >= 48dp, TalkBack accessibility labels, Done/Skip/Reopen pills, and history inspection.
- **Web Application Today Experience (`apps/web`):**
  - Implemented interactive Today view connected to `IndexedDbLocalRepository`, `useAuth()`, and `SyncEngine`.
  - Auto-generates today's occurrences deterministically on page load.
  - Added 5-second floating reversible undo toast for routine completions and skips.
  - Kept daily routine checklists strictly partitioned from one-off tasks due today.
  - Integrated `RoutineDetailEditor` and `RoutineHistoryViewer` modals.
- **Mobile Application Today Experience (`apps/mobile`):**
  - Enhanced React Native `TodayView` with `MobileRoutineRow` checklist and gentle progress message banner.
  - Added floating reversible undo toast with accessible button.
  - Added `MobileModalSheet` routine history viewer showing yesterday's completion and gentle progress stats.
- **Integration Testing & Contracts Alignment (`tests/integration`, `packages/contracts`):**
  - Added `tests/integration/phase21-daily-routines-experience.test.ts` verifying multi-day journeys, occurrence completion/skip transitions, reversible undo, yesterday's completion preservation, forward schedule changes, gentle progress evaluation, and tenant isolation.
  - Aligned `WeekdaySchema` in `@daynori/contracts` to infer union literals `1 | 2 | 3 | 4 | 5 | 6 | 7` for strict type safety across the monorepo.
- **Decision Record:**
  - Published [ADR-0027: Daily Routine Checklists, Non-Punitive Progress, and Completion History](docs/decisions/0027-daily-routine-checklist-and-history.md).

## Phase 20 — Daily routine schedules and occurrences — 2026-10-16

- **Shared Routine Domain & Date-Scoped Occurrences (`packages/domain`, `packages/contracts`):**
  - Implemented routine schedule template model: title, optional details, frequency (`daily` or `weekdays`), ISO 8601 weekdays `1` (Monday) through `7` (Sunday), explicit IANA timezone, optional scheduled time `HH:mm`, active period bounds (`activeFrom` <= `activeTo`), and pause/archive flags.
  - Implemented bounded occurrence generator (`generateOccurrencesForDateRange`) supporting date ranges up to 90 days, producing date-scoped occurrence records without duplicating already existing dates.
  - Established date-scoped occurrence isolation: completing or skipping today's occurrence never affects tomorrow or any other calendar date.
  - Resolved local scheduled times to UTC planned instants in explicit timezones, deterministically handling DST fall-back overlap hours and spring-forward gaps.
  - Implemented occurrence state transitions (`completeOccurrence`, `skipOccurrence`, `reopenOccurrence`) with full audit history tracking (`fromStatus`, `toStatus`, `changedAt`, `actorId`, `reason`).
  - Implemented schedule forward reconciliation (`reconcileOccurrencesOnScheduleChange`): schedule modifications increment `scheduleRevision` and take effect forward from `effectiveDate`, preserving past completed and skipped occurrences while cancelling or updating future pending occurrences.
- **PostgreSQL Persistence & Tenant Isolation (`infra/supabase`):**
  - Applied migration `00017_routines_and_occurrences.sql` creating `app.routines` and `app.routine_occurrences` with foreign keys referencing `app.items`.
  - Added unique constraint `CONSTRAINT uq_routine_occurrence_date UNIQUE (workspace_id, routine_id, scheduled_date)` preventing duplicate occurrences at the database level.
  - Configured Row-Level Security (RLS) policies scoped strictly to authorized workspace membership.
- **Fastify API Routes & Sync Dispatcher (`apps/api`):**
  - Added 11 transactional REST routes under `/v1/workspaces/:workspaceId/routines` for routine CRUD, pause/resume/archive, bounded occurrence generation, date-range listing, and occurrence state transitions with optimistic concurrency protection (`baseRevision`).
  - Added `formatDateOnly` helper to ensure calendar dates (`YYYY-MM-DD`) are preserved without host timezone day shifts.
  - Integrated change feed emission producing `routine` and `routine_occurrence` events on workspace sync streams.
- **Client Storage Adapters (`apps/web`, `apps/mobile`, `@daynori/sync`):**
  - Updated Web IndexedDB adapter (`apps/web/src/data/indexedDbRepository.ts`, `DB_VERSION = 5`) with `routines` and `routine_occurrences` object stores, composite index `by_routine_date`, atomic write/sync/purge operations.
  - Updated Mobile SQLite adapter (`apps/mobile/src/data/sqliteRepository.ts`, migration version 6) with `local_routines` and `local_routine_occurrences` tables and indices.
  - Extended `DaynoriApiClient` with complete typed routine and occurrence methods.
  - Added `RoutineRecord` and `RoutineOccurrenceRecord` models and validators to `@daynori/sync`.
- **Decision Record:**
  - Published [ADR-0026: Daily Routine Schedules, Date-Scoped Occurrences, and Lifecycle Reconciliation](docs/decisions/0026-routine-schedules-and-occurrences.md).

## Phase 19 — Upcoming task lists and detail views — 2026-10-16

- **Prerequisite Correctness Repairs (`apps/api`, `packages/domain`, `packages/sync`, commit `41061fc`):**
  - Parameterized `userTimezone` in PostgreSQL task queries, completely eliminating SQL injection risks.
  - Bracketed `OR` predicate in Today task view to prevent bypass of workspace RLS or status constraints.
  - Added deterministic secondary sort keys before pagination `LIMIT` clauses to guarantee stable page boundaries.
  - Enforced strong type constraints on continuation cursors.
  - Resolved timezone consistency in `getTaskDeadlineSortKey` with explicit reference dates.
  - Added full subtree depth checks enforcing maximum depth of 3 levels across subtask hierarchies.
  - Implemented transactional concurrency locking on task mutations with optimistic revision verification.
  - Ensured durable idempotency replay returns original mutation receipts on repeated identical operation IDs.
  - Preserved local task projections during tombstone metadata sync and tag reconciliation.
- **Pure Domain & Timezone Helpers (`packages/domain`):**
  - Added `formatTaskDeadlineExplanation` returning structured text-based overdue explanations, relative dates, and timezone notes to avoid relying on color alone.
  - Added `checkLocalTimeDisambiguation` detecting nonexistent spring-forward gaps and ambiguous fall-back overlaps during DST transitions.
- **Accessible Web Components (`packages/ui-web`):**
  - Added `TaskRow` component with custom accessible checkbox, priority badges, text-based overdue warnings, tag chips, subtask count indicators, and bulk selection controls.
  - Added `TaskDetailEditor` modal with title auto-focus, details textarea, priority, status, folder, tags, subtasks manager (depth <= 3), and deadline picker supporting none, calendar date, and timed deadlines with timezone selection and DST disambiguation warnings.
- **Web Application Plan Page (`apps/web`):**
  - Implemented production Plan page (`/plan`) connected to `IndexedDbLocalRepository`, `useAuth()`, and `SyncEngine`.
  - Added dedicated priority views: Today, Upcoming, Overdue, Completed, Undated, and All Tasks.
  - Added quick capture bar with deadline presets (`Today`, `Tomorrow`, `No date`).
  - Added sorting and filtering by priority, folder, and deadline.
  - Added safe confirmable bulk actions (complete, delete, move) operating on explicit ID arrays with review confirmation modals.
  - Added floating undo toast for 5-second reversal of task completions.
  - Added accessible live announcements and viewing timezone selector.
- **Mobile Application Plan View (`apps/mobile`):**
  - Enhanced React Native `PlanView` connected to `LocalRepositoryPort` and `SyncEngine` while preserving routines and calendar subviews.
  - Added quick capture input bar with quick deadline preset buttons.
  - Added view filter pills for switching between Today, Upcoming, Overdue, Completed, and All.
  - Added task list rendering with priority badges, text-based overdue explanations, and subtask counters.
  - Added modal sheet editor (`MobileModalSheet`) for task detail editing, subtasks, and deadline selection.
  - Added reversible completion with bottom undo banner.
- **Decision Record:**
  - Published [ADR-0025: Upcoming Task Workflows, Priority Views, and Multi-Platform Plan Interfaces](docs/decisions/0025-upcoming-task-workflows-and-views.md).

## Phase 18 — Upcoming task domain and deadlines — 2026-10-16

- **Shared Task Domain & Explicit Deadline Semantics (`packages/domain`, `packages/contracts`):**
  - Canonical task model with validated non-empty title, optional details, priority (`low`, `normal`, `high`, `urgent`, defaulting to `normal`), status (`todo`, `in_progress`, `completed`, `cancelled`), and folder/Inbox placement.
  - One-off work model: task completion does not spawn recurring events or reset at midnight; daily routines remain a strictly separate domain.
  - Reconciled existing `todo` item aliases with `task` canonical representation (`canonicalItemType("todo") === "task"`).
  - Explicit three-state deadline semantics: `none`, `date` (validated Gregorian calendar date string `YYYY-MM-DD` with leap year verification), and `timed` (authoritative ISO 8601 instant with explicit IANA timezone).
  - Timezone-safe calculations: `isTaskOverdue` evaluates date-only deadlines against 23:59:59.999 in the specified viewing timezone and timed deadlines against the exact UTC instant; `isTaskDueToday` correctly scopes to the viewing timezone's calendar day.
  - Deterministic upcoming comparison (`compareTasksUpcoming`) sorting by deadline presence, deadline instant/date, priority weight (`urgent` > `high` > `normal` > `low`), creation time, and stable ID.
  - Idempotent task completion (`completeTask`) and reopening (`reopenTask`) retaining full transition history while avoiding duplicate entries on retry.
  - Transactional subtask hierarchy validation (`validateSubtaskHierarchy`) enforcing bounded depth (maximum 3 levels), same authorized workspace, and cycle prevention (`NO_SELF_PARENT`, `SUBTASK_CYCLE_DETECTED`).
- **PostgreSQL Persistence & Tenant Isolation (`infra/supabase`):**
  - Applied migration `00015_tasks_domain_and_deadlines.sql` creating `app.tasks` with composite foreign key `(workspace_id, id) REFERENCES app.items(workspace_id, id) ON DELETE CASCADE` and self-referencing `parent_task_id`.
  - Added database check constraints on status, priority, and deadline types.
  - Added targeted indexes on status, priority, due date, parent task ID, and workspace isolation.
  - Configured strict Row-Level Security policies (`p_tasks_select`, `p_tasks_insert`, `p_tasks_update`, `p_tasks_delete`) scoped to authorized workspace membership.
- **Fastify API Routes & Services (`apps/api`):**
  - Added task REST endpoints under `/v1/workspaces/:workspaceId/tasks`:
    - `POST /` (create task)
    - `GET /` (list tasks with filtering by folderId, status, priority, overdue status, search, and stable pagination)
    - `GET /:id` (task detail)
    - `PATCH /:id` (update task with optimistic concurrency revision checks)
    - `POST /:id/complete` (idempotent complete with history recording)
    - `POST /:id/reopen` (idempotent reopen with history recording)
    - `POST /:id/trash` (soft-delete task envelope and item header)
    - `POST /:id/restore` (restore task from trash)
  - Emitted monotonic change records into `app.changes` and outbox intents into `app.outbox_intents` atomically within database transactions.
  - Added durable idempotency key caching via `x-operation-id` / `Idempotency-Key` headers.
- **Client & Sync Engine Integration (`packages/api-client`, `packages/sync`, `apps/api`):**
  - Extended `DaynoriApiClient` with task CRUD, completion, and reopening methods.
  - Defined `TaskRecord` interface in `@daynori/sync` models and ports.
  - Added unified task sync command dispatcher in `SyncService.dispatchCommand` for `createTask`, `updateTask`, `trashTask`, `restoreTask`, `completeTask`, and `reopenTask`.
  - Integrated task projections into client `SyncEngine` for offline writes, pull integration, and conflict recovery.
- **Local Persistence Adapters (`apps/web`, `apps/mobile`):**
  - Extended Web `IndexedDbLocalRepository` to schema version 4 with dedicated `tasks` object store and index on `[workspaceId+status]`.
  - Extended Mobile `SqliteLocalRepository` to migration version 5 with dedicated `tasks` table, indexing, and transactional operations.
- **Decision Record:**
  - Published [ADR-0024: Task Domain, Explicit Deadlines, and Subtask Invariants](docs/decisions/0024-task-domain-and-deadlines.md).

## Phase 17 — Focused note editor on both platforms — 2026-10-16

- **Shared Web UI Component (`packages/ui-web`):**
  - Added `NoteEditor` component with distraction-free title and body editing, visible "Untitled" fallback, and auto-resizing text fields.
  - Implemented direct canonical `NoteDocument` AST editing supporting paragraph, heading (H1–H3), bullet list, ordered list, and checklist blocks with interactive checkbox toggles.
  - Added restrained accessible formatting toolbar with block controls, bold styling toggle, and session undo/redo buttons with keyboard shortcut support (`Ctrl+Z`, `Ctrl+Y` / `Ctrl+Shift+Z`).
  - Implemented IME composition tracking (`isComposingRef`) protecting Bengali (Bangla / বাংলা) phonetic typing and complex scripts from debounced save interruptions.
  - Added 600ms debounced autosave feedback loop decoupling local persistence indicators ("Saved locally", "Saving locally...") from cloud synchronization indicators ("Synced", "Syncing to cloud...", "Offline draft", "Sync conflict").
  - Added server revision conflict recovery banner with explicit, non-destructive resolution actions: Keep Server, Keep Local, and Save Copy.
- **Shared Mobile UI Component (`packages/ui-mobile`):**
  - Added `MobileNoteEditor` component with touch-friendly layout, expandable text inputs, and 48dp minimum touch target formatting toolbar.
  - Supported block controls (¶, H1, H2, H3, • List, 1. List, ☑ Check), bold inline formatting, and session undo/redo.
  - Added interactive checklist toggles mutating AST block states atomically.
  - Supported local persistence status and cloud synchronization badges.
- **Web Application Integration (`apps/web`):**
  - Integrated `NoteEditor` directly into `/library` page supporting item selection and URL deep linking via `?create=note`.
  - Wired global action modal ("📄 New Note / File") to launch the focused note editor immediately.
  - Supported dual persistence using `IndexedDbLocalRepository` (atomic local draft saves) and `SyncEngine.saveItem` (background cloud synchronization).
- **Mobile Application Integration (`apps/mobile`):**
  - Integrated `MobileNoteEditor` into `LibraryView` supporting `+ Note` creation button and note card tap selection.
  - Supported dual persistence using `SqliteLocalRepository` and `SyncEngine`.
- **Decision Record:**
  - Published [ADR-0023: Focused Note Editor and Local Autosave Recovery](docs/decisions/0023-focused-note-editor-and-autosave.md).

## Phase 16 — Typed note domain and persistence — 2026-10-15

- **Portable Typed Note Document AST (`packages/contracts`, `packages/domain`):**
  - Defined version 1 `NoteDocument` AST with typed blocks (`paragraph`, `heading` levels 1–3, `bullet_list`, `ordered_list`, `checklist_item`) and inline text nodes with optional marks (`bold`, `italic`, `hard_break`).
  - Implemented plain text projection (`extractPlainText`) and Unicode-aware character/word counting (`calculateWordCount`, `calculateCharCount`).
  - Added title derivation invariant (`resolveNoteTitle`) falling back to the first non-empty line of content text.
  - Enforced strict payload and node boundaries (`MAX_NOTE_DOCUMENT_BYTES = 512 * 1024`, `MAX_NOTE_NODES = 5000`).
  - Preserved complex Unicode and South Asian scripts (Bangla / বাংলা) across parsing, storage, and retrieval.
  - Implemented inert text sanitization (`sanitizeInertString`) stripping ASCII control codes (< 32, preserving `\t`, `\n`, `\r`), `<script>`/`<style>` blocks, and raw HTML markup tags.
- **PostgreSQL Persistence & RLS (`infra/supabase`):**
  - Applied migration `00014_typed_notes_and_persistence.sql` creating `app.notes` with composite primary key `(workspace_id, id)` and foreign key referencing `app.items(workspace_id, id) ON DELETE CASCADE`.
  - Added GIN full-text index `idx_notes_search` on combined title and plain text.
  - Configured tenant RLS policies (`p_notes_select`, `p_notes_insert`, `p_notes_update`, `p_notes_delete`) ensuring strict tenant isolation and write authorization checks.
- **Fastify API Routes & Services (`apps/api`):**
  - Added note endpoints at `/v1/workspaces/:workspaceId/notes`: `POST` (create), `GET /:id` (detail), `GET` (list with filters), `PATCH /:id` (update with optimistic revision checks), `POST /:id/trash` (soft-delete), and `POST /:id/restore` (restore).
  - Integrated with monotonic change feed (`app.changes`), outbox intent dispatch (`app.outbox_intents`), and durable `x-operation-id` idempotency caching.
  - Supported query boolean coercion via `QueryBooleanSchema` preventing `"false"` string evaluation bugs.
- **Sync Engine & Local Repositories (`packages/sync`, `apps/api`):**
  - Handled note commands (`createNote`, `updateNote`, `trashNote`, `restoreNote`) in client `SyncEngine` and server `SyncService`.
  - Joined `app.notes` in bootstrap query `listActiveItemsForBootstrap` to populate note titles and plain text in client bootstrap snapshots.
  - Preserved offline note drafts in `IndexedDbLocalRepository` and `SqliteLocalRepository` with conflict detection on reconnect.
- **API Client Library (`packages/api-client`):**
  - Added typed methods to `DaynoriApiClient`: `createNote`, `getNote`, `listNotes`, `updateNote`, `trashNote`, and `restoreNote`.
- **Decision Record:**
  - Published [ADR-0022: Typed Note Domain and Persistence](docs/decisions/0022-typed-note-domain-and-persistence.md).

## Phase 15 — Folder browsing and organization interfaces — 2026-10-15

- **Web Library Interface (`apps/web`):**
  - Implemented folder browsing with root/Inbox view (`parentId === null`) and drill-down into nested subfolders.
  - Added accessible `BreadcrumbNav` component with `<nav aria-label="Breadcrumb">`, `<ol>`/`<li>`, `aria-current="page"`, visible focus ring, and dedicated Up button navigation.
  - Displayed mixed folder contents containing child folders, notes, tasks, routines, and journals with semantic `ItemTypeBadge` components.
  - Added non-destructive module view filters (`All Items`, `Notes`, `Knowledge`, `Files`, `Tasks`) projecting content without altering folder hierarchy.
  - Implemented folder CRUD operations: Create folder dialog with depth enforcement (`MAX_FOLDER_DEPTH = 5`), color, icon, and parent selection; Rename dialog; Move dialog with cycle prevention (`detectCycle`); Delete dialog supporting both `preserve_to_parent` and `trash_subtree` policies; Archive/Unarchive toggle.
  - Supported accessible reordering via touch/pointer buttons (▲ / ▼) and keyboard shortcuts (`Alt+Up` / `Alt+Down`) with polite `aria-live` screen-reader announcements.
  - Added floating undo toast with 10-second countdown and optimistic revision check for reversible actions.
  - Decoupled local persistence indicator (`Saved on device` via `IndexedDbLocalRepository` when trusted-device consent is granted) from cloud sync status (`Synced`, `Syncing`, `Offline`, `Conflict`, `Error`).
  - Added bounded 10 items/page pagination for large folders and demo journeys seeder for Software and Government Jobs research fixtures.
  - Ensured full WCAG 1.4.10 mobile reflow compliance at 320px viewport width without horizontal scrollbars.
- **Mobile Library Interface (`apps/mobile`):**
  - Implemented mobile folder browsing with root and nested drilldown navigation.
  - Added `MobileBreadcrumb` with Up button navigation and 48dp touch targets.
  - Implemented module filter tabs (`all`, `notes`, `knowledge`, `files`) preserving backward-compatible testIDs (`library-filter-${key}`).
  - Displayed mixed items with semantic `MobileTypeBadge` cards.
  - Added bottom action sheets for folder creation, renaming, and deletion (with subtree option).
  - Implemented touch reordering buttons (▲ / ▼) with 48dp minimum touch targets.
  - Added floating undo notification banner for reversible operations.
  - Displayed local storage status and cloud synchronization badges.
  - Integrated sample journey loader for Software and Government Jobs journeys.
- **Shared UI Components (`packages/ui-web`, `packages/ui-mobile`):**
  - Added `BreadcrumbNav` and `ItemTypeBadge` to `@daynori/ui-web`.
  - Added `MobileBreadcrumb` and `MobileTypeBadge` to `@daynori/ui-mobile`.
- **Decision Record:**
  - Published [ADR-0021: Folder Browsing and Library Interfaces](docs/decisions/0021-folder-browsing-and-library-interfaces.md).

## Phase 14 — Collections, folders, and shared item metadata — 2026-10-15

- **Unified Workspace Folder Hierarchy (`infra/supabase`, `packages/contracts`, `apps/api`):**
  - Applied migration `00012_organization_folders_and_metadata.sql` introducing `app.folders`, `app.tags`, `app.item_tags`, `app.item_links`, and PL/pgSQL invariant validation function `app.validate_folder_parent`.
  - Folders share unified `app.items` core table with `kind = 'folder'`, security scope (`standard` / `vault`), archive and pin states, rank, and revision tracking.
  - Implemented strict depth bound (`MAX_FOLDER_DEPTH = 5`) and cycle prevention walking ancestor links, enforced transactionally at both domain and database trigger levels.
  - Subtree moves verify that `target_parent_depth + subtree_depth <= 5` preventing descendants from exceeding max depth.
  - Defined explicit folder deletion policies:
    - `preserve_to_parent`: Moves direct child folders and items to parent (or Inbox if deleted folder was root).
    - `trash_subtree`: Recursively tombstones the folder and all its descendant items and folders (`deleted_at = now()`).
  - Implemented safe restoration (`restoreFolder`), reparenting to root if former parent is deleted.
- **Inbox Semantics & Common Item Metadata:**
  - Defined `folder_id = NULL` as workspace Inbox; newly captured items default to Inbox and items can be moved freely between Inbox and folders.
  - Extended generic item creation routes and sync push dispatches to validate folder invariants (parent folder existence, deleted status, kind, security scope).
- **Sparse Ranking & Rebalancing (`packages/domain`, `apps/api`):**
  - Sibling items and folders ordered by sparse lexicographical rank strings with UUID tie-breakers.
  - Added sibling rebalancing endpoint (`/v1/workspaces/:workspaceId/folders/rebalance`) to redistribute sibling ranks with step 1000.
- **Workspace-Scoped Tags & Item Links:**
  - Case-insensitive unique tags per workspace (`app.tags` with unique index on `(workspace_id, lower(name))`).
  - Many-to-many join in `app.item_tags` attaching and detaching tags to items without copying or duplicating item feature bodies.
  - Directed item links in `app.item_links` with self-link prevention and same-workspace validation.
- **Sync & Outbox Integration:**
  - Folder operations emit ordered events in `app.changes` and outbox intents in `app.outbox_intents`.
  - Active folders included in `syncBootstrap` snapshot items.
- **Performance Benchmark:**
  - Validated recursive hierarchy query performance with `EXPLAIN (ANALYZE, BUFFERS)` on a 310-folder synthetic hierarchy, confirming execution time of ~1.5ms (budget < 100ms).
- **Decision Record:**
  - Published [ADR-0020: Workspace Folders, Collections, and Shared Item Metadata](docs/decisions/0020-workspace-folders-and-organization.md).

## Phase 13 — Shared Client Synchronization Engine — 2026-10-15

- **Shared Synchronization State Machine (`packages/sync`):**
  - Implemented `SyncEngine` with atomic local projection/draft saving (`saveItem`) and immutable mutation enqueuing.
  - Decoupled state indicators: separated local device persistence (`savedOnDevice`) from cloud synchronization status (`cloudSyncStatus`: `'synced'`, `'syncing'`, `'saved_locally'`, `'offline'`, `'conflict'`, `'error'`, `'needs_attention'`).
  - Added dependency-aware queue draining: automatically resolves and sorts pending mutations topologically by `dependencyOperationIds` before dispatching in batches of up to 50 operations.
  - Implemented transactional acknowledgment: retains pending mutations in local storage until durable receipts are committed locally.
  - Bounded exponential backoff with jitter and cancellation on network errors.
  - Paginated incremental pulls (up to 100 changes per batch) with out-of-order revision protection and tombstone preservation.
  - Implemented safe snapshot reset (`resetAndBootstrap`) when encountering HTTP 409 `SYNC_RESET_REQUIRED`, reconstructing local projection from a fresh snapshot while strictly preserving unsent local drafts, pending mutations, and conflicts.
  - Explicit conflict lifecycle: detected conflicts are exposed via `ConflictRecord`; user resolution (`keep_local`, `keep_server`, `custom`) mints fresh operation IDs with updated base revisions rather than silently overwriting or reusing rejected IDs.
  - Operational diagnostics: `getDiagnostics()` exposes metrics (queue length, in-flight count, failures, sync sequence, epoch) while strictly excluding user text, secrets, tokens, or encryption keys.
- **Multi-Tab Browser Coordination (`packages/sync`):**
  - Implemented `BroadcastChannelTabCoordinator` with heartbeat-based leader election (1000ms heartbeat, 3000ms lease) and resignation broadcast.
  - Follower tabs forward manual and automatic sync requests to the active leader; leader crashes trigger promotion of follower within 1000ms.
  - Provided `SingleProcessCoordinator` for single-instance native mobile applications.
- **Platform Adapters & Verification (`apps/web`, `apps/mobile`, `tests/integration`):**
  - Created web platform adapter in `apps/web/src/data/syncAdapter.ts` (`createWebSyncEngine`).
  - Created mobile platform adapter in `apps/mobile/src/data/syncAdapter.ts` (`createMobileSyncEngine`).
  - Added comprehensive integration test suite `tests/integration/phase13-client-sync-engine.test.ts` covering 7 core fault journeys against real PostgreSQL and Fastify API server.
  - Published [ADR-0019: Shared Client Synchronization Engine](docs/decisions/0019-shared-client-sync-engine.md).

## Hardening & Defect Repairs (Phases 11 & 12) — 2026-10-15

- **Phase 11 Storage & Verification Hardening (`apps/mobile` & `scripts`):**
  - Updated `SqliteLocalRepository` to enforce `requireSqlCipher: true` by default and perform genuine file-existence checks before creating keys, protecting existing encrypted data.
  - Added transaction concurrency mutex (`runWithLock`) to `SqliteLocalRepository` preventing interleaving of concurrent queries into active transactions.
  - Rewrote Chromium browser CDP verification script (`scripts/test-indexeddb-browser.mjs`) to load and verify the actual production `IndexedDbLocalRepository` across consent, atomicity, persistence, tenant isolation, rollback, and multi-tab coordination.
- **Phase 12 Protocol & Receipt Defect Repairs (`apps/api`, `packages/contracts`, `infra/supabase`):**
  - Implemented deterministic topological dependency ordering in `pushBatch` with 3-color DFS cycle detection and terminal failure persistence (`DEPENDENCY_CYCLE`, `DEPENDENCY_MISSING`, `DEPENDENCY_FAILED`).
  - Added receipt rechecking after acquiring workspace sync lock, ensuring identical concurrent creates return the same committed receipt.
  - Narrowed duplicate-key recovery strictly to the mutation receipts uniqueness constraint (`uq_mutation_receipts_actor_device_op`).
  - Enforced recursive key-sorted canonical hashing over command versions, dependencies, and payloads.
  - Updated `bootstrap` to return full projection representation (`revision`, `rank`, `isArchived`, `isPinned`, `securityScope`) under `REPEATABLE READ` snapshot isolation.
  - Fixed nullable updates: explicitly clearing `folderId` via `null` works.
  - Preserved tombstone semantics: updating a deleted item returns terminal rejection `ENTITY_TOMBSTONED`.
  - Integrated REST API item mutations (`POST` / `DELETE`) into the change feed sequence and outbox intents.
  - Applied migration `00011_repair_receipt_rls.sql` repairing receipt RLS to require active workspace viewer membership, and rotated access epochs on workspace membership mutations.

## Phase 12 — Server mutation receipts and change feed — 2026-10-15

- **PostgreSQL Commit-Safe Sequence & Ordered Change Feed (`infra/supabase` & `apps/api`):**
  - Applied migration `00010_server_mutation_receipts_and_change_feed.sql` introducing `app.workspace_sync_state`, `app.mutation_receipts`, `app.changes`, and `app.outbox_intents`.
  - Implemented row-lock protocol on `app.workspace_sync_state` held inside the PostgreSQL transaction until commit (`SELECT ... FOR UPDATE`), serializing mutations strictly within the target workspace and ensuring monotonic gapless sequences matching commit order.
  - Implemented ordered change feed `app.changes` indexed by `(workspace_id, seq ASC)` with tombstones (`is_tombstone = true`) retained across the 90-day offline horizon.
- **Durable Mutation Receipts & Canonical Idempotency (`apps/api`):**
  - Created `app.mutation_receipts` with uniqueness constraint on `(actor_user_id, device_id, operation_id)`.
  - Implemented deterministic key sorting and SHA-256 payload digest (`computeCanonicalPayloadHash`).
  - Safe replay handling: sequential or concurrent retries with identical payload return the existing durable receipt without allocating a new sequence or creating duplicate change records.
  - Reused operation IDs with altered payloads or target workspaces are rejected with `IDEMPOTENCY_KEY_REUSED`.
- **Sync Endpoints & Protocol (`packages/contracts`, `apps/api`, `packages/api-client`):**
  - Added batch push endpoint `POST /v1/sync/push` supporting up to 50 commands with independent per-command transaction isolation and partial batch failure reporting.
  - Added incremental pull endpoint `GET /v1/sync/pull` supporting bounded pagination and opaque checkpoint cursors.
  - Added snapshot bootstrap endpoint `GET /v1/sync/bootstrap` pairing active items with the high-watermark cursor `next_change_seq - 1`.
  - Implemented 90-day horizon and access epoch cursor expiration (`SYNC_RESET_REQUIRED`), directing clients to perform a safe snapshot reset while preserving local unsent drafts.
  - Implemented foundation sync commands: `createItem`, `updateItem`, `archiveItem`, `unarchiveItem`, `pinItem`, `unpinItem`, `trashItem`, and `restoreItem`.
  - Added client methods (`syncPush`, `syncPull`, `syncBootstrap`) in `DaynoriApiClient`.
- **Architecture Documentation & Verification:**
  - Published [ADR-0018: Commit-Safe Change Ordering and Durable Mutation Receipts](docs/decisions/0018-commit-safe-change-ordering-and-mutation-receipts.md).
  - Verified against real PostgreSQL with 18 integration tests in `tests/integration/phase12-sync-receipts-change-feed.test.ts`.
  - Synchronized OpenAPI 3.0.3 canonical specification without drift (`tests/contract/contract.test.ts`).

## Phase 11 — Local Data Repositories and Migrations — 2026-10-15

- **Shared Persistence Ports & Contracts (`packages/sync` & `packages/domain`):**
  - Defined `LocalRepositoryPort` interface for unified local data persistence across platforms.
  - Specified foundation data models and runtime validators with payload bounds: `ItemHeaderRecord`, `DraftRecord`, `PendingMutationRecord`, `SyncCursorRecord`, `PreferenceSnapshotRecord`, and `AccountNamespace`.
  - Established typed error hierarchy: `StorageQuotaError`, `StorageMigrationError`, `StorageUnavailableError`, `StorageKeyError`, and `TrustedDeviceConsentRequiredError`.
- **Android Encrypted SQLite Repository (`apps/mobile`):**
  - Pinned `expo-sqlite: ~15.1.4` with SQLCipher configuration plugin (`useSQLCipher: true`).
  - Compiled and verified native OpenSSL and SQLCipher C++ shared libraries (`libcrypto.so` and `libexpo-sqlite.so`) across all target ABIs (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) into `app-debug.apk`.
  - Implemented `MobileKeyManager` wrapping Android KeyStore (`expo-secure-store`) generating and protecting 256-bit AES encryption keys per account and workspace (`daynori_sqlite_key_${userId}_${workspaceId}`).
  - Serialized concurrent first initialization, validated 64-char hex key format, and tracked known workspace keys in persistent KeyStore index for restart-safe key erasure.
  - Implemented `SqliteLocalRepository` with parameterized queries, schema migrations (`schema_migrations`), atomic multi-store writes via `withTransactionAsync`, and draft quarantine.
  - Enforced key safety invariant: existing databases missing keys reject initialization with `StorageKeyError` (`KEY_NOT_FOUND`) rather than overwriting with a new key.
  - Decryption verified by querying database schema pages (`SELECT count(*) FROM sqlite_master;`).
  - Enforced strict account and workspace boundaries on every operation (`CROSS_WORKSPACE_VIOLATION`, `CROSS_ACCOUNT_VIOLATION`).
  - Complete account data erasure clears item headers, drafts, mutations, cursors, and KeyStore keys.
- **Web IndexedDB Repository (`apps/web`):**
  - Implemented `IndexedDbLocalRepository` against genuine IndexedDB (`daynori_web_storage`, v1).
  - Enforced deliberate trusted-device consent (`daynori_trusted_device_consent`), defaulting to refusal (`TrustedDeviceConsentRequiredError`) if ungranted.
  - Enforced strict account and workspace boundaries on every operation (`CROSS_WORKSPACE_VIOLATION`, `CROSS_ACCOUNT_VIOLATION`).
  - Complete account erasure clears item headers along with user drafts, mutations, cursors, and preferences.
  - Handled multi-tab coordination (`BroadcastChannel` and `versionchange` event listeners), honest `onblocked` error reporting, and mapped browser quota errors to `StorageQuotaError`.
  - Verified genuine Chromium browser execution via CDP (`scripts/test-indexeddb-browser.mjs`).
- **Architecture & Quality:**
  - Published [ADR-0017: Local Storage and Encryption Key Lifecycle](docs/decisions/0017-local-storage-and-encryption-key-lifecycle.md).
  - Authored contract test suites with 28 passed tests across simulated platform stores and genuine Chromium browser execution via CDP.

- **Provider-Bound Flow Initiation & Anti-Replay Callbacks (Phase 09 Repair):**
  - Added `POST /api/auth/initiate` route in web application, creating encrypted/SameSite `daynori_pkce_verifier` cookie binding state, code challenge, and timestamp.
  - Rewrote web auth callback route (`/api/auth/callback`) to reject unsolicited raw tokens (`unsolicited_token_rejected`), require flow cookie (`no_initiated_flow`), verify state challenge, and consume cookie one-time.
  - Hardened Android `MobileProviderAuthAdapter` to persist pending flow parameters (`state`, `nonce`, `codeVerifier`) in OS-backed secure storage (`SEC_KEY_PENDING_FLOW`), enabling secure cold-start recovery across process death and rejecting replayed/unsolicited callbacks.
- **Atomic Optimistic Concurrency Control (Phase 10 Repair):**
  - Replaced TOCTOU read-then-update pattern in `workspaceRepository.updateProfilePreferences` with atomic SQL predicate: `WHERE id = $1 AND ($7::bigint IS NULL OR revision = $7::bigint)`.
  - Added concurrent race test verifying two simultaneous requests with identical `expectedRevision`: exactly one passes (200) and the second fails (409 Conflict) without overwriting.
- **Legacy Workspace Reconciliation Ledger & Preflight (Phase 10 Repair):**
  - Applied migration `00009_legacy_workspace_reconciliation_and_ownership.sql` establishing `app.legacy_workspace_reconciliation_inventory` to record all duplicate personal workspaces affected by Migration 00008 as `quarantined_pending_review`.
  - Created procedure `app.reconcile_legacy_workspace()` for reviewed disposition (`archive`, `confirm_room`, `restore_as_personal_backup`).
  - Created preflight verification script `scripts/preflight-database.mjs` verifying zero unreviewed duplicate workspaces before runtime boot.
- **Personal Workspace Owner-Only Invariant (Phase 10 Repair):**
  - Added PostgreSQL trigger `trg_enforce_personal_workspace_ownership` on `app.workspace_memberships` physically blocking adding any user other than the owner to a personal workspace.
  - Enforced owner-only constraint in API `POST /v1/workspaces/:workspaceId/members` (400 Validation Error).
  - Kept room creation and sharing inaccessible in user interfaces until planned Phase 51.
- **Architecture Documentation:**
  - Published [ADR-0016: Personal Workspace Ownership, Concurrency Control, and Legacy Reconciliation](docs/decisions/0016-personal-workspace-ownership-concurrency-and-legacy-reconciliation.md).

## Phase 10 — Personal workspace and preferences — 2026-10-15

- **Database-Enforced Personal Workspace Uniqueness & Idempotent Provisioning:**
  - Applied migration `00008_personal_workspace_and_preferences.sql` adding partial unique index `idx_workspaces_personal_owner` on `app.workspaces(owner_id) WHERE kind = 'personal'`.
  - Reconciled existing duplicate workspaces to `kind = 'room'` with suffix ` (Legacy Room)`.
  - Added atomic idempotent provisioning `POST /v1/workspaces/provision` returning 201 on initial creation and 200 on repeated calls, without overwriting custom display names or preferences (`ON CONFLICT (id) DO UPDATE SET updated_at = app.profiles.updated_at`).
  - Enforced single personal workspace constraint: attempting to create a second personal workspace via `POST /v1/workspaces` returns 409 `ConflictError`.
- **User Preferences & Optimistic Concurrency Control:**
  - Added domain invariants for IANA time zones (`Intl.DateTimeFormat`), BCP 47 locales (`Intl.Locale`), and week start days (`monday`, `sunday`, `saturday`).
  - Separated preferences schema version (`preferences_schema_version = 1`) from optimistic concurrency sequence (`revision`).
  - Added `GET /v1/users/me/preferences` and `PATCH /v1/users/me/preferences` endpoints with revision conflict detection returning 409 Conflict when concurrent updates occur.
  - Hardened Fastify error handling to return 400 for `ValidationError` and 409 for `ConflictError`.
- **Web Client Integration (`apps/web`):**
  - Added route handlers `POST /api/workspaces/provision` and `GET/PATCH /api/users/preferences` protected with double-submit CSRF validation and SameSite cookies.
  - Extended `AuthContext` with workspace provisioning, preferences loading/saving, and cache synchronization.
  - Updated `apps/web/src/app/settings/page.tsx` with Personal Workspace status card, IANA time zone selector, locale selector, week start radio group, compact mode toggle, loading spinners, and concurrency conflict warning banner.
- **Mobile Client Integration (`apps/mobile`):**
  - Extended `MobileProviderAuthAdapter` with `provisionPersonalWorkspace`, `getPreferences`, `updatePreferences`, and `getAccessToken`.
  - Persisted `workspaceId` in OS-backed KeyStore (`expo-secure-store` / `SEC_KEY_WORKSPACE_ID`) and restored on cold restart. Purged on sign-out.
  - Updated `apps/mobile/src/views/SettingsView.tsx` with Section 5b: Personal Workspace status card, week start radio buttons (48dp touch targets), and time zone display.
- **Client SDK & Contracts:**
  - Added workspace and preferences methods to `@daynori/api-client` (`provisionPersonalWorkspace`, `getPersonalWorkspace`, `getUserPreferences`, `updateUserPreferences`, `ApiConflictError`).
  - Added `ProfileSchema`, `ProvisionWorkspaceRequestSchema`, `ProvisionWorkspaceResponseSchema`, `UpdatePreferencesRequestSchema`, `ProfileResponseSchema`, `WeekStartSchema`, and `DisplayPreferencesSchema` to `@daynori/contracts`.

## Phase 09 Authentication Defect Repairs & Security Hardening — 2026-10-15

- **Removed Automatic Simulated Authentication from Runtime:**
  - Removed in-memory `mockUsers`, `localAccounts`, and `hash_<password>` from normal application runtime in `apps/web/src/auth/session.ts` and `apps/mobile/src/auth/providerAdapter.ts`.
  - Outages and rejected credentials fail safely with descriptive errors, without fabricating accounts or tokens.
  - Test doubles are strictly injected via constructors/options and are unavailable to standard runtime.
- **Genuine Callbacks & Flow Binding:**
  - Web callback route (`apps/web/src/app/api/auth/callback/route.ts`) performs genuine authorization code exchange (`exchangeCodeForSession`) and provider token verification, eliminating synthetic cookie manufacturing.
  - Mobile deep link handler (`apps/mobile/src/auth/providerAdapter.ts`) strictly requires matching initiated flow state/nonce (`initiateAuthFlow`), anti-replay validation, and genuine provider code/token verification.
- **Session Verification Before Trusting Identity:**
  - Replaced unverified base64 decoding with real provider verification (`GET /auth/v1/user`) and API `JwtVerifier`.
  - Restored mobile sessions verify access token with provider on cold start, attempting refresh if expired, before exposing private state.
- **Completed Native Secure Storage:**
  - Declared `expo-secure-store` in `apps/mobile/package.json` and linked native Android modules.
  - Rebuilt Android development APK (`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`) with `expo-secure-store` compiled in.
  - Hardened `SecureStorageAdapter` to propagate actionable `SecureStorageError` on storage/module failures and restricted in-memory storage strictly to test environments (`NODE_ENV === 'test'`).
  - Handled failed credential deletion on sign-out explicitly: flags session as revoked so cold start cannot silently restore a signed-out account.
- **Real Refresh, Recovery, and Logout:**
  - Both web and mobile sign-out routes call `POST /auth/v1/logout` to revoke sessions at the provider before clearing local state.
  - Verified refresh token rotation and password recovery email capture in Mailpit (`http://127.0.0.1:54324`).
- **Live Supabase Stack Verification:**
  - Verified real user registration, ES256 asymmetric signature verification via JWKS, and logout revocation through live GoTrue v2.197.0 container daemon.
  - Replaced fabricated workspace IDs with explicit `workspaceId: null` ("workspace not provisioned") state pending Phase 10 provisioning.
  - Sanitized evidence and logs by redacting all usable tokens and credentials.

## Phase 09 — Authentication across web and Android — 2026-10-14

- **Selected Authentication Provider & Journey:**
  - Implemented email/password authentication lifecycle: sign-up, verification, sign-in, recovery, refresh, and sign-out, documented in [ADR-0015](docs/decisions/0015-authentication-across-web-and-android.md).
- **Web Same-Origin Session Layer (`apps/web`):**
  - Built same-origin Route Handlers under `/api/auth/*` (`session`, `sign-in`, `sign-up`, `sign-out`, `refresh`, `recover`, `callback`).
  - Stored tokens exclusively in `HttpOnly`, `Secure`, `SameSite=Lax` cookies (`daynori_access_token`, `daynori_refresh_token`, `daynori_csrf_token`).
  - Enforced double-submit CSRF token validation and `Origin` header whitelisting for all state-changing writes.
  - Kept refresh tokens strictly out of `localStorage`, `sessionStorage`, and client DOM state.
  - Applied `Cache-Control: private, no-store, no-cache, must-revalidate` to prevent CDN or shared proxy caching of sensitive user identity.
  - Added multi-tab session synchronization via `BroadcastChannel` (`LOGIN`, `LOGOUT`, `SESSION_REPLACED`).
  - Added in-flight request cancellation via `AbortController` on session replacement and logout.
  - Implemented accessible tabbed `AuthModal` dialog component with ARIA attributes and keyboard navigation.
  - Enforced protected destination gating on `/journal` preserving target navigation.
- **Android OS-Backed Secure Storage & Provider Adapter (`apps/mobile`):**
  - Implemented `SecureStorageAdapter` backed by `expo-secure-store` (Android KeyStore) for session secret persistence.
  - Created `MobileProviderAuthAdapter` replacing synthetic dummy adapter in standard runtime.
  - Implemented anti-replay and anti-injection deep link callback verification requiring valid nonces and allowlisted schemes (`daynori://`).
  - Added cold start and process restart session restoration from OS secure storage.
  - Implemented `DraftQuarantineManager`: uncommitted drafts are quarantined by account ID on logout, strictly preventing cross-tenant leakage.
  - Preserved pending protected navigation upon authentication.
- **Shared Contracts (`packages/contracts`):**
  - Added Zod schemas for sign-in, sign-up, recovery, session, callbacks, quarantined drafts in `packages/contracts/src/auth.ts`.
  - Added open redirect defense helper `validateAuthRedirectUrl` and CSRF helpers (`generateCsrfToken`, `verifyCsrfToken`).
- **Phase Reports & Roadmaps:**
  - Created [Phase 09 Report](docs/phase-reports/phase-09.md) documenting delivered journeys, acceptance evidence, and exact remaining gates (real Supabase Auth container daemon on host and physical Android TalkBack hardware verification).
  - Updated `docs/roadmap/progress.json` reflecting provisional Phase 09 development under authorized waiver.

## Phase 08 & 07 Defect Repairs & Security Hardening — 2026-10-14

- **Phase 07 Storage Policies & Identity Context Repair:**
  - Implemented executable, versioned private-storage RLS policies for `storage.objects` and `storage.buckets` in `infra/supabase/policies/storage.sql` and migration `00007_storage_policies_and_context.sql`.
  - Updated identity resolution `app.current_user_id()` to resolve `COALESCE(app.current_user_id, request.jwt.claim.sub, auth.uid())` without requiring custom transaction variables.
  - Added `app.storage_extract_workspace_id(name)` rejecting path traversal (`..` and leading `/`) and malformed object names.
  - Verified 28 security tests in `tests/security/tenant-isolation.test.ts` (bucket privacy, cross-workspace path rejection, path traversal rejection, malformed name rejection).
- **Phase 08 Service Foundation & JWT Hardening:**
  - Tightened JWT verifier (`apps/api/src/auth/jwt.ts`): rejected ID tokens (`token_use !== 'access'`), rejected anonymous sessions (`is_anonymous: true`), enforced mandatory `role === 'authenticated'` without defaulting, rejected forbidden roles (`anon`, `service_role`, `supabase_admin`), enforced UUID `sub` format and `exp` claims.
  - Added support for HS256 symmetric secret verification with explicit allowlist matching.
  - Bounded and sanitized incoming `x-request-id` headers (max 64 characters, `^[a-zA-Z0-9_-]{1,64}$`), replacing unsuitable or oversized values with random UUIDs.
  - Hardened logging and error handlers: redacted unhandled error messages, stack traces, and database connection strings in `SafeLogger`.
  - Fixed boundary error contracts: malformed JSON returns consistent 400 `VALIDATION_FAILED`; response-schema failures treated as 500 server errors via `ResponseValidationError`.
  - Bound keyset pagination cursors to workspace and filter context (`kind`), with max length 256 characters.
  - Generated OpenAPI 3.0 specification dynamically from canonical shared Zod schemas (`packages/contracts/src/api/openapi.ts`) and added drift check tests.
  - Enforced 2s connection timeout probe in readiness route (`/v1/ready`) and made server startup fail fast when authentication is unconfigured in standard mode.
  - Expanded `apps/api/src/api.test.ts` to 38 passing tests (193 tests total across monorepo).

## Phase 08 — API contracts and service foundation — 2026-10-14

- Implemented versioned Fastify HTTP REST API service in `apps/api` following `/v1` conventions (`/v1/health`, `/v1/ready`, `/v1/openapi.json`, `/v1/workspaces`, `/v1/workspaces/:workspaceId/members`, `/v1/workspaces/:workspaceId/items`).
- Defined canonical shared contracts in `packages/contracts/src/api/` (`common.ts`, `health.ts`, `workspace.ts`, `membership.ts`, `item.ts`) with strict mutation validation rejecting unknown fields and standardized error envelopes.
- Built maintained-library JWT verification via `jose` in `apps/api/src/auth/jwt.ts`: RS256/EdDSA algorithm allowlists, claims validation (`iss`, `aud`, `exp`, `nbf`, `sub`), JWKS key rotation, and strict rejection of administrative/service/anonymous credentials as user sessions.
- Enforced multi-tenant authorization: derived actor identity strictly from verified token claims; enforced workspace membership checks; bound requests to transaction-local PostgreSQL tenant contexts (`withTenantContext` and `withUserContext`).
- Implemented consistent HTTP 404 responses for unauthorized workspaces and nonexistent objects, preventing private workspace ID enumeration.
- Built keyset pagination with stable ordering `(created_at, id)` and opaque base64url cursor encoding.
- Added process-local in-memory sliding-window rate limiter with `Retry-After` header and actor/IP budgeting.
- Implemented safe structured logging with recursive credential and token redaction.
- Built fully typed client in `packages/api-client` with Zod response parsing, `AbortSignal` cancellation support, typed error hierarchy, and keyset pagination async generator (`paginateItems`).
- Documented decisions in [ADR-0014: Authenticated API service, contracts, and tenant-scoped authorization](docs/decisions/0014-authenticated-api-service-and-contracts.md).
- Verified 26 tests in `apps/api/src/api.test.ts` and 8 tests in `packages/api-client/src/client.test.ts` (175 tests passing across monorepo).

## Phase 07 — PostgreSQL and tenant isolation foundation (Security Repairs & Foundation) — 2026-10-14

- Established PostgreSQL schema migrations (`infra/supabase/migrations/` 00001 through 00006) defining tenant tables: `profiles`, `workspaces`, `workspace_memberships`, `items`, `audit_events`, and `storage_objects`.
- Repaired membership privilege escalation in `memberships_insert` policy (migration 00003 & 00006): restricted initial owner bootstrap exclusively to legitimate workspace creators on unpopulated workspaces, strictly rejecting unauthorized self-enrollment into existing workspaces.
- Replaced broad schema grants: revoked administrative table access (including `app.schema_migrations`) from `daynori_runtime` role; granted explicit least-privilege permissions only to tenant application tables.
- Corrected composite folder deletion constraint: implemented `ON DELETE SET NULL (folder_id)` preserving non-null `workspace_id` tenant key.
- Hardened connection pooling in `apps/api/src/db/client.ts`: transaction rollbacks and cleanup failures actively discard/destroy the pooled client (`client.release(true)`) to prevent poisoned connection reuse.
- Added migration advisory locking (`pg_advisory_lock`) in `infra/supabase/migrator.ts` to serialize concurrent migration runs safely.
- Removed hardcoded credentials from codebase; integrated `.env` environment loading with `.env.example`; rotated local development runtime role secret.
- Documented declarative Supabase storage bucket policies in `infra/supabase/policies/storage.sql` and `infra/supabase/policies/README.md` (recording local binary storage service enforcement as an acceptance gap until Phase 10+).
- Verified 22 integration tests in `tests/security/tenant-isolation.test.ts` against real local PostgreSQL 17 instance (`daynori_test`), verifying empty dedicated database reproduction from zero, rollback recovery, and tenant isolation.
- Updated [ADR-0013: PostgreSQL tenant isolation, row-level security, and migration foundations](docs/decisions/0013-postgresql-tenant-isolation-and-rls.md).

## Phase 05 and Phase 06 navigation corrections — 2026-10-14

- **Phase 05 (Web Navigation Repairs):**
  - Added user-accessible Character Key Shortcut toggles (`shortcutsEnabled`) in `ShellContext.tsx` and Settings Section 5 (`/settings`) conforming to WCAG 2.1.4 (Character Key Shortcuts), allowing users to disable single-character shortcuts while preserving `Escape`.
  - Added automated browser CDP tests in `scripts/test-web-e2e.mjs` verifying single-character key suppression and re-enabling across 32 headless Edge checks.
  - Corrected handoff documentation in `docs/phase-reports/phase-05.md` clarifying product persistence belongs to Phase 10+ and Phase 07 delivers PostgreSQL tenant isolation foundation.
- **Phase 06 (Android Navigation Repairs):**
  - Rewrote `scripts/test-android-e2e.mjs` to separate preflight from on-device E2E; runner reports missing hardware/emulator as `BLOCKED_MISSING_PREREQUISITE` and exits non-zero (exit code 1) instead of substituting unit tests.
  - Created lightweight hook-supporting mounted component evaluator in `apps/mobile/src/test-render.ts` to execute interactive mounted component tests across `TodayView`, `PlanView`, `LibraryView`, `JournalView`, `SettingsView`, and `CreateSheet` without adding conflicting external dependencies.
  - Hardened deep link authentication in `apps/mobile/App.tsx`: eliminated synthetic login calls on external `auth` deep links; provider authentication remains deferred to Phase 09.
  - Enforced strict scheme whitelist (`daynori://`, `https://app.daynori.com`), bounded identifiers, strict positive integer timestamps, and error token redaction in `packages/contracts/src/routing.ts`.
  - Configured actual Expo scheme `daynori` and Android intent filters for custom scheme and app links in `apps/mobile/app.json` and `AndroidManifest.xml`.
  - Restricted synthetic login controls in `SettingsView.tsx` to an explicit development review mode (`devReviewMode`), defaulting runtime strictly to unauthenticated.
  - Resolved Windows MAX_PATH (>260 chars) Ninja build failure in `apps/mobile/android/build.gradle` for `expo-modules-core` and verified fresh debug APK compilation (128.4 MB).

- Implemented native bottom navigation bar in `@daynori/ui-mobile/MobileNavigationBar` with four labeled parent destinations: Today, Plan, Library, and Journal, maintaining >= 48dp touch targets.
- Built Plan segmented sub-views for Tasks, Routines, and Calendar (Calendar projection under Plan).
- Built Library view with canonical folder breadcrumb (`Workspace > Software`), module filter chips (All Items, Notes, Knowledge, Files), and folder action buttons.
- Integrated protected destination gating for Journal via `MobileAuthAdapter` (defaults strictly unauthenticated; unauthenticated access renders an authentication requirement screen and queues pending destination).
- Added consistent top `MobileHeader` with contextual titles, Search action, Create action, and Settings/Help action.
- Built accessible Search modal sheet and Create quick-capture sheet with input draft preservation across shell navigation.
- Added Settings destination with Light/Dark theme toggle, 100%–200% font scaling, OS reduced motion status indicator, Bangla (বাংলা) script readability preview with 1.6 line-height, and link to preserved Phase 04 Component Gallery.
- Implemented Android hardware Back button handling (`BackHandler`): dismisses open sheets, returns from child views to parent tab, returns to Today from other tabs, and exits cleanly from Today.
- Implemented `AppState` lifecycle handling to preserve navigation state and uncommitted drafts across background and resume transitions.
- Defined typed route contracts in `@daynori/contracts` (`NotificationPayloadSchema`, `FilePayloadSchema`, `AuthPayloadSchema`) with strict safe identifier validation rejecting path traversal and SQL injections.
- Implemented cold-start and warm-start deep-link handling with 5-second idempotent deduplication.
- Replaced `test:e2e:android` placeholder in `package.json` with real runner in `scripts/test-android-e2e.mjs`.
- Compiled fresh Android development APK (`app-debug.apk`, 128.4 MB) via Gradle `assembleDebug`.
- Retained Phase 06 status as `blocked` in `docs/roadmap/progress.json` pending physical Android TalkBack hardware verification.

## Phase 04 corrective revision — 2026-10-14 (Findings F03–F10 Remediation)

- Added semantic action danger tokens (`danger`, `dangerHover`, `dangerLabel`) in `packages/design-tokens` for light theme (`#B3261E`/`#FFFFFF`, 6.54:1) and dark theme (`#F2B8B5`/`#381615`, 9.51:1); wired `Button` and `MobileButton` to consume them, resolving F03.
- Updated `ListRow` and `MobileListRow` selected metadata color to `palette.text.secondary`, achieving 5.37:1 contrast on light subtle surface and 7.24:1 on dark subtle surface, resolving F04.
- Corrected web `ListRow` ARIA semantics from invalid `aria-selected` to `role="button"` with `aria-pressed={selected}`; verified keyboard Enter/Space activation and toggle state exposure, resolving F05.
- Hardened `TextField` description references in `packages/ui-web` to reference only rendered elements (`errorMessage ? errorId : helperText ? helperId : null`) while preserving caller-provided `aria-describedby` IDs; added unit tests for error recovery and description merging, resolving F06.
- Fixed narrow-screen text clipping and enabled font scaling up to 200%: enabled text wrapping (`overflowWrap: 'anywhere'`) on list rows, wrapped the contrast table in an accessible horizontally scrollable container (`role="region"`), and added `--daynori-text-scale` CSS variable for real font scaling; verified reflow at 320px viewport with zero document horizontal overflow, resolving F07.
- Enlarged `MobileModalSheet` close button touch target to 48dp minimum (`touchTargets.mobileMin: 48`); added `ScrollView` and `KeyboardAvoidingView` to support safe-area, enlarged content, and keyboard avoidance, resolving F08.
- Added dynamic OS reduced motion support to `MobileModalSheet` using React Native's `AccessibilityInfo.isReduceMotionEnabled()` and `reduceMotionChanged` listener, disabling slide animations when enabled, resolving F09.
- Hardened automated browser verification runner `tests/spikes/browser/run-primitives.mjs` using Chrome DevTools Protocol against headless Microsoft Edge, testing the actual mounted Next.js React application at `http://127.0.0.1:3000/review` across 11 assertions (contrast, aria-pressed, keyboard activation, description binding, dialog focus trap, 150% font scale, 320px reflow); clearly labeled `tests/spikes/browser/primitives-real.html` as a synthetic prototype harness, resolving F10.
- Reconciled Phase 04 verification status: retained `in_progress` in `docs/phase-reports/phase-04.md` and `docs/roadmap/progress.json` pending physical Android TalkBack hardware verification.

## Phase 01 corrective revision — 2026-10-14 (Finding F01 Remediation)

- Resolved Expo CLI / `tar@7.5.22` default export incompatibility by adding `patches/tar@7.5.22.patch` via `pnpm.patchedDependencies`, exporting `default = exports` on CommonJS output while preserving tar security patches.
- Hardened `apps/mobile/package.json` `prebuild` script to assert `android/build.gradle` generation and fail closed on generation errors.
- Verified native Android project generation from clean state and compiled development APK (`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`, 128.4 MB) via `.\gradlew.bat assembleDebug`.

## Phase 02 corrective revision — 2026-10-14 (Finding F02 Remediation)

- Investigated upstream releases on npm for `node-forge` (`1.4.0`) and `braces` (`3.0.3`); confirmed no newer/patched releases exist (`patchedVersions: "<0.0.0"`).
- Maintained strict fail-closed enforcement of `scripts/audit-dependencies.mjs` without inventing human approvals or self-authorizing exceptions.
- Documented exact dependency tree, blocker assessment, and human owner approval requirements in `docs/security/pending-exception-proposals.md` and `docs/phase-reports/phase-02.md`.

## Phase 03 corrective revision — 2026-10-14 (Finding F10 Part 1 Remediation)

- Corrected IndexedDB error capture in `tests/spikes/browser/indexeddb-real.html` to record `ConstraintError` on duplicate key addition.
- Hardened `tests/spikes/browser/run-edge.mjs` with self-contained server lifecycle, cross-browser discovery, and strict assertions on `window.__results` that fail closed on missing outcomes, timeouts, or experiment errors.
- Verified all three stages (`?run=write`, `?run=verify`, `?run=all`) against headless Microsoft Edge 155 with exit code 0.

## Phase 05 — 2026-10-14 (Provisional web shell implementation)

- Built the responsive web navigation shell in `apps/web` and `packages/ui-web` matching the information architecture in `docs/design/information-architecture.md`.
- Implemented desktop sidebar navigation (&ge; 1024px), tablet transitions (768px–1023px), and compact mobile bottom navigation (< 768px down to 320px width) with zero horizontal overflow/clipping.
- Built parent routes: Today (`/today` and `/`), Plan (`/plan`), Calendar under Plan (`/plan/calendar`), Library (`/library`), and Journal (`/journal`).
- Provided consistently reachable global controls: Search modal with shortcut `/`, Create item modal with shortcut `c`, Theme toggle (Light/Dark), Help & Shortcuts modal with shortcut `?`, and Workspace Profile modal.
- Added Settings page (`/settings`) supporting theme mode switching, text scaling (100% to 200%), Right-to-Left (RTL) reading direction, and Bengali (বাংলা) font rendering and readability preview with 1.6 line-height.
- Added Help page (`/help`) with accessible keyboard shortcuts reference and landmark structure guide.
- Added accessible 404 page in `apps/web/src/app/not-found.tsx`.
- Preserved Phase 04 component review gallery at `/review`.
- Implemented accessible primitives in `packages/ui-web`: `EmptyState`, `SkipLink`, and `RouteAnnouncer` (with `aria-live="polite"` route change announcements).
- Replaced the root `test:e2e:web` echo placeholder in `package.json` with a real automated browser test script (`scripts/test-web-e2e.mjs`) executing 30 interactive checks in Microsoft Edge via Chrome DevTools Protocol (CDP).
- Tracked Phase 05 status as `blocked` in `docs/roadmap/progress.json` and recorded the provisional implementation in `docs/phase-reports/phase-05.md` pending prerequisite Phase 04 physical Android TalkBack hardware verification.

## Phase 04 — 2026-10-14

- Encoded semantic design tokens in `packages/design-tokens` for light and dark themes (warm paper, dark ink, deep teal, soft amber), spacing, radii, touch targets, focus treatments, motion, and specialized Bangla line-height (`1.6`).
- Implemented WCAG 2.2 relative luminance and contrast ratio calculation utilities and verified all core color pairs meet Level AA requirements (including ink on paper 13.44:1, dark primary on dark surface 14.05:1, and essential UI borders >= 3.0:1).
- Implemented accessible browser UI primitives in `packages/ui-web`: `Button`, `TextField`, `Dialog`, `Feedback`, `ListRow`, `Card` with focus trapping, Escape key closing, and touch targets >= 44px.
- Implemented native mobile UI primitives in `packages/ui-mobile`: `MobileButton`, `MobileTextField`, `MobileModalSheet`, `MobileFeedback`, `MobileListRow`, `MobileCard`, and `theme` with 48dp minimum touch targets.
- Created interactive component review surface in `apps/web/src/app/page.tsx` supporting light/dark theme switching, RTL layout, font scaling, error toggling, dialog focus management, and Bangla script readability.
- Created mobile component gallery in `apps/mobile/App.tsx` displaying all primitives and states.
- Recorded physical Android device TalkBack testing as a remaining hardware gate in `docs/phase-reports/phase-04.md`.

## Phase 03 corrective revision, 2026-10-14

- Relabeled `tests/spikes/` suites as synthetic contract/model tests (`storage-model.synthetic.test.ts`, `native-capabilities-model.synthetic.test.ts`, `platform-policy-model.synthetic.test.ts`) that test contract shapes in-memory rather than actual native hardware or browser storage.
- Added real browser IndexedDB experiment (`tests/spikes/browser/`) and executed via automated Chrome DevTools Protocol against Microsoft Edge 155; observed and recorded transaction rollback on abort, duplicate key constraint failure, schema migration v1->v2 with index creation and data retention, upgrade error rollback, and storage estimate/eviction flags.
- Rechecked primary vendor sources (2026-10-14): removed unsupported 15-minute alarm delivery guarantee in favor of Android 12+ >=10 minute clipping and Doze best-effort delivery; clarified SecureStore adapter 2KB quota vs lack of universal JS limit in Expo; removed fixed CASA dollar figures for Google Drive restricted scopes; and clarified that Node crypto tests do not constitute cryptographic vault approval.
- Updated ADRs 0009 through 0012, `tests/spikes/README.md`, `docs/research/sources.md`, and `docs/phase-reports/phase-03.md`.

## Phase 01-02 corrective revision, 2026-10-14

- Moved the runtime baseline to Node 24.21.0 (Active LTS) and upgraded Next.js to 15.5.x and Vitest to 4.1.x; added overrides for `tar`, `@xmldom/xmldom`, `image-size` and `postcss`.
- Rewrote the dependency audit gate: it now rejects process failures, signals and malformed reports, and matches exceptions by advisory, installed version and dependency path. Removed 40 unapproved exceptions. Two advisories without a patched release remain, so `pnpm audit:deps` fails until the owner approves exceptions (`docs/security/pending-exception-proposals.md`).
- Tests now run the real audit implementation and CLI.

## Phase 03 — 2026-10-13

- Executed platform and integration feasibility spikes under `tests/spikes/`:
  - Validated SQLite vs IndexedDB storage adapters, atomic rollbacks, schema migrations, quota management, and auth session persistence (`sqlite-indexeddb-spike.test.ts`).
  - Evaluated native hardware capabilities: notification channel importance, in-app notification center fallback, SecureStore 2KB size constraints, biometric presence vs vault key separation, 5-minute AAC audio recording limits, and authenticated AES-256-GCM cryptography (`expo-capabilities-spike.test.ts`).
  - Validated platform constraints: Android exact alarm policies (rejecting restricted `USE_EXACT_ALARM`), Web Push requirements, Google Drive least-privilege `drive.file` scope, server-side Google Play Developer API and StoreKit receipt verification, and iOS platform parity (`platform-constraints-spike.test.ts`).
- Created Architecture Decision Records ADR-0009 through ADR-0012 in `docs/decisions/`.
- Updated `docs/roadmap/progress.json` setting Phase 03 to complete and identifying Phase 04 as next eligible phase.

## Phase 02 — 2026-10-13

- Added GitHub Actions continuous integration workflows (`.github/workflows/ci.yml`, `.github/workflows/security.yml`) with minimal token permissions (`contents: read`).
- Created repository secret scanner (`scripts/scan-secrets.mjs`) with output redaction and dependency vulnerability audit wrapper (`scripts/audit-dependencies.mjs`) with granular `.security-exceptions.json` registry enforcing specific advisory GHSAs, expiration, and accountability.
- Added comprehensive synthetic test suite (`tests/security/scanner-synthetic.test.ts`) covering secret detection/redaction, unapproved advisory rejection, unrelated advisories in excepted packages, expired exceptions, and registry service errors.
- Established pull request template (`.github/pull_request_template.md`) and issue templates (`bug_report.md`, `phase_proposal.md`, `config.yml`).
- Documented branch protection rules and protected deployment environment policies in `docs/engineering/contributor-automation.md`.
- Added root `audit`, `audit:deps`, and `audit:secrets` scripts.

## Phase 01 — 2026-10-13

- Configured pnpm monorepo workspace manifests, pinned dependencies, Node LTS configuration, and strict TypeScript rules.
- Replaced reserved directory placeholders with minimal runnable workspaces: `apps/api`, `apps/worker`, `apps/web`, `apps/mobile`, and shared packages (`packages/*`).
- Added Fastify health and smoke endpoints, Next.js web application shell, Expo mobile entrypoint with Metro monorepo resolver, and typed API client.
- Implemented root verification scripts: `build`, `typecheck`, `test`, `test:contract`, `test:integration`, `test:security`, `test:performance`, `lint`, and `format:check`.
- Established verified development startup (`pnpm dev:web`, `pnpm dev:api`, `pnpm dev:worker`, `pnpm dev:mobile`), pinned Node LTS `20.18.3`, and compiled native Expo Android development build APK (`app-debug.apk`) using `expo-dev-client`.

## Phase 00 — 2026-10-13

- Defined the personal organizer product, feature boundaries, provisional brand, and design direction.
- Specified web/mobile architecture, domain model, offline synchronization, integrations, and privacy boundaries.
- Established a granular roadmap, individual phase plans, quality gates, reports, contributor handoff, and repository layout.
- Added executable planning validation. Application implementation starts in Phase 01.
