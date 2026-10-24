# iOS development and verification procedure

Phase 61 establishes the reproducible iOS path. **Native builds require macOS + Xcode.** A Windows host can validate Expo configuration and TypeScript only.

Credentials, provisioning profiles, and signing certificates stay **outside Git** (Apple Developer portal / local Keychain / CI secrets). Never commit `.p12`, `.mobileprovision`, or App Store Connect API keys.

## Prerequisites (macOS)

1. Xcode (App Store) + Command Line Tools (`xcode-select --install` / Xcode Settings → Locations).
2. An iOS Simulator runtime (Xcode → Settings → Components) and optionally a physical device with Developer Mode.
3. CocoaPods (`brew install cocoapods` or as bundled with Expo prebuild flow).
4. Watchman recommended for Expo SDK 52 (`brew install watchman`) — [Expo iOS Simulator guide](https://docs.expo.dev/workflow/ios-simulator/) (checked 2026-10-21).
5. Repo Node `^24.21.0` and `pnpm@9.15.5` per root `package.json` engines.
6. Apple Developer team for device install / archive (not required for config inspection).

Compatibility baseline (checked 2026-10-21 against Expo SDK 52 docs):

| Component | Workspace |
|---|---|
| Expo | `~52.0.30` |
| React Native | `0.76.7` |
| iOS deployment target | `15.1` (`expo-build-properties`) |
| SQLCipher | `expo-sqlite` plugin `useSQLCipher: true` (iOS + Android); **not** Expo Go |
| Secure storage | `expo-secure-store` (Keychain); WHEN_UNLOCKED on write |
| Notifications | `expo-notifications` (local + Expo Push; no Android channel APIs on iOS) |

## Commands

### Any host (config / capability)

```bash
pnpm ios:path inspect
pnpm ios:path host-capability
pnpm ios:path write-evidence
# Evidence: artifacts/release/ios-path-inspection.json
```

`inspect` PASS means Expo `app.json` invariants hold. It is **not** a native build.

### macOS only — generate native project

```bash
cd apps/mobile
pnpm prebuild:ios
# or: npx expo prebuild --no-install -p ios
```

Signing: use Xcode Automatic Signing with your team, or export env vars consumed by your local EAS/Xcode workflow. Do not store secrets in the repo.

### macOS only — run Simulator

```bash
cd apps/mobile
pnpm ios
# equivalent: npx expo run:ios
```

Development build is required for SQLCipher and secure-store (Expo Go is insufficient).

### macOS only — physical device

1. Connect device, trust computer, enable Developer Mode.
2. `npx expo run:ios --device`
3. Record device model, iOS version, build number, and outcomes in the Phase 61 report (or Phase 62 store gate).

### JS-only export (does not prove native modules)

```bash
cd apps/mobile
pnpm build:ios:export
```

Do **not** treat `expo export -p ios` or `pnpm typecheck` as a successful native iOS build.

## Manual verification checklist (physical device)

Keep lanes separate: simulator ≠ physical; automated ≠ manual.

| Journey | Expected |
|---|---|
| VoiceOver focus order / labels | Core tabs and sheets operable |
| Dynamic Type / large text | Inputs remain usable (`allowFontScaling`) |
| Auth + account switch | Keychain session; drafts quarantined across accounts |
| Offline edit → reconnect | Pending mutations drain; conflicts explicit |
| Notifications denied → Settings recovery | Organizer usable; local schedule skipped honestly |
| Background / resume | Reminder reconcile on `AppState` active |
| Recording interrupt (if testing audio) | No false “saved” status |
| Upgrade / reinstall | Encrypted DB + Keychain key still unlock (or honest recovery) |

Optional modules (vault, rooms/chat, live AI, Drive, production billing) stay **disabled** — do not enable to claim parity.

## Windows host reality

This repository’s engineering workstation may be Windows. On Windows:

- `pnpm ios:path host-capability` reports `canRunNativeIosBuild: false`.
- `pnpm --filter @daynori/mobile prebuild:ios` exits with an explicit macOS requirement.
- Continue Android/web work; schedule Mac verification before Phase 62 store claims.
