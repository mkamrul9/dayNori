# Vault Independent Review Package (Phase 97)

**Document Version:** 2.0.0  
**Target Git Baseline:** `848adc4a8e3c691709d2ded4b79ca205a70a05f5` (plus Phase 97 security and disaster recovery audit remediations)  
**Classification:** Pre-Release Security Audit Submission & Acceptance Package  
**Status:** **GATED / BLOCKED** under `DEF-V2-004` (independent external review) and `DEF-V2-008` (physical Android ARM64 hardware verification).

> [!CRITICAL]
> **This package is prepared for an accredited, independent third-party cryptography and application security firm.**
> Internal unit tests, Node.js simulations, emulator passes, or AI agent verifications **do not satisfy** the vault release gate. Vault features remain strictly disabled in production builds until this external review is formally completed, signed off, and accepted by repository owners.

---

## 1. Executive Summary & Audit Scope

Daynori provides an optional client-side encrypted **Vault** for ultra-sensitive personal notes, credentials, and reflections. The system is designed under a **Zero-Knowledge Architecture**:
- All cryptographic key derivation (KDF) and authenticated symmetric encryption (AEAD) occur strictly on client devices.
- The server backend, database, and cloud storage providers receive only AES-256-GCM ciphertexts, base64 nonces, authentication tags, and non-sensitive key identifiers.
- Server administrators, compromised database dumps, and operator triage portals cannot decrypt or view vault contents.

### In-Scope Review Components

| Component | Repository Path | Core Technologies |
|---|---|---|
| **Core Cryptographic Engine** | `packages/domain/src/vaultLifecycle.ts`<br>`packages/domain/src/vaultSessionController.ts`<br>`tests/security/vault/vault-crypto.ts` | Argon2id (RFC 9106), AES-256-GCM, CSPRNG |
| **Shared Cross-Platform Test Vectors** | `tests/security/vault/harnesses/shared-fixtures.json` | RFC 9106 test vectors, McGrew/Viega GCM Appendix B cases |
| **Android Keystore / StrongBox Harness** | `tests/security/vault/harnesses/android-candidate/` | Kotlin, Android Keystore, BouncyCastle, BiometricPrompt |
| **Browser WebCrypto Session Harness** | `tests/security/vault/harnesses/browser-webcrypto.harness.html` | WebCrypto API, SubtleCrypto, BroadcastChannel cross-tab lock |
| **Disaster Recovery & Deletion Suppression** | `scripts/disaster-recovery-drill.mjs`<br>`infra/supabase/migrations/00037-00039` | PostgreSQL RLS, pre-access suppression ledger barrier |

---

## 2. Cryptographic Specifications & Invariants

### 2.1 Cryptographic Primitives
1. **AEAD Symmetric Cipher:** AES-256-GCM (NIST SP 800-38D)
   - Nonce length: exactly 96 bits (12 bytes), generated via CSPRNG per encryption. Nonce reuse is strictly forbidden.
   - Authentication Tag: 128 bits (16 bytes).
   - Additional Authenticated Data (AAD): Canonical JSON string binding `keyVersion`, `workspaceId`, and envelope type.
2. **Password-Based KDF (Argon2id - RFC 9106):**
   - Candidate parameters: `m = 65536 KiB` (64 MiB), `t = 3` iterations, `p = 1` lane.
   - Salt: exactly 128 bits (16 bytes) CSPRNG.
   - Output key length: 256 bits (32 bytes).
   - Downgrade Protection: Reject parameter requests outside memory bounds (16 MiB–256 MiB) or iteration bounds (2–10).
3. **Key Hierarchy:**
   - **VRK (Vault Root Key):** 256-bit random master key generated locally upon vault creation. Never leaves client memory in plaintext.
   - **Passphrase KEK:** Derived via Argon2id(Passphrase, Salt). Encrypts VRK in envelope `wrap:vrk_under_passphrase`.
   - **Recovery KEK:** Derived via Argon2id(RecoverySecret, Salt). Encrypts VRK in envelope `wrap:vrk_under_recovery`.
   - **DEK (Data Encryption Key):** 256-bit ephemeral key per note item, encrypted under VRK (`wrap:dek_under_vrk`).

---

## 3. Findings Register & Remediations Addressed (Phase 86–97)

The following findings have been identified, remediated in code, and verified by regression test suites:

| ID | Severity | Surface | Remediation Summary |
|---|---|---|---|
| **VR-001** | High | Controller | Stale pending unlock operations timeout after 30s (`UNLOCK_OPERATION_TIMEOUT_MS`) to prevent permanent UI lockup. |
| **VR-002** | Medium | Rate-Limiter | Failed attempt cooldown counter resets to 0 upon elapsed 60s cooldown window. |
| **VR-003** | High | Mobile Push | Notification adapter forces generic placeholder strings for any reminder destination targeting `'vault'`. |
| **VR-004** | Medium | Guidance | Explicit UI guidance displayed when Android Keystore key is invalidated by biometric enrollment changes. |
| **VR-005** | Medium | Browser Sync | Cross-tab background visibility signal immediately locks all open tabs via BroadcastChannel. |
| **VR-006** | Low | Formatting | Recovery secret decoder distinguishes between transcription checksum failures and formatting errors. |
| **SEC-001** | Medium | Operator Triage | Operator endpoints strictly throw `AuthError` (401) on unauthenticated calls instead of validation errors (400). |
| **SEC-002** | Medium | Storage Quota | Quota endpoint validates workspace membership before query execution, returning clean 404 instead of 500 RLS error. |

---

## 4. Outstanding Open Release Gates

The following release gates remain **unmet** and block general production enablement:

### 4.1 Gate DEF-V2-004: External Cryptography Audit
- **Status:** **UNMET / BLOCKED**
- **Requirements:** An accredited independent security firm must perform source code review and penetration testing against:
  1. Key derivation and zero-knowledge memory safety (CSPRNG, Argon2id parameter enforcement, memory clearing).
  2. Envelope exchange format parsing, preventing downgrade, tag truncation, or AAD manipulation.
  3. Recovery secret lifecycle, verifying that re-wrapping the same VRK does not leak previous keys and that rotating VRK cleanly isolates revoked envelopes.
  4. Cross-tab and native background locking behavior.

### 4.2 Gate DEF-V2-008: Physical Android ARM64 Hardware Evidence
- **Status:** **UNMET / BLOCKED**
- **Requirements:** Execution of `tests/security/vault/harnesses/android-candidate` on a physical Android device (ARM64 with hardware-backed Keystore / StrongBox):
  1. Enrollment of biometric-bound AES key in StrongBox Keymaster.
  2. Verification that modifying enrolled fingerprints immediately invalidates the bound key with `KeyPermanentlyInvalidatedException`.
  3. Physical power-loss, cold-boot, and memory-dump resistance.

---

## 5. Reviewer Verification Guide & Test Harness Execution

External reviewers can verify the local candidate implementation using the following instructions:

### 5.1 Running the Node.js Cryptographic & Lifecycle Test Suite
```bash
# Execute Phase 86 & Phase 97 security test suites
pnpm vitest run tests/security/phase86-vault-review-recovery.test.ts
pnpm vitest run tests/security/phase97-v2-security-privacy-recovery.test.ts
```

### 5.2 Running the Browser WebCrypto Harness
1. Start local development server or open `tests/security/vault/harnesses/browser-webcrypto.harness.html` in Chrome/Edge/Firefox.
2. Harness automatically loads `shared-fixtures.json` and evaluates WebCrypto AES-GCM and PBKDF2/Argon2id conformance.
3. Review console output for cross-tab locking signals and memory scrubbing.

### 5.3 Running the Android Native Candidate Harness
```bash
# Build candidate harness
cd tests/security/vault/harnesses/android-candidate
./gradlew test
# (When connected to physical ARM64 test device)
./gradlew connectedAndroidTest
```

---

## 6. Required Owner Actions Prior to Production Release

1. **Procure External Audit:** Retain a certified independent security testing firm to complete the checklist in Section 4.1.
2. **Execute Hardware Tests:** Run instrumentation tests on a physical Google Pixel (Tensor chip with Titan M2) or Samsung Galaxy (Knox Vault) running Android 14+.
3. **Approve Live AI Synthetic Test:** Explicit owner approval required before transmitting synthetic test audio/text to external AI providers.
