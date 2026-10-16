# Phase 19: Upcoming task lists and detail views

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [19 — Upcoming task lists and detail views](../roadmap/phases/19-upcoming-task-lists-and-detail-views.md)
- **Status:** `blocked` (Provisional upcoming task lists, priority views, detail editors, subtask hierarchy, and multi-platform Plan interfaces delivered under owner authorization and verified across Vitest pure domain, integration journeys, Web Next.js Plan page, and Mobile React Native PlanView; completion blocked pending prerequisite Phase 04–06 and Phase 11 physical Android TalkBack hardware, and KeyStore release gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-16.
- **Base Git revision and branch:** `41061fc` on `main`.
- **Prerequisites:**
  - [Phase 18 — Upcoming task domain and deadlines](phase-18.md): Canonical task entity, explicit deadline representation (`none`, `date`, `timed`), timezone math, subtask hierarchy, and sync commands.
  - **Prerequisite repairs committed in `41061fc` (`fix(tasks): repair task query safety, concurrency locking, and subtask depth validation`):**
    1. SQL parameterization of `userTimezone` to eliminate SQL injection vulnerabilities.
    2. Bracketed `OR` predicate in Today view SQL query to prevent accidental bypass of tenant RLS or status filters.
    3. Deterministic SQL ordering before pagination `LIMIT` clauses to prevent duplicate or skipped tasks across cursor pages.
    4. Strongly bound continuation cursor types to prevent tampering or out-of-bounds page jumps.
    5. Timezone consistency in `getTaskDeadlineSortKey` using explicit reference dates.
    6. Subtask subtree depth enforcement (`MAX_SUBTASK_DEPTH = 3`) validating both existing subtrees and prospective insertions.
    7. Concurrency locking on task mutations with optimistic revision verification (`baseRevision`).
    8. Durable idempotency replay returning original mutation receipts on repeated identical operation IDs.
    9. Local projection preservation on tombstones and metadata changes in SyncEngine.
    10. Tag reconciliation ensuring tasks synchronize cleanly with `app.tags` and `app.item_tags`.
    - All repairs verified by `tests/integration/phase18-prerequisite-repairs.test.ts` (8/8 tests passing).
- **Included scope:**
  - **Domain Logic & Timezone Helpers (`packages/domain/src/tasks.ts`):**
    - `formatTaskDeadlineExplanation`: Evaluates deadlines against viewing timezone, returning structured labels, overdue flags, human-readable overdue duration with explicit date references (not color alone), and timezone notes.
    - `checkLocalTimeDisambiguation`: Validates prospective timed deadlines against DST transitions, identifying nonexistent "spring forward" gaps and ambiguous "fall back" overlaps.
  - **Accessible Web Components (`packages/ui-web`):**
    - `TaskRow`: Accessible row component with custom checkbox (`role="checkbox"`, `aria-checked`), title, priority badges, explicit overdue warnings (`role="status"`), folder tag, tag chips, subtask count indicators, and bulk selection controls.
    - `TaskDetailEditor`: Accessible modal dialog (`role="dialog"`, `aria-modal="true"`) for editing task titles, details, priority, status, folder, tags, subtasks (with depth checks), and deadlines (none, date, timed with timezone selector and DST warnings).
  - **Web Plan Page (`apps/web/src/app/plan/page.tsx`):**
    - Fully connected to production `IndexedDbLocalRepository`, `useAuth()`, and `SyncEngine`.
    - Dedicated priority views: Today, Upcoming, Overdue, Completed, Undated, and All Tasks.
    - Quick capture bar with deadline presets (`Today`, `Tomorrow`, `No date`).
    - Filter controls by priority and folder; sort controls by deadline, priority, or creation date.
    - Confirmable bulk actions (complete, delete, move) operating on explicit IDs with confirmation dialog showing exact counts.
    - Floating undo toast allowing 5-second reversal of task completions.
    - Accessible live announcements via `aria-live="polite"` region.
    - Timezone selector allowing users to preview deadlines in different IANA zones (e.g. `Asia/Dhaka`, `America/New_York`, `UTC`).
  - **Mobile Plan View (`apps/mobile/src/views/PlanView.tsx`):**
    - Connected to `LocalRepositoryPort` and `SyncEngine` while preserving routines and calendar subviews.
    - Quick capture bar with deadline preset buttons.
    - View filter pills for switching between Today, Upcoming, Overdue, Completed, and All.
    - Task list with priority badges, text-based overdue explanations, folder indicators, and subtask counters.
    - Modal bottom sheet editor (`MobileModalSheet`) for task detail editing, subtasks, and deadline selection.
    - Reversible completion with bottom undo banner.
  - **Sync Support (`packages/sync`):**
    - Enhanced `SyncEngine` with topological dependency inference for task commands (`createTask`, `completeTask`, `updateTask`, `trashTask`).
    - Flexible options accepting `deviceId` and optional namespace fallbacks.
  - **Integration Testing:**
    - `tests/integration/phase19-tasks-workflows.test.ts`: 8 comprehensive end-to-end multi-actor journeys validating task lifecycle, offline capture, conflict recovery, cross-timezone date stability, leap year/DST handling, bulk actions safety, accessibility text explanations, and workspace isolation.
- **Excluded/deferred scope:**
  - Daily routines, recurring habits, routine completions, and review flows belong to Phase 20 (Routines) and remain strictly separated.
  - Audio capture, check-ins, and reminders belong to later phases.
  - Physical Android TalkBack and hardware KeyStore release gates remain blocked pending physical hardware testing.

## Result

Delivered the complete Phase 19 upcoming task workflows, priority views, detail editors, subtask management, and multi-platform plan interfaces across `packages/domain`, `packages/ui-web`, `packages/sync`, `apps/web`, and `apps/mobile`:

1. **Dedicated Priority Views**: Users can seamlessly toggle between Today, Upcoming, Overdue, Completed, Undated, and All Tasks.
2. **Accessible Overdue & Timezone Explanations**: Overdue status is explicitly communicated through text and dates (e.g. `"Overdue by 3 days (due Feb 10, 2026)"`), ensuring non-reliance on color alone. Timezones are displayed when relevant, and DST transitions are validated.
3. **Subtask Hierarchy & Safety Invariants**: Subtasks nest cleanly up to a maximum depth of 3 levels. Self-parenting and cyclic reparenting are rejected both client-side and server-side.
4. **Separation from Daily Routines**: One-off task items remain completely distinct from daily routines and recurring habits.
5. **Safe Bulk Actions**: Confirmable bulk actions operate exclusively on reviewed, visible selections with explicit ID arrays, preventing accidental off-screen mutations.
6. **Reversible Quick Completion**: Completing a task triggers an accessible undo prompt allowing instant restoration and audit history tracking.

## Acceptance evidence

| Acceptance Condition                                 | Verification Method                                                                                          | Location / Artifact                                                         | Result                                                              |
| :--------------------------------------------------- | :----------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------- | :------------------------------------------------------------------ |
| **Prerequisite Phase 18 Defects Repaired**           | Integration test suite verifying SQL parameterization, enclosed predicates, deterministic order, and cursors | `tests/integration/phase18-prerequisite-repairs.test.ts`                    | **PASS**: 8/8 prerequisite tests passed cleanly (commit `41061fc`). |
| **Upcoming & Priority Views Workflows**              | Multi-actor integration tests verifying Today, Upcoming, Overdue, Completed, and Undated views               | `tests/integration/phase19-tasks-workflows.test.ts`                         | **PASS**: All 8 lifecycle & filter journeys passed.                 |
| **Cross-Timezone Stability & DST Disambiguation**    | Tests asserting Asia/Dhaka and America/New_York date preservation, leap day dates, and DST warnings          | `tests/integration/phase19-tasks-workflows.test.ts`                         | **PASS**: No date slippage; DST disambiguation accurate.            |
| **Subtask Hierarchy & Depth Invariants**             | Unit & integration tests asserting depth <= 3 and cycle rejection across Web and Mobile components           | `packages/domain/src/domain.test.ts`, `tests/integration`                   | **PASS**: Depth bounds and cycle prevention verified.               |
| **Accessible Overdue Explanations & Screen Readers** | Component tests and integration assertions on text-based overdue warnings, ARIA attributes, and live regions | `packages/ui-web/src/ui-web.test.ts`, `tests/integration`                   | **PASS**: Overdue text and dates verified without color reliance.   |
| **Safe Confirmable Bulk Operations**                 | Integration tests verifying bulk operations with explicit ID arrays affecting only visible selections        | `tests/integration/phase19-tasks-workflows.test.ts`                         | **PASS**: Bulk actions confirmed and scoped safely.                 |
| **Web Plan Page Typechecking & Build**               | TypeScript compilation and package bundle build for `@daynori/web` and `@daynori/ui-web`                     | `pnpm --filter @daynori/web typecheck`                                      | **PASS**: 0 type errors, clean compilation.                         |
| **Mobile Plan View Typechecking & Tests**            | React Native TypeScript compilation and mobile test suite execution                                          | `pnpm --filter @daynori/mobile typecheck`, `apps/mobile/src/mobile.test.ts` | **PASS**: 23/23 mobile tests passed cleanly.                        |
| **Monorepo Strict Type Checking**                    | Monorepo TypeScript verification across all 13 workspace projects                                            | `pnpm typecheck`                                                            | **PASS**: 13/13 projects cleanly checked.                           |
| **Code Style & Formatting**                          | Monorepo Prettier and ESLint validation                                                                      | `pnpm lint` & `pnpm format:check`                                           | **PASS**: 0 lint errors, 0 warnings; all files formatted.           |
| **Secret Scanning**                                  | Repository secret scanner inspecting working tree and Git objects                                            | `node scripts/scan-secrets.mjs`                                             | **PASS**: 1628 files checked, 0 secrets detected.                   |
| **Planning Consistency**                             | Roadmap planning validator checking phases, requirements, and dependencies                                   | `node scripts/validate-planning.mjs`                                        | **PASS**: 64 phases and 22 requirements validated.                  |

### Commands Executed

```bash
# Prerequisite repairs regression suite
pnpm vitest run tests/integration/phase18-prerequisite-repairs.test.ts
# Exit code: 0, 8 tests passed

# Phase 19 integration test journeys
pnpm vitest run tests/integration/phase19-tasks-workflows.test.ts
# Exit code: 0, 8 tests passed

# Full monorepo test suite (36 test files, 454 tests)
pnpm test
# Exit code: 0, 36 files passed, 454 tests passed

# Web and mobile typechecking
pnpm --filter @daynori/web typecheck
pnpm --filter @daynori/mobile typecheck
# Exit code: 0 across all clients

# Workspace typecheck
pnpm typecheck
# Exit code: 0, 13 projects cleanly checked

# Monorepo linting
pnpm lint
# Exit code: 0, 0 errors, 0 warnings

# Formatting check
pnpm format:check
# Exit code: 0, all matched files use Prettier style

# Secret scan
node scripts/scan-secrets.mjs
# Exit code: 0, 1628 files checked, 0 secrets found

# Planning validation
node scripts/validate-planning.mjs
# Exit code: 0, canonical plan is consistent
```

## Defects, limitations and recovery

- **Physical Android & TalkBack Verification (Blocked Gate):** Automated unit, mock, and component tests verify React Native components, but verification on physical Android hardware with TalkBack screen reader remains blocked pending physical device lab access.
- **Hardware KeyStore Gate (Blocked Gate):** Hardware-backed key wrapping verification on physical Android devices remains blocked.
- **Rollback and Recovery:**
  - Non-destructive rollback: If rollback of Phase 19 UI is ever required, `apps/web/src/app/plan/page.tsx` and `apps/mobile/src/views/PlanView.tsx` can be restored without affecting underlying stored tasks or migrations.
  - Task completion undo is instantaneous and client-side reversible within a 5-second toast window.
  - All task mutations emit durable mutation receipts into `IndexedDbLocalRepository` and `SqliteLocalRepository`, ensuring offline continuity and conflict recovery.

## Documentation and Git review

- **Updated Architecture Documentation:**
  - Published [ADR-0025: Upcoming Task Workflows, Priority Views, and Multi-Platform Plan Interfaces](../decisions/0025-upcoming-task-workflows-and-views.md).
  - Updated [ADR Index](../decisions/README.md) linking ADR-0025.
- **Roadmap & Changelog:**
  - Updated `CHANGELOG.md` with Phase 19 release notes.
  - Updated `docs/roadmap/progress.json` setting Phase 19 status to `blocked` with explicit notes on software completeness and hardware gates.
- **Git Hygiene:**
  - Conventional commit subject: `feat(tasks): add upcoming task workflows and priority views`.

## Handoff

- **Completed Deliverable:** Phase 19 upcoming task workflows, priority views, detail editors, subtask management, and multi-platform plan interfaces across Web and Mobile.
- **Next Phase:** [Phase 20 — Daily routine schedules and occurrences](../roadmap/phases/20-daily-routine-schedules-and-occurrences.md): Daily routine models, recurrence rules, and habit tracking.
- **Stop Condition:** Work on Phase 19 is complete; stop before beginning Phase 20 as instructed.
