# Phase 73: Tasks routines and calendar workflow completion

## Identity and scope

- Phase: [73 — Tasks routines and calendar workflow completion](../roadmap/phases/73-tasks-routines-and-calendar-workflow-completion.md).
- Status: **complete** (owner scheduling amendment [ADR 0073](../decisions/0073-phase-73-before-phase-71-acceptance.md); Phase 71 remains blocked/incomplete).
- Contributor/date: Cursor agent, 2026-10-27, Asia/Dhaka.
- Base revision/branch: `c9d767f`, `codex/free-core-preview`.
- Prerequisites: Phases 69, 70, and 72 complete. Phase 71 referenced input only (ADR 0073).
- Completion commit subject: `feat(planning): complete clear task routine and calendar journeys`

## Result

### Scheduling

- [ADR 0073](../decisions/0073-phase-73-before-phase-71-acceptance.md) records the 2026-10-27 owner amendment.
- Plan Phase 73 `dependsOn`: `["69","70","72"]`.
- Phase 71 stays **blocked** (spoken TalkBack; remaining Phase 71 verification). Security and release gates unchanged.

### Editors and Plan surfaces

- Web `TaskDetailEditor` / `RoutineDetailEditor`: required-fields-first (title + deadline or frequency/weekdays); optional notes/priority/folder/tags/subtasks/advanced schedule under **Details (optional)**.
- Mobile `PlanView` task sheet: same primary/Details split; calendar agenda/day rows open the same task or routine record.
- Canonical deep links: Plan accepts `taskId` / `task` / `targetId`; Calendar links use `/plan?taskId=` and `/?routineId=`; Today opens `routineId`.

### Domain / API invariants (selected family)

- Task complete/reopen keeps the same id and deadline (no tomorrow copy).
- Routine occurrence complete/skip leaves other dates independent.
- Calendar feed create/edit/delete and task-deadline projection remain same-record (phase 26 integration).

### Feature register / Help

- Calendar family actions in `function-register.json` refreshed to `verified_local` with honest evidence layers.
- Help how-to copy updated for required-fields-first tasks, no-tomorrow-copy, and calendar canonical opens.

## Acceptance evidence

### Unit / domain / integration (Node v24.21.0)

| Check | Command | Result |
| --- | --- | --- |
| Phase 73 unit + domain + PlanView + phase70 layout | `node node_modules/vitest/vitest.mjs run tests/unit/phase73-plan-workflows.test.ts …` | **102 pass** (prior combined) |
| Task/routine/calendar integration | `… phase18… phase19… phase20… phase21… phase26…` + phase73 unit | **84 pass** |
| Core organizer e2e | `… tests/e2e/core-organizer-journeys.test.ts` | **13 pass** |
| Planning | `node scripts/validate-planning.mjs` | Pass |
| Function register | `node scripts/validate-function-register.mjs` | Pass (109 actions) |

### Native / browser limits

- Native Android create/reopen chrome remains available via existing PlanView + Dev Client path; **spoken TalkBack listen-through stays a Phase 71 gate** (not waived).
- Interactive desktop password-manager / full browser calendar click-through matrix not separately timed this cycle beyond unit/source + API/e2e journeys.
- Mobile personal-event edit still surfaces via calendar agenda (same event id path); full event sheet parity remains lightweight.

## Defects, limitations and recovery

1. Phase 71 remains blocked; TalkBack is not waived by this phase.
2. Phase 74 still lists Phase 71 as a hard dependency — do not auto-start 74.
3. No push, paid services, store submission, or production activation.

## Documentation and Git review

- ADR 0073; plan/progress; Phase 71/72 handoff notes; this report; CHANGELOG; Help; function register.

## Handoff

Phase 73 **complete**. Next eligible phase: none until Phase 71 completes (Phase 74 `dependsOn` includes 71) or the owner amends again. Do not mark Phase 71 complete.
