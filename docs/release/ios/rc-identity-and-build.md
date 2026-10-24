# Release-candidate identity and build procedure

## Identity (provisional until owner freeze)

| Field | Value | Notes |
|---|---|---|
| Display name | Daynori | Brand clearance pending (`docs/product/naming.md`) |
| Bundle ID | `com.daynori.app` | `apps/mobile/app.json` |
| Version | `0.1.0` | Expo `version` |
| iOS build number | `1` | Increment per upload; credentials outside Git |
| Scheme | `daynori` | Deep links |
| Associated domain | `applinks:app.daynori.com` | Domain ownership **unresolved** |
| Min iOS | 15.1 | `expo-build-properties` |
| SQLCipher | enabled | Development build required (not Expo Go) |

## Build procedure (macOS + Xcode only)

```bash
# Config inspect (any host)
pnpm ios:path inspect
pnpm ios:path host-capability

# On macOS:
cd apps/mobile
pnpm prebuild:ios
# Configure signing in Xcode (Automatic Team) — no secrets in Git
pnpm ios                    # Simulator / device debug
# Archive / distribute via Xcode Organizer or EAS when owner authorizes
```

Do **not** treat `expo export -p ios`, TypeScript, or config inspect as a successful native release build.

## RC artifact gate

A release-candidate build is only candidacy-ready when:

1. Phase 61 Simulator + physical VoiceOver/Keychain/offline/notification evidence recorded.
2. Signed archive identity matches `com.daynori.app` + intended build number.
3. Smoke checklist in [testflight-device-checklist.md](testflight-device-checklist.md) passes on that exact binary.
