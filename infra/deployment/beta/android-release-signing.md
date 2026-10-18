# Daynori Android Release Signing Procedure (Private Beta)

This document establishes the reproducible build and signing procedure for Android internal beta distributions (Phase 38).

> **CRITICAL SECURITY REQUIREMENT**:
> Private signing keys, release keystores, and keystore passwords must **NEVER** be committed to Git or stored in CI logs. All signing operations must use environment variables or externally supplied keys provided by the repository owner.

---

## 1. Versioning & Build Metadata

- **Application ID**: `com.daynori.app`
- **Version Name**: `0.1.0-beta.1`
- **Version Code**: `1` (incremented monotonically per internal build)
- **Target SDK**: Android 15 (API level 35)
- **Minimum SDK**: Android 10 (API level 29)

---

## 2. Keystore Generation (One-Time by Repository Owner)

If a release keystore does not yet exist, the repository owner must generate it in an isolated, secure directory outside the git repository:

```bash
keytool -genkeypair -v \
  -keystore /secure/credentials/daynori-release.keystore \
  -alias daynori-beta \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -dname "CN=Daynori Release, OU=Mobile, O=Daynori, L=Dhaka, C=BD"
```

---

## 3. Environment Variables for Signing

Before triggering the release build, export the following variables in the secure build environment:

```bash
export ANDROID_KEYSTORE_PATH="/secure/credentials/daynori-release.keystore"
export ANDROID_KEY_ALIAS="daynori-beta"
# Read secrets interactively without recording into shell history or environment files
read -s -p "Enter Keystore Secret: " ANDROID_KEYSTORE_PASSWORD; echo
read -s -p "Enter Key Secret: " ANDROID_KEY_PASSWORD; echo
export ANDROID_KEYSTORE_PASSWORD
export ANDROID_KEY_PASSWORD
```

---

## 4. Reproducible Build Execution

From the repository root:

```bash
# 1. Clean previous build outputs
pnpm --filter @daynori/mobile clean

# 2. Export optimized JavaScript Hermes bundle and native assets
pnpm --filter @daynori/mobile build

# 3. Assemble Release APK / Android App Bundle (AAB)
cd apps/mobile/android
./gradlew bundleRelease assembleRelease \
  -Pandroid.injected.signing.store.file="$ANDROID_KEYSTORE_PATH" \
  -Pandroid.injected.signing.store.password="$ANDROID_KEYSTORE_PASSWORD" \
  -Pandroid.injected.signing.key.alias="$ANDROID_KEY_ALIAS" \
  -Pandroid.injected.signing.key.password="$ANDROID_KEY_PASSWORD"
```

---

## 5. Artifact Verification & Signature Integrity

Inspect the generated APK signature using `apksigner`:

```bash
apksigner verify --verbose --print-certs \
  apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

**Expected Verification Output**:

- `Verifies`: `true`
- `Verified using v1 scheme (JAR signing)`: `true`
- `Verified using v2 scheme (APK Signature Scheme v2)`: `true`
- `Verified using v3 scheme (APK Signature Scheme v3)`: `true`
- `Signer #1 certificate DN`: matches owner's generated DN

Record SHA-256 checksums in the release verification log:

```bash
sha256sum apps/mobile/android/app/build/outputs/apk/release/app-release.apk > release-checksums.sha256
```
