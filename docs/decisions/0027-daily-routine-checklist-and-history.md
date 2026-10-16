# ADR-0027: Daily Routine Checklists, Non-Punitive Progress, and Completion History

## Status

Accepted (Provisional daily routine checklist experience, non-punitive gentle progress, reversible undo interaction, schedule change impact explanations, occurrence history inspection, and Today view integration delivered under owner authorization and verified across Vitest pure domain, UI component tests, Web and Mobile Today views, and multi-day integration test suites; physical Android TalkBack hardware and KeyStore release gates remain pending).

## Context

Phase 21 introduces the daily routine experience and history interfaces into the Daynori ecosystem ([docs/roadmap/phases/21-daily-routine-experience-and-history.md](../roadmap/phases/21-daily-routine-experience-and-history.md)), building on the routine schedules and date-scoped occurrence engine delivered in Phase 20 ([ADR-0026](0026-routine-schedules-and-occurrences.md)).

Key user and architectural requirements:

1. **Strict Separation of Daily Routines and One-Off Tasks**:
   - As established in [docs/design/information-architecture.md](../design/information-architecture.md) and [docs/product/requirements.md](../product/requirements.md) (**R-ROUTINE**, **R-TASK**), daily routines represent recurring rhythm practices (e.g., morning deep work, meditation, evening reflections) rather than discrete task backlogs with deadlines.
   - Routines must be displayed in a dedicated, prominent checklist in the Today view, distinctly partitioned from one-off tasks due today to prevent cognitive overload.
2. **Gentle, Non-Punitive Progress (Zero Streak Shaming)**:
   - Traditional habit trackers enforce punitive "streaks" where missing a single day resets a counter to zero, generating user guilt, stress, and eventual abandonment.
   - Daynori deliberately rejects streak counters, guilt banners, and aggressive notifications. Routine progress must be measured gently and non-judgmentally: acknowledging completed and skipped items equally as deliberate choices, celebrating participation, and never penalizing missed days.
3. **Reversible Low-Friction Interaction (Floating Undo)**:
   - Checking off a routine on mobile or web must feel fast and frictionless. To prevent anxiety and accidental toggles without introducing clunky confirmation dialogs, marking a routine as done or skipped must offer an immediate, accessible 5-second reversible undo action via a floating banner/toast.
4. **Multi-Day Occurrence History and Yesterday Preservation**:
   - In accordance with the occurrence isolation invariant ("completing today never completes tomorrow"), advancing to a new day presents a fresh pending occurrence for today while yesterday's completed or skipped record remains permanently accessible in the routine's history log with its exact completion timestamp.
5. **Clear Explanation of Cadence and Schedule Impact**:
   - Users must always understand _why_ a routine appears in today's agenda (e.g., "Repeats weekdays (Mon–Fri) at 09:00 · Due today").
   - When editing a routine's schedule or active range, the interface must clearly explain how modifications affect future occurrences and reassure the user that historical completed/skipped records are preserved.

## Decision

### 1. Shared Domain Logic (`@daynori/domain`)

- **Structured Cadence & Due Reason Explanation (`explainWhyDueToday`)**:
  - Pure function evaluating routine frequency (`daily` or `weekdays`), active date range, paused state, and archived state against a target calendar date.
  - Returns structured explanation: `{ isDue: boolean, reason: string, cadenceDescription: string, isPaused: boolean, isArchived: boolean }`.
  - Distinguishes weekdays (`Mon–Fri`) vs custom days and includes formatted local scheduled times (`HH:mm`).
- **Gentle Non-Punitive Progress Calculation (`calculateGentleProgress`)**:
  - Evaluates an array of occurrences for a viewing date.
  - Returns: `{ completedCount, skippedCount, pendingCount, totalScheduled, completionRate, message, isAllCompleted }`.
  - Produces encouraging messages (e.g., `"1 of 2 routines completed today."`, `"All routines completed for today. Well done!"`, `"1 completed, 1 skipped today."`).
  - No streak count or shaming vocabulary is generated.
- **Forward Schedule Modification Explanation (`explainScheduleChangeImpact`)**:
  - Returns clear explanation of whether changes take effect immediately (`<= todayStr`) or on a future date (`effectiveDate`), explicitly assuring the user that past history is preserved without deletion or corruption.

### 2. Accessible Web Components (`@daynori/ui-web`)

- **`RoutineRow`**:
  - Accessible list item with `role="checkbox"` and `aria-checked` indicator.
  - Clean touch-friendly action controls (Done checkbox, Skip button, Undo button, History viewer button).
  - Explicit text status badges (`Done`, `Skipped`, `Pending`, `Paused`) and cadence explanation strings.
- **`RoutineDetailEditor`**:
  - Accessible modal dialog (`role="dialog"`, `aria-modal="true"`) for creating and editing routine templates.
  - Frequency selector (`daily`, `weekdays`), interactive weekday toggle chips (`M`, `T`, `W`, `T`, `F`, `S`, `S`), scheduled time picker (`HH:mm`), IANA timezone picker, active period bounds, effective date selector, and live schedule change impact preview.
- **`RoutineHistoryViewer`**:
  - Modal dialog displaying historical occurrences and audit logs.
  - Displays gentle progress stats, chronological occurrence cards with formatted timestamps, and reopen controls.

### 3. Accessible Mobile Components & Views (`@daynori/ui-mobile`, `apps/mobile`)

- **`MobileRoutineRow`**:
  - React Native checklist component with touch targets >= 48dp (`touchTargets.mobileMin`).
  - Accessible labels for screen readers (e.g. TalkBack).
  - Supports Done, Skip, Reopen, and History inspection.
- **Mobile `TodayView` (`apps/mobile/src/views/TodayView.tsx`)**:
  - Integrated with `MobileRoutineRow`, gentle progress banner, separate tasks card, and `MobileModalSheet` for routine history inspection.
  - Implements floating reversible undo toast with accessible button.

### 4. Production Web Today Experience (`apps/web/src/components/TodayView.tsx`)

- Connected to `IndexedDbLocalRepository`, `useAuth()`, and `SyncEngine`.
- Auto-generates today's occurrences deterministically on load if missing offline.
- Interactive Done/Skip/Reopen with 5-second floating undo toast.
- Full creation/editing via `RoutineDetailEditor` modal with schedule reconciliation.
- Full occurrence history inspection via `RoutineHistoryViewer` modal.
- Strictly separate cards for daily routines vs tasks due today.

## Consequences

- **Positive**:
  - Daily routine completion is completely insulated from one-off task backlogs.
  - Users experience a calm, guilt-free daily organizer without streak anxiety.
  - Reversible floating undo provides peace of mind against misclicks.
  - Multi-day history and yesterday's completion are preserved deterministically across offline IndexedDB/SQLite storage and online PostgreSQL sync.
- **Tradeoffs & Deferred Items**:
  - Physical Android hardware, TalkBack audio output verification, and hardware KeyStore release gates remain blocked in local development environments.
