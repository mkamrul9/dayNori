# Android physical-device harness evidence — PENDING

**Status:** Not executed in this session. Required for Phase 44 gate.

## Procedure (owner / operator)

See `tests/security/vault/harnesses/android-candidate/README.md` § Physical device.

```powershell
adb devices -l
cd tests/security/vault/harnesses/android-candidate
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
.\gradlew.bat :android-app:connectedDebugAndroidTest --no-daemon
adb logcat -d -s DaynoriVaultCandidate:I *:S > ..\evidence\android-physical-logcat-YYYY-MM-DD.txt
```

## Required record fields

- Device model, manufacturer
- Android API level + ABI
- `org.bouncycastle:bcprov-jdk18on:1.78.1`
- Full instrumentation PASS/FAIL lines (cross-impl AES, Argon2id expected bytes, Keystore smoke)
- Explicit note: Keystore AES smoke ≠ biometric-bound vault unlock (Phase 46)

Until this file is replaced with a dated PASS record, physical Android evidence remains **unmet**.
