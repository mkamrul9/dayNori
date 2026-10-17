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

3. **Secure Device Registration & Token Lifecycle**:
   - Devices register with a persistent installation identity backed by secure storage (`app.devices`), capturing platform, push token (FCM), token type, and capabilities.
   - Missing push credentials produce an honest `unavailable` state without synthetic or fabricated tokens.
   - Deactivation occurs on logout or account switch, preventing cross-account delivery leaks.

4. **Coordinated Delivery: Local Scheduling vs. Push Fallback**:
   - When a reminder instance is scheduled on a device, the client schedules a local OS notification via `Notifications.scheduleNotificationAsync` and acknowledges the schedule to the backend (`app.device_reminder_schedules`).
   - When a background delivery job executes, the worker checks for valid local schedule acknowledgments. If acknowledged, server push is suppressed to prevent annoying duplicate alerts.
   - If local scheduling was not acknowledged (e.g., web-created reminder, device offline during creation), server push fallback activates via the durable worker adapter.

5. **Lock-Screen Privacy & Deep Link Safety**:
   - In accordance with privacy defaults (ADR-0028, ADR-0033), sensitive body details, journal reflections, and confidential notes are never included in notification buffers. Generic and private modes substitute generic lock-screen copy (`Daynori Reminder: You have a scheduled reminder`).
   - Tapping notifications validates payload schemas against allowlisted destinations (`plan`, `library`, `journal`) and deduplicates rapid repeated taps.

## Decision

### 1. Mobile Platform Adapter (`apps/mobile/src/notifications/adapter.ts`)

- Implemented `setupNotificationChannelsAsync`: Configures Android notification channels `reminders` and `updates`.
- Implemented `getNotificationCapabilityAsync`: Queries runtime permissions and channel state, providing honest capability reporting.
- Implemented `requestNotificationPermissionAsync`: Contextually prompts the user after explicit actions.
- Implemented `registerDeviceAsync` and `deactivateDeviceAsync`: Authenticates device registration and cleans up tokens on logout.
- Implemented `scheduleLocalReminderAsync`: Schedules date-triggered local notifications with lock-screen redaction and backend acknowledgment.
- Implemented `cancelLocalReminderAsync` and `cancelAllLocalRemindersAsync`: Explicitly cancels native notification identifiers on completion or reset.
- Implemented `initNotificationResponseListener`: Connects cold-start and warm-start notification responses to application navigation with 3-second tap deduplication.

### 2. Device Registration & Coordination Schema (`infra/supabase/migrations/00025_repair_reminders_and_notifications.sql`)

- Created `app.devices`: Stores installation IDs, push tokens, token types (`fcm`, `web_push`, `none`), capabilities JSON, and active state, protected by RLS (`p_devices_*`).
- Created `app.device_reminder_schedules`: Tracks reminder instance local scheduling acknowledgments per device and generation, protected by RLS (`p_device_schedules_*`).

### 3. API Routes & Service (`apps/api`)

- Registered `/v1/devices`: `POST /` (register), `DELETE /:installationId` (deactivate), `GET /` (list devices).
- Registered `/v1/workspaces/:workspaceId/reminders/schedules/acknowledge`: Records local scheduling acknowledgment.
- Registered `/v1/workspaces/:workspaceId/reminders/instances/:instanceId/schedules`: Lists device schedule statuses.

### 4. Durable Worker Push Suppression & Fallback (`apps/worker/src/worker.ts`)

- Checks `app.device_reminder_schedules` before sending push alerts: suppresses push when device local scheduling is acknowledged.
- Delivers push via `PushNotificationAdapter` when local scheduling is absent.
- Cleans up stale push tokens when the provider reports unregistered devices.

## Consequences

- Android users receive timely local notifications for their tasks and routines even when offline.
- Duplicate alerts between local and push delivery are suppressed through durable schedule coordination.
- Google Play exact alarm policies are respected: reminders operate with best-effort timing windows.
- Physical TalkBack screen reader gestures and hardware KeyStore verification remain recorded as blocked pending real hardware access.
