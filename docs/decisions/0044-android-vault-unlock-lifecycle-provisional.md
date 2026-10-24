# ADR 0044: Android vault unlock and secure lifecycle (provisional)

## Status

Provisional — delivered for bounded local development under explicit owner selection of Phase 46 while Phases 44–45 remain blocked. **Not** independent security approval. **Not** permission to enable vault for real users.

## Context

Phase 46 requires Android unlock, recovery, and secure lifecycle behavior. Phase 45 production ciphertext sync is not implemented. Phase 44 still lacks physical-device evidence and independent qualified review.

## Decision

1. Ship a pure domain lifecycle reducer (`vaultLifecycle`) plus Android controller/UI with **production providers that report unavailable**.
2. Provide an explicitly labeled **synthetic harness** (Settings → Vault development harness) using fixture ciphertext and test key providers. Production code must never silently select the synthetic bundle.
3. Short PIN / device-key unlock remains **unavailable** as a method that could sole-protect synchronized envelopes.
4. Biometric path requires cryptographic unwrap under an OS-auth-bound key in real adapters; a biometric boolean alone is prohibited. Synthetic harness simulates bound unwrap only.
5. **Offline unlock policy:** cached offline unlock may succeed using local wraps while disconnected; revocation learned after reconnect locks on the next online check. Do not claim immediate remote revocation on a disconnected device.
6. Lock on background (default) and idle timeout; stale unlock operations after generation bump cannot reopen the vault.
7. Memory cleanup: release key handles and clear plaintext caches on lock as far as the platform permits. JavaScript/Hermes cannot guarantee secure memory zeroization.

## Consequences

- Phase 46 may be `in_progress` or `blocked` with provisional local behavior while gates remain unmet.
- Enabling real-user vault navigation/sync requires Phase 44 review + physical evidence, Phase 45 implementation acceptance, and production key-provider adapters.
