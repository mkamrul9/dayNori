# ADR-0034: Android Notifications, Device Registration, and Local Reminders Coordination

## Status

Accepted (Phase 28 implementation verified across native Android notification channels, contextual permission requests, authenticated device registration, local reminder scheduling with lock-screen privacy redaction, server push fallback suppression, and deep link deduplication; physical Android TalkBack hardware and KeyStore release gates remain explicitly recorded as blocked without software defects blamed on hardware).

## Context

Phase 28 implements Android notifications and local reminders ([docs/roadmap/phases/28-android-notifications-and-local-reminders.md](../roadmap/phases/28-android-notifications-and-local-reminders.md)), building upon durable scheduling (Phase 27) and the Android navigation shell (Phase 06).

Key architectural requirements and constraints addressed:

1. **Native Android Platform Adapter & Compatibility**:
   - Uses `expo-notifications` compatible with the repository's pinned Expo SDK (`~0.29.13`), configured with native Android notification channels (`reminders` with HIGH importance, vibration, and lights; `updates` with DEFAULT importance).
   - Android 8.0+ (API 26+) requires channels; Android 13+ (API 33+) requires runtime `POST_NOTIFICATIONS` permission.
   - Preserves Google Play policy guidelines by strictly avoiding restricted exact alarm permissions (`SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`) in `AndroidManifest.xml` for organizer apps.

2. **Contextual Permission Model**:
   - Permission prompts are requested contextually upon explicit user action (e.g., setting a reminder or toggling notification preferences in Settings), never on raw application startup.
   - Permission refusal leaves all task, routine, and organizer functionality completely usable. Capability states (`undetermined`, `granted`, `denied`, `channel_disabled`) are honestly communicated in the UI.

3. **Secure Device Registration, Token Transport & Lifecycle**:
   - Differentiates native Android FCM device tokens (`fcm`) from Expo Push transport tokens (`expo_push`), ensuring backend adapters receive matching transport formats.
   - Devices register with a persistent installation identity backed by secure storage (`app.devices`), capturing platform, push token, token type, and capabilities.
   - Reconciles push token rotations via `Notifications.addPushTokenListener`.
   - Missing push credentials produce an honest `unavailable` state without synthetic or fabricated tokens.
   - Deactivation occurs on logout or account switch, preventing cross-account delivery leaks.

4. **Coordinated Delivery: Per-Device Local Scheduling vs. Push Fallback**:
   - When a reminder instance is scheduled on a device, the client schedules a local OS notification via `Notifications.scheduleNotificationAsync` and acknowledges the schedule to the backend (`app.device_reminder_schedules`).
   - Delivery uniqueness and suppression are tracked per recipient device (`app.reminder_deliveries.recipient_device_id`) and browser subscription (`app.reminder_deliveries.recipient_subscription_id`).
   - Local acknowledgment on Android Device A records `suppressed_local_schedule` as a scheduling decision for Device A only, without suppressing Device B or web push subscriptions.
   - If local scheduling was not acknowledged for a device, push fallback activates via the durable worker adapter with bounded retry (up to 3 attempts with exponential backoff).
   - Local alerts are coordinated by `ReminderScheduleCoordinator`, persisting mappings across reboots and reconciling upon startup, app resume, sync completion, and logout.

5. **Lock-Screen Privacy & Deep Link Safety**:
   - In accordance with privacy defaults (ADR-0028, ADR-0033), sensitive body details, journal reflections, and confidential notes apply generic redaction by default (`Daynori Reminder: You have a scheduled reminder`). Detailed content is only displayed when explicitly opted-in.
   - Android reminder channel is configured with `PRIVATE` lock-screen visibility.
   - Tapping notifications validates payload schemas, reauthorizes target access against current workspace membership before navigation, handles stale/deleted targets gracefully, and deduplicates rapid repeated taps by instance and delivery generation.

## Decision

### 1. Mobile Platform Adapter & Coordinator (`apps/mobile/src/notifications`)

- Implemented `setupNotificationChannelsAsync`: Configures Android notification channels `reminders` (with PRIVATE visibility) and `updates`.
- Implemented `getNotificationCapabilityAsync`: Queries runtime permissions and channel state, providing honest capability reporting.
- Implemented `requestNotificationPermissionAsync`: Contextually prompts the user after explicit actions.
- Implemented `registerDeviceAsync` and `deactivateDeviceAsync`: Differentiates native FCM from Expo push tokens, authenticates device registration, and cleans up tokens on logout.
- Implemented `setupPushTokenRotationListener`: Reconciles device registration when push tokens rotate.
- Implemented `scheduleLocalReminderAsync`: Applies generic privacy redaction by default, schedules date-triggered local notifications, and acknowledges with backend.
- Implemented `cancelLocalReminderAsync` and `cancelAllLocalRemindersAsync`: Explicitly cancels native notification identifiers on completion or reset.
- Implemented `ReminderScheduleCoordinator`: Manages local schedule persistence in secure storage, reconciles active instances on startup, resume, and sync, and cleans up local alerts on source deletion or logout.
- Implemented `initNotificationResponseListener`: Connects cold-start and warm-start notification responses to application navigation with instance/generation tap deduplication and target reauthorization.

### 2. Device Registration & Coordination Schema (`infra/supabase/migrations/00025_repair_reminders_and_notifications.sql`, `00026_notification_delivery_coordination_and_web_push.sql`)

- Extended `app.devices`: Stores installation IDs, push tokens, token types (`fcm`, `expo_push`, `web_push`, `none`), capabilities JSON, and active state, protected by RLS (`p_devices_*`).
- Extended `app.reminder_deliveries`: Added `recipient_device_id` and `recipient_subscription_id`, scoped per-target uniqueness index `uq_reminder_deliveries_target`, and added `suppressed_local_schedule` status.
- Created `app.device_reminder_schedules`: Tracks reminder instance local scheduling acknowledgments per device and generation, protected by RLS (`p_device_schedules_*`).

### 3. API Routes & Service (`apps/api`)

- Registered `/v1/devices`: `POST /` (register), `DELETE /:installationId` (deactivate), `GET /` (list devices).
- Registered `/v1/workspaces/:workspaceId/reminders/schedules/acknowledge`: Records local scheduling acknowledgment.
- Registered `/v1/workspaces/:workspaceId/reminders/instances/:instanceId/schedules`: Lists device schedule statuses.

### 4. Durable Worker Push Suppression & Fallback (`apps/worker/src/worker.ts`)

- Checks `app.device_reminder_schedules` per device before sending push alerts: suppresses push for acknowledged devices (`suppressed_local_schedule`) while dispatching push to unacknowledged devices and active browser subscriptions.
- Delivers push via `PushNotificationAdapter` and `WebPushNotificationAdapter` with bounded retry and backoff.
- Cleans up stale push tokens when the provider reports unregistered devices.

## Consequences

- Android users receive timely local notifications for their tasks and routines even when offline.
- Duplicate alerts between local and push delivery are suppressed per-device without starving multi-device or browser subscribers.
- Lock-screen privacy is protected by default minimization.
- Google Play exact alarm policies are respected: reminders operate with best-effort timing windows.
- Physical TalkBack screen reader gestures, hardware KeyStore verification, and live push credentials remain recorded as blocked pending real hardware and external credentials.
