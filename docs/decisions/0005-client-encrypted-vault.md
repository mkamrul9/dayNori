# ADR-0005: Separate client-encrypted vault

Date: 2026-10-13. Status: accepted security boundary; crypto implementation and native quick unlock remain gated.

## Context

A PIN/biometric lock is requested for sensitive information. A hidden screen does not protect readable server records, cached plaintext or weak PIN-derived encryption against copied storage.

## Decision

Vault content uses client-side authenticated encryption and a separate key hierarchy/recovery lifecycle. Encrypt labels, names, text and binaries before server sync. Strong vault passphrase/high-entropy recovery protect portable key envelopes. App PIN/strong biometric convenience unlock needs a reviewed device-bound key design; a short PIN cannot be the sole cloud envelope key. Web initially uses passphrase unlock with memory-only decrypted keys. Exclude vault from AI, server search/rendering, notification previews, ordinary Drive sync and initial room sharing.

## Alternatives

Server encryption plus a UI lock would be easier but would not provide the promised vault boundary. Applying end-to-end encryption to every domain immediately would obstruct server search, ordinary scanning and planned consented AI while greatly increasing first-release scope.

## Consequences and validation

Account password reset cannot recover vault content. Setup must confirm a user-controlled recovery method. Metadata leakage and unlocked compromised-device limits remain explicit. A further ADR selects audited libraries, envelope format, KDF parameters and native key binding after feasibility/security review. Test recovery, biometrics changes, key rotation, lock transitions and ordinary-to-vault cleanup before shipping.

See [security and vault](../architecture/security-and-vault.md).
