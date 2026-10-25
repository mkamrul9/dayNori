# Phase 76 — Expenses and safe custom sections completion

Group: V2 everyday experience. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [73 — Tasks routines and calendar workflow completion](73-tasks-routines-and-calendar-workflow-completion.md)
- [74 — Library writing journal and search completion](74-library-writing-journal-and-search-completion.md)
- [75 — Files and audio attachment readiness](75-files-and-audio-attachment-readiness.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web/src/app/expenses
- apps/web/src/app/custom-sections
- apps/mobile/src/views
- apps/api
- packages/domain

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Apply simple expense entry, categories/budgets/reports and approved section templates with optional advanced controls.
2. Verify money/currency/date rules and typed-block validation, accessible ordering, schema migration and referenced-item preservation.
3. Complete missing bounded family actions from the inventory and attach instructions/coverage without exposing arbitrary code or SQL.

## Acceptance

- Expense create/edit/report/export and section create/fill/reorder/remove/recover journeys work across promised platforms.
- Section removal preserves referenced records and recoverable field values; invalid blocks and cross-scope attachments are rejected.
- Modules are optional in navigation but reachable through All features when released and authorized.

## Verification and evidence

- Run relevant money/expenses/section integration, migration and authorization checks.
- Inspect mobile forms, reports, keyboard reorder and text scaling in both themes.

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
- [docs/product/requirements.md](../../product/requirements.md)
- [docs/roadmap/v2/design-and-mobile.md](../v2/design-and-mobile.md)

## Commit target

`feat(extensions): finish expenses and approved custom sections`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
