# Android release signing (local preparation)

## Fail-closed release path

`plugins/withReleaseSigningGuard.js` is applied from `app.json`. A `release` build type **will not** silently use `debug.keystore`.

### Approved path (owner credentials — never commit)

```text
DAYNORI_RELEASE_STORE_FILE=/absolute/path/to/daynori-release.keystore
DAYNORI_RELEASE_STORE_PASSWORD=...
DAYNORI_RELEASE_KEY_ALIAS=...
DAYNORI_RELEASE_KEY_PASSWORD=...
```

Validate presence before CI/release jobs; do not print secret values.

### Explicit local-test only

```text
DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING=true
```

Produces a **debug-signed test artifact**. Never label it an approved release candidate. Never upload it as the production RC.

## Commands (after `pnpm --filter @daynori/mobile prebuild`)

Record exact Gradle/Expo commands and artifact checksums in the phase report when a build is run. This phase may stop at unsigned/local-test artifacts when owner keystores are absent.
