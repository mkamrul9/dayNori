# Phase 28 — Android notifications and local reminders

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [27 — Reminder scheduling and durable delivery jobs](27-reminder-scheduling-and-durable-delivery-jobs.md)
- [06 — Android navigation shell](06-android-navigation-shell.md)
- [03 — Platform and integration feasibility spikes](03-platform-and-integration-feasibility-spikes.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/mobile notifications
- apps/api device registration
- apps/worker delivery adapters

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Add contextual notification permission requests, channel preferences, device token rotation, local schedules, and push fallback.
2. Coordinate local/server delivery by reminder instance identity and rebuild schedules after edits/resume/reboot as supported.
3. Handle notification deep links and redacted lock-screen previews; implement exact audible alarms only if the earlier policy/native feasibility gate permits, otherwise retain ordinary reminders.

## Acceptance

- Permission refusal leaves tasks usable and settings explain actual delivery capability.
- A reminder opens its authorized task and stale reminders are cancelled.
- Physical-device evidence covers background/reboot/power-saving constraints with honest timing copy.

## Verification and evidence

- Test granted/denied/revoked permission, token change, offline schedules, reboot, task completion, and duplicate local/push paths.
- Record exact-alarm eligibility outcome separately; no exact timing acceptance is implied.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/integrations-and-reminders.md](../../architecture/integrations-and-reminders.md)
- [docs/research/sources.md](../../research/sources.md)

## Commit target

`feat(notifications): add Android reminder delivery and permission controls`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
