# Phase 50 — Optional external Drive folder mirroring

Group: Vault and Drive. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [48 — Drive scope and external folder feasibility](48-drive-scope-and-external-folder-feasibility.md)
- [49 — Drive selected-file connector](49-drive-selected-file-connector.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/worker drive indexing
- apps/api external folders
- apps/web files
- apps/mobile files

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Proceed only if Phase 48's broader-access decision and any required verification are satisfied; otherwise record this optional feature as deferred.
2. Implement a selected folder boundary with tested recursive policy, incremental provider changes, pagination, reconciliation, and rate/backoff controls.
3. Show externally-added authorized files, source deletion/move, cache/offline status, and clear provider versus app storage ownership.

## Acceptance

- When enabled, new files placed directly in the configured Drive folder become visible within the documented observed sync interval.
- Reconciliation handles missed cursors and cannot enumerate unselected folders in the app UI.
- If deferred, UI/store claims omit automatic folder mirroring and the unresolved prerequisite remains visible in progress.

## Verification and evidence

- Test external create/move/delete, nested folders, inaccessible children, changed permissions, expired change cursor, and rate limits.
- Review verified scopes and service cost before release; deferral is not implemented completion.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/integrations-and-reminders.md](../../architecture/integrations-and-reminders.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`feat(drive): mirror approved external folder content`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
