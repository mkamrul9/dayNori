# ADR-0116: Native Android Release-Candidate Verification and Physical Hardware Audit

- Status: accepted
- Date: 2026-11-14
- Owner/reviewer: Antigravity agent (owner-authorized Phase 116).
- Related: [Phase 116](../roadmap/phases/116-daynori-native-android-release-candidate-verification-and-physical-hardware-audit.md), [Phase 71](../phase-reports/phase-71.md), [Phase 106](../phase-reports/phase-106.md), [Phase 115](../phase-reports/phase-115.md), [ADR 0071](0071-native-android-settings-hub-and-insets.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0106](0106-daynori-native-android-interface-refinement-and-component-overhaul.md), [ADR 0115](0115-voice-assistant-audio-memory-cleanup-and-speech-capture-correction.md), [android-release-candidate-identity-and-signing.md](../engineering/android-release-candidate-identity-and-signing.md), [android-talkback-verification-protocol.md](../engineering/android-talkback-verification-protocol.md), [release-gates.md](../engineering/release-gates.md).
- Supersedes/superseded by: Supersedes Phase 71 and Phase 106 standalone verification reporting for native Android release candidates while keeping Phase 71 blocked on physical hardware and spoken TalkBack. Preserves all outstanding security, hardware, and release gates (`DEF-V2-011` and `OWNER-SIGNING-KEYS` remain strictly fail-closed).

---

## Context & Owner Scheduling Authorization

The project owner authorized Phase 116 with the following instructions:

> "Select one bounded native Android release-verification phase. Follow AGENTS.md and the Phase 71/106 reports. Test an identified release-candidate build on physical ARM64 Android hardware, including sign-in and account switching, local storage recovery, create/save/reopen, offline restart, notifications where enabled, microphone behavior, landscape, large text, and hardware Back.
>
> Have a human perform and record a spoken TalkBack listen-through of navigation, forms, errors, confirmation, and focus return. Keep emulator evidence separate. Verify release signing, artifact identity, and current Google Play requirements using official documentation. Never distribute a debug APK as a release build. Fix reproducible defects, record missing credentials or hardware as blocked, update the phase evidence and roadmap, and commit/push one reviewed phase."

This decision governs the verification of the native Android release candidate, establishes the technical enforcement preventing debug APK distribution, audits current Google Play developer policy compliance, specifies the human TalkBack spoken verification protocol, and truthfully records physical ARM64 hardware absence and unprovisioned release signing credentials as blocked under ADR 0074.

---

## Review of Prior Foundations (Phase 71 & Phase 106)

1. **Phase 71 Interface and Navigation Parity ([ADR 0071](0071-native-android-settings-hub-and-insets.md))**:
   - Established SQLite local repository, SecureStore encryption, routine calendar projection, and local mutation subscriptions.
   - Identified open blockers: ordinary account switching stability, physical ARM64 smartphone verification, and spoken TalkBack ear listen-through.
   - Standing [ADR 0074](0074-standing-phase71-scheduling-and-push.md) established that Phase 71 remains incomplete without waiving TalkBack, while preventing it from stalling independent roadmap phases.

2. **Phase 106 Native Component Overhaul ([ADR 0106](0106-daynori-native-android-interface-refinement-and-component-overhaul.md))**:
   - Modernized visual hierarchy for mobile idioms: eliminated perimeter card borders, added subtle elevation, unified SettingsHubView notebook card, and modernized MobileHeader and MobileNavigationBar.
   - Verified BackHandler navigation stack and CreateSheet local draft preservation.
   - Captured 12 automated verification steps on Android emulator (`emulator-5554`), keeping emulator evidence strictly separate from physical hardware.

---

## Release-Candidate Identity and Google Play Compliance

### 1. Release Candidate Artifact Identity
The native Android candidate artifact identity is verified across `apps/mobile/app.json`, `android/app/build.gradle`, and `packages/contracts`:
- **Package Name**: `com.daynori.app`
- **Version Code**: `1`
- **Version Name**: `2.0.0-candidate`
- **Target SDK**: `36` (Android 16 compatibility)
- **Compile SDK**: `36`
- **Min SDK**: `24` (Android 7.0 Nougat)
- **Architectures**: 64-bit native binaries (`arm64-v8a`, `x86_64`)
- **Runtime**: React Native New Architecture (`newArchEnabled = true`), Hermes bytecode engine.

### 2. Fail-Closed Release Signing Guard (`daynoriReleaseSigningGuard`)
Exported from `apps/mobile/plugins/withReleaseSigningGuard.js` and wired into `apps/mobile/android/app/build.gradle`:
- Distributable packaging tasks (`bundleRelease`, `assembleRelease`, `publishReleaseBundle`) strictly require owner production keystore credentials via environment variables (`DAYNORI_RELEASE_STORE_*` / `ANDROID_KEYSTORE_*`).
- When credentials are unset, the Gradle task graph `whenReady` hook halts the build with an explicit `GradleException`.
- Silent fallback to `debug.keystore` is permanently prevented.

### 3. Strict Invariant: Debug APKs are NEVER Release Builds
Daynori maintains strict segregation between test artifacts and distributable builds:
- Existing test APKs (`artifacts/release/app-debug-arm64.apk`, `app-debug-x86_64.apk`, `app-embedded-x86_64.apk`) are signed with the default debug certificate (`androiddebugkey`), contain `android:debuggable="true"`, and are strictly reserved for local developer and emulator testing.
- Distributing a debug-signed APK as a release build is strictly prohibited.
- Google Play production distribution requires an Android App Bundle (`.aab`) signed with an upload key managed under Google Play App Signing.

### 4. Official Google Play Policy Compliance Verification
Documented in [docs/engineering/android-release-candidate-identity-and-signing.md](../engineering/android-release-candidate-identity-and-signing.md):
- **Target API Requirements**: Google Play requires API 34+; Daynori targets API 36.
- **Play App Signing**: Mandates Android App Bundle (`.aab`) format.
- **64-Bit Architecture**: Verified native 64-bit binaries (`arm64-v8a`).
- **Sensitive Permissions Fencing**: Manifest strictly excludes restricted permissions `USE_EXACT_ALARM`, `SCHEDULE_EXACT_ALARM`, and `MANAGE_EXTERNAL_STORAGE`.
- **Account Deletion**: Verified in-app (`MobileAccountDeletionSheet`) and public web endpoint (`https://app.daynori.com/delete-account`).
- **Data Safety Disclosures**: Declares 0-day transient voice audio retention, SQLCipher encryption at rest, and zero model training on customer data.

---

## Physical Hardware Audit & TalkBack Spoken Protocol

### 1. Physical ARM64 Hardware Absence
Inspection via `adb devices -l` reveals zero attached devices (`List of devices attached` empty). No physical ARM64 Android smartphone is attached in this test runner.
In accordance with AGENTS.md truthfulness rules, physical device readiness is **truthfully recorded as BLOCKED under `DEF-V2-011`**.

### 2. Spoken TalkBack Audio Listen-Through Protocol
Automated XML layout hierarchy dumps (`adb exec-out uiautomator dump`) verify accessibility labels and roles in software, but cannot certify spoken ear intelligibility, pronunciation, or audio clipping.
Authored [docs/engineering/android-talkback-verification-protocol.md](../engineering/android-talkback-verification-protocol.md) providing the comprehensive protocol for human testers covering:
- Navigation chrome: Header buttons (`header-search-btn`, `header-assistant-btn`, `header-create-btn`, `header-settings-btn`) and bottom tabs (`nav-tab-today`, `nav-tab-plan`, `nav-tab-library`, `nav-tab-journal`).
- Form inputs: Item type selector pill chips, title and detail edit boxes, and submit/cancel actions.
- Live validation errors: Verified `<Text accessibilityRole="alert">` in `MobileTextField.tsx` announces *"Please provide a title for the item, alert"*.
- Confirmation and modal trapping: `accessibilityViewIsModal={true}` traps focus inside `MobileModalSheet`.
- Focus return: Dismissing sheets returns accessibility focus directly to the triggering button.

---

## Automated Journey Verification (16/16 Passed)

1. **E2E & Policy Verification (`tests/e2e/phase116-android-release-verification.test.ts` — 7 tests)**:
   - Artifact identity & SDK levels.
   - Authoritative inspection via `scripts/mobile-android-release-path.mjs inspect`.
   - `daynoriReleaseSigningGuard` fail-closed logic in Gradle.
   - Debug APK segregation.
   - Google Play policy compliance boundaries.
   - Truthful physical hardware and TalkBack blocking under `DEF-V2-011`.
   - Strict separation of emulator evidence.

2. **Mobile Journeys & Interactions (`apps/mobile/src/phase116-native-android-journeys.test.ts` — 9 tests)**:
   - Journey 1: Two-account sign-in and switching isolation across local repositories.
   - Journey 2: Local storage recovery, entity draft preservation, and create/save/reopen lifecycle.
   - Journey 3: Offline restart and cold launch operability.
   - Journey 4: Microphone behavior (permission denied typing fallback vs recording cancellation).
   - Journey 5: Landscape orientation and large text scaling ($\ge 48\text{dp}$ touch targets).
   - Journey 6: Hardware Back button navigation stack.
   - Journey 7: TalkBack accessibility tree contracts (`accessibilityRole="alert"`, modal sheets, focus return).

---

## Standing Release Gates

Native Android release capabilities remain strictly gated fail-closed:
- **`OWNER-SIGNING-KEYS`**: Owner production keystore and passwords remain unconfigured.
- **`DEF-V2-011`**: Physical ARM64 Android smartphone hardware and spoken TalkBack screen-reader ear review remain unavailable locally.
- **`DEF-V2-013`**: Personal developer account 20-tester 14-day closed beta cohort remains unexecuted.
- **`OWNER-RELEASE-AUTH`**: Owner publication authorization remains unexecuted.
- **`Phase 71`**: Retained strictly blocked under ADR 0074.

Under ADR 0074, Phase 116 is recorded as complete and bounded, with release gates `OWNER-SIGNING-KEYS` and `DEF-V2-011` preserved as `blocked`.
