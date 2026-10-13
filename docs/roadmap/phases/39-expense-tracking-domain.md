# Phase 39 — Expense tracking domain

Group: Personal extensions. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [38 — Controlled private beta](38-controlled-private-beta.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain expenses
- apps/api expenses module
- packages/contracts

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement manual expense/income/refund records, user categories, dates, notes, optional receipt references, and folder organization. A refund references an original expense, uses its currency, and reduces spending rather than increasing income; partial refunds cannot cumulatively exceed the original without a later reviewed policy.
2. Store money as integer minor units with currency metadata and explicit precision; do not sum unrelated currencies.
3. Add recurring entry templates and month totals without bank linking, tax claims, or financial advice.
4. Define transaction-date reporting for refunds, category inheritance, reversal/edit/trash constraints, and original-expense deletion before writing migrations; defer account transfers unless separately specified.

## Acceptance

- Amounts round-trip accurately without floating-point drift.
- Totals are grouped by currency and local date boundaries.
- Receipts remain governed by the file access policy and private by default.

## Verification and evidence

- Test zero/negative/currency precision rules, category deletion, date boundaries, and receipt permissions.
- Test recurrence deduplication and offline conflict behavior.
- Test partial/full/concurrent refunds, currency mismatch, over-refund rejection, category totals, and deletion of a referenced original expense.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/product/requirements.md](../../product/requirements.md)
- [docs/architecture/data-model.md](../../architecture/data-model.md)

## Commit target

`feat(expenses): add precise manual expense and income records`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
