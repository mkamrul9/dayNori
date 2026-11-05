# V2 PWA and native notification plan

Reviewed 2026-10-25. Status: supported-platform research and planned evidence, not confirmation that the current preview delivers notifications.

## Can the PWA notify a phone?

Yes, on a supported browser/device with user permission and an operating push backend. Web Push can deliver when the web app is not open; the browser's service worker handles the incoming event. The [Push API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) explains this background delivery model. Installing a PWA alone does not implement reminders.

For iPhone and iPad, the documented baseline is iOS/iPadOS 16.4 or later with the web app added to the Home Screen. Permission must be requested after a direct user action. See [WebKit's Home Screen Web Push documentation](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). Use runtime capability detection and recheck the actual supported OS/browser matrix when implementing and releasing.

For Android, validate Chrome and any additional promised browsers on physical devices. Delivery depends on browser/OS notification settings, network, battery/force-stop restrictions, and provider availability. No exact delivery-time or alarm guarantee follows from Web Push. A sleeping free application server/worker can delay dispatch; a dependable release needs measured hosting/worker behavior and an approved operating budget.

The current Daynori free preview excludes reminder delivery. V2 Phase 84 must connect and verify the complete path before telling the owner that notifications work on their phone.

## Complete path and controls

1. User creates a reminder. Explain its purpose and request permission only in that context.
2. Register an authenticated device subscription through a service worker and store it with account/workspace/device binding. Validate external input and protect subscription endpoints as sensitive delivery capabilities.
3. Domain mutation commits reminder scheduling/cancellation and durable outbox work. An operating worker dispatches through the approved Web Push adapter, using stable occurrence identity and bounded retries.
4. Service worker displays minimal private content. Tapping opens the correct item after current authorization; a removed item/account or revoked membership gets a safe fallback.
5. Settings expose device permission, subscriptions, categories, content privacy, quiet hours, timezone behavior, test notification, and opt-out. Denial has useful in-app agenda/help fallback, not repeated nagging.
6. Reschedule, completion, deletion, archive, logout, subscription expiry, and account removal update/cancel pending effects. Follow the documented multi-device policy and guard against duplicate native/web delivery.

Distinguish scheduled, worker-dispatched, provider-accepted, failed/expired, and user-observed display. Do not show a “delivered to phone” claim from an HTTP success alone. Client display acknowledgments are best-effort observations, not proof that the user read a notification.

## Native Android

Phase 85 verifies existing native adapters, local schedules and server push with the same domain semantics. Test OS permission, channels, reboot, time/timezone changes, device idle, force-stop, canceled source items, and deep links. Exact-alarm eligibility is a separate current-policy decision; do not add restricted permissions as a shortcut. Native results do not substitute for PWA or iPhone results.

## Required physical evidence

Record OS/browser/app versions, installed vs tab mode, device class, permission state, worker uptime, expected due time, dispatch/acceptance timestamps, observed display/tap result, and delays. Test app closed, screen locked, offline/reconnect, permission revoked, stale subscription, denied install/permission, quiet hours, duplicate retry, and two-account switch. Use synthetic titles without private journal text. A headless browser or fake push provider cannot close these gates.
