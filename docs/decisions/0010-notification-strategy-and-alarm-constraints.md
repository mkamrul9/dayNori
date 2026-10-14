# ADR-0010: Notification strategy and Android alarm constraints

Date: 2026-10-13. Status: accepted.

## Context

Users schedule time-sensitive routines, todo deadlines, and journal reminders. Android 13+ (API 33+) restricts notification runtime permissions, and Google Play enforces strict policy constraints on `USE_EXACT_ALARM`, reserving it exclusively for core alarm clocks, timers, and specialized calendar apps. Doze mode and manufacturer power-management daemons delay background background wakeups.

## Decision

1. **Best-Effort Scheduling**: Adopt an explicit best-effort delivery SLA for reminders. Do not claim or promise exact-minute or safety-critical alarm delivery. Android provides no fixed delivery SLA (e.g. no guaranteed 15-minute window); Android 12+ (API 31+) typically clips inexact windows under 10 minutes to 600,000ms, and battery optimizations (Doze mode, App Standby) defer wakeups until maintenance windows.
2. **Permission Policy**: Do not request Google Play's restricted `USE_EXACT_ALARM` permission in `AndroidManifest.xml` (reserved strictly for dedicated alarm clocks/timers). On Android 13+, request standard `POST_NOTIFICATIONS`. If exact scheduling is requested by the user, inspect `SCHEDULE_EXACT_ALARM`; if revoked or unavailable, gracefully fall back to AlarmManager inexact delivery and Android WorkManager.
3. **In-App Notification Center**: Persist all triggered and scheduled reminders in an internal in-app notification center so users never lose reminders if OS notification permissions are denied or silenced by system Doze.
4. **Web Delivery**: Use W3C Push API / Web Push with Service Workers on desktop and installed PWA on iOS (16.4+), falling back to in-app notification banners.

## Alternatives

- **Declaring USE_EXACT_ALARM**: High probability of Google Play Store rejection during app review, as Daynori is a multi-feature daily organizer, not a dedicated alarm clock.
- **Persistent Foreground Service**: Keeps a permanent notification in the status bar and drains battery; rejected as poor user experience for passive reminder scheduling.

## Consequences and validation

- UI and documentation must clearly state that reminders operate with best-effort timing windows and depend on device power state.
- Validated via synthetic model suites `tests/spikes/platform-policy-model.synthetic.test.ts` and `tests/spikes/native-capabilities-model.synthetic.test.ts`. Physical device notification and alarm validation is deferred to Phase 28.
- See [integrations and reminders](../architecture/integrations-and-reminders.md) and [ADR-0007](0007-durable-jobs-and-reminders.md).
