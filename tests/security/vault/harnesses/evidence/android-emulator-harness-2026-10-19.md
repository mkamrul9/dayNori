# Android emulator instrumentation evidence

- executedAt: 2026-10-19 (Asia/Dhaka)
- procedure: create AVD `daynori_vault_api35` (`system-images;android-35;google_apis;x86_64`); start emulator; then  
  `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"; .\gradlew.bat :android-app:connectedDebugAndroidTest --no-daemon`
- exitCode: 0
- device: `sdk_gphone64_x86_64` (AVD `daynori_vault_api35`)
- Android API: **35**
- ABI: **x86_64**
- KDF candidate: `org.bouncycastle:bcprov-jdk18on:1.78.1` (pure Java; Android ABI portable)
- AEAD: shared `AES/GCM/NoPadding` candidate sources
- tests: 2 instrumentation tests finished PASS
- harnessResult: **PASS (emulator)**

## Operations tested (logcat `DaynoriVaultCandidate`)

```
[PASS] AndroidKeyStore AES-256-GCM smoke (not biometric-bound unlock proof)
[PASS] canonical AAD / UTF-8
[PASS] McGrew Case 13/14
[PASS] Empty/Unicode/Binary Node→Android decrypt + Android→expected encrypt/tag
[PASS] Wrong key / wrong context / tamper rejected
[PASS] Argon2id password+salt expected
[PASS] Argon2id app-bounds Node↔Android
HARNESS RESULT: PASS
```

## Explicit limits

- Emulator PASS is **not** physical-device evidence and does **not** clear the physical Android gate.
- Keystore AES smoke on emulator is **not** hardware-backed biometric unlock proof (Phase 46).
- Desktop JVM PASS remains a separate evidence lane.
