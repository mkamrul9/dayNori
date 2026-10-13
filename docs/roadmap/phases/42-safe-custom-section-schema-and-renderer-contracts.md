# Phase 42 — Safe custom section schema and renderer contracts

Group: Personal extensions. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [38 — Controlled private beta](38-controlled-private-beta.md)
- [32 — Knowledge guides and cheatsheet organization](32-knowledge-guides-and-cheatsheet-organization.md)
- [40 — Expense capture reports and budgets](40-expense-capture-reports-and-budgets.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain custom-sections
- packages/contracts
- apps/api custom-sections

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Define versioned custom section schemas for both approved views of existing notes/tasks/routines/files/journals/expense summaries and bounded structured text/checklist/date/number/link/attachment field collections.
2. Support template instances, user labels, collection placement, order, and typed validation with bounded field/item limits.
3. Define renderer migration/fallback contracts and data export; prohibit user scripts, arbitrary SQL, and untrusted executable embeds.

## Acceptance

- Users can define a new structured section without developer-written code.
- Invalid schemas and unknown block versions fail safely without losing existing values.
- Custom data remains organized, searchable where eligible, exportable, and tenant-scoped.
- Existing-record view blocks reference canonical authorized items rather than copying content or granting access.

## Verification and evidence

- Test schema validation/migration, field removal preservation, limits, malicious input, and permissions.
- Round-trip custom records through API and local storage.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/data-model.md](../../architecture/data-model.md)
- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)

## Commit target

`feat(customization): add safe versioned custom section schemas`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
