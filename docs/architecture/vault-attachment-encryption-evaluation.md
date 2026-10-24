# Vault attachment encryption evaluation (Phase 44 / Phase 45 prep)

**Status:** Design evaluation only. **No production implementation.** Homegrown “chunk index + final flag” streaming protocols remain rejected. **Proposed choice is submitted for independent review — not adopted.**

## Problem

Vault attachments may exceed comfortable single-envelope sizes. Unauthenticated streaming encryption is prohibited. Any chunked or streaming design must address truncation, reordering/duplication, incomplete uploads, manifest authenticity, nonce uniqueness, authenticated completion, and browser↔Android interoperability on maintained libraries.

## Candidates (exact versions considered)

| Candidate | Pinned / referenced versions | Browser | Android / JVM | Interoperability evidence | Unresolved risks |
|---|---|---|---|---|---|
| **Google Tink Streaming AEAD** (`AesGcmHkdfStreaming`) | Tink Java `1.15.0` (Maven `com.google.crypto.tink:tink`); JS interop via `@tink-crypto/tink-js` is incomplete for streaming AEAD — **no reviewed browser twin at same wire format** | Weak / TBD | Strong (Android/JVM) | JVM self-round-trip only in candidate experiments; **no Daynori browser↔Android vectors yet** | Browser port gap; segment size / key derivation parameter lock-in; key rotation story |
| **libsodium `crypto_secretstream_xchacha20poly1305_*`** | libsodium `1.0.20`; `libsodium-wrappers` / `libsodium-wrappers-sumo` npm `0.7.15`; Android: `libsodium-jni` or Lazysodium — versions must be re-pinned at adoption | WASM/JS available | JNI/native available | Cross-platform secretstream is well documented; Daynori has **not** yet produced fixture vectors in-repo | WASM memory/perf on low-end devices; wrapper maintenance; ABI drift |
| **age STREAM** | age Go `v1.2.1` STREAM design; no first-party TypeScript STREAM implementation suitable for Daynori | No maintained TS STREAM | Via age libraries / Go mobile — heavy | Not evaluated in Daynori harnesses | Missing dual-platform reviewed ports |
| **Bounded single-envelope AES-256-GCM** | Phase 44 profile (NIST SP 800-38D mode; McGrew/Viega Appendix B vectors for empty/16-byte cases) | Web Crypto | `AES/GCM/NoPadding` | Node↔Node and JVM candidate harnesses exercise the **non-streaming** profile | Hard size ceiling (`ENVELOPE_PROFILE.maxCiphertextBytes` = 16 MiB); not a large-file solution |
| **Homegrown chunked GCM** | n/a | DIY | DIY | **Rejected** | Manifest/resume/completion underspecified |

## Proposed choice for independent review (not approved)

**Primary proposal:** libsodium `crypto_secretstream_*` with pinned `libsodium 1.0.20` (+ matching wrappers) for large vault attachments, **and** retain Phase 44 single-envelope AES-256-GCM for small objects ≤ 16 MiB.

**Rationale for proposal (subject to reviewer rejection):**
- Explicit finalization tags address authenticated completion / truncation.
- Existing browser WASM and Android native ports reduce net-new crypto invention.
- Clear separation from Daynori application code until review passes.

**Fallback if secretstream is rejected:** Tink Streaming AEAD on Android/JVM with an explicit decision to **defer** large web vault uploads until a reviewed browser-compatible implementation exists (honest product limit).

## Required properties (acceptance checklist)

1. Authenticated completion — missing final tag fails closed.
2. Manifest bound to workspace/item/key version.
3. Documented nonce/key schedule — no reuse under one DEK.
4. Resume-safe incomplete uploads; idempotent retries.
5. Reordering/duplication rejected.
6. Cross-scope ordinary↔vault attachment links rejected (Phase 45 authz).
7. Independent review of format + pinned versions.

## Decision status

**Pending independent security review.** Do not invent a Daynori-specific streaming format. Phase 45 preparation must not ship streaming crypto into application packages.
