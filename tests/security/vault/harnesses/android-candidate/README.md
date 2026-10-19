# Android / JVM vault candidate harness (Phase 44)

Isolated, buildable candidate proof using:

- `javax.crypto` `AES/GCM/NoPadding` (same algorithm class as Android)
- `de.mkammerer:argon2-jvm:2.11` for Argon2id (pinned)

**Candidate evaluation ≠ production approval.** JVM host results are recorded separately from emulator and physical-device results.

## Prerequisites

- JDK 17+
- Network access for Maven Central (first build)

## Build and run (JVM host)

```bash
cd tests/security/vault/harnesses/android-candidate
# Windows (PowerShell):
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
.\gradlew.bat :harness:runHarness

# Unix:
export JAVA_HOME=...
./gradlew :harness:runHarness
```

Exit code 0 = harness PASS. Capture stdout into `../evidence/android-jvm-harness-latest.md`.

## Physical Android / emulator (unverified until executed)

1. Create an Android application module wrapping the same `VaultCandidate` sources (or call the JVM logic via instrumentation).
2. Pin the same Argon2 library (or Android-native Argon2) and record versions.
3. Install on emulator, then physical device.
4. Exercise: shared fixtures, Unicode, binary, empty payload, tamper, 16-byte key reject, Argon2id derive + latency samples.
5. Record device model, Android API level, library versions, and full log.

Until step 5 is done, physical evidence remains **unverified**.

## Explicit non-claims

- Passing on desktop JVM does not prove browser or Android Keystore unlock.
- Argon2id latency on a PC does not establish device UX or offline guessing cost.
- This harness is disconnected from Daynori production apps and unlock screens.
