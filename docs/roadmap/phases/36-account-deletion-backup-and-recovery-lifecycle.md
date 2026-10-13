# Phase 36 — Account deletion backup and recovery lifecycle

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [35 — Portable export and controlled import](35-portable-export-and-controlled-import.md)
- [24 — Private binary upload lifecycle](24-private-binary-upload-lifecycle.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api account lifecycle
- apps/worker deletion
- infra/deployment
- docs/engineering

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Require recent supported reauthentication and explicit confirmation for account/workspace deletion; implement token revocation, local removal, queued blob deletion, cancellation of connectors/reminders, and honest retention disclosure.
2. Configure database and object backup strategy separately and perform a staging restore drill.
3. Document provider disconnect, shared-content ownership, outstanding drafts, backup retention, and incident recovery procedures.

## Acceptance

- Deleted users cannot continue accessing data or reminder subscriptions.
- A restore drill proves recovery of both metadata and included object versions.
- Deletion states, backup exceptions, and recovery retention are explained without false immediate-erasure promises.

## Verification and evidence

- Test deletion retries, orphan objects, revoked sessions/devices, cancelled jobs, and multi-device local clearing.
- Record backup restore evidence and primary Play account-deletion policy review.
- Test cancelled/expired/replayed deletion reauthentication and server-bound confirmation state.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)
- [docs/architecture/operations-and-scaling.md](../../architecture/operations-and-scaling.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`feat(privacy): add account deletion and verified recovery procedures`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
