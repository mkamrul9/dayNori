# Phase 18: Upcoming task domain and deadlines

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [18 — Upcoming task domain and deadlines](../roadmap/phases/18-upcoming-task-domain-and-deadlines.md)
- **Status:** `blocked` (Provisional task domain, explicit deadline semantics, subtask hierarchy, PostgreSQL schema, sync dispatcher, and Web IndexedDB / Mobile SQLite local adapters delivered under owner authorization and verified across Vitest and integration test suites; completion blocked pending prerequisite Phase 04–06 and Phase 11 physical Android TalkBack hardware and KeyStore release gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-16.
- **Base Git revision and branch:** `ed5a93d` on `main`.
- **Prerequisites:**
  - [Phase 15 — Folder browsing and organization interfaces](phase-15.md): Canonical workspace hierarchy, typed folder metadata, depth limits, and cycle prevention.
  - Prerequisite repairs committed in `ed5a93d`: Inline run preservation without text node destruction, reliable autosave serialization and generation tracking, explicit `folderId = null` Inbox moves, conflict recovery banner preservation, and mobile folder picker wiring.
- **Included scope:**
  - **Task Domain Model & Validation (`packages/domain/src/tasks.ts`, `packages/contracts/src/api/task.ts`):**
    - Canonical task entity with validated title, optional details, priority (`low`, `normal`, `high`, `urgent`, defaulting to `normal`), status (`todo`, `in_progress`, `completed`, `cancelled`), and folder/Inbox placement.
    - One-off work model: task completion does not create recurring tomorrow tasks or reset at midnight; daily routines remain a strictly separate domain.
    - Explicit deadline representation: `none`, `date` (validated Gregorian calendar date string `YYYY-MM-DD` with leap year verification), and `timed` (authoritative ISO 8601 instant with explicit IANA timezone).
    - Timezone-safe date math: `isTaskOverdue` evaluates date-only deadlines against 23:59:59.999 in the specified viewing timezone and timed deadlines against the exact UTC instant; `isTaskDueToday` correctly scopes to the viewing timezone's calendar day.
    - Deterministic upcoming comparison (`compareTasksUpcoming`) sorting by deadline presence, deadline instant/date, priority weight (`urgent` > `high` > `normal` > `low`), creation time, and stable ID.
    - Idempotent task completion (`completeTask`) and reopening (`reopenTask`) retaining full transition history while avoiding duplicate entries on retry.
    - Transactional subtask hierarchy validation (`validateSubtaskHierarchy`) enforcing bounded depth (maximum 3 levels), same authorized workspace, and cycle prevention (`NO_SELF_PARENT`, `SUBTASK_CYCLE_DETECTED`).
    - Reconciled existing `todo` item aliases with `task` canonical representation (`canonicalItemType("todo") === "task"`).
  - **PostgreSQL Persistence & Tenant Isolation (`infra/supabase/migrations/00015_tasks_domain_and_deadlines.sql`):**
    - Created `app.tasks` table with composite foreign key `(workspace_id, id) REFERENCES app.items(workspace_id, id) ON DELETE CASCADE` and self-referencing `parent_task_id`.
    - Added database check constraints on status, priority, and deadline types.
    - Added targeted indexes on status, priority, due date, parent task ID, and workspace isolation.
    - Configured strict Row-Level Security policies (`p_tasks_select`, `p_tasks_insert`, `p_tasks_update`, `p_tasks_delete`) scoped to authorized workspace membership.
  - **Fastify API Routes & Services (`apps/api/src/modules/tasks/`, `apps/api/src/routes/v1/tasks.ts`):**
    - Added task REST endpoints under `/v1/workspaces/:workspaceId/tasks`:
      - `POST /` (create task with subtask hierarchy and folder verification)
      - `GET /` (list tasks with filtering by folderId, status, priority, overdue status, search, and stable pagination)
      - `GET /:id` (task detail)
      - `PATCH /:id` (update task with optimistic concurrency revision checks)
      - `POST /:id/complete` (idempotent complete with history recording)
      - `POST /:id/reopen` (idempotent reopen with history recording)
      - `POST /:id/trash` (soft-delete task envelope and item header)
      - `POST /:id/restore` (restore task from trash)
    - Emitted monotonic change records into `app.changes` and outbox intents into `app.outbox_intents` atomically within database transactions.
    - Added durable idempotency key caching via `x-operation-id` / `Idempotency-Key` headers.
  - **Client & Sync Engine Integration (`packages/api-client`, `packages/sync`, `apps/api/src/modules/sync/service.ts`):**
    - Extended `DaynoriApiClient` with task CRUD, completion, and reopening methods.
    - Defined `TaskRecord` interface in `@daynori/sync` models and ports.
    - Added unified task sync command dispatcher in `SyncService.dispatchCommand` for `createTask`, `updateTask`, `trashTask`, `restoreTask`, `completeTask`, and `reopenTask`.
    - Integrated task projections into client `SyncEngine` for offline writes, pull integration, and conflict recovery.
  - **Local Persistence Adapters (`apps/web`, `apps/mobile`):**
    - Extended Web `IndexedDbLocalRepository` to schema version 4 with dedicated `tasks` object store and index on `[workspaceId+status]`.
    - Extended Mobile `SqliteLocalRepository` to migration version 5 with dedicated `tasks` table, indexing, and transactional operations.
  - **Testing & Verification:**
    - `packages/domain/src/domain.test.ts`: Added 23 unit tests verifying title validation, Gregorian calendar validation, leap years, IANA timezones, overdue boundaries across zones, today boundaries, upcoming sorting, idempotent completion/reopening history, subtask cycle detection, and subtask depth limits.
    - `tests/integration/phase18-tasks-deadlines.test.ts`: Added 14 integration tests verifying task CRUD against live PostgreSQL and Fastify API, Asia/Dhaka deadlines viewed from America/New_York, date-only and timed overdue boundaries, subtask cycle rejection, completion retries, revision preconditions, sync push/pull integration, and cross-workspace isolation.
    - `apps/mobile/src/data/sqliteRepository.test.ts`: Updated to verify SQLite migration version 5 and task repository operations.
- **Excluded/deferred scope:**
  - Task list, detail, and upcoming UI views belong to Phase 19 (no UI screens implemented in this phase).
  - Audio capture, voice notes, and transcription belong to a separately scheduled phase (do not implement recording or audio permissions).
  - Physical Android TalkBack and hardware KeyStore release gates remain blocked pending physical device availability.

## Result

Delivered the complete Phase 18 task domain, explicit deadline semantics, subtask hierarchy, and persistence layer across `packages/domain`, `packages/contracts`, `apps/api`, `packages/api-client`, `packages/sync`, `apps/web`, and `apps/mobile`:

1. **One-Off Task Work Model**: Tasks represent discreet units of work with validated titles, optional details, explicit priority, status, and folder placement. Tasks do not recur or reset automatically; daily routines remain separate.
2. **Explicit Deadline Semantics**:
   - `none`: Undated task, sorted after dated tasks in upcoming lists.
   - `date`: Validated calendar date (`YYYY-MM-DD`). Leap days (e.g. Feb 29 in leap vs non-leap years) and month day limits are strictly verified. Overdue transition occurs at 23:59:59.999 in the viewing timezone.
   - `timed`: Authoritative UTC instant with explicit selected IANA timezone. Evaluated against exact clock instant.
3. **Timezone Independence**: All overdue and today calculations accept explicit timezone parameters and injectable reference clocks, guaranteeing that server host timezone never affects client domain results.
4. **Subtask Hierarchy & Cycles**: Up to 3 levels of subtasks supported. Invariants enforce same-workspace containment, prevention of self-parenting, and rejection of cyclic reparenting.
5. **Durable Sync & Local Adapters**: Offline task creation, edits, completion, and trashing are captured in IndexedDB and SQLite repositories, synchronized via SyncEngine, and dispatched atomically on the server with monotonic change records and outbox intents.

## Acceptance evidence

| Acceptance Condition                              | Verification Method                                                                                                          | Location / Artifact                                       | Result                                                          |
| :------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------- | :-------------------------------------------------------------- |
| **Strict Title & Deadline Domain Validation**     | Vitest unit tests verifying non-empty titles, calendar dates, leap years, IANA zones, and invalid inputs                     | `packages/domain/src/domain.test.ts`                      | **PASS**: 23/23 domain tests passed.                            |
| **Cross-Timezone & Overdue Boundary Correctness** | Integration tests asserting Asia/Dhaka and America/New_York date-only and timed deadline boundaries                          | `tests/integration/phase18-tasks-deadlines.test.ts`       | **PASS**: Date-only and timed boundaries evaluated accurately.  |
| **Subtask Invariants & Cycle Detection**          | Unit & integration tests asserting self-parent rejection, cycle detection, depth <= 3, and folder inheritance                | `packages/domain/src/domain.test.ts`, `tests/integration` | **PASS**: Cycles and depth violations rejected cleanly.         |
| **Idempotent Completion & Reopening History**     | Unit & integration tests asserting unchanged initial instant and no duplicate history on completion retries                  | `packages/domain/src/domain.test.ts`, `tests/integration` | **PASS**: Original timestamp preserved; history deduplicated.   |
| **PostgreSQL Migration & RLS Tenant Isolation**   | Live PostgreSQL integration tests verifying RLS isolation, item foreign key cascades, and change feed generation             | `tests/integration/phase18-tasks-deadlines.test.ts`       | **PASS**: Unauthorized cross-workspace requests return 404/403. |
| **Sync Push/Pull & Local Repository Persistence** | Full sync round-trip test dispatching task commands through SyncService, updating change feeds, and pulling to local storage | `tests/integration/phase18-tasks-deadlines.test.ts`       | **PASS**: Task records correctly persisted and synchronized.    |
| **Mobile SQLite Repository Task Operations**      | React Native SQLite unit tests verifying schema migration version 5 and task persistence                                     | `apps/mobile/src/data/sqliteRepository.test.ts`           | **PASS**: SQLite repository tests passed cleanly.               |
| **Strict Type Checking**                          | Monorepo TypeScript verification across all 13 workspace projects                                                            | `pnpm typecheck`                                          | **PASS**: 0 type errors across all packages.                    |
| **Code Style & Formatting**                       | Monorepo Prettier and ESLint validation                                                                                      | `pnpm lint` & `pnpm format:check`                         | **PASS**: 0 lint errors, 0 warnings; all files formatted.       |
| **Secret Scanning**                               | Repository secret scanner inspecting working tree and Git objects                                                            | `node scripts/scan-secrets.mjs`                           | **PASS**: 1620 files checked, 0 secrets detected.               |
| **Planning Consistency**                          | Roadmap planning validator checking phases, requirements, and dependencies                                                   | `node scripts/validate-planning.mjs`                      | **PASS**: 64 phases and 22 requirements validated.              |

### Commands Executed

```bash
# Unit test suite (Domain, UI, SQLite, API services)
pnpm test
# Exit code: 0, 34 files passed, 430 tests passed

# Integration test suite (Live PostgreSQL, Fastify API, SyncEngine)
pnpm test:integration
# Exit code: 0, 9 files passed, 125 tests passed

# Monorepo type checking
pnpm typecheck
# Exit code: 0, 13 projects cleanly checked

# Monorepo linting
pnpm lint
# Exit code: 0, 0 errors, 0 warnings

# Formatting check
pnpm format:check
# Exit code: 0, all files formatted

# Secret scan
node scripts/scan-secrets.mjs
# Exit code: 0, 1620 files checked, 0 secrets found

# Planning validation
node scripts/validate-planning.mjs
# Exit code: 0, canonical plan is consistent
```

## Defects, limitations and recovery

- **Physical Android & TalkBack Verification (Blocked Gate):** Automated unit and mock tests verify React Native components, but verification on physical Android hardware with TalkBack screen reader remains blocked pending physical device lab access.
- **Hardware KeyStore Gate (Blocked Gate):** Hardware-backed key wrapping verification on physical Android devices remains blocked.
- **Rollback and Recovery:**
  - Non-destructive rollback: If rollback of migration `00015_tasks_domain_and_deadlines.sql` is ever required, avoid destructive `DROP TABLE`. Instead, back up `app.tasks` to an archive schema (`archive.tasks`), deprecate active triggers, and preserve all change receipts and revisions in `app.changes`.
  - Foreign key cascade `(workspace_id, id) REFERENCES app.items(workspace_id, id) ON DELETE CASCADE` guarantees that soft-deleted items preserve task payloads while hard-deleted envelopes cascade safely.
  - All task mutations emit ordered events into `app.changes` and outbox intents into `app.outbox_intents`, ensuring durable replay, conflict recovery, and draft restoration without data loss.

## Documentation and Git review

- **Updated Architecture Documentation:**
  - Published [ADR-0024: Task Domain, Explicit Deadlines, and Subtask Invariants](../decisions/0024-task-domain-and-deadlines.md).
  - Updated [ADR Index](../decisions/README.md) linking ADR-0024.
- **Roadmap & Changelog:**
  - Updated `CHANGELOG.md` with Phase 18 release notes.
  - Updated `docs/roadmap/progress.json` setting Phase 18 status to `blocked` with explicit notes on software completeness and hardware gates.
- **Git Hygiene:**
  - `git diff --check` passed with zero whitespace or line-ending errors.
  - Secret scan passed with 0 unapproved secrets across 1620 files.
  - Conventional commit subject: `feat(tasks): add prioritized tasks and explicit deadline semantics`.

## Handoff

- **Completed Deliverable:** Phase 18 task domain, contracts, database persistence, sync dispatcher, and local storage adapters with explicit deadline semantics and subtask hierarchy validation.
- **Next Phase:** [Phase 19 — Upcoming task lists and detail views](../roadmap/phases/19-upcoming-task-lists-and-detail-views.md): Task list views, upcoming grouping, task detail editor, subtask indentation, and quick completion.
- **Stop Condition:** Work on Phase 18 is complete; stop before beginning Phase 19 as instructed.
