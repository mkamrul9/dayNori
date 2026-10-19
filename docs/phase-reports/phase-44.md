# Phase 44: Vault cryptography and recovery proof

## Identity and scope

- **Phase ID/specification:** [Phase 44 — Vault cryptography and recovery proof](../roadmap/phases/44-vault-cryptography-and-recovery-proof.md).
- **Status:** `blocked`. Provisional local prototype and test suite are complete; external release gates (independent qualified security review and physical Android hardware evidence) remain unmet.
- **Contributor and report date:** Antigravity, 2026-10-19 (Asia/Dhaka).
- **Base Git revision and branch:** Commit `65c31c1` on `main`.
- **Prerequisites:**
  - [Phase 38 — Controlled private beta](../roadmap/phases/38-controlled-private-beta.md): Status `blocked` (pending external store accounts and deployment targets).
  - [Phase 03 — Platform and integration feasibility spikes](../roadmap/phases/03-platform-and-integration-feasibility-spikes.md): Complete (empirical IndexedDB browser verification and synthetic contract modeling).
- **Included scope:**
  - Threat model and security boundaries documented in [ADR 0043](../decisions/0043-vault-cryptography-and-recovery-proof.md) and [Security Architecture](../architecture/security-and-vault.md).
  - Cryptographic primitive evaluation: Authenticated symmetric encryption (AES-256-GCM, NIST SP 800-38D) and memory-hard key derivation (Argon2id, RFC 9106).
  - Strict parameter bounding and denial-of-service defense: Memory cost bounded to 16MB–256MB, passes bounded to 2–10.
  - Wire envelope format with versioned Additional Authenticated Data (AAD) binding `workspaceId`, `itemId`, `itemType`, `schemaVersion`, and `keyVersion`.
  - Key hierarchy: 256-bit client-generated Vault Root Key (VRK), envelope-wrapped Data Encryption Keys (DEK), and separate 256-bit high-entropy Recovery Secret (68-character hex string with embedded 4-character SHA-256 checksum).
  - Cross-platform harnesses: Web Crypto API (`SubtleCrypto`) representing browser execution and Node/Android native `Cipher` representing mobile native execution.
  - Verification test suite: `tests/security/phase44-vault-crypto.test.ts` (19/19 tests passing).
  - KDF benchmark profiling: `tests/security/vault/kdf-benchmark.ts`.
- **Excluded / deferred scope:**
  - Production database schema migrations (`app.vault_records`, `app.vault_folders`) — Phase 45.
  - Production sync change-feed and serialization routes for encrypted records — Phase 45.
  - Mobile UI biometric prompt and Android Keystore native hardware binding — Phase 46.
  - Web UI vault unlock modal and passphrase capture — Phase 47.
  - Processing real private user content or deploying vault features.

## Result

Delivered an isolated, verifiable cryptographic prototype proving client-side authenticated envelope encryption, memory-hard key derivation, and high-entropy recovery for the Daynori Vault:
1. **Standards Verification:** Verified against published reference vectors: RFC 9106 for Argon2id (`03aab965c12001c9d7d0d2de33192c0494b684bb148196d73c1df1acaf6d0c2e`) and NIST SP 800-38D for AES-256-GCM (Test Cases 13 & 14).
2. **Cross-Platform Interoperability:** Proved bit-for-bit bidirectional interoperability between W3C Web Crypto (`SubtleCrypto`) and Node/Android native `Cipher`. Plaintext encrypted under Web Crypto decrypts identically under Android/Node native cipher and vice versa, covering Unicode & Bangla text (`"আমার গোপন ডায়েরি এবং ভল্ট ডেটা"`) and arbitrary binary files.
3. **Relocation & Tamper Defense:** Validated that any modification to ciphertext, authentication tag, nonce, or authenticated context (AAD) results in immediate, non-silent rejection before any plaintext is released.
4. **Key Management & Recovery:** Validated envelope wrapping of per-item Data Encryption Keys (DEK) under the Vault Root Key (VRK), and high-entropy recovery secret unsealing on a fresh simulated device. Demonstrated that recovery key rotation invalidates prior recovery envelopes.
5. **KDF Profiling:** Profiled Argon2id candidate production parameters (64 MB, 3 passes) at ~264 ms average latency, providing strong resistance against GPU/ASIC parallel brute-force attacks while remaining interactive for device unlock.

## Acceptance evidence

### 1. Published Reference Vectors & Standards Compliance
- **Argon2id (RFC 9106 Section 5.3):** Passed. Verified exact match for 32-byte password, 16-byte salt, 3 passes, 32 KiB memory, 4 lanes tag.
- **AES-256-GCM (NIST SP 800-38D Appendix B):** Passed. Verified Case 13 (empty plaintext tag `530f8afbc74536b9a963b4f1c4cb738b`) and Case 14 (16 zero bytes ciphertext `cea7403d4d606b6e074ec5d3baf39d18`, tag `d0d1c8a799996bf0265b98b5d48ab919`).

### 2. Cross-Platform AEAD Interoperability
- **Browser (WebCrypto) -> Mobile (Node/Android Cipher):** Passed. Validated on Bangla Unicode string and emojis.
- **Mobile (Node/Android Cipher) -> Browser (WebCrypto):** Passed. Validated on ASCII and Unicode strings.
- **Binary Fixtures:** Passed. 4KB random byte buffer round-tripped with bit-exact parity.

### 3. Key Hierarchy & Recovery Proof
- **DEK Envelope Wrapping:** Passed. DEK wrapped with VRK unwrap successfully with authenticated context.
- **Recovery Secret Format & Checksum:** Passed. 256-bit entropy formatted into 68-character grouped hex string; bit mutation detected by 4-character SHA-256 checksum check.
- **Fresh Device Recovery:** Passed. Root key unsealed from recovery envelope on clean device using recovery secret and Argon2id KEK derivation.
- **Recovery Key Rotation:** Passed. New recovery key wraps root key; old recovery key immediately fails unwrap.

### 4. Tamper & Relocation Resistance (Negative Tests)
- **Ciphertext Bit-Flip:** Rejected (`Decryption failed: authentication tag verification failure`).
- **Tag Bit-Flip:** Rejected (`Decryption failed: authentication tag verification failure`).
- **Relocation Across Workspaces / Items (AAD Mismatch):** Rejected (`AAD mismatch`).
- **Modified Envelope AAD String:** Rejected (`Decryption failed: authentication tag verification failure`).
- **Wrong Key / Passphrase:** Rejected (`Decryption failed: authentication tag verification failure`).
- **Truncated Envelope / Corrupted Tag Length:** Rejected (`Invalid authentication tag length`).
- **Unknown Version / Algorithm:** Rejected (`Unsupported envelope version or algorithm`).

### 5. Denial-of-Service Defense (KDF Bounds)
- **Argon2id Memory Bounds:** Enforces 16 MB <= memoryKiB <= 256 MB. Values 1 MB and 512 MB rejected with explicit range errors.
- **Argon2id Passes Bounds:** Enforces 2 <= passes <= 10. Values 1 and 20 rejected.
- **Argon2id Parallelism Bounds:** Enforces 1 <= parallelism <= 4. Value 16 rejected.
- **Argon2id Salt Bounds:** Enforces salt length >= 16 bytes. 8-byte salt rejected.
- **PBKDF2 Iteration Bounds:** Enforces 100,000 <= iterations <= 1,000,000. Values 1,000 and 5,000,000 rejected.

### 6. Benchmark Metrics (Node 24 / x86_64 Environment)
Executed via `runKdfBenchmark(5)`:
| Algorithm | Parameters | Samples | Min (ms) | Avg (ms) | Max (ms) | P95 (ms) | Heap Delta (KiB) |
|---|---|---|---|---|---|---|---|
| **Argon2id Candidate Production** | m=64MB, t=3, p=1 | 5 | 261.7 | **264.3** | 267.0 | 267.0 | 149 |
| **Argon2id Test Profile** | m=16MB, t=2, p=1 | 5 | 39.4 | **41.3** | 44.7 | 44.7 | 27 |
| **PBKDF2-HMAC-SHA256 (100k)** | iter=100,000, sha256 | 5 | 14.7 | **15.0** | 15.2 | 15.2 | 9 |
| **PBKDF2-HMAC-SHA256 (600k OWASP)** | iter=600,000, sha256 | 5 | 88.6 | **89.0** | 89.7 | 89.7 | 14 |

### 7. Automated Test Execution Commands
- Command: `pnpm vitest run tests/security/phase44-vault-crypto.test.ts`
  - Exit code: 0
  - Output: 1 test file passed, 19 tests passed (1077ms).
- Command: `pnpm vitest run tests/security/`
  - Exit code: 0
  - Output: 4 test files passed, 60 tests passed (9.71s).
- Command: `pnpm typecheck`
  - Exit code: 0 across all 13 workspace projects.
- Command: `pnpm run audit`
  - Exit code: 0 (0 secrets detected).

## Defects, limitations and recovery

1. **Release Gate Blocked (Independent Security Review):**
   - Per `docs/engineering/release-gates.md`, vault functionality cannot be enabled or considered approved without a formal independent review by a qualified cryptography and application security expert.
   - An automated AI agent or internal pair review does **not** constitute independent expert authorization.
2. **Release Gate Blocked (Physical Android Hardware Evidence):**
   - The native mobile quick unlock binding requires hardware-backed Android Keystore (`MasterKey`) biometric key authorization on physical hardware. Testing on Node or emulator synthetic models does not substitute for physical device QA.
3. **Web Client Security Boundary Limits:**
   - Web vault encryption is constrained by browser architecture: same-origin XSS, malicious browser extensions, or compromised server-delivered JavaScript can capture decrypted keys in memory. Reliable memory zeroization is not guaranteed by JavaScript engines.
4. **Metadata Disclosure:**
   - Server-visible metadata (object UUIDs, ciphertext byte sizes, revision counters, access timestamps) cannot be concealed by symmetric payload encryption.
5. **No Production Database or Sync Work Started:**
   - Phase 45 (production vault database tables, sync protocol, and ordinary-to-vault transfer workflows) has not been started. The vault remains completely disabled in application configuration.

## Documentation and Git review

- **ADR Created:** [ADR 0043: Vault Cryptography, Key Management, and Recovery Proof](../decisions/0043-vault-cryptography-and-recovery-proof.md).
- **Architecture Updated:** [docs/architecture/security-and-vault.md](../architecture/security-and-vault.md).
- **Roadmap & Progress Updated:** [docs/roadmap/progress.json](../roadmap/progress.json).
- **Changelog Updated:** [CHANGELOG.md](../../CHANGELOG.md).
- **Staged Diff Check:** Clean diff in `tests/security/`, `docs/`, and configuration. No private secrets or credentials.

## Handoff

Phase 44 is complete as a provisional proof-of-concept and remains **BLOCKED** as an operational release gate.
- **Next ready phase for normal development:** Phase 44 is blocked pending external security audit; the next planned phase in the roadmap is **Phase 45 — Encrypted vault records and sync protocol**, which requires explicit gate unblocking before implementation.
- **Exact unblocking requirements for Phase 44:**
  1. Completion of an independent external security review report with findings disposition.
  2. Physical Android device testing evidence demonstrating OS-authentication-bound Keystore unsealing.
