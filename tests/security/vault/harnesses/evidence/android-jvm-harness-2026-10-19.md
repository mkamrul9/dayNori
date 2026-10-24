# Android/JVM candidate harness evidence (host JVM — not physical device)

- executedAt: 2026-10-19 (Asia/Dhaka session, post-repair)
- procedure: `cd tests/security/vault/harnesses/android-candidate` then  
  `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"; .\gradlew.bat :harness:runHarness --no-daemon`
- exitCode: 0
- java.version: 17.0.20.1 (Temurin)
- os.name: Windows 11
- sourceRevisionAtExecution: working tree repairing Phase 44/45 prep (base `cfb7adf`)
- dependencies: `de.mkammerer:argon2-jvm:2.11`, Kotlin 1.9.25, Gradle 8.10.2
- sharedFixtures: `tests/security/vault/harnesses/shared-fixtures.json` (required; parsed with expected-byte comparisons)
- harnessResult: **PASS** (build + run)

## Operations tested (exact)

```
[PASS] canonical AAD string
[PASS] canonical AAD UTF-8 bytes
[PASS] McGrew/Viega Appendix B Case 13 tag
[PASS] McGrew/Viega Appendix B Case 14 ciphertext
[PASS] McGrew/Viega Appendix B Case 14 tag
[PASS] Empty payload decrypt Node→JVM
[PASS] Empty payload encrypt JVM→expected
[PASS] Unicode payload decrypt Node→JVM
[PASS] Unicode payload encrypt JVM→expected
[PASS] Binary payload decrypt Node→JVM
[PASS] Binary payload encrypt JVM→expected
[PASS] Unicode / binary / empty same-library round-trips
[PASS] Wrong key rejected
[PASS] Wrong context AAD rejected
[PASS] Ciphertext tamper rejected
[PASS] Reject 16-byte key
[PASS] Malformed empty nonce rejected
[PASS] DEK wrap/unwrap
[PASS] Argon2id password+salt-only expected bytes (03aab965…)
[PASS] Argon2id application-bounds expected bytes (Node↔JVM)
[PASS] Argon2id length 32
[META] Argon2id app-min-profile latency ~25–33 ms on this host
HARNESS RESULT: PASS
```

## Explicit limits

- This is **desktop JVM** evidence using Android-class `AES/GCM/NoPadding` and pinned `argon2-jvm`.
- It is **not** emulator evidence, **not** physical Android device evidence, and **not** biometric Keystore unlock evidence.
- Android instrumentation target lives in `:android-app` with Bouncy Castle Argon2id (`bcprov-jdk18on:1.78.1`).
