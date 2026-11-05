# Phase 94 — Structured organizer tools and multi-action creation

Group: V2 daily assistant. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [93 — Reviewed note task and journal creation](93-reviewed-note-task-and-journal-creation.md)
- [76 — Expenses and safe custom sections completion](76-expenses-and-safe-custom-sections-completion.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api
- packages/contracts
- packages/domain
- apps/web
- apps/mobile
- tests/integration

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Extend the approved tool catalog to routines/events/folders/knowledge notes/custom-section blocks and validated expense drafts where supported.
2. Add missing bounded public contracts/domain-service interfaces before exposing tools; validate all cross-record references and dates/money.
3. Implement ordered review, per-action selection, declared transaction boundaries, durable partial-failure recovery and safe retry.

## Acceptance

- A user can request supported organizer creation in plain text without manually assembling every form, then review/save the result.
- Generated sections use approved blocks only; no arbitrary scripts, SQL, sharing, purchases, account deletion or vault tools.
- Partial success is reported accurately; receipt-bound retries do not repeat already completed actions.

## Verification and evidence

- Run per-tool schema/authorization/domain-invariant and multi-step interruption/partial-failure tests.
- Exercise routine/timezone, event/all-day, section/reference and expense/currency previews in live synthetic chat/tours.

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
- [docs/roadmap/v2/assistant.md](../v2/assistant.md)
- [docs/product/requirements.md](../../product/requirements.md)

## Commit target

`feat(assistant): add safe structured and multi-action organizer tools`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
