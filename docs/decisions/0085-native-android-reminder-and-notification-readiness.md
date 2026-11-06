# ADR-0085: Native Android reminder and notification readiness

- Status: accepted
- Date: 2026-11-06
- Owner/reviewer: Antigravity agent (owner-authorized Phase 85 with explicit scheduling exception).
- Related: [Phase 85](../roadmap/phases/85-native-android-reminder-and-notification-readiness.md), [ADR 0034](0034-android-notifications-and-device-schedules.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0084](0084-mobile-pwa-push-and-reminder-delivery-proof.md), [Phase 73](../phase-reports/phase-73.md), [Phase 81](../phase-reports/phase-81.md), [Phase 84](../phase-reports/phase-84.md).
- Supersedes/superseded by: none. Does not waive Phase 71, Phase 75, Phase 80, Phase 81, Phase 84, or Phase 99 gates.

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 85 implementation before Phase 81 final acceptance:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 85 implementation before Phase 81 final acceptance. Record this scheduling exception explicitly in an ADR and roadmap metadata. Preserve outstanding acceptance checks for Phases 71, 75, 80, 81, 84, and 99. Do not mark prerequisites complete, remove dependencies, or waive security/release gates."

Phase 85 addresses native Android reminder scheduling and notification delivery readiness, connecting native task and routine mutations to local Expo/Android NotificationChannels, single-active per-device server push suppression, privacy-minimized lock-screen previews, quiet hours evaluation, lifecycle target cancellations, and multi-account isolation.

Key architectural and policy decisions addressed:
1. **Google Play Policy Compliance**:
   - Google Play policy restricts `SCHEDULE_EXACT_ALARM` and `USE_EXACT_ALARM` to alarms, clocks, and timer apps. Daynori is an organizer/planner.
   - Standard inexact/best-effort scheduling windows are strictly used. Restricted alarm permissions are omitted from AndroidManifest to avoid policy rejection.
2. **Contextual Permissions & Degraded Operation**:
   - Permission request (`POST_NOTIFICATIONS`) is triggered solely upon deliberate user interaction (e.g., clicking "Enable Notifications" in Settings or configuring a reminder alert), never on raw app startup.
   - Distinct permission states are handled: `granted`, `denied`, `channel_disabled`, `revoked`, and `undetermined`.
   - When permission is denied, the organizer, agenda, tasks, and routines remain 100% usable without modal blocking or nagging.
3. **Android NotificationChannels & Lock-Screen Privacy**:
   - Channels configured on native Android:
     - `reminders`: HIGH importance, vibration pattern `[0, 250, 250, 250]`, notification sound, lockscreenVisibility `PRIVATE`.
     - `updates`: DEFAULT importance, silent (`enableVibrate: false`), lockscreenVisibility `PRIVATE`.
   - Lock-screen preview privacy toggle:
     - Default `generic` mode: title "Daynori Reminder", body "You have a scheduled reminder".
     - Opt-in `detailed` mode: title specifies target item title (e.g. "Task: Review quarterly plan").
     - Critical Invariant: Private journal entries, vault contents, and confidential records are strictly redacted to generic titles and placeholder bodies under ALL modes.
4. **Per-Device Local Suppression**:
   - Avoids duplicate local and server notifications on the same device. When Device A schedules a local alarm, acknowledgment records `suppressed_local_schedule` for Device A.
   - Does NOT suppress server push to Device B or web push endpoints.
5. **Quiet Hours Evaluation**:
   - Evaluates quiet hours window (default 22:00 to 07:00).
   - Rules configure whether quiet hours notifications are deferred to window end or dropped.
6. **Lifecycle & Multi-Account Isolation**:
   - Target completion (`handleToggleComplete`, `handleCompleteRoutineOccurrence`) and deletion (`handleDeleteTask`) explicitly invoke `defaultScheduleCoordinator.cancelForTarget`.
   - Schedule persistence is scoped per authenticated user (`daynori_local_schedules_${userId}`).
   - Logout and account switching invoke `cancelAll` and `resetNotificationResponseState`, preventing cross-account notification leak or stale execution.

## Decision

1. **Scheduling Exception**: Record the owner scheduling exception authorizing Phase 85 before Phase 81 final acceptance in `docs/roadmap/progress.json` and this ADR. Phase 81 remains recorded as `blocked` due to outstanding physical checks.
2. **Native Adapter & Coordinator Enhancements**:
   - Implement `getNotificationPrivacyModeAsync` / `setNotificationPrivacyModeAsync` in `apps/mobile/src/notifications/adapter.ts`.
   - Implement `sendLocalTestNotificationAsync` triggering a synthetic native test notification (+1s delay) with verified payload.
   - Implement `optOutNotificationsAsync` cancelling local scheduled alerts and marking device registration deactivated.
   - Update `getNotificationCapabilityAsync` to correctly distinguish `revoked` and `channel_disabled` states.
   - Enforce quiet hours calculation (`isTimeInQuietHours`, `calculateNextQuietHoursEnd`) and confidential item redaction in `scheduleLocalReminderAsync`.
   - Support `setQuietHoursConfig` in `apps/mobile/src/notifications/coordinator.ts`.
3. **Settings UI (`apps/mobile/src/views/SettingsView.tsx`)**:
   - Provide complete notification preferences card in Section 5c:
     - Contextual permission toggle button with truthful status badges (`Enabled`, `Channel Disabled`, `Revoked`, `Denied`, `Undetermined`).
     - Channel and category breakdown card (`Reminders & Alerts` HIGH, `Workspace Updates` DEFAULT).
     - Lock-screen preview privacy radio selector (`generic` vs `detailed`).
     - Quiet hours and Google Play inexact timing disclosures.
     - "Send Test Notification" action button with immediate feedback badge.
     - "Clear Scheduled Alerts & Opt Out" action button when enabled.
4. **Lifecycle Invalidation (`apps/mobile/src/views/PlanView.tsx`)**:
   - Wire `defaultScheduleCoordinator.cancelForTarget` into `handleToggleComplete`, `handleCompleteRoutineOccurrence`, and `handleDeleteTask`.
5. **Truthful Physical Gate Accounting**:
   - Automated unit tests, mobile view tests, integration tests, and emulator journeys pass cleanly.
   - Physical Android device verification is truthfully marked `unmet` in `artifacts/phase85/phase85-ui-evidence.json`, maintaining Phase 85 status as `blocked` rather than claiming unverified release readiness.

## Consequences

- Native Android notifications conform strictly to Google Play policy and Android 13+ runtime permission best practices.
- Users have full control over lock-screen notification privacy and quiet hours.
- Duplicate alerts are prevented on the local device without suppressing alerts on other registered devices.
- Confidential content (journal, vault) is never leaked into system notification trays or lock screens.
- Physical device review gates remain honestly marked `unmet` pending real hardware verification.
