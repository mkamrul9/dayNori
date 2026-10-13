# Platform and Integration Feasibility Spikes

This directory contains isolated, disposable prototype test suites executed for **Phase 03: Platform and integration feasibility spikes**.

## Purpose

These spikes validate the technical, cryptographic, platform, and policy constraints of Daynori's target environments before committing to long-term architecture or implementing user-facing features in subsequent phases:

1. **Storage and Session Spikes (`sqlite-indexeddb-spike.test.ts`)**:
   - Compares mobile SQLite (via `expo-sqlite`) and browser IndexedDB semantics.
   - Evaluates schema migration engines, atomic batch transactions, quota eviction failure modes, and session token persistence strategies.
   - Assesses local-first navigation state preservation during network disconnection.

2. **Native Hardware & Expo Capabilities (`expo-capabilities-spike.test.ts`)**:
   - Assesses notifications, secure storage, biometrics, audio recording, and client-side cryptography.
   - Validates that high-risk hardware integrations require the Expo Development Build workflow (`expo-dev-client`) rather than Expo Go.
   - Proves clear architectural boundaries (e.g. biometric prompt success is distinct from cryptographic vault unsealing).

3. **Platform and Policy Constraints (`platform-constraints-spike.test.ts`)**:
   - Investigates Android exact alarm policies (`USE_EXACT_ALARM` Play Store policy restrictions vs best-effort inexact alarms).
   - Validates browser notification constraints and Web Push service worker requirements.
   - Proves Google Drive scope boundaries (`drive.file` least-privilege per-file access vs restricted `drive` scope requiring CASA Tier 2/3 security assessments).
   - Validates Google Play Billing requirements (server-side receipt verification, pending transactions) and eventual iOS parity requirements (APNs, Keychain, StoreKit).

## Running Spikes

Spikes are written as executable Vitest suites and run as part of the workspace test pipeline:

```powershell
pnpm test tests/spikes
```
