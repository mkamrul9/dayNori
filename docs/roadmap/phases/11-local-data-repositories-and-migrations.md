# Phase 11 — Local data repositories and migrations

Group: Foundation and sync. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [10 — Personal workspace and preferences](10-personal-workspace-and-preferences.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain repository ports
- packages/sync
- apps/mobile data
- apps/web data

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement encrypted SQLite and reviewed native key wrapping on mobile after Phase 03 proves support; implement IndexedDB on web with explicit trusted-device persistence consent, opt-out, and clear-data controls. Store item headers, drafts, pending mutations, cursors, and preference snapshots.
2. Define local schema migrations and account-scoped namespaces; add transaction-safe write/read operations.
3. Expose persistence failures and storage quota conditions without showing a false saved state.

## Acceptance

- Drafts survive app/process restart and normal offline navigation.
- Signing into another account cannot display previous account content.
- Interrupted migration either finishes safely or returns a documented recovery path.
- Native cached ordinary data follows the reviewed encryption/key lifecycle; browser persistence requires deliberate consent and is never described as client-encrypted normal content.

## Verification and evidence

- Test adapter contract parity, crash/restart, quota failure, and migration from a prior fixture.
- Run real Android SQLite and browser IndexedDB persistence checks.
- Test browser trusted-device refusal, clear-data/account switch, and native encryption key failure/reinstall; inspect raw local storage with synthetic data.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/sync-and-offline.md](../../architecture/sync-and-offline.md)
- [docs/architecture/data-model.md](../../architecture/data-model.md)
- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)

## Commit target

`feat(storage): add account-scoped local persistence adapters`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
