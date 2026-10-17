# ADR-0032: Unified Calendar Views, Canonical Deadline Projections, and Personal Events

## Status

Accepted (Phase 26 delivery verified across pure domain projection algorithms, Fastify REST API, DaynoriApiClient, Web PlanCalendarPage, Mobile PlanView, IndexedDB/SQLite durable repositories, and 15 end-to-end integration tests; physical Android TalkBack hardware and KeyStore release gates remain explicitly recorded as blocked without software defects blamed on hardware).

## Context

Phase 26 implements calendar and deadline views ([docs/roadmap/phases/26-calendar-and-deadline-views.md](../roadmap/phases/26-calendar-and-deadline-views.md)), fulfilling product requirements for consolidated temporal planning across tasks, routines, and personal events without fragmenting user data or duplicating database tables.

Key architectural requirements and constraints addressed:

1. **Canonical Source Projection Without Table Duplication**:
   - Upcoming task deadlines (`app.tasks`) and recurring routine occurrences (`app.routine_occurrences`) must appear on calendar views alongside personal calendar events.
   - The architecture strictly forbids creating duplicate task tables (e.g. `app.calendar_tasks`) or duplicating task records into calendar event tables. Modifying a canonical task deadline or completing a routine occurrence must immediately update calendar views through the single canonical domain record.

2. **Personal Calendar Events with Explicit Interval Semantics**:
   - Personal calendar events (`app.calendar_events`) support two distinct modes with strict validation:
     - **All-Day Events (`allDay = true`)**: Represented by calendar dates (`YYYY-MM-DD`) with an **exclusive** end date (`endDate > startDate`). A single-day event from `2026-10-20` has `startDate = '2026-10-20'` and `endDate = '2026-10-21'`.
     - **Timed Events (`allDay = false`)**: Represented by UTC ISO-8601 timestamps with timezone context, where end instant must follow start instant (`endAt > startAt`).
   - Inverted or zero-length intervals are rejected with HTTP 400 validation errors at the domain, contract, and database check constraint levels.

3. **Timezone, Daylight Saving Time (DST), and Week-Start Preferences**:
   - Calendar date allocations must accurately compute local dates according to the viewing timezone across DST transitions without 18:00 UTC shifts or midnight drift.
   - The month grid generator must support customizable week-start preferences (Monday=1, Sunday=7, Saturday=6), padding filler cells from adjacent months appropriately.

4. **Journal Entry Privacy Defaults**:
   - Journal reflections must be indicated on calendar views (showing that a reflection took place on a given day), but entry bodies, prompts, reflections, and titles must NEVER be loaded, queried, or leaked into the calendar read model. Indicators return `{ date, hasEntry: true, count }` only.

5. **Accessible Non-Visual Grid Alternatives**:
   - Visual 2D month grids present accessibility hurdles for screen readers and keyboard navigation. The calendar architecture must provide an accessible, linearized Agenda feed view (`role="feed"`) alongside Day and Month modes.

6. **Local Durable Storage & Sync Engine Integration**:
   - Personal calendar events must persist in local offline stores across Web (IndexedDB) and Mobile (SQLite) and synchronize via the shared `SyncEngine` with change feed tracking and idempotent mutation receipts.

## Decision

### 1. Pure Domain Logic & Projections (`packages/domain/src/calendar.ts`)

- Implemented `validateCalendarEventTitle(title)` trimming whitespace and enforcing 1–255 character limits.
- Implemented `validateCalendarEventInterval(input)` enforcing exclusive `endDate > startDate` for all-day events, `endAt > startAt` for timed events, and IANA timezone validation.
- Implemented `getDaysCoveredByAllDayEvent(startDate, endDate)` returning the array of covered calendar dates.
- Implemented `isEventActiveOnDate`, `isTaskDeadlineOnDate`, and `getItemsForDate` for fast date-based lookup.
- Implemented `buildMonthGrid({ year, month, weekStart, todayDate, items, journalIndicators, viewingTimezone })` constructing full month matrices with customizable week starts (Mon=1, Sun=7, Sat=6) and adjacent-month filler cells.
- Implemented `buildCalendarReadModel(...)` combining canonical tasks, routine occurrences, personal events, and aggregate journal indicator counts into a single consolidated read model.

### 2. API Contracts & Validation (`packages/contracts/src/api/calendar.ts`)

- Defined Zod schemas: `CalendarEventSchema`, `CreateCalendarEventRequestSchema`, `UpdateCalendarEventRequestSchema`, `CalendarFeedQuerySchema`, and `CalendarReadModelResponseSchema`.
- Defined discriminated union item types: `CalendarTaskDeadlineItemSchema`, `CalendarRoutineOccurrenceItemSchema`, and `CalendarPersonalEventItemSchema`.
- Configured query parameters (`includeTasks`, `includeRoutines`, `includeEvents`, `includeJournalIndicators`) using `z.preprocess` to parse boolean query strings reliably.

### 3. Database Schema & Multi-Tenant Isolation (`infra/supabase/migrations/00022_calendar_events_and_projections.sql`)

- Created table `app.calendar_events` referencing canonical `app.items(workspace_id, id)` with composite primary key `(workspace_id, id)`.
- Added interval check constraint:
  ```sql
  CONSTRAINT chk_calendar_event_interval CHECK (
      (all_day = true AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date > start_date) OR
      (all_day = false AND start_at IS NOT NULL AND end_at IS NOT NULL AND end_at > start_at)
  )
  ```
- Enforced PostgreSQL Row-Level Security (RLS) policies (`p_calendar_events_select`, `p_calendar_events_insert`, `p_calendar_events_update`, `p_calendar_events_delete`) ensuring strict tenant isolation.

### 4. REST API Service & Endpoints (`apps/api`)

- Registered calendar routes under `/v1/workspaces/:workspaceId/calendar`:
  - `GET /feed`: Generates aggregated calendar feed projecting tasks, routines, personal events, and journal count indicators for a bounded date range.
  - `POST /events`: Creates personal calendar event with mutation receipt recording and change feed insertion.
  - `GET /events/:eventId`: Retrieves event by ID.
  - `PATCH /events/:eventId`: Updates event interval or metadata with optimistic concurrency revision tracking.
  - `DELETE /events/:eventId`: Soft-deletes event and records tombstone change.

### 5. Client Sync & Local Storage Adapters

- Extended `LocalRepositoryPort` with calendar event CRUD and transaction integration (`calendarEvent?: CalendarEventRecord`).
- Upgraded Web IndexedDB repository (`DB_VERSION = 8`) adding object store `calendar_events` with indices on `by_start_date` and `by_start_at`.
- Upgraded Mobile SQLite repository (`schema_version = 9`) adding table `calendar_events` with indexing and sync page application.

### 6. Web & Mobile User Interfaces

- **Web (`apps/web/src/app/plan/calendar/page.tsx`)**:
  - Live API feed connection with local offline fallback.
  - View switcher supporting Agenda (`role="feed"`), Day, and Month (`role="grid"`) views.
  - Week-start selector (Monday, Sunday, Saturday).
  - Source filter toggle chips (`⏱ Tasks`, `🔄 Routines`, `🗓 Events`).
  - Journal privacy indicators showing entry count dots on calendar cells.
  - Add/Edit event modal dialog with live interval validation.
- **Mobile (`apps/mobile/src/views/PlanView.tsx`)**:
  - Sub-view tab switcher for Tasks, Routines, and Calendar.
  - Calendar mode selector: Agenda, Day, and Month views.
  - Source filter chips and week-start preferences.
  - New Calendar Event bottom sheet (`MobileModalSheet`) with transactional offline persistence.

## Consequences

- **Positive**: Single canonical source of truth for all deadlines and schedules; updating a task or routine immediately updates calendar projections without sync drift.
- **Positive**: Strict personal event interval validation prevents corrupted temporal data.
- **Positive**: Journal privacy is completely preserved; reflections appear as non-leaking date indicators.
- **Positive**: High accessibility via dedicated Agenda feed view alongside grid views.
- **Trade-off**: External calendar sync (Google Calendar, iCal, CalDAV) is intentionally deferred to later roadmap phases.
