# Phase 84: Mobile PWA push and reminder delivery proof

## Identity and scope

- Phase: [84 — Mobile PWA push and reminder delivery proof](../roadmap/phases/84-mobile-pwa-push-and-reminder-delivery-proof.md).
- Status: **blocked** — automated Web Push pipeline, SSRF endpoint validation, single active endpoint rebinding, mobile platform guidance (iOS 16.4+ Home Screen requirement, Android Chrome settings), content privacy controls, test notification dispatch, and desktop/narrow-PWA journeys verified; physical iPhone Home Screen and physical Android hardware reviews remain recorded as unmet.
- Contributor/date: Antigravity agent, 2026-11-05.
- Base revision/branch: `8c26a33`, `codex/free-core-preview`.
- Hard prerequisites: Phases **70** (mobile web/PWA layout), **73** (tasks/routines workflow), **77** (offline reopen/sync recovery), and **81** (advanced tour coverage).
- Owner Scheduling Authorization: The owner authorized implementing Phase 84 before Phase 81 final acceptance ([ADR 0084](../decisions/0084-mobile-pwa-push-and-reminder-delivery-proof.md)). Phase 81 remains recorded as `blocked` in roadmap metadata. Phases 71, 75, 80, and 99 gates remain preserved. Standing push authorized under ADR 0074. No `release_ready` claim.

## Result

### Implementation delivered

- **Contracts & API Client** ([ADR 0084](../decisions/0084-mobile-pwa-push-and-reminder-delivery-proof.md)):
  - Defined `TestWebPushRequestSchema`, `TestWebPushResponseSchema`, and `TestWebPushDeliveryItemSchema` in `@daynori/contracts`.
  - Added `sendTestWebPushNotification` to `@daynori/api-client` (`DaynoriApiClient`).
- **API Backend Service and Routes**:
  - Implemented `sendTestWebPushNotification` in `apps/api/src/modules/reminders/service.ts`, verifying active Web Push subscriptions, finding or creating target items and reminder rules/instances to satisfy database constraints, and inserting delivery records into `app.reminder_deliveries`.
  - Added route `POST /v1/workspaces/:workspaceId/reminders/test-push` in `apps/api/src/routes/v1/reminders.ts` with tenant isolation and role validation.
  - SSRF defenses in `assertValidPushEndpoint` strictly enforce HTTPS port 443 and reject loopback, RFC 1918 subnets, cloud metadata (`169.254.169.254`), `.internal`/`.local` domains, and IPv4/IPv6 obfuscated representations.
  - VAPID application public key served via `GET /v1/web-push/vapid-public-key`; private key held securely on server.
- **Web Push Manager (`apps/web/src/notifications/webPushManager.ts`)**:
  - `getMobilePwaPlatformInfo`: Detects iOS, Android, and standalone PWA display modes. Detects when iOS requires Home Screen installation (`isIOS && !isStandalone`) to support Web Push.
  - `getPwaPushPrivacyMode` / `setPwaPushPrivacyMode`: Stores user lock-screen content privacy preference (`generic` vs `detailed`).
  - `sendLocalTestNotificationAsync`: Provides client-side test notification trigger via `ServiceWorkerRegistration.showNotification`.
- **UI Enhancements (`apps/web/src/components/ReminderAgendaView.tsx`)**:
  - Contextual platform guidance: Displays informative callout for iOS Home Screen installation requirement and Android Chrome permissions.
  - Push Content Privacy: Exposes radio options for `Privacy-minimized` ('Daynori Reminder') vs `Detailed` (item title), with explicit disclosure that private journal entries, notes, and vault items are never included in notification payloads.
  - Test Notification: Added "Send Test Notification" button with immediate feedback.
  - Truthful Delivery States: Displays precise status badges (`Scheduled`, `Worker Dispatched`, `Provider Accepted`, `Failed / Expired`, `Observed Display / Tapped`) rather than conflating server push acceptance with physical phone delivery.
- **Service Worker (`apps/web/public/sw.js`)**:
  - Generic privacy minimization enforced on push events.
  - Authorized deep-link navigation on notification click targeting `/plan?reminderInstanceId=...`.

## Real UI and journey verification

Executed 14 automated journeys via `scripts/phase84-run-all-journeys.mjs`:

1. **Desktop Web Journeys (7/7 passed)**:
   - `web-push-capability-agenda`: VAPID public key acquisition and reminder agenda retrieval.
   - `web-push-subscription`: Authenticated subscription registration, single active endpoint binding, and account reconciliation.
   - `web-push-test-notification`: Synthetic test push dispatch and delivery receipt tracking.
   - `web-push-content-privacy`: Generic and detailed payload redaction verification.
   - `web-push-quiet-hours`: Quiet hours window detection and deferral end calculation.
   - `web-push-source-lifecycle`: Task creation, reminder rule attachment, and task completion invalidation.
   - `web-push-unsubscribe`: Subscription deletion and active counter verification.
2. **Narrow PWA Journeys (7/7 passed, 390x844 viewport)**:
   - Mirrored the 7 journeys with mobile-specific checks: iOS 16.4+ Home Screen requirement guidance, Android Chrome settings guidance, responsive touch targets, and truthful delivery state rendering.

### Physical device reviews (truthfully recorded)

| Review | Target | Result | Reason |
| --- | --- | --- | --- |
| `physicalIphoneHomeScreen` | Physical iPhone iOS 16.4+ | **unmet** | Physical iOS hardware unavailable in local runner environment. |
| `physicalAndroidDevice` | Physical Android device | **unmet** | Physical Android phone hardware unavailable in local runner environment. |

Evidence files:
- `artifacts/phase84/phase84-ui-evidence.json`
- `artifacts/phase84/evidence-summary.json`
- `artifacts/phase84/manual-ui-evidence.json`

## Automated evidence

| Check | Result |
| --- | --- |
| `tests/unit/phase84-pwa-push-pipeline.test.ts` | Pass (23 tests) |
| `tests/integration/phase29-web-reminders.test.ts` | Pass (19 tests) |
| `scripts/lib/phase84-ui-evidence.test.mjs` | Pass (3 tests) |
| `scripts/phase84-run-all-journeys.mjs` | Pass (14 journeys) |
| `pnpm --filter @daynori/contracts build` | Pass |
| `pnpm --filter @daynori/api-client build` | Pass |
| `pnpm --filter @daynori/api build` | Pass |
| `pnpm --filter @daynori/web typecheck` | Pass |
| `pnpm validate:planning` | Pass |
| `pnpm validate:function-register` | Pass |
| `pnpm icons:check` | Pass |
| `pnpm audit:secrets` | Pass |
| `git diff --check` | Pass |

## Next steps

- Close physical device verification gates for Phase 84 when physical iPhone (iOS 16.4+) and physical Android devices are available.
- Retain Phase 81's blocked status.
- Implement Phase 85 (Native Android reminders and alarms) when selected by the owner.
