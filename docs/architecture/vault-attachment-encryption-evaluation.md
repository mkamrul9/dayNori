# Vault attachment encryption evaluation (Phase 44)

**Status:** Design evaluation only. **No production implementation.** Homegrown “chunk index + final flag” streaming protocols are rejected as insufficient for Phase 44 proof.

## Problem

Vault attachments may exceed comfortable single-envelope sizes. Unauthenticated streaming encryption is prohibited. Any chunked or streaming design must address:

- Truncation of the final stream
- Reordering or duplication of chunks
- Incomplete uploads / resumable transfers
- Manifest authenticity binding to the parent vault item
- Nonce uniqueness under the same key
- Authenticated completion (explicit end-of-object)
- Browser ↔ Android interoperability on maintained libraries
- Failure modes that never release partial plaintext as “complete”

## Candidates under consideration

| Format / library | Maintainer / review posture | Browser | Android | Notes |
|---|---|---|---|---|
| **Google Tink Streaming AEAD** (`AesGcmHkdfStreaming` etc.) | Google Tink; widely reviewed | Via WASM/JS ports or encrypt-on-client with compatible format — **interop TBD** | First-class | Strong candidate; pin version; verify exact wire format across platforms before adoption. |
| **libsodium `crypto_secretstream_*`** | libsodium; audited AEAD stream | `libsodium.js` / WASM | Sodium Android / JNI | Explicit push/pull tags for finalization; good truncation detection. Confirm WASM performance on low-end devices. |
| **age (Filippo Valsorda) + STREAM** | age STREAM is documented; Go reference | Limited native JS — would need a reviewed port | Via age libraries | Attractive design; Daynori would need a reviewed TypeScript/Kotlin pair — **not currently selected**. |
| **Single-envelope AES-256-GCM for small files only** | NIST SP 800-38D | Web Crypto | `AES/GCM/NoPadding` | Acceptable interim bound (e.g. ≤ 16 MiB) matching `ENVELOPE_PROFILE.maxCiphertextBytes`. Does not solve large-file streaming. |
| **Homegrown chunked GCM (index + final flag in AAD)** | None | DIY | DIY | **Rejected for adoption in this phase.** Insufficient without a full reviewed design for manifests, resume, and completion. |

## Required properties (acceptance checklist for a future choice)

1. **Authenticated completion:** Missing final chunk/tag fails closed; partial downloads never presented as complete vault files.
2. **Manifest:** Chunk/stream identity bound to `workspaceId` + vault `itemId` + content key version under AEAD or signature; server cannot silently substitute chunks from another item.
3. **Nonce / key schedule:** Documented uniqueness rules; no nonce reuse under one DEK.
4. **Resume:** Incomplete uploads leave recoverable ciphertext state without plaintext disclosure; retries are idempotent.
5. **Reordering / duplication:** Detected and rejected.
6. **Cross-scope rejection:** Ordinary attachment IDs cannot be linked into vault items and vice versa (Phase 45 authorization).
7. **Independent review:** Format + library versions included in the vault security review packet.

## Decision for Phase 44

**Pending independent security review.**

- Small ciphertext envelopes use the Phase 44 AES-256-GCM profile.
- Large-file streaming format is **explicitly unresolved**.
- ADR 0043 no longer authorizes a homegrown chunk-index protocol as the production design.
- Phase 45 preparation may reference synthetic fixtures only; it must not ship a custom stream cipher protocol into application packages.

## Unblocking action

Select one maintained format after reviewer agreement, pin library versions for web and Android, publish interoperability vectors, and amend ADR 0043 with the chosen wire format.
