# ADR 0043: Vault Cryptography, Key Management, and Recovery Proof

## Status
Provisional local proof repaired and retained; production vault implementation and release remain **BLOCKED** pending independent qualified security review, recorded browser/Android platform harness evidence, and attachment-format decision. An AI review, Node simulation, successful build, or feature flag does **not** satisfy the gate.

## Context
Phase 44 evaluates and proves the cryptographic foundation, key hierarchy, envelope format, and recovery mechanics for the Daynori Vault.
A basic PIN screen or biometric prompt is an access gate, not evidence of encryption. Without client-side authenticated encryption and rigorous key management, server-side data compromises, malicious server updates, or offline database dumps completely expose user content.

The initial Phase 44 prototype (`e07c454`) overstated platform evidence and reference-vector attribution, under-validated recovery secrets and envelope fields, and incorrectly claimed that recovery rewrap invalidates prior secrets. This ADR records the repaired contract.

## Threat Model and Boundaries

1. **Backend / Database / Object Storage Compromise:**
   - The adversary possesses full read/write access to PostgreSQL databases, Supabase storage buckets, logs, and server infrastructure.
   - *Mitigation:* Vault item titles, bodies, metadata values, file attachments, and folder labels are encrypted client-side using authenticated encryption (AES-256-GCM). The server only stores opaque ciphertext envelopes and minimal routing identifiers. Decrypted keys never leave client memory.
2. **Lost or Stolen Devices / Offline Guessing:**
   - The adversary extracts encrypted local SQLite databases or intercepts cloud envelopes.
   - *Mitigation:* Key derivation uses memory-hard Argon2id (RFC 9106) with minimum 16 MB memory cost and 2 passes (candidate production: 64 MB, 3 passes, parallelism 1, 32-byte output). These parameters are chosen for interactive unlock latency on capable devices and to raise the memory×time cost of offline guessing relative to short-iteration hashes; **they are not claimed here to “prevent cost-effective GPU/ASIC cracking.”** Resistance depends on passphrase entropy and attacker resources and requires qualified review. Candidate parameters are never silently weakened based on desktop Node benchmarks.
3. **Weak App PIN Resistance:**
   - A 4–6 digit PIN has only 10,000 to 1,000,000 combinations.
   - *Invariant:* A short PIN must **never** be the sole encryption key or direct KDF input protecting an envelope synchronized to or stored on a server.
4. **Mobile Quick Unlock & Biometric Binding:**
   - Calling a biometric prompt that returns a boolean `true` does not protect a key.
   - *Requirement:* Mobile quick unlock must use an OS-authentication-bound cryptographic key (e.g. Android Keystore `MasterKey` requiring user biometric authentication for key release). Any biometric enrollment change or hardware lockout forces fallback to the strong vault passphrase.
5. **Web Execution & Same-Origin XSS:**
   - The browser client is vulnerable to same-origin script injection, malicious extensions, and compromised delivered code from an updated server.
   - *Boundary:* Plaintext and decrypted keys reside strictly in memory and are never persisted to `localStorage` or `IndexedDB`. Client-side web cryptography cannot defend against compromised delivered application code. Reliable memory zeroization is not guaranteed by JavaScript engines.
6. **Metadata Leakage:**
   - The server unavoidably observes: user account IDs, workspace IDs, item UUIDs, ciphertext byte sizes, revision numbers, and synchronization timestamps.
   - *Disclosure:* The service does not claim zero-knowledge of tenant activity, only zero-knowledge of content, titles, labels, and file contents.
7. **Rollback / Replay of older valid versions:**
   - AAD identity binding prevents cross-item relocation; it does **not** by itself prevent replay of an older valid ciphertext for the same item.
   - *Requirement:* Trusted client checkpoint / monotonic version acceptance design, with documented fresh-device recovery limits when checkpoints are absent.
8. **Exclusions:**
   - Rooted/jailbroken operating systems, hardware cold-boot memory attacks, and actively compromised unlocked runtime processes are outside confidentiality guarantees.

## Decision

1. **Cryptographic Primitives:**
   - **Authenticated Symmetric Encryption:** AES-256-GCM (NIST SP 800-38D) with unique 96-bit CSPRNG nonces and 128-bit authentication tags.
   - **Key Derivation (KDF):** Argon2id (RFC 9106) candidate production parameters: `memoryKiB: 65536` (64 MB), `passes: 3`, `parallelism: 1`, `saltLength: 16 bytes`, output exactly 32 bytes.
   - **Alternative Baseline:** PBKDF2-HMAC-SHA256 (NIST SP 800-132) profiled as a comparative baseline — **not** a silent fallback when Argon2id fails.
   - **Strict KDF Parameter Bounds:** Argon2id memory 16–256 MB; passes 2–10; parallelism 1–4; salt 16–64 bytes; reject NaN/fractions/wrong types; bound concurrent derivations; never silently downgrade output length.
   - **Reference vectors isolated:** RFC 9106 §5.3 complete fixture (password, salt, secret, associated data) is computed only via `computeArgon2idReferenceVector`. Low-cost reference parameters must not enter application KDF policy.
   - **AES-GCM known-answer vectors:** Empty/16-byte zero-key cases used in tests are **McGrew/Viega GCM specification Appendix B Test Cases 13–14** (NIST modes submission PDF). They are **not** SP 800-38D Appendix B/C cases (SP 800-38D App B = authentication assurance; App C = short-tag guidance).
2. **Envelope profile (explicit, single):**
   - Version `1`, algorithm `AES-256-GCM` only.
   - Exactly 32-byte keys, 12-byte nonces, 16-byte tags.
   - Strict base64 encodings; bounded ciphertext/AAD sizes.
   - Valid UUID `workspaceId`, constrained `itemType`, positive integer `schemaVersion` / `keyVersion`.
   - Outer `keyVersion` must equal AAD `keyVersion` before decrypt.
3. **Key Hierarchy:**
   - **Vault Root Key (VRK):** A 256-bit random key generated by client CSPRNG.
   - **Key Encryption Key (KEK):** Derived from user passphrase via Argon2id. Wraps the VRK (`wrap:vrk_under_passphrase`).
   - **Data Encryption Key (DEK):** Unique 256-bit AES-GCM key generated per item or file, envelope-wrapped under the VRK (`wrap:dek_under_vrk`).
   - **Recovery Secret:** A distinct, high-entropy 256-bit random secret (68 hex characters with 4-character SHA-256 checksum). Checksum detects transcription errors only; it does **not** authenticate a recovery package. Decode must reject non-hex, truncated, oversized, and empty-buffer inputs.
4. **Recovery / rotation guarantees (precise):**
   - Rewrapping the same VRK under a new recovery secret does **not** invalidate an attacker’s saved old envelope + old secret.
   - True recovery invalidation requires VRK rotation and re-encryption of dependent DEKs/content.
   - Device revocation (future) stops new access via that device wrap; it does **not** erase previously obtained keys or plaintext.
5. **Cross-Platform Evidence (honest attribution):**
   - Node WebCrypto (`SubtleCrypto`) ↔ Node `createCipheriv` interoperability is useful wire-format evidence only.
   - Browser and Android require separate harnesses (`tests/security/vault/harnesses/`). Until those are executed and recorded, browser↔Android execution is **unverified**.
6. **Account vs Vault Boundary:**
   - Account password reset via Supabase Auth restores account access only; it **cannot** decrypt or reset the vault.
   - If the user forgets their passphrase and loses their recovery secret, vault content is permanently unrecoverable.
7. **Large File Encryption Strategy:**
   - Homegrown “chunk index + final flag” protocols are **not authorized**.
   - Evaluate maintained formats (Tink Streaming AEAD, libsodium secretstream, age STREAM, or bounded single-envelope for small files). Choice remains **pending independent review** — see [vault-attachment-encryption-evaluation.md](../architecture/vault-attachment-encryption-evaluation.md).
8. **Production authorization:**
   - No production database tables (`app.vault_*`), sync routes, or UI unlock screens until release gates in [release-gates.md](../engineering/release-gates.md) and the [review packet](../engineering/vault-security-review-packet.md) are satisfied.

## Benchmark Interpretation Limits
- Node host latency distributions inform interactive unlock UX on desktop-class hardware only.
- JavaScript heap delta and process RSS delta do **not** measure peak native Argon2 memory.
- Small sample counts do **not** prove resistance to affordable offline password guessing.
- Candidate parameters remain justified for supported devices; they must not be silently reduced to chase benchmark numbers.

## Release Gate Disposition
- Repaired prototype and verification suite live under `tests/security/vault/` and `tests/security/phase44-vault-crypto.test.ts`.
- Production vault features remain **BLOCKED** until:
  1. Formal independent external security audit with findings disposition.
  2. Recorded browser harness execution and physical Android candidate-library evidence.
  3. Attachment streaming format decision after review.
- Phase 45 may prepare documentation and disconnected synthetic fixtures only while this ADR remains blocked.
