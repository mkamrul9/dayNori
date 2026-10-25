# Phase 85 — Native Android reminder and notification readiness

Group: V2 advanced capability gates. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [71 — Native Android interface and navigation parity](71-native-android-interface-and-navigation-parity.md)
- [73 — Tasks routines and calendar workflow completion](73-tasks-routines-and-calendar-workflow-completion.md)
- [81 — Advanced recovery and optional-feature tour coverage](81-advanced-recovery-and-optional-feature-tour-coverage.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/mobile/src/notifications
- apps/api
- apps/worker
- docs/engineering

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Verify and repair native local/server scheduling, device channels, minimal payload and deep links with current runtime permission rules.
2. Enforce source cancellation, occurrence deduplication, quiet hours/timezone and the declared multi-device web/native policy.
3. Complete physical reboot/idle/force-stop/background evidence and real reminder tour chapter; leave exact alarms behind a separate policy decision.

## Acceptance

- Allowed reminders show observed physical display/tap evidence without conflating provider acceptance with delivery.
- Denied/revoked permission, reboot, reschedule, account deletion and duplicate retries remain safe.
- No restricted alarm permission is added without a current reviewed eligibility/need decision.

## Verification and evidence

- Run native scheduling/integration and source-lifecycle tests.
- Record physical Android permission/reboot/timezone/idle/multi-device scenarios and timing limits.

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
- [docs/decisions/0034-android-notifications-and-device-schedules.md](../../decisions/0034-android-notifications-and-device-schedules.md)

## Commit target

`fix(notifications): close native Android reminder evidence`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
