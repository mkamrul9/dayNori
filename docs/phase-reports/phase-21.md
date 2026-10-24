# Phase 21: Daily routine experience and history

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [21 — Daily routine experience and history](../roadmap/phases/21-daily-routine-experience-and-history.md)
- **Status:** `blocked` (Provisional daily routine checklist, gentle non-punitive progress, reversible undo interaction, occurrence history inspection, and web/mobile Today agenda interfaces delivered under owner authorization and verified across Vitest pure domain, UI component tests, Web/Mobile Today views, and multi-day integration journeys; completion blocked pending prerequisite Phase 04–06 and Phase 11 physical Android TalkBack hardware and KeyStore release gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-16.
- **Base Git revision and branch:** `f7404c0` on `main`.
- **Prerequisites:**
  - [Phase 20 — Daily routine schedules and occurrences](phase-20.md): Daily routine schedule templates, date-scoped occurrence engine, PostgreSQL unique constraint `uq_routine_occurrence_date`, and forward schedule reconciliation.
- **Included scope:**
  - **Shared Domain Logic (`packages/domain/src/routines.ts`):**
    - `explainWhyDueToday`: Structured explanations of routine recurrence (`daily`, `weekdays`, custom days with local time) and due status for any target calendar date.
    - `calculateGentleProgress`: Non-punitive evaluation of daily routine participation (`completedCount`, `skippedCount`, `completionRate`, encouraging message), completely free from streak shaming or guilt banners.
    - `explainScheduleChangeImpact`: Clear explanations of forward-effective schedule modifications with history preservation guarantees.
  - **Accessible Web Components (`packages/ui-web`):**
    - `RoutineRow.tsx`: Accessible checklist row with `role="checkbox"`, Done/Skip/Undo/History controls, due explanation notes, and text status badges.
    - `RoutineDetailEditor.tsx`: Modal dialog (`role="dialog"`, `aria-modal="true"`) for creating and editing routine schedules, weekdays, scheduled times, IANA timezones, active date ranges, and live schedule impact previews.
    - `RoutineHistoryViewer.tsx`: Dialog showing chronological past occurrences, gentle routine overview stats, audit logs, and occurrence reopen controls.
  - **Accessible Mobile Components (`packages/ui-mobile`):**
    - `MobileRoutineRow.tsx`: React Native checklist row with touch targets >= 48dp (`touchTargets.mobileMin`), TalkBack accessible labels, Done/Skip/Reopen pills, and history inspection.
  - **Web Application Today Experience (`apps/web/src/components/TodayView.tsx`):**
    - Connected to `IndexedDbLocalRepository`, `useAuth()`, and `createWebSyncEngine()`.
    - Auto-generates today's occurrences deterministically on page load if missing.
    - Interactive Done/Skip/Reopen with 5-second reversible floating undo toast.
    - Modal integration for creating and editing routines (`RoutineDetailEditor`).
    - Modal integration for viewing past occurrences and gentle progress (`RoutineHistoryViewer`).
    - Strict visual and structural partitioning of daily routines from one-off tasks due today.
  - **Mobile Application Today Experience (`apps/mobile/src/views/TodayView.tsx`):**
    - Connected to `MobileRoutineRow` with touch-friendly controls.
    - Floating reversible undo toast with accessible button.
    - Bottom sheet (`MobileModalSheet`) for occurrence history inspection with yesterday's completion and gentle progress stats.
    - Maintained interactive state switchers (`normal`, `empty`, `loading`, `error`) for visual verification.
  - **Integration & Unit Test Coverage:**
    - `tests/integration/phase21-daily-routines-experience.test.ts`: End-to-end multi-day journey testing deterministic occurrence generation, completion transitions, reversible undo, multi-day progression, yesterday's completion retention, schedule modification impact, gentle progress calculation, and tenant isolation.
    - Unit tests across `packages/domain`, `packages/ui-web`, `packages/ui-mobile`, and `apps/mobile`.
- **Excluded/deferred scope:**
  - Phase 22 (Journal entries and privacy defaults): Private dated journal entries, reflection metadata, personal workspace isolation, and RLS.
  - Physical Android TalkBack and hardware KeyStore release gates remain blocked pending physical hardware testing.

## Result

Delivered the complete Phase 21 daily routine checklist and history experience across web, mobile, shared domain, and UI component packages:

1. **Pure Domain Helpers (`packages/domain/src/routines.ts`)**:
   - `explainWhyDueToday`: Evaluates cadence and active periods against a viewing date, returning human-readable explanations (e.g., `"Repeats weekdays (Mon–Fri) at 09:00"`, `"Due today"`).
   - `calculateGentleProgress`: Calculates non-punitive participation metrics and encouraging progress messages without streak dependency or forced notifications.
   - `explainScheduleChangeImpact`: Generates plain-language descriptions of how schedule changes affect future occurrences while reassuring the user of historical preservation.

2. **Web Checklist & History Interface (`packages/ui-web`, `apps/web`)**:
   - Built `RoutineRow`, `RoutineDetailEditor`, and `RoutineHistoryViewer` following Daynori design tokens and WAI-ARIA accessibility standards.
   - Updated `apps/web/src/components/TodayView.tsx` to provide a complete, responsive Today agenda experience that keeps daily recurring practices strictly separate from one-off tasks.

3. **Mobile Checklist & History Interface (`packages/ui-mobile`, `apps/mobile`)**:
   - Built `MobileRoutineRow` with minimum 48dp touch targets and clear accessible labels.
   - Updated `apps/mobile/src/views/TodayView.tsx` to support interactive checklist completion, floating reversible undo notifications, and `MobileModalSheet` occurrence history inspection.

4. **Multi-Day Journey & History Preservation Testing**:
   - Authored `tests/integration/phase21-daily-routines-experience.test.ts` verifying that completing an occurrence on Day 1 preserves that record in history with exact timestamps when advancing to Day 2, while Day 2 begins with a fresh pending occurrence.

## Verification and evidence

### Automated Test Suites

```
1. Unit Tests (All 38 test files, 510 tests passing):
   pnpm test:unit
   Output: Test Files 38 passed (38), Tests 510 passed (510), Duration 10.05s

2. Integration Tests (All 13 test files, 182 tests passing):
   pnpm test:integration
   Output: Test Files 13 passed (13), Tests 182 passed (182), Duration 5.84s

3. Web Application Typecheck (0 errors):
   pnpm --filter @daynori/web typecheck
   Output: tsc --noEmit (Exit status 0)

4. Mobile Application Typecheck (0 errors):
   pnpm --filter @daynori/mobile typecheck
   Output: tsc --noEmit (Exit status 0)

5. Monorepo-wide Typecheck (All 13 workspace projects, 0 errors):
   pnpm typecheck
   Output: pnpm -r run typecheck (Exit status 0)

6. Monorepo-wide Linting (0 warnings, 0 errors):
   pnpm lint
   Output: eslint . (Exit status 0)

7. Code Style Verification:
   pnpm format:check
   Output: All matched files use Prettier code style! (Exit status 0)

8. Secret Scanning:
   node scripts/scan-secrets.mjs
   Output: Secret scanning passed: checked 1644 files without detecting unapproved secrets.

9. Planning Validation:
   node scripts/validate-planning.mjs
   Output: Planning validation passed: 64 phases, 22 mapped requirements, 174 Markdown files.
```

## Decisions and deviations

- **Decision [ADR-0027](../decisions/0027-daily-routine-checklist-and-history.md)**: Daily Routine Checklists, Non-Punitive Progress, and Completion History.
- **Contract Alignment**: Updated `WeekdaySchema` in `@daynori/contracts` to infer union literals `1 | 2 | 3 | 4 | 5 | 6 | 7` instead of generic `number`, ensuring strict compile-time type safety across domain, contracts, sync, API, and UI packages.
- **No-Punitive Streak Policy**: Explicitly avoided all streak counters and shaming language in `calculateGentleProgress` and UI components, fulfilling the core Daynori product philosophy.

## Limitations and blocked release gates

- **Physical Android Device & TalkBack Hardware Gate**: Testing was executed in Node/Vitest using `react-test-renderer` and accessibility property verification. Physical Android device verification with TalkBack audio output is blocked in the local development environment pending physical hardware.
- **Hardware KeyStore Gate**: Native Android hardware KeyStore release gate remains blocked pending physical device deployment.

## Next steps

- Stop strictly before Phase 22 in accordance with contributor rules.
- Next ready phase is [Phase 22 — Journal entries and privacy defaults](../roadmap/phases/22-journal-entries-and-privacy-defaults.md).
