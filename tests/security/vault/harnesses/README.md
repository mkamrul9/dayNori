# Vault platform harnesses (Phase 44)

Isolated cryptographic evidence runners. **Not** unlock screens. **Not** wired into Daynori apps.

| Harness | Runtime | Evidence status |
|---|---|---|
| `browser-webcrypto.harness.html` + `run-browser-harness.mjs` | Real browser (Playwright → Edge/Chromium) | **PASS** recorded 2026-10-19 |
| `android-candidate/` Gradle/Kotlin | JVM host using `AES/GCM/NoPadding` + `argon2-jvm:2.11` | **PASS (JVM)** recorded 2026-10-19; **physical Android unverified** |
| Node Vitest suite | `tests/security/phase44-vault-crypto.test.ts` | Node wire-format / policy tests |

## Browser

```bash
cd tests/security/vault/harnesses
npm install
node run-browser-harness.mjs
```

## Android / JVM candidate

```bash
cd tests/security/vault/harnesses/android-candidate
# Set JAVA_HOME to JDK 17+
./gradlew.bat :harness:runHarness   # Windows
./gradlew :harness:runHarness       # Unix
```

Physical device steps: see `android-candidate/README.md`.
