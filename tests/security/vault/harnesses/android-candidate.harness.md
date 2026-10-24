# Android candidate library harness (Phase 44)

**Status:** Runnable procedure prepared; **execution UNVERIFIED** on this workstation (no physical Android device / emulator evidence recorded in the Phase 44 repair session).

This harness is intentionally separate from unlock-screen phases (46–47). It proves AES-256-GCM envelope interoperability with the shared fixtures used by `tests/security/vault/vault-crypto.ts`.

## Candidate libraries (evaluate; do not invent a custom AEAD)

| Candidate | Notes |
|---|---|
| `javax.crypto.Cipher` / `AES/GCM/NoPadding` (Android API) | Platform baseline; record API level. |
| Google Tink (`AesGcmJce` / hybrid primitives) | Maintained; prefer for production review. |
| libsodium / Sodium Android bindings | Strong AEAD; wire format differs — map via explicit adapter. |

Pick one maintained library after independent review. Do **not** claim Node `createCipheriv` results are Android results.

## Shared fixtures to exercise

1. **NIST SP 800-38D Appendix C Test Case 13:** 32-byte zero key, 12-byte zero IV, empty PT/AAD → tag `530f8afbc74536b9a963b4f1c4cb738b`.
2. **Unicode:** Bangla + emoji plaintext UTF-8 round-trip.
3. **Binary:** 4096 random bytes round-trip.
4. **AAD:** Canonical JSON context binding (`workspaceId`, `itemId`, `itemType`, `schemaVersion`, `keyVersion`).
5. **Tampering:** Ciphertext bit-flip and tag bit-flip must fail closed.
6. **Recovery secret:** Validate decode rules (68 hex chars, checksum) without claiming package authentication.
7. **Rejection:** 16-byte keys, non-12-byte nonces, wrong algorithm identifiers.

## Envelope profile (must match Node prototype)

- Algorithm: AES-256-GCM
- Key: exactly 32 bytes
- Nonce: exactly 12 bytes (CSPRNG)
- Tag: exactly 16 bytes
- Version: `1`

## Minimal Kotlin sketch (API 23+)

```kotlin
// Synthetic only — not production vault code.
fun encryptAesGcm(
  key: ByteArray, // size == 32
  nonce: ByteArray, // size == 12
  plaintext: ByteArray,
  aad: ByteArray
): Pair<ByteArray, ByteArray> { // ciphertext, tag
  require(key.size == 32)
  require(nonce.size == 12)
  val cipher = Cipher.getInstance("AES/GCM/NoPadding")
  val spec = GCMParameterSpec(128, nonce)
  cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), spec)
  cipher.updateAAD(aad)
  val out = cipher.doFinal(plaintext)
  val ct = out.copyOfRange(0, out.size - 16)
  val tag = out.copyOfRange(out.size - 16, out.size)
  return ct to tag
}
```

Cross-check: encrypt on Android → decrypt with Node `NodeCreateCipherivVaultAdapter` (and the reverse) using identical AAD bytes.

## Evidence checklist (fill when executed)

| Field | Value |
|---|---|
| Device model | _unverified_ |
| Android version / API level | _unverified_ |
| Library + version | _unverified_ |
| App package / harness APK build id | _unverified_ |
| NIST Case 13 | _unverified_ |
| Unicode / binary / AAD / tamper | _unverified_ |
| Interop with Node envelopes | _unverified_ |
| Operator + date | _unverified_ |

## Explicit non-claims

- Passing this harness does not authorize production vault tables, sync routes, or unlock UI.
- Emulator results are weaker than physical-device evidence required by release gates.
- Biometric / Keystore binding is out of scope here (Phase 46).
