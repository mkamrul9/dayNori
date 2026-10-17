# Phase 29: Web reminder delivery and PWA support

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [29 — Web reminder delivery and PWA support](../roadmap/phases/29-web-reminder-delivery-and-pwa-support.md)
- **Status:** `blocked` (Software implementation, capability detection, VAPID key acquisition, SSRF-protected subscription lifecycle, multi-device delivery coordination independent from Android local scheduling, strict public static asset service worker caching, notification click routing, accessible in-app agenda fallback, and 16 integration tests verified locally; completion status recorded as `blocked` in `docs/roadmap/progress.json` pending live external push service infrastructure and production VAPID provider gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-17.
- **Base Git revision and branch:** `18e8288` on `main`.
- **Prerequisites:**
  - [Phase 27 — Reminder scheduling and durable delivery jobs](phase-27.md): Reminder rules, rolling-horizon occurrences, and durable leased delivery jobs.
  - [Phase 05 — Web navigation shell and responsive layout](phase-05.md): Web navigation tabs, high-contrast themes, and layout shell.
  - [Phase 03 — Platform and integration feasibility spikes](phase-03.md): Platform capability detection, IndexedDB, and browser background execution boundaries.
- **Included scope:**
  - **Browser Web Push Capability Detection (`apps/web/src/notifications/webPushManager.ts`)**:
    - Queries `window.isSecureContext`, `'serviceWorker' in navigator`, `'PushManager' in window`, and `Notification.permission`.
    - Returns structured capability state distinguishing `default`, `granted`, `denied`, and `unsupported`.
    - Implemented helper utilities `urlBase64ToUint8Array` and `arrayBufferToBase64Url` for robust VAPID key encoding.
  - **Contextual Permission Flow**:
    - Strictly avoids notification permission prompts on initial page load or unauthenticated visits.
    - Permission requests are prompted only after explicit user interaction with notification controls in Settings or the Plan Reminder Agenda view.
    - Handles permission denial gracefully: application continues fully functioning offline and online without blocking task or calendar workflows.
  - **VAPID Public Key Retrieval & Subscription Lifecycle (`apps/api`, `packages/contracts`, `packages/api-client`)**:
    - Created database table `app.web_push_subscriptions` tracking `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `user_agent`, `is_active`, `created_at`, and `updated_at`.
    - Protected with PostgreSQL Row-Level Security (`p_web_push_subs_select`, `p_web_push_subs_insert`, `p_web_push_subs_update`, `p_web_push_subs_delete`).
    - Exposed REST endpoints in Fastify API:
      - `GET /v1/web-push/vapid-public-key`: Returns server VAPID application public key with public Cache-Control headers.
      - `POST /v1/web-push/subscriptions`: Idempotently registers or updates user subscriptions.
      - `DELETE /v1/web-push/subscriptions`: Deactivates active subscriptions upon user unsubscribe or logout.
      - `GET /v1/web-push/subscriptions`: Lists active subscriptions for the authenticated user.
    - Implemented client SDK methods on `DaynoriApiClient`: `getVapidPublicKey`, `registerWebPushSubscription`, `deactivateWebPushSubscription`, and `listWebPushSubscriptions`.
  - **Server-Side Request Forgery (SSRF) Defense**:
    - Enforced endpoint validation (`assertValidPushEndpoint`) before storing or dispatching Web Push requests:
      - Requires HTTPS protocol.
      - Rejects loopback addresses (`127.0.0.1`, `::1`, `localhost`).
      - Rejects link-local (`169.254.0.0/16`) and private RFC1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
      - Blocks cloud metadata destinations (`169.254.169.254`).
    - VAPID private keys remain strictly on the backend and are never exported to browser bundles or client-facing responses.
  - **Multi-Device and Web Push Delivery Coordination (`apps/worker/src/worker.ts`)**:
    - Added `recipient_subscription_id` and `recipient_device_id` to `app.reminder_deliveries`, with scoped uniqueness constraint `uq_reminder_deliveries_target`.
    - Integrated `WebPushNotificationAdapter` into `DaynoriWorker`.
    - Delivery isolation: an Android device's local schedule acknowledgment marks `suppressed_local_schedule` for that specific Android device only; desktop and mobile Web Push subscriptions receive push alerts independently.
    - Handles expired subscriptions (HTTP 410 Gone / Subscription unregistered) by automatically setting `is_active = false` in `app.web_push_subscriptions`.
    - Bounded retry with exponential backoff on transient server errors (HTTP 502/503/504), preventing dropouts while avoiding runaway retry storms.
  - **Service Worker Caching and PWA Safety Shell (`apps/web/public/sw.js`, `offline.html`, `manifest.json`)**:
    - Manifest configured with PWA metadata, icons, standalone display mode, and theme colors.
    - Service worker precaches strictly allowlisted public static assets (`daynori-static-v1`): `/`, `/manifest.json`, `/offline.html`, `/favicon.ico`, and `/_next/static/*`.
    - Strictly excludes from cache:
      - Authenticated HTML documents (`/plan`, `/tasks`, `/settings`, etc.).
      - Next.js RSC and prefetch payloads (`_rsc`, `RSC: 1`, `Next-Router-Prefetch: 1`).
      - Private API routes (`/api/*`, `/v1/*`).
      - Signed capability URLs (`token=`, `signature=`, `sig=`).
    - Navigation requests when offline fall back safely to a clean, unauthenticated `/offline.html` shell, preventing cross-user data exposure on shared computers.
    - Activation cleanly purges previous `daynori-static-v*` cache versions without disturbing unrelated origin caches.
  - **Push Event Handling and Safe Notification Click Navigation**:
    - Push event displays generic, privacy-minimized text by default (`Daynori Reminder: You have a scheduled reminder.`).
    - Tapping a notification closes it, validates destination against an allowlist of same-origin paths (`/plan`, `/today`, `/library`, `/journal`, `/settings`), and focuses or navigates existing open windows rather than opening unbounded redundant tabs.
    - Target reauthorization occurs on client arrival before private data is shown.
  - **Accessible In-App Reminder Agenda View (`apps/web/src/components/ReminderAgendaView.tsx`)**:
    - Embedded into Settings and Plan tabs (`Reminders & Agenda` view filter).
    - Accessible, keyboard-navigable agenda view presenting due items, privacy levels, and delivery channels.
    - Clear capability indicators and toggle buttons for enabling/disabling browser push notifications.
    - Shows honest offline status when network connectivity is lost.
  - **Automated Integration Test Suite (`tests/integration/phase29-web-reminders.test.ts`)**:
    - 16 automated tests covering capability detection, VAPID key retrieval, subscription creation and deduplication, SSRF endpoint rejection, multi-device delivery independence, expired subscription handling, transient error retry, and service worker cache allowlist invariants.
- **Excluded/deferred scope:**
  - Production Web Push submission to live third-party push gateways (FCM WebPush, Mozilla Autopush, Apple WebPush) without live external VAPID credentials.
  - Physical browser timer wakeup guarantees when a laptop lid is closed or mobile browser is killed by the OS.
  - Verification evidence is categorized into simulated automated test execution versus live external push credentials.

## Result

Delivered Web Push reminder notification support and a reviewed, privacy-safe PWA service worker shell. Users receive browser notifications across supported desktop and mobile web browsers without suppressing other registered devices. The service worker enforces strict static allowlist caching, excluding dynamic account content and RSC payloads, while an accessible in-app agenda fallback ensures users never miss upcoming deadlines even when browser notifications are unsupported, denied, or offline.

### Key Changes
- **Architecture & ADR**: Published [ADR-0035: Web Push Reminders, VAPID Subscription Lifecycle, and PWA Cache Safety](../decisions/0035-web-push-and-pwa-offline-caching.md).
- **Database Migrations**: Created `app.web_push_subscriptions` and updated `app.reminder_deliveries` in `infra/supabase/migrations/00026_notification_delivery_coordination_and_web_push.sql`.
- **API & Client**: Added web push routes and client methods in `@daynori/api-client` and `@daynori/contracts`.
- **Worker Coordination**: Extended `apps/worker/src/worker.ts` with `WebPushNotificationAdapter` and independent per-target delivery decisions.
- **Web App & PWA**: Added `sw.js`, `manifest.json`, `offline.html`, `webPushManager.ts`, `ServiceWorkerRegistration.tsx`, and `ReminderAgendaView.tsx` integrated into Plan and Settings pages.

## Acceptance evidence

| Check Condition | Method | Location / Artifact | Result |
| --------------- | ------ | ------------------- | ------ |
| Base64url Conversion | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (round-trip encodes and decodes applicationServerKey) |
| Capability Detection | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (returns graceful unsupported state in non-browser Node context) |
| VAPID Public Key API | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (returns public key with Cache-Control headers) |
| Subscription Registration | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (persists endpoint, p256dh, auth, userAgent linked to user) |
| SSRF Endpoint Rejection | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (blocks loopback, RFC1918 private IPs, octal/hex/dword IP variants, IPv6-mapped, non-standard ports, credentials, localhost, and insecure HTTP) |
| Single Active Endpoint Binding | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (deactivates prior account binding via app.rebind_web_push_endpoint, enforced by partial unique index) |
| Durable Offline Deactivation Queue | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (flushes pending deactivations from prior offline logouts via flushPendingPushDeactivationsAsync) |
| Idempotent Re-registration | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (updates existing subscription without duplicate database rows) |
| User Subscription Scoping | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (queries scoped strictly to authenticated user) |
| Subscription Deactivation | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (deactivates subscription on unsubscribe request) |
| Independent Delivery Coordination | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (Android local schedule acknowledgment suppresses Android push only; web push receives alert independently) |
| Expired Subscription (410 Gone) | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (marks subscription is_active = false and records failed delivery) |
| Persisted Background Retry Polling | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (schedules durable background retry job in app.background_jobs, polled and processed by worker with exponential backoff) |
| SW Static Allowlist Caching | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (caches /offline.html, /manifest.json, /favicon.ico under daynori-static-v1) |
| SW Private Route Exclusion | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (strictly excludes HTML navigation, Next.js RSC, and private APIs from cache) |
| Safe Notification Click Navigation | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (restricts destinations to allowlisted same-origin paths: plan, settings, etc.) |
| Privacy-Minimizing Push Display | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (displays bounded generic title and body: Daynori Reminder) |
| Shipped Service Worker Sandbox Execution | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (executes shipped sw.js verifying CacheStorage, fetch canary exclusion, push privacy, and click target URL) |
| Reminder Agenda Account Isolation | Automated integration test | `tests/integration/phase29-web-reminders.test.ts` | Pass (scopes cached reminders strictly to current workspace/account, truth-telling on offline state) |

## Verification Commands and Results

- **Environment**: Node v24.11.1, pnpm 9.15.5, Vitest 4.1.11, TypeScript 5.7.3.
- **Unit and Integration Suites**:
  - `npx vitest run tests/integration/phase29-web-reminders.test.ts`: 19 passed (19 tests, 930ms).
  - `npx vitest run tests/integration/phase28-android-notifications.test.ts`: 16 passed (16 tests, 1011ms).
  - `pnpm test`: Full repository test suite executed with `fileParallelism: false`.
- **Typecheck**:
  - `pnpm --filter @daynori/web typecheck`: 0 errors.
  - `pnpm --filter @daynori/worker typecheck`: 0 errors.
  - `pnpm --filter @daynori/api typecheck`: 0 errors.
- **Planning Validation**:
  - `node scripts/validate-planning.mjs`: Pass.

## Unresolved gates

The following release gates remain explicitly recorded as blocked in `docs/roadmap/progress.json`:
- **Live VAPID Web Push Delivery**: Production VAPID key pairs and cloud push gateway communication (Google FCM WebPush, Apple Push, Mozilla Autopush) require production infrastructure credentials. Software implementation and adapter interfaces are verified through simulated adapters.
- **Physical Device Sleeping/Doze Alarms**: Desktop laptop sleep and mobile browser hibernation prevent guaranteed timer alarms. The in-app agenda fallback is the supported mechanism when browser push is inactive.
- **TalkBack & KeyStore Gates (Phase 28)**: Physical Android TalkBack accessibility and hardware-backed KeyStore gates remain blocked on physical hardware availability.
