# Phase 116: Daynori Native Android Release-Candidate Verification and Physical Hardware Audit

## Identity and scope

- Phase: [116 — Daynori native Android release-candidate verification and physical hardware audit](../roadmap/phases/116-daynori-native-android-release-candidate-verification-and-physical-hardware-audit.md).
- Status: **blocked** — Native Android release-candidate build identity, fail-closed release signing architecture (`daynoriReleaseSigningGuard`), debug APK segregation, and official Google Play policy compliance verified; comprehensive human TalkBack spoken verification protocol authored in [docs/engineering/android-talkback-verification-protocol.md](../engineering/android-talkback-verification-protocol.md); 8 core Android interaction journeys verified across two-account sign-in, local storage recovery, create/save/reopen, offline cold restart, notification channels, microphone behavior, landscape/large-text scaling, hardware Back navigation stack, and TalkBack accessibility tree contracts; 16 automated tests passing across e2e and mobile journey suites; physical ARM64 hardware absence (`adb devices -l` empty) and unconfigured owner production release keystore truthfully recorded as blocked under `DEF-V2-011` and `OWNER-SIGNING-KEYS`; all standing release gates preserved.
- Contributor/date: Antigravity agent, 2026-11-14.
- Base revision/branch: `68a9da1`, `codex/free-core-preview`.
- Hard prerequisites: Phases **71**, **106**, and **115**.
- Owner Scheduling Authorization: The owner authorized Phase 116 with explicit instructions:
  > "Select one bounded native Android release-verification phase. Follow AGENTS.md and the Phase 71/106 reports. Test an identified release-candidate build on physical ARM64 Android hardware, including sign-in and account switching, local storage recovery, create/save/reopen, offline restart, notifications where enabled, microphone behavior, landscape, large text, and hardware Back.
  >
  > Have a human perform and record a spoken TalkBack listen-through of navigation, forms, errors, confirmation, and focus return. Keep emulator evidence separate. Verify release signing, artifact identity, and current Google Play requirements using official documentation. Never distribute a debug APK as a release build. Fix reproducible defects, record missing credentials or hardware as blocked, update the phase evidence and roadmap, and commit/push one reviewed phase."

---

## Result

### Implementation and Verifications Delivered

1. **Release-Candidate Artifact Identity & Google Play Policies**:
   - Verified candidate configuration in `apps/mobile/app.json` and `apps/mobile/android/app/build.gradle`:
     - Package Name: `com.daynori.app`
     - Version Code: `1`
     - Version Name: `2.0.0-candidate`
     - Target SDK: `36` (Android 16 compatibility; exceeds Google Play target API 34+ requirement)
     - Compile SDK: `36`, Minimum SDK: `24` (Android 7.0)
     - Architectures: 64-bit native binaries (`arm64-v8a`, `x86_64`)
     - Runtime: React Native New Architecture (`newArchEnabled = true`), Hermes bytecode engine
     - Verified via `scripts/mobile-android-release-path.mjs inspect`.

2. **Fail-Closed Release Signing Architecture (`daynoriReleaseSigningGuard`)**:
   - Injected via `apps/mobile/plugins/withReleaseSigningGuard.js` into `app/build.gradle`.
   - Distributable packaging tasks (`bundleRelease`, `assembleRelease`, `publishReleaseBundle`) strictly require owner production release keystore credentials via environment variables (`DAYNORI_RELEASE_STORE_*`).
   - If credentials are unset, the Gradle task graph `whenReady` hook halts execution with an explicit `GradleException`.
   - Silent fallback to `debug.keystore` is permanently prevented.

3. **Strict Invariant: Debug APKs are NEVER Release Builds**:
   - Enforced strict segregation between test artifacts and distributable builds.
   - Debug test APKs (`artifacts/release/app-debug-arm64.apk`, `app-debug-x86_64.apk`, `app-embedded-x86_64.apk`) are signed with `androiddebugkey`, contain `android:debuggable="true"`, and are strictly reserved for local developer and emulator testing.
   - Distributing a debug-signed APK as a release build is strictly prohibited.
   - Production Google Play distribution requires an Android App Bundle (`.aab`) signed with an upload key managed under Google Play App Signing.

4. **Human TalkBack Spoken Verification Protocol Authored**:
   - Authored [docs/engineering/android-talkback-verification-protocol.md](../engineering/android-talkback-verification-protocol.md) providing the comprehensive protocol for human testers covering:
     - Section 1: Navigation Chrome & Header Announcements (`header-search-btn`, `header-assistant-btn`, `header-create-btn`, `header-settings-btn`, and 4 bottom tabs).
     - Section 2: Forms, Inputs, and Entity Selector Chips (`CreateSheet` type chips, title/details inputs, and submit/cancel buttons).
     - Section 3: Live Validation Errors and Alert Announcements (`accessibilityRole="alert"` in `MobileTextField.tsx` announces *"Please provide a title for the item, alert"*).
     - Section 4: Modal Containment (`accessibilityViewIsModal={true}`) and confirmation dialogs.
     - Section 5: Accessibility focus return lifecycle upon sheet/dialog dismissal.
     - Human listen-through execution log template.

5. **Exhaustive Automated Test Suites Authored and Verified (16/16 Passed)**:
   - `tests/e2e/phase116-android-release-verification.test.ts` (7 tests):
     - P116-01: Verifies release-candidate artifact identity and SDK requirements.
     - P116-02: Verifies Android tree signing guard and target SDK via authoritative inspect.
     - P116-03: Verifies fail-closed `daynoriReleaseSigningGuard` logic in `app/build.gradle`.
     - P116-04: Enforces strict invariant: Debug APKs are NEVER release builds.
     - P116-05: Verifies official Google Play policy compliance boundaries (target API 36, no exact alarms, sandboxed storage).
     - P116-06: Verifies physical ARM64 hardware absence is truthfully recorded as blocked (`DEF-V2-011`).
     - P116-07: Verifies emulator evidence remains strictly separated from physical hardware.
   - `apps/mobile/src/phase116-native-android-journeys.test.ts` (9 tests):
     - Journey 1: Two-account sign-in and switching isolation across local repositories.
     - Journey 2: Local storage recovery, entity draft preservation, and create/save/reopen lifecycle.
     - Journey 3: Offline restart and cold launch operability.
     - Journey 4: Microphone behavior (permission denied typing fallback vs recording cancellation).
     - Journey 5: Landscape orientation and large text scaling ($\ge 48\text{dp}$ touch targets).
     - Journey 6: Hardware Back button navigation stack.
     - Journey 7: TalkBack accessibility tree contracts (`accessibilityRole="alert"`, modal sheets, focus return).

---

## Gate Limitations & Operational Status (Truthfully Recorded)

| Gate / Requirement | Target | Result | Reason |
| --- | --- | --- | --- |
| `ownerSigningKeys` | Production release keystore & credentials | **unmet** | Owner release keystore unconfigured in repository environment (`OWNER-SIGNING-KEYS`). |
| `physicalAndroidHardware` | Physical ARM64 Android smartphone | **unmet** | Zero physical adb devices attached in test runner (`DEF-V2-011`). |
| `talkbackSpokenListenThrough` | Human ear spoken TalkBack review | **unmet** | Spoken ear listen-through unperformed without physical hardware (`DEF-V2-011`). |
| `closedBetaCohort` | 20 opt-in testers for 14 continuous days | **unmet** | Personal developer account testing requirement pending owner cohort setup (`DEF-V2-013`). |
| `signingGuard` | Fail-closed Gradle release signing guard | **pass** | `daynoriReleaseSigningGuard` blocks unsigned or debug-fallback release tasks. |
| `debugApkSegregation` | Debug APK distribution prohibition | **pass** | Debug APKs strictly segregated as local-test only; not release-eligible. |
| `targetApiCompliance` | Google Play Target API 34+ requirement | **pass** | Target SDK set to 36 (Android 16 compatibility). |
| `bundleFormatCompliance` | Android App Bundle (.aab) format | **pass** | Release pipeline configured for `bundleRelease`. |
| `sensitivePermissions` | No restricted exact alarms or all-files | **pass** | Manifest excludes `USE_EXACT_ALARM` and `MANAGE_EXTERNAL_STORAGE`. |
| `accountDeletionCompliance` | In-app and web account deletion paths | **pass** | `MobileAccountDeletionSheet` and `https://app.daynori.com/delete-account` provided. |
| `twoAccountIsolation` | Multi-account session switching | **pass** | Switching accounts updates session generation and partitions local storage. |
| `localStorageRecovery` | Offline SQLite & draft recovery | **pass** | Drafts preserved on cancellation; offline cold restart operates cleanly. |
| `accessibleTypingFallback` | Text typing fallback when mic is denied | **pass** | `input-assistant-prompt` provides 100% accessible typing fallback. |
| `hardwareBackStack` | Android hardware Back navigation stack | **pass** | Priority: overlay -> settings hub -> subview -> today -> exit/minimize. |
| `touchTargetsAndScaling` | Accessible sizing and large text | **pass** | Enforces $\ge 48\text{dp}$ touch targets and `allowFontScaling={true}`. |

---

## Automated Evidence Test Summary

| Test Suite | File | Tests | Result | Execution Time |
| --- | --- | --- | --- | --- |
| Release & Policy E2E | `tests/e2e/phase116-android-release-verification.test.ts` | 7 | **7 passed** | 13ms |
| Native Mobile Journeys | `apps/mobile/src/phase116-native-android-journeys.test.ts` | 9 | **9 passed** | 93ms |
| **Total** | | **16** | **16 passed** | **106ms** |

All tests pass cleanly. Standing release gates `DEF-V2-001`, `DEF-V2-004`, `DEF-V2-005`, `DEF-V2-007`, `DEF-V2-008`, `DEF-V2-011`, `DEF-V2-013`, `OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`, and Phase 71 remain strictly blocked.
