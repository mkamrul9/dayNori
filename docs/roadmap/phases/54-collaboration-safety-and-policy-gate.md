# Phase 54 — Collaboration safety and policy gate

Group: Rooms and chat. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [53 — Room chat and realtime events](53-room-chat-and-realtime-events.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api reports and blocks
- apps/web room settings
- apps/mobile room settings
- docs/engineering

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Add user/message reporting, blocking where policy requires, invitation restrictions, moderation audit trail, and room owner controls.
2. Publish acceptable-use/support/moderation workflows and define response ownership before public chat release.
3. Review current store UGC requirements, notification abuse, data retention, and all role/boundary tests.

## Acceptance

- Users can report abusive content and follow documented block/mute behavior.
- A real moderation owner and operational response process exist before public sharing is enabled.
- No unresolved serious room access or abuse-control defect remains.

## Verification and evidence

- Run report/block/leave/removed-user journeys and moderation authorization tests.
- Review current Google Play UGC policy with evidence and conduct collaboration security review.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/engineering/release-gates.md](../../engineering/release-gates.md)
- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)

## Commit target

`feat(safety): add room reporting controls and moderation gate`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
