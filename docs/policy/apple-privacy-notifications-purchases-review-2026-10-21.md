# Apple privacy, notifications, and purchases review (Phase 61)

**Review date:** 2026-10-21  
**Reviewer:** Cursor agent (engineering configuration review; not App Store submission)  
**Primary sources checked:**

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (Privacy 5.1, permissions, account deletion)
- [Asking permission to use notifications](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications)
- [App Store submitting / privacy nutrition labels](https://developer.apple.com/app-store/submitting/)
- Expo SDK 52: [SQLite / SQLCipher](https://docs.expo.dev/versions/v52.0.0/sdk/sqlite/), [iOS Simulator](https://docs.expo.dev/workflow/ios-simulator/)

## Configuration recorded in repo

| Topic | Daynori configuration (2026-10-21) |
|---|---|
| Bundle id | `com.daynori.app` |
| Microphone purpose string | `NSMicrophoneUsageDescription` in `apps/mobile/app.json` — optional voice notes; denial allowed |
| Encryption export compliance | `ITSAppUsesNonExemptEncryption: false` (standard HTTPS + on-device SQLCipher/Keychain; revisit if custom non-exempt crypto ships) |
| Notification permission | Requested only after reminder opt-in (`requestNotificationPermissionAsync`); core organizer usable when denied |
| Background modes | `remote-notification` declared for push wake; local reminders are best-effort |
| Face ID string | Declared via `expo-secure-store` plugin for future biometric unlock; vault production entry remains gated off |
| Privacy policy / account deletion | Web resources exist; in-app deletion sheet present; App Store Connect privacy nutrition labels **not** filed (Phase 62) |
| Purchases | Production StoreKit / billing **disabled** by release gate; if enabled later, server-side receipt verification required (ADR 0012 / 0054) |

## Requirements summary (not submission evidence)

1. **Privacy policy** link required in App Store Connect and in-app before submission.
2. **Permission purpose strings** must match actual use; do not gate paid/core flows on unnecessary permissions.
3. **Notifications** must not be required for core functionality; request in context.
4. **Account deletion** required if account creation is offered (already implemented in organizer lifecycle).
5. **Privacy Nutrition Labels** required at submission time for the app and third-party SDKs.
6. **In-app purchases** for digital goods must use StoreKit; entitlements server-authoritative when billing is enabled.

## Gaps

- No App Store Connect listing, privacy questionnaire, or TestFlight build executed.
- No physical-device notification / Keychain evidence.
- StoreKit sandbox not run (billing disabled).
