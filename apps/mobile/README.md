# @daynori/mobile

Expo and React Native mobile application for Daynori (Android-first).

## Status

Established in Phase 01. Phase 71 adapts the Version 2 Warm notebook shell on Android (Settings hub/groups, Back priority, keyboard insets). Device/TalkBack acceptance for Phase 71 may still be incomplete — see [phase-71 report](../../docs/phase-reports/phase-71.md).

Provides:

- Expo SDK 52 mobile application shell with strict TypeScript
- Accessible React Native UI styled with semantic design tokens (`@daynori/ui-mobile`)
- Metro monorepo resolution configured via `metro.config.js`
- Grouped native Settings (hub → Account / Appearance / Notifications / Workspace / Privacy / Help)
- Feature-registry primary tabs (Journal hide → three destinations)

Native Android differs from browser/PWA (Phase 70): hardware Back, `androidInsets` keyboard helper (no `react-native-safe-area-context` yet), StatusBar top pad for edge-to-edge header hit-testing, Expo Dev Client for debug APKs (`orientation: default` for landscape evidence). Native iOS remains separately gated.

Device evidence (explicit serial): `DAYNORI_ANDROID_SERIAL=emulator-5554 node scripts/phase71-android-device-evidence.mjs` (and optional `phase71-android-journeys.mjs`). Metro for Dev Client often runs from the short sync root `D:\d\daynori`.

## Commands and development build workflow

- `pnpm dev`: Start the Expo Metro development server (`expo start`)
- `pnpm prebuild`: Generate native Android project files (`expo prebuild --no-install -p android`)
- `pnpm build`: Generate the Android Hermes JavaScript bundle and static assets (`expo export -p android`)
- `pnpm android`: Run native development build on connected device/emulator via `expo run:android`
- `.\gradlew.bat assembleDebug`: Compile debug APK (`app-debug.apk`) inside `android/` using the native Android toolchain
- `pnpm typecheck`: Run strict TypeScript validation

Space-free APK builds (Windows): from repo root,
`DAYNORI_ANDROID_ABI=x86_64 node scripts/build-android-debug-apk.mjs`
syncs dirty mobile sources into `DAYNORI_SHORT_BUILD_ROOT` (default `D:\d\daynori`) before Gradle.
Select a device explicitly: `DAYNORI_ANDROID_SERIAL=emulator-5554 pnpm test:e2e:android`.

Development builds are configured with `expo-dev-client` (`~5.0.20`) and `expo-modules-autolinking` (`~2.0.8`) targeting Android SDK 34/35. Debug APKs typically need Metro; an Expo export alone is not an installable acceptance APK.

See [system overview](../../docs/architecture/system-overview.md) and [repository layout](../../docs/engineering/repository-layout.md).
