# ADR-0024: Task Domain, Deadlines, Subtasks, and Multi-Platform Synchronization

## Status

Accepted (Provisional task domain, explicit deadline semantics, subtask invariants, and synchronization persistence delivered under owner authorization and verified across Vitest pure domain, PostgreSQL RLS, Web IndexedDB, and Mobile SQLite; physical Android TalkBack hardware and KeyStore release gates remain pending).

## Context

Phase 18 implements the core task domain and explicit deadline semantics, fulfilling requirement **R-TASK** in [docs/product/requirements.md](../product/requirements.md), architectural foundations in [docs/architecture/data-model.md](../architecture/data-model.md) and [docs/architecture/sync-and-offline.md](../architecture/sync-and-offline.md), and roadmap specifications in [docs/roadmap/phases/18-upcoming-task-domain-and-deadlines.md](../roadmap/phases/18-upcoming-task-domain-and-deadlines.md).

Key requirements and domain boundaries:

1. **One-Off Work vs. Daily Routines**: Tasks represent distinct, one-off units of work with priorities, optional deadlines, subtask relationships, and completion states. Completion of a task must never reset at midnight or spawn tomorrow's task. Recurring occurrences and daily habits belong strictly to the separate routine domain.
2. **Explicit Deadline Semantics**:
   - `none`: Undated task.
   - `date`: Calendar date (`YYYY-MM-DD`). Must not be converted to midnight UTC to prevent date-slipping across timezones. Evaluated against the active viewing timezone; expires at 23:59:59.999 of the local day.
   - `timed`: Authoritative ISO 8601 instant with an explicit IANA timezone identifier (e.g. `Asia/Dhaka`).
3. **Exact Overdue Invariants**:
   - Completed and cancelled tasks are never overdue.
   - Tasks without a deadline are never overdue.
   - Timed deadlines are overdue when the current instant is strictly greater than the due instant, invariant across viewing zones.
   - Date-only deadlines become overdue only when the current local calendar date in the viewing timezone is strictly greater than the deadline date.
   - Clearing a deadline immediately removes the overdue classification without altering task status.
4. **Idempotent Completion & Reopening History**:
   - Completing an already completed task preserves the original `completedAt` timestamp and does not append duplicate history.
   - Reopening records `reopenedAt`, clears `completedAt`, resets status to `todo`, and preserves full audit history.
5. **Subtask Hierarchy & Cycles**:
   - Tasks may be nested up to a maximum depth of 3 levels (`MAX_SUBTASK_DEPTH = 3`).
   - Self-parenting and cyclic ancestor relationships are transactionally rejected.
   - Subtasks must belong to the same authorized workspace as their parent.
6. **Alias Reconciliation**:
   - Reconciles existing `todo` item aliases to canonical `task` entity representations without parallel tables or duplicated records.
7. **Multi-Platform Storage & Offline Synchronization**:
   - Atomic persistence across PostgreSQL (with tenant RLS), Web IndexedDB (database version 4), and Mobile SQLite (schema version 5).
   - Sync commands (`createTask`, `updateTask`, `completeTask`, `reopenTask`, `trashTask`, `restoreTask`) integrated into the topological dependency engine.

## Decision

### 1. Contracts & Domain Rules (`@daynori/contracts` & `@daynori/domain`)

- Defined strict Zod schemas for task priorities (`low`, `normal`, `high`, `urgent`), statuses (`todo`, `in_progress`, `completed`, `cancelled`), and tagged discriminated union `TaskDeadline` (`none`, `date`, `timed`).
- Implemented pure domain algorithms in `@daynori/domain/src/tasks.ts`:
  - `validateTaskTitle`: non-empty, trimmed, Unicode/Bangla script and emoji preservation up to 255 chars.
  - `isValidCalendarDateString` & `isLeapYear`: calendar date validation enforcing real Gregorian days and leap years.
  - `isValidIanaTimezone`: validates runtime support for IANA timezone strings.
  - `isTaskOverdue` & `isTaskDueToday`: deterministic overdue and today checks accepting injectable `now` clock and explicit viewer timezone.
  - `compareTasksUpcoming`: canonical sorting (dated before undated, due instant ascending, priority descending, creation order ascending, ID tie-breaker).
  - `completeTask` & `reopenTask`: idempotent state transitions preserving `completionHistory`.
  - `validateSubtaskHierarchy`: cycle detection and depth validation using ancestor lookups.

### 2. Database Schema & Tenant RLS (`infra/supabase/migrations/00015_tasks_domain_and_deadlines.sql`)

- Created `app.tasks` table linked by composite foreign key `(workspace_id, id)` to `app.items`:
  - Stores `title`, `details`, `priority`, `status`, deadline components (`deadline_type`, `deadline_date`, `deadline_time`, `deadline_zone`), `completed_at`, `reopened_at`, `completion_history` (jsonb), `parent_id`, `subtask_order`, and `tags` (text[]).
  - Foreign key `fk_tasks_parent` enforces same-workspace parent references with `ON DELETE CASCADE`.
  - B-tree and GIN indexes support Today, Upcoming, Overdue, and full-text search queries.
  - Row Level Security policies (`p_tasks_select`, `p_tasks_insert`, `p_tasks_update`, `p_tasks_delete`) enforce strict tenant isolation via `app.user_has_workspace_role`.

### 3. API Service & Routes (`apps/api`)

- Registered REST endpoints under `/v1/workspaces/:workspaceId/tasks`:
  - `POST /`: Create task with title validation, deadline normalization, and mutation receipt generation.
  - `GET /`: List tasks with indexed filtering by `folderId`, `status`, `priority`, `parentId`, `tag`, and virtual views (`today`, `upcoming`, `overdue`, `undated`, `completed`).
  - `GET /:taskId`: Fetch single task; rejects trashed items unless explicitly querying trash.
  - `PATCH /:taskId`: Update task attributes with optimistic revision concurrency check (`baseRevision`).
  - `POST /:taskId/complete`: Idempotent completion service.
  - `POST /:taskId/reopen`: Reopen task and append to history.
  - `DELETE /:taskId`: Trash task and emit sync tombstone.
  - `POST /:taskId/restore`: Restore task from trash.

### 4. Client Transport & Sync Engine (`@daynori/api-client` & `@daynori/sync`)

- Added typed methods to `DaynoriApiClient` for task CRUD and status operations.
- Updated `SyncEngine` with `TaskRecord` mapping, schema validation, and projection integration.
- Wired unified task commands into `SyncService.dispatchCommand` for background push processing.

### 5. Local Persistence Adapters

- **IndexedDB (`apps/web/src/data/indexedDbRepository.ts`)**: Upgraded to version 4 with dedicated `tasks` store, index on `[workspaceId+status]`, and multi-store transactional sync operations (`saveItemTransaction`, `applyPullPage`, `installBootstrapGeneration`, `clearWorkspaceData`).
- **SQLite (`apps/mobile/src/data/sqliteRepository.ts`)**: Added migration 5 creating the `tasks` table with foreign key indices and complete transactional CRUD operations.

## Consequences

- Task management is cleanly decoupled from daily routines and focused note editors.
- Calendar dates do not shift when viewed across UTC day boundaries.
- Deterministic task sorting provides consistent ordering across SQL and offline clients.
- Task list and detail user interfaces are deferred to Phase 19.
- Audio recording and transcription remain deferred to their dedicated phase; no audio dependencies or permissions are introduced.
- Physical Android hardware, KeyStore encryption release gates, and TalkBack verification remain blocked pending physical device availability.
