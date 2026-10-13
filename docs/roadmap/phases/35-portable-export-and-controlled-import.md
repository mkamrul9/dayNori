# Phase 35 — Portable export and controlled import

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [34 — Conflict recovery and offline hardening](34-conflict-recovery-and-offline-hardening.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api portability
- apps/worker export
- apps/web settings
- apps/mobile settings

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Require recent supported reauthentication before creating a protected workspace export; export metadata and typed content in documented JSON/Markdown/CSV formats with selected binary files and a manifest.
2. Implement validated bounded import with preview, duplicate mapping, schema versions, and safe path handling.
3. Use authorized expiring download links and communicate that vault/Drive external content require separate policies.

## Acceptance

- An exported core workspace can be imported into a clean test account with preserved meaningful content.
- Malformed archives, traversal paths, oversize entries, and duplicate imports fail safely.
- Users understand which remote/undownloaded files and later vault content are included.

## Verification and evidence

- Run round-trip fixtures including Unicode, folders, tasks, routines, journal, and attachment references.
- Test archive safety, expiration, authorization, cancellation, and quota enforcement.
- Test recent-reauthentication expiry/cancellation, session binding, and unauthorized export link reuse.

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

`feat(portability): add documented workspace export and import`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
