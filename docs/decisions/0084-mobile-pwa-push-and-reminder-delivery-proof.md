# ADR-0084: Mobile PWA push and reminder delivery proof

- Status: accepted
- Date: 2026-11-05
- Owner/reviewer: Antigravity agent (owner-authorized Phase 84 with explicit scheduling exception).
- Related: [Phase 84](../roadmap/phases/84-mobile-pwa-push-and-reminder-delivery-proof.md), [ADR 0035](0035-web-push-and-pwa-offline-caching.md), [Phase 70](../phase-reports/phase-70.md), [Phase 73](../phase-reports/phase-73.md), [Phase 77](../phase-reports/phase-77.md), [Phase 81](../phase-reports/phase-81.md).
- Supersedes/superseded by: none. Does not waive Phase 71, Phase 75, Phase 80, Phase 81, or Phase 99 gates.

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 84 implementation before Phase 81 final acceptance:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 84 implementation before Phase 81 final acceptance. Record this scheduling exception explicitly in an ADR and roadmap metadata. Preserve Phase 81’s blocked status and outstanding checks. Do not mark any prerequisite complete, waive security/release gates, or remove dependencies merely to make validation pass."

Phase 84 addresses the end-to-end mobile PWA reminder delivery proof, connecting scheduled reminder rules, operating worker dispatch, VAPID Web Push delivery, service worker event processing, and contextual device permission guidance.

Key architectural and security requirements addressed:
1. **Push Pipeline Integrity**:
   - Traceable delivery flow: `reminder source → durable scheduling/outbox → operating worker → Web Push provider (Apple WebPush / Google FCM / Mozilla autopush) → service worker push handler → displayed notification → authorized deep link`.
   - Single Active Endpoint Binding: Partial unique index `app.uq_web_push_active_endpoint` guarantees that an endpoint is bound to at most one account at any time. Atomic rebinding (`app.rebind_web_push_endpoint`) deactivates prior account bindings when switching accounts.
2. **SSRF and Endpoint Sanitization**:
   - Web Push endpoints are external URLs supplied by browser clients. Endpoints must use HTTPS on default port 443 with no embedded userinfo.
   - Strict rejection of loopback (`127.0.0.1`, `::1`), private RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), cloud metadata (`169.254.169.254`), non-public domains (`.internal`, `.local`, `.test`), octal/hex representations, and IPv6-mapped addresses.
   - VAPID private keys remain strictly server-held; only VAPID public keys are served to clients via `GET /v1/web-push/vapid-public-key`.
3. **Contextual Mobile Platform Guidance**:
   - iOS/iPadOS 16.4+ Requirement: Web Push operates exclusively when Daynori is added to the Home Screen (`Share` > `Add to Home Screen`). In browser tabs, Web Push is unavailable; the UI displays explicit setup guidance without broken prompts.
   - Android Chrome Requirement: Explains both browser permission and Android OS app notification channels.
   - Deliberate Gesture: Notification permission is requested strictly upon explicit user interaction (e.g. clicking "Enable Browser Notifications"), never on initial load.
4. **Privacy Minimization**:
   - Generic preview by default (`Daynori Reminder` / `You have a scheduled reminder`).
   - Detailed mode available if opted-in by user (`Task: <title>`), never exposing note or description bodies.
   - Critical Invariant: Private journal entries, vault passphrases, and secret files are NEVER included in push payloads or lock-screen previews under any configuration.
5. **Truthful Delivery States**:
   - States are explicitly distinguished:
     - `Scheduled`: pending in local or server agenda.
     - `Worker Dispatched`: queued for delivery worker dispatch.
     - `Provider Accepted`: successfully accepted by Apple/Google push server over HTTP.
     - `Failed / Expired`: delivery expired (24h TTL) or rejected.
     - `Observed Display / Tapped`: user acknowledged or tapped notification.
   - Provider acceptance confirms HTTP receipt by FCM/Apple push servers; it is NEVER misrepresented as confirmed physical phone display.

## Decision

1. **Scheduling Exception**: Record the owner scheduling exception authorizing Phase 84 before Phase 81 final acceptance in `docs/roadmap/progress.json` and this ADR. Phase 81 remains recorded as `blocked` due to outstanding physical checks.
2. **Durable Web Push Test Dispatch**: Implement `POST /v1/workspaces/:workspaceId/reminders/test-push` and `@daynori/api-client` method `sendTestWebPushNotification` alongside `sendLocalTestNotificationAsync` in `webPushManager.ts`, allowing users to deliberately test notification delivery.
3. **Contextual UI Enhancements**:
   - Enhance `ReminderAgendaView.tsx` with mobile platform detection (`getMobilePwaPlatformInfo`), iOS 16.4+ Home Screen guidance banner, Android Chrome instructions, push content privacy radio options (`generic` vs `detailed`), and truthful delivery state badges.
4. **Multi-Device Target Isolation**: Maintain strict target separation between Web Push subscriptions (`recipient_subscription_id`) and native Android tokens (`recipient_device_id`). Native Android notification ownership remains reserved for Phase 85.
5. **Truthful Physical Gate Accounting**: Automated tests and journeys pass across desktopWeb and narrowPwa, but physical iPhone Home Screen and physical Android hardware reviews are truthfully marked `unmet` in `artifacts/phase84/manual-ui-evidence.json`, maintaining Phase 84 status as `blocked` rather than claiming unverified release readiness.

## Consequences

- Web Push reminder delivery is verified across unit, integration, and journey test suites.
- Contextual guidance clearly informs iOS and Android users of platform-specific installation prerequisites without nagging.
- Security boundaries (SSRF validation, VAPID secrecy, single active endpoint binding, privacy minimization) are fully enforced.
- Physical device review gates remain honestly marked `unmet` pending real hardware verification.
