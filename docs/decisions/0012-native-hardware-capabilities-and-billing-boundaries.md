# ADR-0012: Native hardware capabilities and billing boundaries

Date: 2026-10-13. Status: accepted.

## Context

Hardware integrations (biometrics, secure keystore, audio recording, and client-side cryptography) and digital monetization (Google Play Billing, Apple StoreKit) introduce deep platform dependencies that cannot be supported under sandboxed environments like Expo Go.

## Decision

1. **Native Build Strategy**: Mandate the Expo Development Build workflow (`expo-dev-client`) as the single supported mobile development and distribution pathway. Expo Go is officially rejected for production and integration testing.
2. **Biometric Security Boundary**: Use `expo-local-authentication` solely for user-presence verification. Biometric authentication success by itself DOES NOT decrypt vault data. Vault encryption keys must be derived from user passphrases using Argon2id/PBKDF2 or unwrapped from device keystores via user consent.
3. **Audio Capture Preset**: Restrict audio recording via `expo-av` to AAC format within an `.m4a` container at 128 kbps (44.1 kHz, mono) with an enforced 5-minute cap per recording to prevent unbounded local storage and sync bandwidth usage.
4. **Billing Verification Authority**: For digital subscriptions and organizer features, comply strictly with Google Play Billing (Android) and Apple StoreKit (iOS). All client-side purchase receipts/tokens must be verified and acknowledged server-side via official developer APIs before entitlements are granted. Direct client-side entitlement trusts are prohibited.

## Alternatives

- **Expo Go**: While convenient for basic UI prototyping, it lacks custom native modules, native notification channels, and custom C++ libraries required for Daynori's secure vault and offline storage.
- **Client-Side Receipt Trust**: Extremely vulnerable to client tampering and fake receipt injections; rejected in favor of authoritative backend validation.

## Consequences and validation

- Local development requires the native Android toolchain (JDK 17, Android SDK Platform 34/35) established in Phase 01.
- Validated via `tests/spikes/expo-capabilities-spike.test.ts` and `tests/spikes/platform-constraints-spike.test.ts`.
- See [release gates](../engineering/release-gates.md) and [vault ADR-0005](0005-client-encrypted-vault.md).
