# Android / JVM vault candidate harness (Phase 44)

Isolated, buildable candidate proof with two execution targets:

| Target | Module | KDF candidate | Establishes |
|---|---|---|---|
| Desktop JVM host | `:harness` | `de.mkammerer:argon2-jvm:2.11` | Android-class `AES/GCM` + Argon2id on JVM |
| Android app + instrumentation | `:android-app` | `org.bouncycastle:bcprov-jdk18on:1.78.1` (pure Java) | Emulator/device ABI-portable KDF + Keystore smoke |

**Candidate evaluation ≠ production approval.** Record browser, JVM, emulator, and physical-device results separately. Emulator PASS does **not** clear the physical-device gate.

Shared fixtures (`../shared-fixtures.json`) are **required**. Missing fixtures fail the harness. Deterministic keys/nonces are fixture-only.

## Prerequisites

- JDK 17+
- Android SDK (`ANDROID_HOME`) with `platforms;android-35` and `build-tools;35.0.0` (or compatible)
- Network access for Maven Central / Google Maven (first build)
- For emulator tests: a system image + AVD (see below)
- For physical-device tests: USB debugging enabled device

## 1. Desktop JVM host

```powershell
cd tests/security/vault/harnesses/android-candidate
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
.\gradlew.bat :harness:runHarness --no-daemon
```

Exit code 0 = harness PASS. Capture stdout into `../evidence/android-jvm-harness-YYYY-MM-DD.md`.

Checks include: McGrew/Viega Appendix B, Node↔JVM envelope exchange (empty/Unicode/binary), wrong key/context/tamper/malformed rejection, Argon2id expected-byte matches (password+salt regression + application-bounds fixture).

## 2. Android application / instrumentation

### Build APKs

```powershell
cd tests/security/vault/harnesses/android-candidate
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
# local.properties must set sdk.dir (gitignored). Example:
# sdk.dir=C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
.\gradlew.bat :android-app:assembleDebug :android-app:assembleDebugAndroidTest --no-daemon
```

Outputs:

- `android-app/build/outputs/apk/debug/android-app-debug.apk`
- `android-app/build/outputs/apk/androidTest/debug/android-app-debug-androidTest.apk`

### Emulator (when a system image / AVD exists)

```powershell
# Create AVD once (example API 35 google_apis x86_64):
# sdkmanager "system-images;android-35;google_apis;x86_64"
# avdmanager create avd -n daynori_vault_api35 -k "system-images;android-35;google_apis;x86_64" -d pixel_6
$env:ANDROID_HOME = "C:\Users\Lenovo\AppData\Local\Android\Sdk"
& "$env:ANDROID_HOME\emulator\emulator.exe" -avd daynori_vault_api35 -no-snapshot -wipe-data
# In another shell, wait for device then:
cd tests/security/vault/harnesses/android-candidate
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
.\gradlew.bat :android-app:connectedDebugAndroidTest --no-daemon
```

Capture logcat / Gradle test report into `../evidence/android-emulator-harness-YYYY-MM-DD.md`.
**Emulator evidence does not replace physical-device evidence.**

### Physical device

1. Enable Developer options + USB debugging; connect device (`adb devices` shows `device`).
2. Install + run instrumentation:

```powershell
adb devices -l
cd tests/security/vault/harnesses/android-candidate
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
.\gradlew.bat :android-app:connectedDebugAndroidTest --no-daemon
adb logcat -d -s DaynoriVaultCandidate:I *:S > ..\evidence\android-physical-logcat-YYYY-MM-DD.txt
```

3. Record in evidence: device model, Android API level, ABI, `bcprov-jdk18on:1.78.1`, full PASS/FAIL lines, Keystore smoke result.
4. Physical-device PASS is required for the Phase 44 gate; store separately from emulator.

## Explicit non-claims

- Desktop JVM PASS ≠ Android compatibility.
- Emulator PASS ≠ physical device / hardware-backed key evidence.
- Keystore AES smoke ≠ biometric-bound vault unlock (Phase 46).
- Argon2id latency samples ≠ GPU/ASIC resistance proof.
- This harness is disconnected from Daynori production apps and unlock screens.
