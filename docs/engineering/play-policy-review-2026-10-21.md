# Google Play policy review — 2026-10-21

Review date: **2026-10-21**. Applicability: proposed Android phone app `com.daynori.app` (Expo RN). This is an engineering audit, not store approval.

## Target API

| Item | Finding |
|---|---|
| Official requirement | New apps/updates targeting phones must target **API 36** (Android 16) starting **2026-08-31** ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/11926878); [target SDK guide](https://developer.android.com/google/play/requirements/target-sdk)) |
| Repository config | `expo-build-properties` now requests `compileSdkVersion`/`targetSdkVersion` **36** in `apps/mobile/app.json` |
| Built artifact | **Unexecuted** — no signed/merged APK/AAB inspected in this phase |
| Extension | Nov 1 2026 extension may be available in Console; not requested |

Raising targetSdk in source is **not** compatibility evidence. Expo 52 / RN 0.76 / native module matrix must be validated with a real build.

## 16 KB page size / native libraries

| Item | Finding |
|---|---|
| Official | Apps targeting Android 15+ must support 16 KB page sizes on 64-bit ([page sizes](https://developer.android.com/guide/practices/page-sizes); Play blog May 2025) |
| SQLCipher via `expo-sqlite` `useSQLCipher: true` | Native library present; alignment **unverified** on a built artifact |
| Evidence needed | APK Analyzer / `llvm-objdump` LOAD align 2**14 on packaged `.so` files after prebuild |

## Data safety draft (from actual behavior)

| Data type | Collected? | Notes |
|---|---|---|
| Account/auth | Yes | JWT/session; provider TBD for production |
| Personal content | Yes | Notes/tasks/journals/files when user creates them |
| Photos/files | Yes | Uploads when used |
| Audio | Possible | Recording modules exist; permission-gated |
| Financial | No production purchases | Synthetic billing only; production billing off |
| Analytics/crash | Not configured as a product SDK | Do **not** claim “no data collected” |
| AI | Off for proposed release | Live AI disabled |
| Vault | Off | Always gated |

SDK inventory (bundled/init even if UI hidden): Expo, React Native, expo-sqlite(+SQLCipher), expo-notifications, expo-secure-store, expo-av, jose/auth client paths — declare honestly in Console Data safety.

## Account deletion & privacy

| Requirement | Local status |
|---|---|
| In-app deletion | Present (Settings) |
| Public web resource without login | `/account-deletion` |
| Enumeration-safe / abuse-limited | Implemented in API (re-verify in release smoke) |
| Identity verification before destroy | Required |
| Deployed public URL | **Unverified** |
| Privacy policy URL | Draft `/privacy` — legal entity **UNRESOLVED** |

## Account-specific testing

Personal developer accounts may require closed testing with real testers ([Play requirement](https://support.google.com/googleplay/android-developer/answer/14151465)). Synthetic fixtures/emulators **do not** count.

## Permissions / audience / billing

| Topic | Status |
|---|---|
| Notifications / mic | Contextual; denied path must remain usable |
| Content rating / audience | Draft answers pending owner questionnaire |
| Play Billing | Production activation off; no commercial offers marketed |
| Optional features | Vault/rooms/AI/Drive must stay unreachable via API/nav/deep link |

## Signing

Silent debug.keystore fallback on release is **disabled** via `apps/mobile/plugins/withReleaseSigningGuard.js`. Distributable builds require `DAYNORI_RELEASE_STORE_*` or explicit `DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING=true` for local-test-only (never label as approved RC).
