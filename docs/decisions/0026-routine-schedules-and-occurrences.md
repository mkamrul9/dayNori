# ADR-0026: Daily Routine Schedules, Date-Scoped Occurrences, and Lifecycle Reconciliation

## Status

Accepted (Provisional daily routine schedule templates, date-scoped occurrences, PostgreSQL unique constraints, timezone-safe generation, schedule revision forward reconciliation, Fastify API routes, IndexedDB object stores, SQLite migrations, and sync models delivered under owner authorization and verified across Vitest pure domain, integration test suites, and real browser IndexedDB; physical Android TalkBack hardware and KeyStore release gates remain pending).

## Context

Phase 20 introduces daily routine schedules and date-scoped occurrences into the Daynori ecosystem ([docs/roadmap/phases/20-daily-routine-schedules-and-occurrences.md](../roadmap/phases/20-daily-routine-schedules-and-occurrences.md)), satisfying requirements from [docs/product/requirements.md](../product/requirements.md) (**R-ROUTINE**), [docs/design/information-architecture.md](../design/information-architecture.md), and [docs/architecture/data-model.md](../architecture/data-model.md).

Key architectural requirements and invariants:

1. **Separation from One-Off Tasks**:
   - Tasks ([ADR-0024](0024-task-domain-and-deadlines.md), [ADR-0025](0025-upcoming-task-workflows-and-views.md)) represent discrete, non-recurring work items with deadlines.
   - Routines represent daily and weekday practices that recur on a fixed or chosen cadence. They do not accumulate overdue days like tasks; missing a day does not create backlog debt.
2. **Occurrence Isolation ("Completing today never completes tomorrow")**:
   - Each occurrence is strictly date-scoped to a single calendar date `YYYY-MM-DD`.
   - Completing, skipping, or reopening today's occurrence mutates only that date's record and never affects future or past days.
3. **Idempotency & Uniqueness**:
   - Generation of occurrences across any date range must be idempotent.
   - Repeated calls, re-runs after staying offline, or concurrent sync requests must never generate duplicate occurrences for the same routine on the same calendar date.
4. **Timezone Pinning vs Roaming**:
   - Routines have an explicit IANA timezone (e.g., `Asia/Dhaka`, `America/New_York`, `UTC`).
   - Planned times are pinned to the routine template's explicit timezone, preventing erratic shifts when the user travels across time zones.
5. **Daylight Saving Time (DST) Disambiguation**:
   - Times during ambiguous "fall-back" overlap hours resolve deterministically to the earlier UTC instant.
   - Nonexistent times during "spring-forward" gap hours resolve to the forward-adjusted valid timestamp.
6. **Schedule Change Forward Reconciliation**:
   - Changing a routine's schedule (e.g., switching from daily to weekdays, changing time, or shifting active dates) increments `schedule_revision` and sets an `effective_date`.
   - Past occurrences before `effective_date` are strictly immutable.
   - Completed or skipped occurrences on or after `effective_date` are strictly preserved.
   - Future pending occurrences on or after `effective_date` are reconciled: cancelled if no longer scheduled, or updated with the new schedule revision and planned instant if still scheduled.
7. **Multi-Platform Local Storage & Sync**:
   - Web IndexedDB adapter (`apps/web/src/data/indexedDbRepository.ts`, `DB_VERSION = 5`) and mobile SQLite adapter (`apps/mobile/src/data/sqliteRepository.ts`, migration version 6) must persist routines and occurrences offline with transactional safety.

## Decision

### 1. Pure Domain Logic (`@daynori/domain`)

- **ISO 8601 Weekday Standard**:
  - Weekdays are numbered strictly from `1` (Monday) to `7` (Sunday), adhering to ISO 8601 (`getIsoWeekday`).
  - Arrays are validated to ensure non-empty unique integers within `[1..7]` (`validateWeekdays`).
- **Bounded Occurrence Generation (`generateOccurrencesForDateRange`)**:
  - Accepts a `RoutineTemplateRule`, calendar `startDate`, `endDate`, and an array of existing occurrences.
  - Enforces a maximum range limit (`MAX_GENERATION_RANGE_DAYS = 90`) to prevent memory exhaustion and execution timeouts.
  - Checks `isRoutineScheduledOnDate`: verifies routine is not archived, not paused, falls within `[activeFrom, activeTo]`, and matches frequency (`daily` or matching ISO `weekdays`).
  - Returns only newly planned occurrences for unscheduled dates, preserving existing records.
- **Idempotent Occurrence State Transitions**:
  - `completeOccurrence`, `skipOccurrence`, and `reopenOccurrence` perform immutable transitions.
  - Each transition appends to the `history` array with `{ fromStatus, toStatus, status, previousStatus, changedAt, transitionedAt, actorId, reason }`.
  - Re-applying the same transition is idempotent and produces no-op history churn.
- **Forward Schedule Reconciliation (`reconcileOccurrencesOnScheduleChange`)**:
  - Segregates historical (`< effectiveDate`) and resolved (`status !== 'pending'`) occurrences as strictly retained.
  - Cancels future pending occurrences that no longer match the new schedule and updates matching ones with the new schedule revision and planned instant.

### 2. Database Schema & Tenant Isolation (`infra/supabase`)

- Migration `00017_routines_and_occurrences.sql`:
  - `app.routines`: Composite primary key `(workspace_id, id)` with foreign key `(workspace_id, id) REFERENCES app.items(workspace_id, id) ON DELETE CASCADE`.
  - `app.routine_occurrences`: Composite primary key `(workspace_id, id)` with foreign key `(workspace_id, routine_id) REFERENCES app.routines(workspace_id, id) ON DELETE CASCADE`.
  - **Unique Date Constraint**: `CONSTRAINT uq_routine_occurrence_date UNIQUE (workspace_id, routine_id, scheduled_date)` guaranteeing database-level deduplication.
  - Row-Level Security (RLS) policies on both tables strictly scoped to `app.user_has_workspace_role(workspace_id, ...)`.
  - Targeted indices on `(workspace_id, scheduled_date, status)` and `(workspace_id, routine_id, scheduled_date)`.

### 3. Fastify API Routes & Sync Dispatcher (`apps/api`)

- Implemented 11 transactional endpoints under `/v1/workspaces/:workspaceId/routines`:
  - `POST /`: Create routine template.
  - `GET /`: List routine templates with folder, pause, and archive filters.
  - `GET /:routineId`: Retrieve routine template.
  - `PATCH /:routineId`: Update routine template with schedule change forward reconciliation.
  - `POST /:routineId/pause`: Pause routine.
  - `POST /:routineId/resume`: Resume routine.
  - `POST /:routineId/archive`: Archive routine.
  - `POST /generate-occurrences`: Bounded occurrence generation query (`startDate`, `endDate`, optional `routineId`). Throws `NotFoundError` if `routineId` is not in the workspace.
  - `GET /occurrences`: List occurrences in date range.
  - `POST /occurrences/:occurrenceId/complete`: Mark occurrence done with optimistic `baseRevision`.
  - `POST /occurrences/:occurrenceId/skip`: Mark occurrence skipped with optional reason.
  - `POST /occurrences/:occurrenceId/reopen`: Reopen occurrence to pending.
- Date string serialization uses `formatDateOnly` to preserve exact calendar dates (`YYYY-MM-DD`) without UTC timezone day shifts.
- Emits atomic change feed entries (`routine` and `routine_occurrence`) via `insertChange` with monotonically increasing sync sequences.

### 4. Client Storage Adapters (`apps/web`, `apps/mobile`, `@daynori/sync`)

- **Web IndexedDB (`apps/web/src/data/indexedDbRepository.ts`)**:
  - Upgraded schema to `DB_VERSION = 5`.
  - Created `routines` object store (keyPath `id`) and `routine_occurrences` object store (keyPath `id`, index `by_routine_date` on `['workspaceId', 'routineId', 'scheduledDate']`).
  - Added atomic CRUD and sync write methods: `upsertRoutine`, `getRoutine`, `listRoutines`, `upsertRoutineOccurrence`, `getRoutineOccurrence`, `listRoutineOccurrences`.
  - Updated `clearWorkspaceData` to wipe routines and occurrences cleanly.
- **Mobile SQLite (`apps/mobile/src/data/sqliteRepository.ts`)**:
  - Added schema migration 6 creating `local_routines` and `local_routine_occurrences` tables and indices.
  - Added repository methods for atomic CRUD, parameterized queries, and workspace data purging.
- **Client SDK & Models (`@daynori/api-client`, `@daynori/sync`)**:
  - Extended `DaynoriApiClient` with complete typed routine and occurrence methods.
  - Added `RoutineRecord` and `RoutineOccurrenceRecord` sync interfaces and validators in `packages/sync`.

## Alternatives Considered

1. **Modeling Occurrences as Standard Tasks**:
   - _Rejected_: Violates core domain separation. Daily routines do not represent one-off work, do not accumulate overdue backlog debt, and have fundamentally different completion lifecycles.
2. **Infinite Forward Occurrence Generation**:
   - _Rejected_: Generating occurrences years in advance creates massive database bloat and requires unbounded reconciliation on schedule changes. Bounded 90-day generation on demand provides ideal responsiveness with minimal storage footprint.
3. **Retroactive Schedule Modification**:
   - _Rejected_: Mutating past occurrences when a schedule changes invalidates historical completion and habit tracking logs. Changes must strictly apply from `effectiveDate` forward.

## Consequences & Invariants

- **Verified Invariants**:
  - Completing today's occurrence never affects tomorrow's occurrence.
  - Repeated generation with existing occurrences returns only new dates; database unique constraint prevents duplicate records.
  - Offline devices backfill missing days as date-scoped occurrences without spawning overdue tasks.
  - Schedule edits increment `scheduleRevision`, preserve past completed/skipped occurrences, and reconcile future pending occurrences forward.
  - Tenant isolation is strictly enforced across API routes, Postgres RLS, IndexedDB, and SQLite.
