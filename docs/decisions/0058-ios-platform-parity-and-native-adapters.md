# ADR-0058: iOS platform parity and native adapters

- Status: accepted (implementation + config; native verification pending).
- Date: 2026-10-21.
- Related: Phase 61; ADR 0001, 0009, 0010, 0012, 0015, 0034; [ios-support-matrix](../engineering/ios-support-matrix.md); [ios-development](../engineering/ios-development.md).

## Context

Daynori’s mobile shell was Android-first. Phase 61 adapts the same Expo app for iOS without claiming that Android notification, alarm, KeyStore, or TalkBack evidence transfers. The current engineering host may be Windows, which cannot run Xcode or the iOS Simulator ([Expo iOS Simulator](https://docs.expo.dev/workflow/ios-simulator/), checked 2026-10-21). Owner authorized Phase 61 while Phases 59–60 remain incomplete for live Play/web publication.

Optional modules (vault, rooms/chat, live AI, Drive, production billing) stay gated.

## Options

1. **Separate native iOS app** — high cost; duplicates sync/auth.
2. **Expo Go only** — rejected: SQLCipher and secure-store require a development build.
3. **Shared Expo development build with platform adapters** — chosen: reuse domain/contracts/sync; branch notifications, device registration, Keychain options, and UI chrome per OS.

## Decision

1. **Single Expo app** (`apps/mobile`) with `ios.bundleIdentifier = com.daynori.app`, deployment target ≥ 15.1, SQLCipher enabled for iOS, associated domains for `app.daynori.com`, and microphone/encryption Info.plist keys.
2. **Platform helpers** (`nativePlatform.ts`) own OS identity and device-id prefixes (`mobile_ios_` / `mobile_android_`).
3. **Notifications:** Android channels only on Android; iOS schedules without `channelId`; device registration uses `platform: ios|android`; iOS push prefers `expo_push` (no invented `apns` token type without a migration); `exactAlarms` always false.
4. **Secure storage:** Keychain writes use `WHEN_UNLOCKED` when the Expo constant is available.
5. **Verification lanes:** `scripts/mobile-ios-path.mjs` validates config/host capability; Mac `prebuild:ios` / `expo run:ios` / physical VoiceOver evidence are separate and mandatory before Phase 62 store claims. TypeScript/`expo export` ≠ native build success.
6. **Feature matrix** published at `docs/engineering/ios-support-matrix.md`.

## Consequences

- Android and web continue to work; Android signing guard unchanged.
- Phase 61 remains **blocked** for acceptance until Mac/physical evidence exists, even when config/tests pass.
- Drive OAuth platform enum remains web/android until a dedicated Drive-on-iOS change; Drive stays release-gated off.
- Phase 62 must not treat this ADR as App Store readiness.

## Verification and revisit

- Config inspection + unit/integration tests on any host.
- Revisit when: APNs direct token type is added; StoreKit is enabled; vault ships on iOS; associated domain entitlement fails App Store validation; Expo SDK major upgrade changes SQLCipher/plugin APIs.
