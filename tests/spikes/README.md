# Platform and Integration Feasibility Spikes

This directory contains feasibility spikes and synthetic model suites for **Phase 03: Platform and integration feasibility spikes**.

## Taxonomy of Evidence

To prevent treating synthetic mocks or documentation readings as hardware or store verification, Phase 03 evidence is classified into three explicit categories:

### 1. Observed Experimental Results (Real Runtime)

- **Real Browser IndexedDB Suite (`browser/indexeddb-real.html`, `browser/run-edge.mjs`)**:
  - Executed in a real Chromium/Edge browser process (`Edg/155.0.4283.45`) over Chrome DevTools Protocol in a secure context (`127.0.0.1`).
  - **Transaction Rollback on Abort**: Multi-write transaction abort cleanly rolled back without leaving partial writes (`undefined`).
  - **Constraint Error on Duplicate Key**: Calling `add()` on an existing key raised a constraint error and aborted the transaction without corrupting data.
  - **Schema Migration v1 -> v2**: Upgrading schema version from 1 to 2 successfully added a new index (`byBody`) while preserving existing stored records (`kept=true`).
  - **Failed Upgrade Rollback**: Throwing an error inside `onupgradeneeded` aborted with `AbortError`, preserved the existing schema version (v2), and retained all records.
  - **Data Durability Across Reload**: Wrote record `n1` in a dedicated session, reloaded to a separate session (`?run=verify`), and successfully retrieved the intact payload.
  - **Storage Quota & Eviction**: Queried `navigator.storage.estimate()` (reported 4,171 bytes used of 10.7 GB quota). `navigator.storage.persisted()` returned `false`, proving browser IndexedDB remains opportunistic best-effort storage subject to eviction under disk pressure unless persistent storage is requested.

### 2. Documented Conclusions (Primary Vendor Sources, Checked 2026-10-14)

- **Android Alarms & Notifications**:
  - `USE_EXACT_ALARM` is a restricted Google Play permission limited strictly to dedicated alarm clocks and timers. Daynori will not declare it.
  - `SCHEDULE_EXACT_ALARM` can be revoked by users at any time in system settings.
  - On Android 12+ (API 31+), inexact alarm windows under 10 minutes (600,000ms) are clipped to 600,000ms. Android provides **no guaranteed delivery SLA** (e.g. no 15-minute guarantee); delivery timing is governed by Doze mode and App Standby maintenance windows.
- **Google Drive Scopes**:
  - The narrow `drive.file` scope (`https://www.googleapis.com/auth/drive.file`) permits access only to files created by Daynori or opened via the Google Picker API.
  - The broad `drive` scope is restricted by Google and requires a mandatory third-party Cloud App Security Assessment (CASA) Tier 2/3 audit by an authorized lab. Cost is variable depending on the independent assessor. Daynori adopts the least-privilege `drive.file` scope.
- **Expo SecureStore Quota**:
  - Expo SecureStore does not enforce a 2048-byte limit on Android or modern iOS in JavaScript, but historical iOS Keychain limits and memory considerations require keeping it restricted to credentials and cryptographic seeds. The Daynori adapter enforces a conservative 2KB quota.

### 3. Untested Assumptions & External Prerequisites

- **Physical Android Hardware**: Biometric prompt sensor interaction, native background audio recording, and notification channel display on physical Android hardware remain untested until physical device testing in Phase 06, Phase 28, and Phase 41.
- **Client Cryptography**: In-memory Node `node:crypto` AES-256-GCM tests model algorithmic boundaries only. They **do not** prove mobile hardware keystore integration or constitute cryptographic vault approval (Phase 44–47).
- **External Services**: Cloud notification dispatch (FCM / Apple APNs), Google OAuth client verification, and Google Play Billing merchant accounts are external prerequisites tracked for later release phases.

---

## Synthetic Model Test Suites

These suites model architecture contracts, policy rules, and state machines in Node using in-memory abstractions:

1. `tests/spikes/storage-model.synthetic.test.ts`:
   - Models unified `StorageAdapter` operations, batch transaction rollbacks, schema version migrations, and session token persistence.
2. `tests/spikes/native-capabilities-model.synthetic.test.ts`:
   - Models notification channel priorities, fallback in-app inbox, SecureStore 2KB quota enforcement, biometric prompt separation, 5-minute audio limits, and AES-256-GCM authenticated encryption contracts.
3. `tests/spikes/platform-policy-model.synthetic.test.ts`:
   - Models Android inexact alarm fallback logic, Web Push browser support matrices, Google Drive scope boundary checks, and server-side receipt validation contracts.

## Running Tests and Spikes

Run the synthetic models:

```powershell
pnpm test tests/spikes
```

Run the real browser IndexedDB experiment:

```powershell
node tests/spikes/browser/serve.mjs
# In another terminal:
node tests/spikes/browser/run-edge.mjs
```
