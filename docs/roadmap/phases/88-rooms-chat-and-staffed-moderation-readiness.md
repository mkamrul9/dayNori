# Phase 88 — Rooms chat and staffed moderation readiness

Group: V2 advanced capability gates. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [71 — Native Android interface and navigation parity](71-native-android-interface-and-navigation-parity.md)
- [75 — Files and audio attachment readiness](75-files-and-audio-attachment-readiness.md)
- [77 — Safe offline reopen sync and upgrade recovery](77-safe-offline-reopen-sync-and-upgrade-recovery.md)
- [81 — Advanced recovery and optional-feature tour coverage](81-advanced-recovery-and-optional-feature-tour-coverage.md)
- [83 — Developer feedback triage and verified support contact](83-developer-feedback-triage-and-verified-support-contact.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web/src/components/RoomsPanel.tsx
- apps/mobile/src/views/RoomsSheet.tsx
- apps/api
- apps/worker
- docs/policy
- docs/engineering

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Verify existing room/member/role/invite/content/chat behavior and current terms/report/block requirements using synthetic participants.
2. Repair bounded revocation, realtime, attachment, retry, mute and report handling gaps; establish actual moderation owner and incident procedure.
3. Enable only authorized reviewed environments after real infrastructure/moderation evidence; teach sharing and exit semantics through safe chapters.

## Acceptance

- Removed members lose newly authorized access, roles cannot be escalated, and private/vault content is not silently shared.
- Reporting/blocking/terms and staffed action process work with private audit evidence.
- Free sleeping-host realtime limits and existing production-off controls are resolved explicitly, not bypassed with a local flag.

## Verification and evidence

- Run room/chat/membership-revocation/IDOR/retry/report integration and security tests.
- Record two-participant physical/web/native scenarios, moderation disposition and current policy review; absent staff/infrastructure blocks release.

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
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)
- [docs/roadmap/v2/help-and-feedback.md](../v2/help-and-feedback.md)

## Commit target

`fix(rooms): close sharing chat and moderation release gates`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
