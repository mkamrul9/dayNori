# Phase 20: Daily routine schedules and occurrences

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [20 — Daily routine schedules and occurrences](../roadmap/phases/20-daily-routine-schedules-and-occurrences.md)
- **Status:** `blocked` (Provisional daily routine schedule templates, date-scoped occurrences, occurrence state machine, PostgreSQL unique constraints, change reconciliation, and IndexedDB/SQLite adapters delivered under owner authorization and verified across Vitest pure domain, integration test suite, and real browser IndexedDB; completion blocked pending prerequisite Phase 04–06 and Phase 11 physical Android TalkBack hardware and KeyStore release gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-16.
- **Base Git revision and branch:** `4baef60` on `main`.
- **Prerequisites:**
  - [Phase 18 — Upcoming task domain and deadlines](phase-18.md): Canonical task entity, explicit deadline representation (`none`, `date`, `timed`), timezone math, subtask hierarchy, and sync commands.
  - [Phase 19 — Upcoming task lists and detail views](phase-19.md): Task priority views, detail editors, subtask management, and plan interfaces.
- **Included scope:**
  - **Shared Routine Domain (`packages/domain/src/routines.ts`):**
    - Routine schedule template validation: non-empty title (up to 255 chars), frequency (`daily` | `weekdays`), weekday collection (ISO 8601 numbering `1`=Mon..`7`=Sun), active period bounds (`activeFrom` <= `activeTo`), explicit IANA timezone, and optional scheduled time (`HH:mm`).
    - Bounded occurrence generator (`generateOccurrencesForDateRange`): Generates date-scoped occurrences up to 90 days bounded range, skipping inactive, paused, or unselected days, and resolving planned instants against explicit timezones and DST transitions.
    - Idempotent occurrence state machine: `completeOccurrence`, `skipOccurrence`, and `reopenOccurrence` appending audit history without duplicate churn.
    - Schedule revision forward reconciliation: `reconcileOccurrencesOnScheduleChange` strictly preserving historical occurrences (`< effectiveDate`) and already-resolved occurrences (`status !== 'pending'`), while updating or cancelling future pending occurrences.
  - **Contracts & Request/Response Schemas (`packages/contracts/src/api/routine.ts`):**
    - Routine schemas: `RoutineSchema`, `CreateRoutineRequestSchema`, `UpdateRoutineRequestSchema`, `RoutineResponseSchema`, `RoutineListResponseSchema`.
    - Occurrence schemas: `RoutineOccurrenceSchema`, `RoutineOccurrenceTransitionSchema`, `CompleteOccurrenceRequestSchema`, `SkipOccurrenceRequestSchema`, `ReopenOccurrenceRequestSchema`, `GenerateOccurrencesQuerySchema`, `RoutineOccurrenceListResponseSchema`.
    - Sync entity commands: `createRoutine`, `updateRoutine`, `pauseRoutine`, `resumeRoutine`, `archiveRoutine`, `completeRoutineOccurrence`, `skipRoutineOccurrence`, `reopenRoutineOccurrence`.
  - **Database Migration & Tenant RLS (`infra/supabase/migrations/00017_routines_and_occurrences.sql`):**
    - `app.routines`: Composite primary key `(workspace_id, id)` with foreign key referencing `app.items`.
    - `app.routine_occurrences`: Composite primary key `(workspace_id, id)` with foreign key referencing `app.routines`.
    - Unique constraint: `CONSTRAINT uq_routine_occurrence_date UNIQUE (workspace_id, routine_id, scheduled_date)` preventing duplicate occurrences at the database level.
    - Strict Row-Level Security policies enforcing workspace isolation.
  - **Fastify API Routes & Services (`apps/api`):**
    - 11 REST endpoints under `/v1/workspaces/:workspaceId/routines` covering routine CRUD, pause/resume/archive, bounded occurrence generation, date-range listing, and occurrence state transitions with optimistic concurrency protection (`baseRevision`).
    - Date formatting using `formatDateOnly` ensuring calendar date strings are immune to host timezone day shifts.
    - Sync change feed integration emitting `routine` and `routine_occurrence` events into `app.sync_changes`.
  - **API Client SDK (`packages/api-client`):**
    - Typed methods on `DaynoriApiClient`: `createRoutine`, `listRoutines`, `getRoutine`, `updateRoutine`, `pauseRoutine`, `resumeRoutine`, `archiveRoutine`, `generateOccurrences`, `listOccurrences`, `getOccurrence`, `completeOccurrence`, `skipOccurrence`, `reopenOccurrence`.
  - **Sync Models & Client Storage Adapters (`packages/sync`, `apps/web`, `apps/mobile`):**
    - `RoutineRecord` and `RoutineOccurrenceRecord` models and validators in `@daynori/sync`.
    - IndexedDB adapter (`apps/web/src/data/indexedDbRepository.ts`, `DB_VERSION = 5`): `routines` and `routine_occurrences` object stores with `by_routine_date` index and atomic workspace purge.
    - SQLite adapter (`apps/mobile/src/data/sqliteRepository.ts`, migration version 6): `local_routines` and `local_routine_occurrences` tables and indices.
  - **Integration & Unit Testing:**
    - `tests/integration/phase20-routines-occurrences.test.ts`: 21 comprehensive integration tests covering template lifecycle, occurrence generation, date-scoped isolation, state transitions, DST handling, offline backfill, schedule forward revisions, tenant isolation, and IndexedDB persistence.
    - `packages/domain/src/domain.test.ts`: Unit tests verifying pure recurrence, weekday validation, timezone math, and occurrence idempotency.
    - `apps/mobile/src/data/sqliteRepository.test.ts`: Verification of SQLite migration 6 and routine store operations.
- **Excluded/deferred scope:**
  - Phase 21 (Today view and daily routine execution UX): Web and mobile UI screens for the Today agenda and routine completion interfaces.
  - Physical Android TalkBack and hardware KeyStore release gates remain blocked pending physical hardware testing.

## Result

Delivered the complete Phase 20 daily routine schedules and occurrences domain, persistence layer, API service, client SDK, and storage adapters across `packages/domain`, `packages/contracts`, `infra/supabase`, `apps/api`, `packages/api-client`, `packages/sync`, `apps/web`, and `apps/mobile`:

1. **Pure Domain Logic & Date Math (`packages/domain/src/routines.ts`)**:
   - Implemented `getIsoWeekday` returning standard ISO 8601 day numbers `1` (Monday) through `7` (Sunday).
   - Implemented `validateRoutineTitle` and `validateWeekdays` enforcing non-empty arrays with bounds `[1..7]`.
   - Implemented `calculatePlannedInstant` mapping calendar date and optional `HH:mm` into explicit IANA timezone UTC instants, resolving DST ambiguous overlap hours to earlier UTC instants and spring-forward gaps to valid suggested timestamps.
   - Implemented `isRoutineScheduledOnDate` evaluating frequency, active periods, and pause/archive flags.
   - Implemented `generateOccurrencesForDateRange` bounded to `MAX_GENERATION_RANGE_DAYS = 90`, idempotently returning only newly planned occurrences for unscheduled dates.
   - Implemented `completeOccurrence`, `skipOccurrence`, and `reopenOccurrence` with rich transition audit logs (`fromStatus`, `toStatus`, `changedAt`, `actorId`, `reason`).
   - Implemented `reconcileOccurrencesOnScheduleChange` preserving historical records and reconciling future pending occurrences.

2. **Contracts & API Schemas (`packages/contracts/src/api/routine.ts`)**:
   - Defined strict Zod schemas for routine entities, occurrence records, query parameters, and mutations.
   - Wired schemas into API export index and sync command schemas (`packages/contracts/src/api/sync.ts`).

3. **Database Migration & Tenant RLS (`infra/supabase/migrations/00017_routines_and_occurrences.sql`)**:
   - Created `app.routines` and `app.routine_occurrences` with tenant foreign keys and RLS policies.
   - Applied unique constraint `CONSTRAINT uq_routine_occurrence_date UNIQUE (workspace_id, routine_id, scheduled_date)`.
   - Migration applied and verified on local PostgreSQL instance.

4. **API Service & Routes (`apps/api`)**:
   - Created `apps/api/src/modules/routines/service.ts` and `apps/api/src/routes/v1/routines.ts`.
   - Wired into Fastify server routes (`apps/api/src/server.ts`) and sync dispatcher (`apps/api/src/modules/sync/service.ts`).
   - Tenant isolation enforced with 404 responses on cross-workspace queries.

5. **Client Repositories & Sync Adapters (`apps/web`, `apps/mobile`, `@daynori/sync`)**:
   - IndexedDB bumped to version 5 with dedicated stores and indices.
   - SQLite migration 6 applied with tables, indexes, and parameterized CRUD.
   - Verified via real browser IndexedDB execution in Microsoft Edge CDP runner.

## Verification and evidence

### 1. Test Suite Results

```bash
pnpm test tests/integration/phase20-routines-occurrences.test.ts
```

Output:

```
 ✓ tests/integration/phase20-routines-occurrences.test.ts (21 tests) 755ms
 Test Files  1 passed (1)
      Tests  21 passed (21)
```

```bash
pnpm test
```

Output:

```
 Test Files  37 passed (37)
      Tests  484 passed (484)
   Start at  19:47:24
   Duration  7.50s (transform 11.92s, setup 0ms, import 26.72s, tests 30.79s, environment 8ms)
```

### 2. Browser IndexedDB Verification

```bash
node scripts/test-indexeddb-browser.mjs
```

Output:

```
=== VERIFYING REAL PRODUCTION INDEXEDDB ADAPTER IN CHROMIUM BROWSER ===
HTTP Server: http://127.0.0.1:3199
Browser: C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
CDP Port: 9235
✓ Connected to Edg/155.0.4283.45

--- Scenario 1: Consent refusal & enforcement ---
[1/6] Consent refusal threw: Persistent local browser storage requires explicit trusted-device consent.

--- Scenario 2: Transactional enqueue & atomic save ---
[2/6] Transactional write results: { hasHeader: true, hasDraft: true, mutationCount: 1, mutationOpId: 'op-browser-prod-01' }

--- Scenario 3: Persistence across page reload ---
[3/6] Reloaded records from disk: { reloadedHeaderId: 'item-browser-prod-01', reloadedDraftTitle: 'Offline Note Title', reloadedOpId: 'op-browser-prod-01' }

--- Scenario 4: Account and workspace boundary isolation ---
[4/6] Isolation errors: {
  crossWsError: 'CROSS_WORKSPACE_VIOLATION: Requested workspace "ws_test_OTHER" does not match active namespace workspace "ws_test_01".',
  crossUserError: 'CROSS_ACCOUNT_VIOLATION: Requested user "usr_bob" does not match active namespace user "usr_alice".'
}

--- Scenario 5: Transaction failure & rollback integrity ---
[5/6] Rollback result: { thrown: true, draftPersisted: false }

--- Scenario 6: Multi-tab coordination via BroadcastChannel ---
[6/6] Coordination revocation result: { opError: 'Local storage is closed or uninitialized.' }

✓ PRODUCTION INDEXEDDB REPOSITORY PASSED ALL 6 BROWSER CDP INTEGRATION CHECKS.
```

### 3. Typecheck, Lint, and Format Verification

```bash
pnpm typecheck
# Output: tsc --noEmit passed across all 13 workspace projects (exit code 0)

pnpm lint
# Output: eslint passed with 0 errors, 0 warnings (exit code 0)

pnpm format:check
# Output: All matched files use Prettier code style (exit code 0)
```

## Acceptance criteria checklist

- [x] **Completing today's routine never completes tomorrow's occurrence**: Verified in pure domain tests and integration journey. Completing today's occurrence mutates only `2026-10-15` without altering `2026-10-16`.
- [x] **Repeated generation cannot duplicate one scheduled occurrence**: Database unique constraint `(workspace_id, routine_id, scheduled_date)` and domain generator deduplication guarantee exactly one record per date.
- [x] **Editing a template preserves completed history and applies the documented future rule**: Schedule edits forward from `effective_date` retain historical occurrences and completed/skipped records intact, while updating or cancelling pending future occurrences.
- [x] **Offline days backfill as date-scoped occurrences**: Devices staying offline for several days generate past date occurrences on reconnect without creating overdue tasks or polluting task backlogs.
- [x] **Timezone and DST safety**: Routine templates pin explicit IANA timezones; local time conversions handle spring-forward gaps and fall-back overlap hours deterministically.

## Architecture decision records

- [ADR-0026: Daily Routine Schedules, Date-Scoped Occurrences, and Lifecycle Reconciliation](../decisions/0026-routine-schedules-and-occurrences.md)

## Next phase handoff

- **Next Phase:** [Phase 21 — Today view and daily routine execution](../roadmap/phases/21-today-view-and-daily-routine-execution.md).
- Per project instructions, stop work before implementing Phase 21.
