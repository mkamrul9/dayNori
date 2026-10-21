# Privacy declarations and dependency inventory (draft)

**Review date:** 2026-10-21.  
**Sources:** [App privacy details](https://developer.apple.com/app-store/app-privacy-details/), [Submitting](https://developer.apple.com/app-store/submitting/).  
Nutrition Labels must be filed in App Store Connect before App Store submission — **not filed** in this preparation.

## Privacy policy URL

- In-app / web draft: `/privacy` (local Next.js app).
- Public production URL: **UNRESOLVED** until domain/hosting owner decisions.

## Draft data types (owner must confirm before filing)

Likely **collect** (transmitted off-device for account/sync), subject to final architecture:

| Category | Examples | Linked to user? | Purpose |
|---|---|---|---|
| Contact info | Account email | Yes | App functionality |
| User content | Notes, tasks, journal, files metadata/blobs | Yes | App functionality |
| Identifiers | Account / workspace / device installation IDs | Yes | App functionality |
| Diagnostics | Optional crash/usage if TestFlight/OS share | Possibly | Analytics / app functionality |

Do **not** claim “no data collected.” Do not declare tracking for advertising (Daynori does not ship ads). Update when third-party SDKs change.

Privacy manifests / third-party SDK signatures: follow current Apple SDK requirements at submission time; inventory Expo/RN transitive SDKs from the locked install on the Mac build machine.

## Mobile direct dependencies (inventory seed)

From `apps/mobile/package.json` (versions as of Phase 62 prep):

| Package | Role |
|---|---|
| `expo` ~52 | Runtime / tooling |
| `react-native` 0.76.7 | UI |
| `expo-sqlite` | Encrypted local DB (SQLCipher) |
| `expo-secure-store` | Keychain |
| `expo-notifications` | Local / push |
| `expo-av` | Audio (optional recording) |
| `expo-document-picker` / `expo-file-system` | Files |
| `expo-dev-client` | Development builds |
| `@daynori/*` workspace | Domain, sync, UI |

Full transitive tree: generate on Mac with `pnpm list --depth 10 --filter @daynori/mobile` at freeze time.

## Purchases

StoreKit / IAP: **disabled**. Do not add purchase products to fill release forms.
