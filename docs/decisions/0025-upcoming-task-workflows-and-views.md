# ADR-0025: Upcoming Task Workflows, Priority Views, and Multi-Platform Plan Interfaces

## Status

Accepted (Provisional upcoming task lists, priority views, detail editors, subtask management, and bulk operations delivered under owner authorization and verified across Vitest integration test journeys, Web Next.js Plan page, and Mobile React Native PlanView; physical Android TalkBack hardware and KeyStore release gates remain pending).

## Context

Phase 19 builds upon the core task domain and explicit deadline semantics established in Phase 18 to deliver production task management interfaces across Web (`apps/web`) and Mobile (`apps/mobile`).

Key requirements from [docs/product/requirements.md](../product/requirements.md) (**R-TASK**), [docs/design/information-architecture.md](../design/information-architecture.md), [docs/design/journeys.md](../design/journeys.md), and [docs/roadmap/phases/19-upcoming-task-lists-and-detail-views.md](../roadmap/phases/19-upcoming-task-lists-and-detail-views.md):

1. **Dedicated Priority Views**:
   - `Today`: Tasks due on or before today's calendar date in the viewing timezone.
   - `Upcoming`: Tasks with future deadlines ordered chronologically by due instant/date.
   - `Overdue`: Incomplete tasks past their deadline with explicit text explanations (not color alone).
   - `Completed`: Finished tasks with completion timestamps, reopening controls, and full completion audit history.
   - `Undated`: Tasks without a deadline to ensure backlog visibility.
   - `All Tasks`: Unfiltered workspace view with priority and folder selectors.
2. **Accessible Overdue & Timezone Explanations**:
   - Overdue status must be explained using visible text and relative/absolute dates (e.g. `"Overdue by 3 days (due Feb 10, 2026)"`), complying with WCAG 2.2 AA non-reliance on color alone.
   - Timezones must be displayed whenever relevant (e.g., timed deadlines displaying timezone offset or IANA zone code).
   - Ambiguous or nonexistent local times during Daylight Saving Time (DST) transitions must be explained and validated rather than silently corrupted.
3. **Subtask Hierarchy & Safety Invariants**:
   - Subtasks must nest cleanly under parents up to a maximum depth of 3 levels (`MAX_SUBTASK_DEPTH = 3`).
   - Cycles, self-parenting, and subtree depth violations must be rejected transactionally and validated in client UI forms before emission.
4. **Separation from Daily Routines**:
   - Tasks represent discrete, one-off work items with completion history. They must not reset at midnight or spawn tomorrow's instance.
   - Daily routines, recurring habits, audio check-ins, notifications, and review flows remain strictly separated (Phase 20+).
5. **Confirmable Bulk Operations**:
   - Bulk actions (complete, delete/trash, move folder) must operate on explicit, verified arrays of task IDs.
   - Bulk actions must require confirmation showing exact counts and affect only visible reviewed selections, preventing accidental mutation of off-screen tasks.
6. **Reversible Actions**:
   - Task completion provides an accessible undo toast allowing instant status restoration and recording the reopening transition.
7. **Prerequisite Correctness Repairs**:
   - Prior to Phase 19 interface development, all Phase 18 backend and sync defects were repaired and verified in commit `41061fc` (SQL parameterization of `userTimezone`, enclosed Today `OR` predicate, deterministic query ordering before `LIMIT`, bound continuation cursors, timezone consistency in sort keys, subtree depth enforcement, concurrency locking on task mutations, durable idempotency replay, and local projection preservation in sync).

## Decision

### 1. Pure Domain Logic & Timezone Helpers (`@daynori/domain`)

- Implemented `formatTaskDeadlineExplanation(deadline, userTimezone, referenceDate)` in `packages/domain/src/tasks.ts`:
  - Returns structured explanation `{ label, isOverdue, overdueText, timezoneNote }`.
  - For timed deadlines: Formats localized date and time, detects whether past due, and produces human-readable overdue duration with explicit date reference.
  - For date deadlines: Evaluates against viewing timezone calendar day, producing clear textual flags such as `"Overdue by 1 day (due yesterday)"`.
- Implemented `checkLocalTimeDisambiguation(dateStr, timeStr, timezone)`:
  - Formats forward and reverse timezone projections to detect nonexistent "spring forward" gaps and ambiguous "fall back" overlap hours during DST transitions.

### 2. Accessible Web Components (`packages/ui-web`)

- **`TaskRow` (`packages/ui-web/src/TaskRow.tsx`)**:
  - Accessible task row with custom completion checkbox (`role="checkbox"`, `aria-checked`), title, priority pill badges with high contrast, explicit text overdue warnings (`role="status"`), folder badge, tag chips, and subtask count indicators.
  - Includes a bulk selection checkbox with unique IDs for batching.
  - Supports keyboard navigation (Space/Enter to toggle complete or open editor).
- **`TaskDetailEditor` (`packages/ui-web/src/TaskDetailEditor.tsx`)**:
  - Accessible modal dialog (`role="dialog"`, `aria-modal="true"`) for creating or editing tasks.
  - Fields: title (with auto-focus and 255-char limit), detailed notes, priority selector, status selector, folder dropdown, tag management, and deadline picker.
  - Deadline picker distinguishes `none`, `date` (calendar date with leap year validation), and `timed` (with time picker, IANA timezone selector, and DST disambiguation warnings).
  - Subtask manager allows creating, completing, and reordering subtasks with depth validation (`MAX_SUBTASK_DEPTH = 3`).

### 3. Production Web Plan Page (`apps/web/src/app/plan/page.tsx`)

- Connected directly to `IndexedDbLocalRepository`, `useAuth()`, and `SyncEngine`.
- Features:
  - Real-time online/offline network listeners and local save status indicators.
  - Timezone selector allowing users to preview task deadlines in different IANA timezones (e.g. `Asia/Dhaka`, `America/New_York`, `UTC`).
  - Quick capture input with deadline presets (`Today`, `Tomorrow`, `No date`).
  - Filter tabs for `Today`, `Upcoming`, `Overdue`, `Completed`, `Undated`, and `All Tasks`.
  - Priority and folder filters, with sort options (`Deadline`, `Priority`, `Creation Date`) and direction toggling.
  - Bulk action toolbar with selection count, "Select all visible", and confirmation modal showing the exact count of affected tasks.
  - Floating undo toast for 5 seconds following task completion.
  - Screen reader announcements via dynamic `aria-live="polite"` region.

### 4. Production Mobile Plan View (`apps/mobile/src/views/PlanView.tsx`)

- Connected directly to `LocalRepositoryPort` and `SyncEngine` while preserving routines and calendar subviews.
- Features:
  - Quick capture input bar with quick deadline preset buttons.
  - View filter pills for switching between Today, Upcoming, Overdue, Completed, and All.
  - FlatList rendering of tasks with priority badges, overdue explanation text, folder indicators, and subtask counters.
  - Modal bottom sheet (`MobileModalSheet`) for task detail editing, subtasks, and deadline selection.
  - Reversible completion with bottom undo banner.
  - Offline mutation queueing with background sync integration.

### 5. Multi-Platform Synchronization Engine (`packages/sync`)

- `SyncEngine`:
  - Added topological dependency inference for task commands (`createTask`, `completeTask`, `updateTask`, `trashTask`).
  - Preserves local task projections during tombstone metadata sync and tag reconciliation.
  - Exposes `synchronize()` method and handles tab coordination gracefully.

## Consequences & Verification

- **Prerequisite Defects Repaired**: Verified via `tests/integration/phase18-prerequisite-repairs.test.ts` (all 8 tests passing, committed in `41061fc`).
- **Comprehensive Phase 19 Test Suite**: Verified via `tests/integration/phase19-tasks-workflows.test.ts` (8 comprehensive multi-actor journeys):
  1. Full task lifecycle (create, detail edit, deadline change, completion, reopen, undo).
  2. Offline capture, local storage persistence, reconnect, and cloud synchronization.
  3. Concurrent update conflict handling with 409 conflict detection and latest revision resolution.
  4. Timezone crossing across Asia/Dhaka and America/New_York without date slippage.
  5. Leap day deadlines, DST transition disambiguation, and overdue clearing on deadline removal.
  6. Pagination safety, cursor stability, and bulk operations affecting only explicit selections.
  7. Accessible non-color overdue explanations and screen reader attributes.
  8. Multi-tenant workspace and account switching isolation.
- **Full Monorepo Integrity**:
  - `pnpm typecheck`: All 13 workspace projects cleanly typechecked.
  - `pnpm lint`: Zero ESLint errors across repository.
  - `pnpm format:check`: All files conform to Prettier formatting standards.
  - `pnpm test`: All 36 test files, 454 tests passing.
- **Pending Hardware Gates**:
  - Physical Android device execution, TalkBack screen reader gestures, and Android KeyStore hardware backing remain required release gates and are recorded as blocked without weakening requirements or claiming completion.
