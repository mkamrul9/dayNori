# Android release signing (authoritative local path)

## Source of truth

1. `app.json` plugins: `expo-build-properties` (compile/target SDK **36**) and `./plugins/withReleaseSigningGuard.js`.
2. **Always regenerate** native Android via Expo prebuild before packaging a release candidate. Stale `apps/mobile/android/` trees may still contain Expo’s silent `debug.keystore` fallback and older SDK defaults — those trees are **not** release-eligible.
3. Verify generated Gradle (not `app.json` alone):

```bash
node scripts/mobile-android-release-path.mjs prebuild-disposable
node scripts/mobile-android-release-path.mjs inspect --android-dir <generated-android>
# Optional when JDK/Android SDK available:
node scripts/mobile-android-release-path.mjs exercise-gradle --android-dir <generated-android>
```

`inspect` fails if the guard marker is missing, a silent debug fallback remains, or effective target/compile SDK ≠ 36.

## Fail-closed release path

`withReleaseSigningGuard` defers credential checks to Gradle `taskGraph.whenReady` for distributable release tasks (`assemble*Release`, `bundle*Release`, etc.). Ordinary debug builds and harmless configuration tasks (for example `:app:tasks`) do **not** require release credentials.

### Approved path (owner credentials — never commit)

Preferred:

```text
DAYNORI_RELEASE_STORE_FILE=/absolute/path/to/daynori-release.keystore
DAYNORI_RELEASE_STORE_PASSWORD=...
DAYNORI_RELEASE_KEY_ALIAS=...
DAYNORI_RELEASE_KEY_PASSWORD=...
```

Aliases accepted by the same guard (beta docs):

```text
ANDROID_KEYSTORE_PATH
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Validate presence before CI/release jobs; do not print secret values. Partial or empty credentials fail closed on release packaging.

### Explicit local-test only

```text
DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING=true
```

Produces a **debug-signed test artifact**. Release-eligibility / preflight checks must reject it. Never upload it as a production RC.

## Commands

```bash
pnpm --filter @daynori/mobile prebuild
# then from a verified android/ tree with owner credentials:
# gradlew :app:bundleRelease
```

Record exact Gradle/Expo commands, artifact SHA-256, signer certificate fingerprint, and effective SDK versions in the phase report. This phase may stop at unsigned/local-test artifacts when owner keystores are absent.
