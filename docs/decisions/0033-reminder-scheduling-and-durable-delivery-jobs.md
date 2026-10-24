# ADR-0033: Reminder Scheduling, Recurrence Instances, and Durable Delivery Jobs

## Status

Accepted (Phase 27 implementation verified across pure domain scheduling algorithms, Fastify REST API, DaynoriApiClient, PostgreSQL RLS policies, durable background leased-jobs in DaynoriWorker, and 13 end-to-end integration tests; physical Android TalkBack hardware and KeyStore release gates remain explicitly recorded as blocked without software defects blamed on hardware).

## Context

Phase 27 implements reminder scheduling and durable delivery jobs ([docs/roadmap/phases/27-reminder-scheduling-and-durable-delivery-jobs.md](../roadmap/phases/27-reminder-scheduling-and-durable-delivery-jobs.md)), fulfilling product requirements for timely, reliable notifications without compromising private personal workspace contents or guaranteeing impossible delivery semantics over best-effort operating systems.

Key architectural requirements and constraints addressed:

1. **Decoupled Reminder Rules & Target Versioning**:
   - Reminder rules (`app.reminder_rules`) are persisted separately from tasks, routines, and calendar events to allow independent preference management, schedule revisioning, and privacy controls.
   - Each rule tracks `rule_revision` and target references `(workspace_id, target_id)`. Modifying a rule increments `rule_revision` and invalidates previous pending occurrences.

2. **Durable Leased Delivery Jobs with PostgreSQL SKIP LOCKED**:
   - Scheduled reminder occurrences materialize in `app.reminder_instances` within a 14-day rolling horizon using a unique compound key `(workspace_id, rule_id, rule_revision, occurrence_key)`.
   - Durable delivery execution is dispatched via `app.background_jobs` with `task_type = 'reminder_delivery'`. Workers acquire jobs using `FOR UPDATE SKIP LOCKED` and enforce lease fences (`leased_until > now()`).

3. **Stale Schedule Invalidation on Target Lifecycle Events**:
   - Completing a task, cancelling a task, moving/rescheduling a deadline, archiving an event, or pausing a routine immediately invalidates pending reminder instances (`status = 'invalidated'`).
   - Before dispatching notifications, the worker rechecks the live target entity. If the target is completed, cancelled, archived, paused, or deleted, the instance is marked invalidated without dispatching alerts.

4. **Quiet Hours Behavior & DST Disambiguation**:
   - Quiet hours evaluation supports midnight-crossing time windows (e.g. 22:00 to 08:00) and daylight saving time transitions without time drift.
   - Rules specify explicit quiet hours behavior:
     - `drop`: Drops the delivery during quiet hours and marks the instance `dismissed`.
     - `defer`: Reschedules the job's `run_at` to the exact calculated instant when quiet hours end.
     - `allow`: Delivers unconditionally.

5. **Payload Privacy & Content Redaction**:
   - OS-level push notifications and lock-screen alerts must never leak journal reflections, vault contents, financial items, or private body texts.
   - Generic mode redacts all content to non-revealing generic text (`Daynori Reminder: You have a scheduled item waiting in your workspace.`).
   - Detailed mode restricts notification text to entity kind and item title only (`Task: Review report`), completely suppressing body and details.

6. **Receipt Tracking Without Receipt Guarantees**:
   - Delivery status distinguishes `pending`, `accepted` (provider/FCM accepted), `delivered`, and `opened`/`observed`.
   - The system explicitly discloses delivery as best-effort; mobile Doze mode, network outages, and OS process management mean notification delivery cannot be guaranteed.

## Decision

### 1. Pure Domain Logic & Invariants (`packages/domain/src/reminders.ts`)

- Implemented `isTimeInQuietHours(timeUtc, config)` evaluating timezone-aware quiet hours across single-day and midnight-crossing intervals.
- Implemented `calculateNextQuietHoursEnd(timeUtc, config)` resolving the exact next opening UTC instant with DST disambiguation.
- Implemented `calculateSnoozeTime(currentScheduledAt, snoozeMinutes)` clamping snooze durations between 5 and 1440 minutes (24 hours).
- Implemented `materializeReminderOccurrences({ rule, target, horizonDays, now })` generating idempotent occurrence keys (`${rule.id}_rev${rule.ruleRevision}_...`).
- Implemented `redactReminderPayload({ title, targetType, privacyLevel })` enforcing privacy redaction.

### 2. API Contracts & Client SDK (`packages/contracts`, `packages/api-client`)

- Defined Zod schemas and TypeScript types: `ReminderRuleSchema`, `ReminderInstanceSchema`, `ReminderDeliverySchema`, `CreateReminderRuleRequestSchema`, `UpdateReminderRuleRequestSchema`, `SnoozeReminderRequestSchema`, and `RecordDeliveryReceiptRequestSchema`.
- Extended `DaynoriApiClient` with full REST methods: `createReminderRule`, `listReminderRules`, `getReminderRule`, `updateReminderRule`, `deleteReminderRule`, `listReminderInstances`, `snoozeReminderInstance`, and `recordDeliveryReceipt`.

### 3. Database Schema & RLS Policies (`infra/supabase/migrations/00024_reminder_rules_instances_and_deliveries.sql`)

- Created `app.reminder_rules` scoped to personal workspaces with RLS policies (`p_reminder_rules_*`).
- Created `app.reminder_instances` with unique compound index `(workspace_id, rule_id, rule_revision, occurrence_key)`.
- Created `app.reminder_deliveries` tracking channels (`in_app`, `push`, `local`), provider state, attempt counts, and receipts.

### 4. Background Delivery Worker (`apps/worker/src/worker.ts`)

- Added built-in handler for `task_type === 'reminder_delivery'`.
- Enforces lease fences, checks live target revision, applies quiet hours policies (`drop`, `defer`, `allow`), deduplicates delivery attempts, and writes operational status.

### 5. Automatic Target Lifecycle Invalidation (`apps/api`)

- Hooked task lifecycle in `apps/api/src/modules/tasks/service.ts`:
  - `updateTask`: invalidates reminders when status becomes `completed`/`cancelled` or when deadline changes.
  - `completeTaskService`: invalidates reminders with reason `task_completed`.
  - `trashTask`: invalidates reminders with reason `task_deleted`.
- Hooked calendar events in `apps/api/src/modules/calendar/service.ts` and routines in `apps/api/src/modules/routines/service.ts`.

## Consequences

### Positive
- Zero duplicate reminder instances on job retry due to deterministic compound unique keys.
- Completing or rescheduling a task immediately invalidates pending reminders before dispatch.
- Private journal, notes, and vault contents are never exposed in OS notification buffers.
- Quiet hours crossing midnight are handled safely across DST changes.

### Neutral / Tradeoffs
- Operating systems (Android Doze, battery savers, background kill) may delay or throttle alerts; delivery is best effort, not guaranteed alarm clock timing.
- Exact alarms require explicit separate opt-in permissions covered under Phase 28/29.
