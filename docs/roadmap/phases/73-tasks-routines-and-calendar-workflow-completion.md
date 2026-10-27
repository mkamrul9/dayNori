# Phase 73 — Tasks routines and calendar workflow completion

Group: V2 everyday experience. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [69 — Desktop shell and focused Today experience](69-desktop-shell-and-focused-today-experience.md)
- [70 — Mobile web and PWA layout redesign](70-mobile-web-and-pwa-layout-redesign.md)
- [72 — Welcome startup onboarding and authentication polish](72-welcome-startup-onboarding-and-authentication-polish.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web/src/app/plan
- apps/mobile/src/views/PlanView.tsx
- apps/api
- packages/domain
- packages/contracts

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Apply simple required-fields-first editors and coherent list/agenda/month views to tasks, routines and private events.
2. Repair inventoried family-specific gaps in completion/undo, priorities/subtasks, recurrence history, date-only/timed semantics and timezone projections.
3. Keep canonical source links and mutation receipts; update feature register and contextual instructions.

## Acceptance

- Create/edit/reopen/complete/undo journeys pass on web/PWA and native Android for the selected family.
- Task completion never creates tomorrow copies; routine occurrences remain independent and calendar edits target the same record.
- Offline/retry/conflict and invalid date/schedule cases preserve content with actionable errors.

## Verification and evidence

- Run relevant task/routine/calendar domain, integration and UI journeys including timezone changes.
- Inspect mobile pickers, long lists, empty/error states and keyboard/screen-reader controls.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/roadmap/v2/feature-coverage.md](../v2/feature-coverage.md)
- [docs/engineering/handoff.md](../../engineering/handoff.md)
- [docs/roadmap/v2/design-and-mobile.md](../v2/design-and-mobile.md)
- [docs/product/requirements.md](../../product/requirements.md)
- [docs/decisions/0073-phase-73-before-phase-71-acceptance.md](../../decisions/0073-phase-73-before-phase-71-acceptance.md)
- [docs/phase-reports/phase-71.md](../../phase-reports/phase-71.md)

## Commit target

`feat(planning): complete clear task routine and calendar journeys`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
