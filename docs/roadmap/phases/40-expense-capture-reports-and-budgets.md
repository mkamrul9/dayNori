# Phase 40 — Expense capture reports and budgets

Group: Personal extensions. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [39 — Expense tracking domain](39-expense-tracking-domain.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web expenses
- apps/mobile expenses
- apps/api reports

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Build fast manual entry, category/date filters, receipt attachment, and month/category summaries.
2. Add optional per-currency budgets, accessible chart/list alternatives, and CSV export.
3. Make the module opt-in and avoid placing financial summaries on the default home.

## Acceptance

- Users can enter an expense quickly and verify its inclusion in the correct monthly total.
- Charts have exact accessible values and clear currencies.
- Budget messages describe tracking and do not present financial advice.

## Verification and evidence

- Run capture/edit/filter/report/export journeys and reconcile totals with domain fixtures.
- Review chart readability, large text, keyboard operation, and privacy defaults.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/design/design-system.md](../../design/design-system.md)
- [docs/engineering/quality.md](../../engineering/quality.md)

## Commit target

`feat(expenses): add capture reports and optional budgets`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
