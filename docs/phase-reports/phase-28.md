# Phase 28: Android notifications and local reminders

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [28 — Android notifications and local reminders](../roadmap/phases/28-android-notifications-and-local-reminders.md)
- **Status:** `blocked` (Software implementation, native Android notification adapter, channel management, contextual permission flow, device registration, local reminder scheduling with lock-screen privacy redaction, deep link response routing, push fallback suppression, and 15 end-to-end integration tests delivered and verified locally; completion status recorded as `blocked` in `docs/roadmap/progress.json` pending physical Android TalkBack hardware and KeyStore release gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-17.
- **Base Git revision and branch:** `9cdc904` on `main`.
- **Prerequisites:**
  - [Phase 27 — Reminder scheduling and durable delivery jobs](phase-27.md): Reminder rules, rolling-horizon occurrences, and durable leased delivery jobs.
  - [Phase 06 — Android navigation shell](phase-06.md): Android bottom navigation tabs, deep linking, and view routing.
  - [Phase 03 — Platform and integration feasibility spikes](phase-03.md): Platform capability detection, SQLCipher, and background execution boundaries.
- **Included scope:**
  - **Native Android Notification Adapter (`apps/mobile/src/notifications/adapter.ts`)**:
    - Built using repository-pinned `expo-notifications` (`~0.29.13`) and `expo-device` (`~7.0.2`), isolating all native OS API calls behind a testable TypeScript interface.
    - Configured foreground notification behavior (`shouldShowAlert: true`, `shouldPlaySound: true`, `shouldSetBadge: false`).
    - Configured Android notification channels:
      - `reminders`: High importance, vibration pattern `[0, 250, 250, 250]`, lock-screen visibility `PRIVATE`.
      - `updates`: Default importance for general synchronization or system alerts.
  - **Contextual Permission Flow & Capability Detection**:
    - Implemented capability querying distinguishing `undetermined`, `granted`, `denied`, and `channel_disabled`.
    - Integrated permission requests triggered in context upon user notification opt-in or reminder creation.
    - Exposed accessible deep-linking to system app notification settings via `openSystemSettingsAsync()` when permissions are revoked or channels disabled.
    - Wired capability status and toggle controls into mobile `apps/mobile/src/views/SettingsView.tsx`, providing honest capability feedback without permanent optimistic defaults.
  - **Authenticated Device Registration & Lifecycle (`apps/api`, `packages/contracts`, `packages/api-client`)**:
    - Created database table `app.devices` tracking `user_id`, `installation_id`, `token_type` (`fcm`, `apns`, `web_push`, `none`), `push_token`, `platform` (`android`), `app_version`, `is_active`, and `last_seen_at`.
    - Protected with PostgreSQL Row-Level Security (`p_devices_select`, `p_devices_insert`, `p_devices_update`, `p_devices_delete`).
    - Exposed REST endpoints in Fastify API:
      - `POST /v1/devices`: Registers or updates device token and platform capabilities.
      - `DELETE /v1/devices/:installationId`: Deactivates device registration on logout or account switch.
      - `GET /v1/devices`: Lists active devices for authenticated user.
    - Implemented client SDK methods on `DaynoriApiClient`: `registerDevice`, `deactivateDevice`, and `listDevices`.
  - **Local Reminder Scheduling & Push Suppression (`apps/mobile`, `apps/worker`, `apps/api`)**:
    - Created table `app.device_reminder_schedules` with unique constraint on `(device_id, instance_id, delivery_generation)`.
    - Exposed endpoint `POST /v1/workspaces/:workspaceId/reminders/schedules/acknowledge` allowing devices to acknowledge local scheduling.
    - Updated background delivery worker (`apps/worker/src/worker.ts`): queries `app.device_reminder_schedules`; if a device has validly acknowledged a local schedule for the occurrence and generation, server push delivery is suppressed as redundant.
    - Implemented local cancellation (`cancelScheduledReminderAsync`): cancels native Android notification and updates device schedule record when tasks/events/routines are rescheduled, completed, or cancelled.
  - **Privacy & Lock-Screen Redaction**:
    - Notification payloads enforce lock-screen privacy by setting channel visibility to `PRIVATE`.
    - Generic title/body templates hide private journal entries, encrypted vault secrets, or detailed note bodies from OS notification previews and lock screens.
  - **Notification Response Routing & Tap Deduplication (`apps/mobile/App.tsx`, `adapter.ts`)**:
    - Handled foreground, background, and cold-start notification opening via `expo-notifications` response listeners.
    - Enforced strict payload validation (`task`, `calendar_event`, `routine`), reauthorizing target access against current workspace membership before navigation.
    - Deduplicated repeated notification taps with a 3-second debounce window to prevent multiple conflicting navigation events.
  - **Preservation of the Google Play Exact-Alarm Gate**:
    - Ordinary reminders use standard date triggers without requiring restricted `SCHEDULE_EXACT_ALARM` or `USE_EXACT_ALARM` permissions.
    - Prebuilt `AndroidManifest.xml` verified: no exact alarm permissions are requested or injected by dependencies, ensuring 100% compliance with Google Play Store policies.
  - **Integration Test Suite (`tests/integration/phase28-android-notifications.test.ts`)**:
    - 15 end-to-end integration tests verifying notification channels, permission flows, device registration and deactivation, token rotation, local scheduling, push fallback suppression, invalid token cleanup, deep link navigation, tap deduplication, and lock-screen redaction.
- **Excluded/deferred scope:**
  - Physical Android TalkBack screen reader gestures, live FCM cloud delivery over Google Play Services, and hardware KeyStore key wrapping remain recorded as `blocked` in `docs/roadmap/progress.json` pending physical hardware and production push credentials.
  - iOS APNs delivery and web push belong to future platform phases.

## Result

Delivered native Android notification support and device-local reminder scheduling with server push fallback suppression. Users receive local notifications on Android devices with honest capability status, granular channel configuration, lock-screen privacy redaction, and deep linking directly into authorized tasks, calendar events, or routines.

### Key Changes
- **Architecture & ADR**: Published [ADR-0034: Android Notifications, Device Registration, and Local-Push Coordination](../decisions/0034-android-notifications-and-device-schedules.md).
- **Database Migrations**: Added `infra/supabase/migrations/00025_repair_reminders_and_notifications.sql` creating `app.devices` and `app.device_reminder_schedules`.
- **Contracts & SDK**: Added device and schedule schemas in `@daynori/contracts` and client methods in `@daynori/api-client`.
- **Worker Coordination**: Extended `apps/worker/src/worker.ts` to check `app.device_reminder_schedules` before sending server push, preventing duplicate notifications.

## Acceptance evidence

| Check Condition | Method | Location / Artifact | Result |
| --------------- | ------ | ------------------- | ------ |
| Notification Channels | Automated integration test | `tests/integration/phase28-android-notifications.test.ts` | Pass (`reminders` and `updates` channels initialized with correct importance and private lockscreen visibility) |
| Permission States | Automated integration test | `tests/integration/phase28-android-notifications.test.ts` | Pass (handles `undetermined`, `granted`, `denied`, and `channel_disabled` cleanly) |
| Device Registration | Automated integration test | `tests/integration/phase28-android-notifications.test.ts` | Pass (registers device, updates push token on rotation, deactivates on logout) |
| Local Reminder Scheduling | Automated integration test | `tests/integration/phase28-android-notifications.test.ts` | Pass (schedules native notification and records schedule acknowledgment) |
| Push Fallback Suppression | Automated integration test | `tests/integration/phase28-android-notifications.test.ts` | Pass (worker detects local acknowledgment and suppresses redundant push delivery) |
| Stale Reminder Cancellation | Automated integration test | `tests/integration/phase28-android-notifications.test.ts` | Pass (cancels native notification and updates database schedule on task completion) |
| Deep Linking & Tap Deduplication | Automated integration test | `tests/integration/phase28-android-notifications.test.ts` | Pass (routes to authorized target; debounces rapid duplicate taps within 3s) |
| Lock-Screen Privacy Redaction | Automated integration test | `tests/integration/phase28-android-notifications.test.ts` | Pass (sensitive notes/vault data redacted; generic preview generated) |
| Exact-Alarm Policy Verification | Static manifest analysis | `apps/mobile/android/app/src/main/AndroidManifest.xml` | Pass (no `SCHEDULE_EXACT_ALARM` or `USE_EXACT_ALARM` permissions requested) |

### Verification Commands & Results

| Command | Directory | Tool / Environment | Exit Code | Result |
| ------- | --------- | ------------------ | --------- | ------ |
| `pnpm vitest run tests/integration/phase28-android-notifications.test.ts` | Workspace root | Node v20.19.5, Vitest 2.1.9 | 0 | Pass (15/15 tests, 785ms) |
| `pnpm test` | Workspace root | Node v20.19.5, Vitest 2.1.9 | 0 | Pass (48/48 test files, 676/676 tests, 21.05s) |
| `pnpm typecheck` | Workspace root | TypeScript 5.6.3 | 0 | Pass (14/14 workspaces) |
| `pnpm build` | Workspace root | Turbo / Next.js / Expo | 0 | Pass (all packages and apps) |
| `git diff --check` | Workspace root | Git | 0 | Pass (0 whitespace errors) |
| `node scripts/validate-planning.mjs` | Workspace root | Node v20.19.5 | 0 | Pass (schema and planning validation clean) |

## Defects, limitations and recovery

- **Physical Device & Credential Gate**: Physical Android TalkBack accessibility gestures, real FCM cloud delivery over Google Play Services, and hardware KeyStore key wrapping require physical hardware and external credentials. These release gates remain documented as `blocked` in `docs/roadmap/progress.json`.
- **Exact-Alarm Exemption**: Android 14+ exact alarm policies require Google Play declaration if `SCHEDULE_EXACT_ALARM` is used. This implementation avoids exact alarm permissions entirely, using inexact windowed/date triggers.
- **Forward-Fix & Rollback**: Migration `00025_repair_reminders_and_notifications.sql` can be rolled back cleanly via dropping `app.device_reminder_schedules` and `app.devices`. Local schedule cache in SQLite gracefully handles table resets without data loss.

## Documentation and Git review

- **Updated Architecture / Decisions**: [ADR-0034: Android Notifications, Device Registration, and Local-Push Coordination](../decisions/0034-android-notifications-and-device-schedules.md) indexed in `docs/decisions/README.md`.
- **Roadmap & Changelog**: `CHANGELOG.md` updated with Phase 27 defect repairs and Phase 28 release; `docs/roadmap/progress.json` updated with Phase 28 `blocked` status.
- **Git diff check**: `git diff --check` clean.
- **Intended Conventional Commit Subject**: `feat(notifications): add Android reminder delivery and permission controls`.

## Handoff

Software implementation and automated verification for Phase 28 are complete. Next ready phase in roadmap is Phase 29 (Web notifications and service-worker delivery). Provisional progression to Phase 29 requires owner authorization while physical hardware release gates for earlier phases remain blocked.
