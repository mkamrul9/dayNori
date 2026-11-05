# Phase 84 — Mobile PWA push and reminder delivery proof

Group: V2 advanced capability gates. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [70 — Mobile web and PWA layout redesign](70-mobile-web-and-pwa-layout-redesign.md)
- [73 — Tasks routines and calendar workflow completion](73-tasks-routines-and-calendar-workflow-completion.md)
- [77 — Safe offline reopen sync and upgrade recovery](77-safe-offline-reopen-sync-and-upgrade-recovery.md)
- [81 — Advanced recovery and optional-feature tour coverage](81-advanced-recovery-and-optional-feature-tour-coverage.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web/src/notifications
- apps/web/public
- apps/api
- apps/worker
- docs/engineering
- tests/integration

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Complete authenticated Web Push subscriptions, live operating worker path, expiry/retry and source reschedule/cancel using existing reminder semantics.
2. Add contextual permission/install guidance, device status, privacy/quiet hours/test notification and authorized tap deep links.
3. Verify Android installed-PWA and supported iPhone Home Screen delivery separately; activate their real tour/help chapter only with evidence.

## Acceptance

- Scheduled, dispatched, provider-accepted and physically observed display are distinguished; preview no-delivery limits are not silently relabeled.
- Denied/revoked permissions, account switch, stale endpoints and completed/deleted source records are safe.
- Physical locked/closed-app notification evidence and approved hosting/worker behavior exist for each promised platform; no exact-alarm guarantee.

## Verification and evidence

- Run subscription/reminder/privacy/duplicate integration tests and inspect actual configured provider behavior.
- Record timed physical Android and iPhone-PWA allow/deny/offline/revoke/deep-link scenarios; unavailable device/provider evidence remains blocked.

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
- [docs/roadmap/v2/notifications.md](../v2/notifications.md)
- [docs/decisions/0035-web-push-and-pwa-offline-caching.md](../../decisions/0035-web-push-and-pwa-offline-caching.md)

## Commit target

`feat(notifications): verify mobile PWA reminder delivery`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
