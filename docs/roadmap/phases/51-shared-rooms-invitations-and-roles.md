# Phase 51 — Shared rooms invitations and roles

Group: Rooms and chat. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [38 — Controlled private beta](38-controlled-private-beta.md)
- [10 — Personal workspace and preferences](10-personal-workspace-and-preferences.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api rooms module
- packages/domain collaboration
- apps/web rooms
- apps/mobile rooms

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement separate shared workspaces/rooms with owner/editor/viewer roles and expiring single-use invitations.
2. Require explicit copy/share actions from personal items and block journal/vault exposure by default.
3. Add member management, leave/transfer/delete rules, invite abuse controls, and visible room context.

## Acceptance

- Joining a room never grants access to another user's personal workspace.
- Role changes and invitation replay are authorized and audited.
- Users understand whether they are editing private or shared content.

## Verification and evidence

- Run role matrix, invite expiry/replay, unauthorized transfer, last-owner, and personal/shared boundary tests.
- Review multi-account sharing journeys and private journal/vault exclusion.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)
- [docs/architecture/data-model.md](../../architecture/data-model.md)

## Commit target

`feat(rooms): add invitations roles and explicit sharing boundaries`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
