# ADR-0007: Durable jobs and best-effort reminders

Date: 2026-10-13. Status: accepted for planning; exact alarm mode requires a separate decision.

## Context

Reminders, scans, exports and provider transfers must survive process restarts. Push acceptance is not a delivery guarantee, and native precise alarms are subject to permission and store policy.

## Decision

Persist outbox/jobs in PostgreSQL with leased claiming, bounded retries and idempotent state transitions. Run a separate worker; external calls do not hold application transactions. Store reminder intent and occurrence separately; combine acknowledged local schedules, FCM/Web Push and an in-app reminder center with explicit per-device delivery mode and privacy controls. Initially use best-effort reminders without restricted exact/full-screen permissions.

## Alternatives

Process timers and fire-and-forget requests lose work during restarts. A dedicated broker/Redis may be useful later but adds early operational dependencies. Declaring exact alarm capability without device/policy proof risks misleading users and blocking store release.

## Consequences and validation

External delivery is at-least-once and can arrive late or duplicate in races. Workers reauthorize revision/state before side effects. Test leases/restart, provider response loss, denied permission, reboot, battery saving and cancellation. Add a broker or exact mode only after a measured/reviewed need and new ADR.

See [operations](../architecture/operations-and-scaling.md) and [reminders](../architecture/integrations-and-reminders.md).
