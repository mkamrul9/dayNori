# Phase 26: Calendar and deadline views

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [26 — Calendar and deadline views](../roadmap/phases/26-calendar-and-deadline-views.md)
- **Status:** `blocked` (Software implementation, API endpoints, web and mobile UI views, durable storage adapters, and 15 end-to-end integration tests delivered and verified locally; completion status recorded as `blocked` in `docs/roadmap/progress.json` pending physical Android TalkBack hardware and KeyStore release gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-17.
- **Base Git revision and branch:** `95fc1a8` on `main`.
- **Prerequisites:**
  - [Phase 19 — Upcoming task lists and detail views](phase-19.md): Canonical task deadlines, priorities, and workflow states.
  - [Phase 21 — Daily routine experience and history](phase-21.md): Routine templates, occurrence generation, and completion tracking.
- **Included scope:**
  - **Pure Domain Operations (`packages/domain/src/calendar.ts`)**:
    - `validateCalendarEventTitle`: Enforces non-empty, trimmed title between 1 and 255 characters.
    - `validateCalendarEventInterval`: Enforces exclusive `endDate > startDate` for all-day events, `endAt > startAt` for timed events, and IANA timezone validation.
    - `getDaysCoveredByAllDayEvent`: Computes covered calendar date strings across all-day intervals.
    - `isEventActiveOnDate`, `isTaskDeadlineOnDate`, `getItemsForDate`: Fast query and filtering helpers for dates and intervals.
    - `buildMonthGrid`: Constructs calendar month week matrices with customizable week starts (Mon=1, Sun=7, Sat=6), today flags, and item mappings.
    - `buildCalendarReadModel`: Aggregates canonical tasks (`TaskRecord`), routine occurrences (`RoutineOccurrenceRecord`), personal events (`CalendarEventEntity`), and privacy-preserving journal indicators into a unified projection read model.
    - Added unit test coverage in `packages/domain/src/domain.test.ts`.
  - **API Contracts & Validation (`packages/contracts/src/api/calendar.ts`)**:
    - Defined Zod schemas: `CalendarEventSchema`, `CreateCalendarEventRequestSchema`, `UpdateCalendarEventRequestSchema`, `CalendarFeedQuerySchema`, and `CalendarReadModelResponseSchema`.
    - Defined item schemas for feed union: `CalendarTaskDeadlineItemSchema`, `CalendarRoutineOccurrenceItemSchema`, and `CalendarPersonalEventItemSchema`.
    - Sanitized boolean query parameters with `z.preprocess`.
  - **Database Schema & Multi-Tenant Isolation (`infra/supabase/migrations/00022_calendar_events_and_projections.sql`)**:
    - Created `app.calendar_events` table linked to canonical `app.items(workspace_id, id)` with folder containment.
    - Added database check constraint `chk_calendar_event_interval` enforcing all-day exclusive end dates and timed timestamp ordering.
    - Configured indexes for date and timestamp querying.
    - Enforced tenant-isolated Row-Level Security (RLS) policies for select, insert, update, and delete operations.
  - **Fastify API Routes & Service (`apps/api`)**:
    - Registered routes under `/v1/workspaces/:workspaceId/calendar`:
      - `GET /feed`: Generates aggregated calendar feed without duplicate task tables.
      - `POST /events`: Creates personal calendar events with mutation receipts and change feed entries.
      - `GET /events/:eventId`: Retrieves calendar event by ID.
      - `PATCH /events/:eventId`: Updates event interval or details with optimistic concurrency check.
      - `DELETE /events/:eventId`: Deletes event and records tombstone change.
  - **API Client (`packages/api-client/src/client.ts`)**:
    - Implemented `getCalendarFeed`, `createCalendarEvent`, `getCalendarEvent`, `updateCalendarEvent`, and `deleteCalendarEvent`.
  - **Client Sync & Durable Storage Adapters (`packages/sync`, `apps/web`, `apps/mobile`)**:
    - Extended `LocalRepositoryPort` with calendar event CRUD signatures and transaction integration.
    - Sync engine `applyPullPage` and bootstrap generation handling `calendar_events`.
    - Upgraded Web IndexedDB store to `DB_VERSION = 8` with `calendar_events` object store and indices.
    - Upgraded Mobile SQLite schema to version 9 with `calendar_events` table and sync application.
  - **Web User Interface (`apps/web/src/app/plan/calendar/page.tsx`)**:
    - Connected to API feed client with local fallback.
    - View modes: Agenda (`role="feed"`), Day, and Month (`role="grid"`).
    - Source filter chips: `⏱ Tasks`, `🔄 Routines`, `🗓 Events`.
    - Week-start preference switcher: Monday, Sunday, Saturday.
    - Journal privacy indicators: entry count dots on cells without body exposure.
    - Add/Edit event modal dialog with live interval validation.
  - **Mobile User Interface (`apps/mobile/src/views/PlanView.tsx`)**:
    - Sub-view tab switcher: Tasks, Routines, and Calendar.
    - View modes: Agenda, Day, and Month views.
    - Source filter chips and week-start preferences.
    - New Calendar Event bottom sheet (`MobileModalSheet`) with transactional offline persistence.
    - Verified in `apps/mobile/src/mobile.test.ts`.
  - **Integration Test Suite (`tests/integration/phase26-calendar-deadlines.test.ts`)**:
    - 15 comprehensive integration tests covering aggregated projections, canonical task deadline updates, interval validations, week-start preferences, DST handling, journal privacy preservation, multi-tenant workspace isolation, source filter toggles, and IndexedDB local storage.
- **Excluded/deferred scope:**
  - Physical Android TalkBack screen reader and hardware KeyStore verification remain recorded as `blocked` in `docs/roadmap/progress.json` pending access to physical hardware devices.
  - External calendar provider synchronization (Google Calendar, Microsoft Outlook, CalDAV) is intentionally deferred to later roadmap phases.
  - Phase 27 (Vault domain and encryption foundation) remains untouched.

## Verification evidence

| Suite / Command                                                        | Result             | Duration | Scope                                                                                                          |
| ---------------------------------------------------------------------- | ------------------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm vitest run packages/domain/src/domain.test.ts`                   | Pass (56/56 tests) | 540ms    | Pure domain validation, intervals, month grid, read model projection                                           |
| `pnpm vitest run apps/mobile/src/mobile.test.ts`                       | Pass (30/30 tests) | 1.58s    | Mobile PlanView calendar navigation, mode switching, event creation                                            |
| `pnpm vitest run apps/web/src/web.test.ts`                             | Pass (2/2 tests)   | 1.36s    | Web routes export and PlanCalendarPage registration                                                            |
| `pnpm vitest run tests/integration/phase26-calendar-deadlines.test.ts` | Pass (15/15 tests) | 2.05s    | End-to-end integration: feed aggregation, personal event CRUD, interval rejections, week starts, RLS isolation |

## Blockers and release gates

- **Physical Android TalkBack hardware verification:** Blocked. Screen-reader accessibility attributes and announcements are implemented in code (`accessibilityRole`, `accessibilityLabel`, `accessibilityState`), but verification on a physical Android device remains pending.
- **Physical Hardware KeyStore verification:** Blocked. Release gate remains blocked pending physical device hardware access.

## Next steps

- Await owner authorization before proceeding to Phase 27.
- Complete conventional commit: `feat(calendar): add linked deadlines routines and personal events`.
