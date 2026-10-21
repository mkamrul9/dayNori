# iOS feature / support matrix (Phase 61)

Date: 2026-10-21. Platform: Expo SDK 52 / React Native 0.76. Bundle id: `com.daynori.app`.

Status legend:

| Status | Meaning |
|---|---|
| **Enabled and verified** | Implemented and checked with automated or recorded native evidence |
| **Implemented; verification pending** | Code/config present; Mac simulator and/or physical iOS evidence missing |
| **Unsupported / deferred** | Intentionally out of current iOS track |
| **Disabled by release gate** | Module exists but must stay off until its gate has evidence |

## Core organizer

| Capability | Status | Notes |
|---|---|---|
| Shared domain / contracts / sync engine | Enabled and verified (shared TS) | Same packages as Android/web |
| Encrypted SQLite (SQLCipher) + Keychain-wrapped keys | Implemented; verification pending | `expo-sqlite` `useSQLCipher` for iOS; Keychain via `expo-secure-store` WHEN_UNLOCKED |
| Auth session restore, deep links (`daynori://`, applinks) | Implemented; verification pending | Same adapter; physical cold/warm start unexecuted on iOS |
| Offline drafts, outbox, receipts, conflicts | Implemented; verification pending | Shared SyncEngine; iOS restart recovery unexecuted |
| Today / Plan / Library / Journal / Settings | Implemented; verification pending | Shared mobile views; VoiceOver/Dynamic Type unexecuted |
| Search, create sheets, portability, account deletion UI | Implemented; verification pending | Sheet keyboard/safe-area adapted; native UX unexecuted |
| Local reminders (best-effort) | Implemented; verification pending | No Android channels/exact alarms on iOS; permission denial recovery copy iOS-specific |
| Push registration | Implemented; verification pending | iOS uses `expo_push` token type; APNs direct type not in schema; credentials unexecuted |
| File pick / share / offline cache | Implemented; verification pending | `expo-document-picker` / Share / file-system adapters |
| Audio recording (optional module UI) | Implemented; verification pending | `NSMicrophoneUsageDescription` present; interruption evidence unexecuted |
| Accessibility (VoiceOver, large text, focus) | Implemented; verification pending | `allowFontScaling`; physical VoiceOver gate open |

## Optional / gated modules (unchanged decisions)

| Module | Status | Notes |
|---|---|---|
| Vault unlock / production vault | Disabled by release gate | Phases 44–47; no production vault entry |
| Rooms / chat | Disabled by release gate | Phases 51–54; fail-closed in production |
| Live AI / assistant | Disabled by release gate | Phases 55–56 |
| Google Drive connector | Disabled by release gate | Phases 48–49; Drive OAuth platform enum still web/android |
| Expenses | Unsupported / deferred for iOS release claims | Opt-in UI exists; not part of enabled iOS parity claim |
| Production billing / StoreKit | Disabled by release gate | Phase 57; StoreKit sandbox not run; server receipt rules still required if enabled later |

## Explicit non-transfers from Android

- Android notification **channels** and `SCHEDULE_EXACT_ALARM` / exact-alarm APIs do **not** apply on iOS.
- Android KeyStore evidence does **not** satisfy iOS Keychain / Secure Enclave checks.
- TalkBack evidence does **not** satisfy VoiceOver evidence.
- Debug APK / Play AAB paths are Android-only; iOS uses Xcode / `expo run:ios` / archive on macOS.

## Host reality (this workspace)

Windows engineering host: Expo config + TypeScript/tests only. Native iOS prebuild, Simulator, and physical-device verification require macOS + Xcode (see [ios-development.md](ios-development.md)).
