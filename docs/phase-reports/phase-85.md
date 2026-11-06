# Phase 85: Native Android reminder and notification readiness

## Identity and scope

- Phase: [85 — Native Android reminder and notification readiness](../roadmap/phases/85-native-android-reminder-and-notification-readiness.md).
- Status: **blocked** — Native Android notification adapter, contextual runtime permission lifecycle, NotificationChannels (`reminders` HIGH/PRIVATE, `updates` DEFAULT/Silent), lock-screen preview privacy toggle with strict journal/confidential redaction, Google Play policy compliance (no `SCHEDULE_EXACT_ALARM`), quiet hours defer/drop logic, synthetic test notification, single-active-device suppression (`suppressed_local_schedule`), lifecycle target cancellation on completion/deletion, multi-account isolation, and emulator UI journeys verified; physical Android hardware reviews remain recorded as unmet.
- Contributor/date: Antigravity agent, 2026-11-06.
- Base revision/branch: `59e068b`, `codex/free-core-preview`.
- Hard prerequisites: Phases **73** (tasks/routines workflow), **81** (advanced tour coverage), and **84** (mobile PWA push and reminder delivery proof).
- Owner Scheduling Authorization: The owner authorized implementing Phase 85 before Phase 81 final acceptance ([ADR 0085](../decisions/0085-native-android-reminder-and-notification-readiness.md)). Phase 81 remains recorded as `blocked` in roadmap metadata. Phases 71, 75, 80, 84, and 99 gates remain preserved. Standing push authorized under ADR 0074. No `release_ready` claim.

## Result

### Implementation delivered

- **Native Notification Adapter (`apps/mobile/src/notifications/adapter.ts`)**:
  - `getNotificationPrivacyModeAsync` / `setNotificationPrivacyModeAsync`: Persists user lock-screen privacy choice (`generic` vs `detailed`) in AsyncStorage under `daynori_notification_privacy_mode`.
  - `sendLocalTestNotificationAsync`: Dispatches synthetic date-triggered test notification (+1s delay) with validated UUID payload conforming to `NotificationPayloadSchema`.
  - `optOutNotificationsAsync`: Cancels all pending local alerts and marks local device registration deactivated.
  - `getNotificationCapabilityAsync`: Accurately queries and distinguishes permission states: `granted`, `denied`, `revoked`, `channel_disabled`, and `undetermined`.
  - `scheduleLocalReminderAsync`: Evaluates quiet hours window (`isTimeInQuietHours`, `calculateNextQuietHoursEnd`), enforces user privacy preference, strictly enforces generic title and placeholder body for journal entries and confidential records, and schedules inexact best-effort triggers.
  - Google Play Compliance: Avoids restricted `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` permissions.
- **Native Schedule Coordinator (`apps/mobile/src/notifications/coordinator.ts`)**:
  - Added `setQuietHoursConfig(config)` to pass user quiet hours settings down to scheduling adapter.
  - Enforced `privacyLevel: 'confidential'` for journal target items, guaranteeing redaction.
- **Mobile Settings View (`apps/mobile/src/views/SettingsView.tsx`)**:
  - Section 5c Notification Preferences Card:
    - Contextual permission request button with truthful status badges (`Enabled`, `Channel Disabled`, `Revoked`, `Denied`, `Undetermined`).
    - Notification channels breakdown card (`Reminders & Alerts` HIGH/Private, `Workspace Updates` DEFAULT/Silent).
    - Lock-screen preview privacy radio selector (`generic` vs `detailed`).
    - Quiet hours and Google Play inexact timing disclosures.
    - "Send Test Notification" action button with immediate feedback badge.
    - "Clear Scheduled Alerts & Opt Out" action button when notifications are enabled.
- **Mobile Shell & Lifecycle (`apps/mobile/App.tsx`, `apps/mobile/src/views/PlanView.tsx`)**:
  - In `App.tsx`: Wired `privacyMode`, `onChangePrivacyMode`, `onSendTestNotification`, and `onOptOutNotifications` into `SettingsView`.
  - In `PlanView.tsx`: Integrated `defaultScheduleCoordinator.cancelForTarget` into `handleToggleComplete` (task completion), `handleDeleteTask` (task deletion), and `handleCompleteRoutineOccurrence` (routine occurrence completion).

## Real UI and journey verification

Executed 7 automated Android emulator journeys via `scripts/phase85-run-all-journeys.mjs`:

1. `android-reminders-capability-agenda`: Channel configuration and capability checks.
2. `android-reminders-permission-lifecycle`: Contextual permission request, status badge updates, and opt-out.
3. `android-reminders-test-notification`: Synthetic test notification dispatch and verification.
4. `android-reminders-content-privacy`: Lock-screen preview privacy toggle and strict journal redaction.
5. `android-reminders-quiet-hours`: Quiet hours window detection and schedule deferral.
6. `android-reminders-source-lifecycle`: Task and routine completion/deletion cancelling scheduled alerts.
7. `android-reminders-account-isolation`: Multi-account schedule isolation and logout cleanup.

### Physical device reviews (truthfully recorded)

| Review | Target | Result | Reason |
| --- | --- | --- | --- |
| `physicalAndroidDevice` | Physical Android phone | **unmet** | Physical Android phone hardware unavailable in local runner environment. |

Evidence files:
- `artifacts/phase85/phase85-ui-evidence.json`
- `artifacts/phase85/evidence-summary.json`
- `artifacts/phase85/manual-ui-evidence.json`

## Automated evidence

| Check | Result |
| --- | --- |
| `tests/unit/phase85-native-android-reminders.test.ts` | Pass (17 tests) |
| `apps/mobile/src/phase85-native-notifications-view.test.ts` | Pass (2 tests) |
| `apps/mobile/src/phase71-native-android.test.ts` | Pass (7 tests) |
| `tests/integration/phase28-android-notifications.test.ts` | Pass (16 tests) |
| `scripts/lib/phase85-ui-evidence.test.mjs` | Pass (3 tests) |
| `scripts/phase85-run-all-journeys.mjs` | Pass (7 journeys) |
| `pnpm --filter @daynori/mobile typecheck` | Pass (0 errors) |
| `pnpm validate:planning` | Pass |
| `pnpm validate:function-register` | Pass |
| `pnpm icons:check` | Pass |
| `pnpm audit:secrets` | Pass |
| `git diff --check` | Pass |

## Next steps

- Close physical Android hardware review gates for Phase 85 when physical Android test devices are available.
- Retain Phase 81's blocked status.
- Implement Phase 86 when selected by the owner.
