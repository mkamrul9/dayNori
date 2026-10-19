# Vault platform harnesses (Phase 44)

Isolated cryptographic evidence runners. **Not** unlock screens. **Not** wired into Daynori apps.

Record **browser**, **desktop JVM**, **emulator**, and **physical device** results in separate evidence files. Emulator PASS does not clear the physical-device gate.

| Harness | Runtime | Evidence status |
|---|---|---|
| `browser-webcrypto.harness.html` + `run-browser-harness.mjs` | Real browser (Playwright → Edge/Chromium) | **PASS** — `evidence/browser-harness-2026-10-19.md` |
| `android-candidate/` `:harness` | Desktop JVM (`AES/GCM` + `argon2-jvm:2.11`) | **PASS** — `evidence/android-jvm-harness-2026-10-19.md` |
| `android-candidate/` `:android-app` | Android instrumentation (`bcprov-jdk18on:1.78.1`) | **Emulator PASS** — `evidence/android-emulator-harness-2026-10-19.md`; **physical PENDING** |
| Node Vitest suite | `tests/security/phase44-vault-crypto.test.ts` | Node wire-format / policy tests |
| Shared fixtures | `shared-fixtures.json` | **Required** by JVM/Android harnesses |

## Browser

```bash
cd tests/security/vault/harnesses
npm install
node run-browser-harness.mjs
```

## Android / JVM candidate

```bash
cd tests/security/vault/harnesses/android-candidate
# Set JAVA_HOME to JDK 17+; local.properties sdk.dir for Android builds
./gradlew.bat :harness:runHarness
./gradlew.bat :android-app:assembleDebug :android-app:assembleDebugAndroidTest
./gradlew.bat :android-app:connectedDebugAndroidTest   # emulator or device attached
```

Full procedures: `android-candidate/README.md`.
