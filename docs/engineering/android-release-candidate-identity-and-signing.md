# Daynori Android Release-Candidate Identity, Signing Architecture, and Google Play Compliance Specification

**Phase:** Phase 116 — Daynori Native Android Release-Candidate Verification and Physical Hardware Audit  
**Date:** 2026-11-14  
**Status:** **ACTIVE / VERIFIED IMPLEMENTATION; GATED FAIL-CLOSED UNDER OWNER-SIGNING-KEYS AND DEF-V2-011**

---

## 1. Executive Summary & Scope

This specification establishes the authoritative build identity, release signing architecture, and official Google Play compliance boundaries for the Daynori native Android application (`apps/mobile`).

In strict compliance with `AGENTS.md` and repository release invariants:
1. **Never Distribute a Debug APK as a Release Build**: Debug-signed APKs are strictly segregated for local emulator/developer testing and cannot be published or distributed to end users.
2. **Fail-Closed Release Signing Guard**: `daynoriReleaseSigningGuard` actively prevents silent fallback to `debug.keystore` during release packaging tasks.
3. **Official Policy Adherence**: All store submission rules, SDK targets, 64-bit requirements, permission restrictions, and account deletion pathways are verified against current Google Play developer policies.
4. **Honest Gate Gating**: Missing physical ARM64 hardware and owner production signing credentials are affirmatively recorded as **`blocked`** under `DEF-V2-011` and `OWNER-SIGNING-KEYS`.

---

## 2. Release-Candidate Build Identity

The authoritative artifact configuration is defined across `apps/mobile/app.json`, `apps/mobile/android/app/build.gradle`, and `packages/contracts`:

| Attribute | Specification Value | Enforcement Mechanism | Verification Check |
|---|---|---|---|
| **Package ID / Application ID** | `com.daynori.app` | `android.defaultConfig.applicationId` | `scripts/mobile-android-release-path.mjs inspect` |
| **Version Code** | `1` | `android.defaultConfig.versionCode` | Matches candidate release manifest |
| **Version Name** | `2.0.0-candidate` | `app.json` / `build.gradle` | Candidate semantic version |
| **Target SDK Version** | `36` (Android 16 compatibility) | `rootProject.ext.targetSdkVersion` | Exceeds Google Play target API 34+ requirement |
| **Compile SDK Version** | `36` | `rootProject.ext.compileSdkVersion` | Build tools 36.0.0 |
| **Minimum SDK Version** | `24` (Android 7.0 Nougat) | `rootProject.ext.minSdkVersion` | Supported device floor |
| **Target ABIs** | `arm64-v8a`, `x86_64` | `react-native-community/cli` NDK config | 64-bit architecture compliance |
| **Runtime Architecture** | React Native New Architecture (`newArchEnabled = true`) | `apps/mobile/app.json` | Fabric renderer + TurboModules enabled |
| **JavaScript Engine** | Hermes | `hermesEnabled: true` | Bytecode precompilation enabled |

---

## 3. Fail-Closed Release Signing Architecture

### 3.1 The `withReleaseSigningGuard` Config Plugin
Exported from `apps/mobile/plugins/withReleaseSigningGuard.js`, this Expo prebuild plugin injects a tamper-resistant signing guard into `apps/mobile/android/app/build.gradle`:

```groovy
// daynoriReleaseSigningGuard
def daynoriConfigureReleaseSigning() {
    def storeFile = System.getenv("DAYNORI_RELEASE_STORE_FILE") ?: System.getenv("ANDROID_KEYSTORE_PATH")
    def storePass = System.getenv("DAYNORI_RELEASE_STORE_PASSWORD") ?: System.getenv("ANDROID_KEYSTORE_PASSWORD")
    def keyAlias  = System.getenv("DAYNORI_RELEASE_KEY_ALIAS") ?: System.getenv("ANDROID_KEY_ALIAS")
    def keyPass   = System.getenv("DAYNORI_RELEASE_KEY_PASSWORD") ?: System.getenv("ANDROID_KEY_PASSWORD")
    def allowDebug = (System.getenv("DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING") ?: "false").toBoolean()

    if (storeFile && storePass && keyAlias && keyPass) {
        android.signingConfigs.release.storeFile = file(storeFile)
        android.signingConfigs.release.storePassword = storePass
        android.signingConfigs.release.keyAlias = keyAlias
        android.signingConfigs.release.keyPassword = keyPass
        android.buildTypes.release.signingConfig = android.signingConfigs.release
        return null
    }

    if (allowDebug) {
        // Local developer debug override only
        android.buildTypes.release.signingConfig = android.signingConfigs.debug
        logger.warn("DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING: producing DEBUG-SIGNED local-test artifact only — not release-eligible")
        return null
    }

    return "Release signing refused for distributable release task: set complete DAYNORI_RELEASE_STORE_* credentials. Silent debug.keystore fallback is disabled."
}

def daynoriSigningFailure = daynoriConfigureReleaseSigning()
gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { daynoriIsDistributableReleaseTask(it) } && daynoriSigningFailure != null) {
        throw new GradleException(daynoriSigningFailure)
    }
}
```

### 3.2 Distributable Task Enforcement
The guard detects any task intended for external distribution:
- `assembleRelease`
- `bundleRelease`
- `publishReleaseBundle`
- `packageRelease`

If the owner release keystore is unconfigured, Gradle halts execution with an explicit exception. Silent substitution of `debug.keystore` is impossible.

---

## 4. Strict Separation: Debug APKs vs. Distributable Release Builds

Daynori maintains an absolute barrier between local test APKs and distributable release artifacts:

```
+-------------------------------------------------------------------------+
|                              ARBITRARY APKS                             |
+-------------------------------------------------------------------------+
| [Local Debug APKs]                     | [Distributable Release Builds] |
| - app-debug-arm64.apk                  | - Daynori-release.aab (AAB)    |
| - app-debug-x86_64.apk                 | - Play App Signing managed     |
| - app-embedded-x86_64.apk              | - Owner production keystore    |
| - Signed with 'androiddebugkey'        | - android:debuggable="false"   |
| - android:debuggable="true"            | - Minified via R8/ProGuard     |
| - FOR LOCAL TEST & EMULATORS ONLY      | - ELIGIBLE FOR GOOGLE PLAY     |
| - NEVER DISTRIBUTED TO USERS           | - Requires OWNER-SIGNING-KEYS  |
+-------------------------------------------------------------------------+
```

### Prohibited Actions:
1. Renaming `app-debug-arm64.apk` or `app-embedded-x86_64.apk` to a release name.
2. Publishing any APK or bundle signed with the default `debug.keystore`.
3. Distributing an artifact containing `android:debuggable="true"`.
4. Uploading an APK directly to the Google Play Console for production tracks (AAB is required).

---

## 5. Google Play Official Policy Compliance Verification

In accordance with `docs/research/sources.md`, the release candidate is evaluated against official Google Play policies:

### 5.1 Target API Level Requirements
- **Official Policy**: [Google Play Target API Policy](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).
- **Requirement**: New apps and updates must target API level 34 or higher (Daynori targets API 36).
- **Compliance**: `apps/mobile/android/app/build.gradle` and `app.json` set `targetSdkVersion = 36`. Verified via `scripts/mobile-android-release-path.mjs inspect`.

### 5.2 Play App Signing and Distribution Format
- **Official Policy**: [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842754?hl=en).
- **Requirement**: Apps must be published using the Android App Bundle (`.aab`) format. Google Play generates optimized APK splits per device configuration.
- **Compliance**: The release pipeline targets `bundleRelease` to produce `.aab`. Signing requires owner upload keystore (`OWNER-SIGNING-KEYS`).

### 5.3 64-Bit Architecture Requirement
- **Official Policy**: [64-bit Requirement](https://developer.android.com/google/play/requirements/64-bit).
- **Requirement**: Native C/C++ libraries must include 64-bit architectures.
- **Compliance**: Daynori configures `arm64-v8a` (physical devices) and `x86_64` (emulators). 32-bit legacy ABIs (`armeabi-v7a`, `x86`) are excluded from release bundles.

### 5.4 Sensitive Permissions Fencing
- **Official Policy**: [Google Play Sensitive Permissions Policy](https://support.google.com/googleplay/android-developer/answer/16558241?hl=en).
- **Invariants**:
  - `USE_EXACT_ALARM` / `SCHEDULE_EXACT_ALARM`: **Strictly excluded**. Daynori uses standard inexact alarm intervals and NotificationChannels (`reminders` and `updates`).
  - `MANAGE_EXTERNAL_STORAGE`: **Strictly excluded**. Daynori uses sandboxed app-specific storage (`ExpoFileSystemOfflineStorageAdapter`).
  - `RECORD_AUDIO`: Declared for optional voice memo attachments; decoupled from cloud AI transmission (`app.ai_consents`). 100% accessible text keyboard fallback provided when denied.

### 5.5 Account Deletion Compliance
- **Official Policy**: [Account Deletion Guidance](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).
- **Compliance**:
  - In-App: Settings -> Account -> Delete Account opens `MobileAccountDeletionSheet` requiring explicit confirmation.
  - Web Fallback: Public account deletion URL hosted at `https://app.daynori.com/delete-account`.

### 5.6 Data Safety Disclosures
- **Official Policy**: [Data Safety Guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).
- **Compliance**: Disclosures accurately reflect that Daynori does not sell user data, does not use customer content to train foundation models, enforces SQLCipher encryption at rest, and provides 0-day transient retention for voice recordings.

### 5.7 Personal Developer Account Testing Gate
- **Official Policy**: [Testing Requirements for New Personal Accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).
- **Requirement**: Minimum 20 opt-in testers participating continuously for at least 14 days before applying for production track access.
- **Compliance**: Tracked under release gate `DEF-V2-013`.

---

## 6. Operational Release Gates

| Gate ID | Barrier Description | Current Status | Resolution Requirement |
|---|---|---|---|
| **`OWNER-SIGNING-KEYS`** | Owner production release keystore, passwords, and key alias | **BLOCKED** | Human owner must provision production keystore in secure CI secrets. |
| **`DEF-V2-011`** | Physical ARM64 Android device testing and spoken TalkBack audio listen-through | **BLOCKED** | Connect physical ARM64 test smartphone and perform human ear TalkBack review. |
| **`DEF-V2-013`** | Personal developer account 20-tester 14-day closed test cohort | **BLOCKED** | Execute 14-day closed beta with 20 distinct registered Google accounts. |
| **`OWNER-RELEASE-AUTH`** | Owner sign-off on release candidate hash, cohort size, and hosting budget | **BLOCKED** | Final publication authorization by repository owner. |
