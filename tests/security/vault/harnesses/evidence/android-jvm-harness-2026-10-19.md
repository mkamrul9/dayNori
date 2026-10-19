# Android/JVM candidate harness evidence (host JVM — not physical device)

- executedAt: 2026-10-19 (session)
- procedure: `cd tests/security/vault/harnesses/android-candidate` then  
  `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"; .\gradlew.bat :harness:runHarness --no-daemon`
- java.version: 17.0.20.1 (Temurin)
- os.name: Windows 11
- dependencies: `de.mkammerer:argon2-jvm:2.11`, Kotlin 1.9.25, Gradle 8.10.2
- harnessResult: **PASS** (build + run)

## Checks

```
[PASS] McGrew/Viega Appendix B Case 13 tag
[PASS] McGrew/Viega Appendix B Case 14 ciphertext/tag
[PASS] Unicode / binary / empty payload round-trips
[PASS] Tamper rejection / 16-byte key rejection
[PASS] DEK wrap/unwrap
[PASS] Argon2id deterministic + 32-byte output (test profile m=16MiB,t=2,p=1)
[META] Argon2id test-profile latency ~24–27 ms on this host
```

## Explicit limits

- This is **desktop JVM** evidence using Android-class `AES/GCM/NoPadding` APIs and a pinned Argon2id library.
- It is **not** physical Android device evidence, **not** emulator evidence, and **not** Android Keystore / biometric unlock evidence.
- Physical-device installation steps remain in `android-candidate/README.md` and are **unverified** here.
