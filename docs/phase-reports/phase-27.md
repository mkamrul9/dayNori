# Phase 27: Reminder scheduling and durable delivery jobs

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [27 — Reminder scheduling and durable delivery jobs](../roadmap/phases/27-reminder-scheduling-and-durable-delivery-jobs.md)
- **Status:** `blocked` (Software implementation, API endpoints, durable leased background jobs, quiet hours DST evaluation, payload redaction, and 13 end-to-end integration tests delivered and verified locally; completion status recorded as `blocked` in `docs/roadmap/progress.json` pending physical Android TalkBack hardware and KeyStore release gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-17.
- **Base Git revision and branch:** `0518123` on `main`.
- **Prerequisites:**
  - [Phase 20 — Daily routine schedules and occurrences](phase-20.md): Routine templates and date-scoped occurrence generation.
  - [Phase 26 — Calendar and deadline views](phase-26.md): Calendar interval invariants, deadline projections, and personal events.
  - [Phase 12 — Server mutation receipts and change feed](phase-12.md): Transactional outbox, change log ordering, and receipt deduplication.
- **Included scope:**
  - **Pure Domain Operations (`packages/domain/src/reminders.ts`)**:
    - `isTimeInQuietHours`: Evaluates timezone-aware quiet hours across single-day and midnight-crossing intervals (e.g. 22:00 to 08:00).
    - `calculateNextQuietHoursEnd`: Resolves the exact next opening UTC instant with DST disambiguation.
    - `calculateSnoozeTime`: Clamps snooze durations between 5 and 1440 minutes (24 hours).
    - `materializeReminderOccurrences`: Materializes occurrences for a rule within a 14-day rolling horizon using deterministic compound idempotency keys (`${rule.id}_rev${rule.ruleRevision}_...`).
    - `redactReminderPayload`: Strictly redacts sensitive note text, journal reflections, or vault content from notification delivery buffers; detailed mode restricts text to entity kind and item title only.
    - Verified in pure domain tests.
  - **API Contracts & Client SDK (`packages/contracts`, `packages/api-client`)**:
    - Defined Zod schemas and TypeScript types: `ReminderRuleSchema`, `ReminderInstanceSchema`, `ReminderDeliverySchema`, `CreateReminderRuleRequestSchema`, `UpdateReminderRuleRequestSchema`, `SnoozeReminderRequestSchema`, and `RecordDeliveryReceiptRequestSchema`.
    - Extended `DaynoriApiClient` with full REST methods: `createReminderRule`, `listReminderRules`, `getReminderRule`, `updateReminderRule`, `deleteReminderRule`, `listReminderInstances`, `snoozeReminderInstance`, and `recordDeliveryReceipt`.
  - **Database Schema & RLS Policies (`infra/supabase/migrations/00024_reminder_rules_instances_and_deliveries.sql`)**:
    - Created `app.reminder_rules` scoped to personal workspaces with RLS policies (`p_reminder_rules_*`).
    - Created `app.reminder_instances` with unique compound index `(workspace_id, rule_id, rule_revision, occurrence_key)`.
    - Created `app.reminder_deliveries` tracking channels (`in_app`, `push`, `local`), provider state, attempt counts, and receipts.
  - **Fastify API Routes & Service (`apps/api`)**:
    - Registered routes under `/v1/workspaces/:workspaceId/reminders`:
      - `POST /rules`: Creates reminder rule and materializes initial rolling-horizon occurrences with background jobs.
      - `GET /rules`: Lists rules for workspace.
      - `GET /rules/:ruleId`: Fetches single rule.
      - `PATCH /rules/:ruleId`: Updates rule, increments revision, invalidates previous occurrences, and rematerializes occurrences under the new revision.
      - `DELETE /rules/:ruleId`: Soft-deletes rule and invalidates scheduled occurrences.
      - `GET /instances`: Lists scheduled/snoozed/dispatched occurrences.
      - `POST /instances/:instanceId/snooze`: Snoozes occurrence and enqueues updated job.
      - `POST /deliveries/:deliveryId/receipt`: Records delivery receipt (`opened` marks instance `observed`).
  - **Target Lifecycle Invalidation Integration**:
    - Hooked tasks in `apps/api/src/modules/tasks/service.ts`: completing, cancelling, rescheduling deadline, or trashing a task immediately marks pending reminder instances `invalidated`.
    - Hooked calendar events in `apps/api/src/modules/calendar/service.ts` and routines in `apps/api/src/modules/routines/service.ts`.
  - **Durable Leased Delivery Jobs (`apps/worker/src/worker.ts`)**:
    - Built-in handler for `task_type === 'reminder_delivery'`.
    - Acquires jobs with PostgreSQL `FOR UPDATE SKIP LOCKED` and lease fencing (`leased_until > now()`).
    - Rechecks target active revision before delivery; if target completed/cancelled/deleted, marks instance `invalidated` without dispatching alerts.
    - Enforces quiet hours behaviors: `drop` (marks delivery `dropped_quiet_hours` and instance `dismissed`), `defer` (reschedules job to quiet hours end), and `allow`.
    - Deduplicates channel deliveries for each instance.
  - **Integration Test Suite (`tests/integration/phase27-reminders.test.ts`)**:
    - 13 comprehensive integration tests covering pure domain logic, personal workspace boundary assertions, task completion invalidation, task rescheduling invalidation, snooze transitions, delivery receipt tracking, worker leased job crash recovery and deduplication, and quiet hours drop behavior.
- **Excluded/deferred scope:**
  - Physical Android TalkBack screen reader and hardware KeyStore verification remain recorded as `blocked` in `docs/roadmap/progress.json` pending access to physical hardware devices.
  - Native Android notification tokens, FCM credentials, and exact alarm permissions (`SCHEDULE_EXACT_ALARM`) belong to Phase 28 / Phase 29.
  - Vault encryption belongs to Phases 44–47. Screen locking is never claimed to encrypt data.

## Verification evidence

| Suite / Command                                                        | Result             | Duration | Scope                                                                                                          |
| ---------------------------------------------------------------------- | ------------------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm vitest run tests/integration/phase27-reminders.test.ts`          | Pass (13/13 tests) | 758ms    | End-to-end reminder scheduling, quiet hours, snooze, receipts, worker deduplication                            |
| `pnpm test:integration`                                                | Pass (271/271 tests)| 10.01s  | Full 20 integration test suites across all phases                                                             |
| `pnpm test`                                                            | Pass (655/655 tests)| 15.37s  | All 47 test suites across all packages and apps                                                               |
| `pnpm typecheck`                                                       | Pass (Exit code 0) | ~12s     | Strict TypeScript checking across all 14 workspaces without `any` regressions                                 |
| `pnpm build`                                                           | Pass (Exit code 0) | ~25s     | Monorepo production builds including domain, contracts, api-client, worker, api, web, and mobile               |

## Blocked gates & physical hardware notes

- Physical Android device with Google Play Services is required for native push token registration and TalkBack gesture verification.
- Release gate in `docs/roadmap/progress.json` remains `blocked` to maintain honesty about real hardware verification constraints.
