# ADR-0035: Web Push Reminders, VAPID Subscription Lifecycle, and PWA Cache Safety

## Status

Accepted (Phase 29 implementation verified across browser PushManager capability detection, VAPID key retrieval, SSRF-protected subscription lifecycle, multi-target delivery coordination independent from Android local scheduling, strict public static asset service worker caching, and accessible in-app reminder agenda fallback; live external push services and production VAPID credentials remain recorded as blocked gates without software defects blamed on external infrastructure).

## Context

Phase 29 implements Web reminder delivery and PWA support ([docs/roadmap/phases/29-web-reminder-delivery-and-pwa-support.md](../roadmap/phases/29-web-reminder-delivery-and-pwa-support.md)), building upon durable reminder scheduling (Phase 27), the notification foundation repairs (Phase 28), and the Next.js web application shell (Phase 05).

Key architectural requirements and safety invariants addressed:

1. **Browser Push Capability Detection & Contextual Permission**:
   - Detects `window.isSecureContext`, `'serviceWorker' in navigator`, `'PushManager' in window`, and `Notification.permission`.
   - Never prompts for notification permission on initial page load or unauthenticated landing. Prompts occur solely upon deliberate user action (e.g., clicking "Enable Browser Notifications" in Settings or the Plan Reminder Agenda).
   - Gracefully handles `unsupported`, `denied`, and `default` states without impairing task management, calendar navigation, or offline use.

2. **VAPID Subscription Registration & Lifecycle**:
   - Fetches VAPID application public keys via `GET /v1/web-push/vapid-public-key` with public cache headers.
   - Encodes and decodes base64url keys securely for `PushSubscriptionOptionsInit`.
   - Subscribes via `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
   - Persists subscriptions in `app.web_push_subscriptions` linked to authenticated user IDs, installation user agents, and encryption credentials (`p256dh`, `auth`).
   - Supports idempotent re-registration, user unsubscription via `DELETE /v1/web-push/subscriptions`, and session reconciliation on sign-in.

3. **SSRF and Input Validation Defenses**:
   - Push endpoints are external URLs supplied by browser user agents (e.g., FCM, Mozilla autopush, Apple WebPush).
   - Validates push endpoints strictly before database persistence or worker HTTP dispatch:
     - Disallows insecure HTTP protocols (`http:`).
     - Resolves hostnames and blocks loopback addresses (`127.0.0.1`, `::1`, `localhost`), link-local addresses (`169.254.0.0/16`), and private RFC1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
     - Blocks internal cloud metadata endpoints (e.g., `169.254.169.254`).
   - VAPID private keys are never exposed to browser bundles or client-side code.

4. **Independent Multi-Device Delivery Coordination**:
   - Building on the Phase 28 notification foundation repairs, delivery uniqueness is tracked per recipient target (`app.reminder_deliveries.recipient_subscription_id` alongside `recipient_device_id`).
   - An Android device's local schedule acknowledgment marks `suppressed_local_schedule` for that Android device only; web push subscriptions and other devices receive alerts independently.
   - Handles expired subscriptions (HTTP 410 Gone / unregistered) by marking `is_active = false` in `app.web_push_subscriptions`.
   - Employs bounded retry with exponential backoff on transient server errors (HTTP 502/503/504), ensuring failed deliveries are not dropped or prematurely considered permanent.

5. **Service Worker Caching and PWA Privacy Isolation**:
   - Employs a strict allowlist policy (`daynori-static-v1`) precaching public static assets (`/manifest.json`, `/offline.html`, `/favicon.ico`, and `/_next/static/*`).
   - Strictly excludes:
     - Authenticated HTML documents (`/plan`, `/tasks`, `/settings`, etc.).
     - Next.js RSC and prefetch payloads (`_rsc`, `RSC: 1`, `Next-Router-Prefetch: 1`).
     - Private REST endpoints (`/api/*`, `/v1/*`).
     - URLs with signed capabilities (`token=`, `signature=`, `sig=`).
   - Ensures navigation requests fall back to `/offline.html` without leaking dynamic account content across users or offline sessions on shared computers.
   - Service worker activation purges only outdated `daynori-static-v*` caches without deleting unrelated origin caches.

6. **Privacy-Minimizing Push Display & Click Handling**:
   - Push event handler displays generic privacy-minimized notifications by default (`Daynori Reminder: You have a scheduled reminder.`).
   - Tapping a notification closes the notification, validates that destination targets match allowed internal routes (`plan`, `today`, `library`, `journal`, `settings`), and focuses or navigates an existing open window rather than spawning unbounded duplicate tabs.
   - Authentication is verified upon target arrival before private data is displayed.

7. **In-App Reminder Agenda Fallback**:
   - Implements `ReminderAgendaView`: An accessible, high-contrast agenda view embedded in Plan and Settings tabs.
   - Displays scheduled reminder instances, due dates, privacy levels, and delivery channels.
   - Allows users to test browser notification capabilities, enable/disable push, and review upcoming notifications even if browser push is unsupported, denied, or offline.

## Consequences

- Web Push delivery operates reliably across modern desktop and mobile browsers supporting the W3C Push API and Service Workers.
- Multi-device accounts receive synchronized reminders: local scheduling on Android does not mute browser push notifications on desktop or laptop workstations.
- Shared and public computers remain safe from data leakage through service worker caches or cross-account push payloads.
- Clear separation between software verification (unit and integration tests passing against simulated push services) and physical release gates (live VAPID push infrastructure).
