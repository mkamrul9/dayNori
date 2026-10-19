# Vault security review packet (Phase 44)

**Purpose:** Materials for an independent qualified cryptography / application-security reviewer.  
**Not a substitute for that review.** An AI agent review, Node simulation, successful build, or feature flag does **not** satisfy the vault release gate.

**Prototype location:** `tests/security/vault/` (isolated; not wired into apps).  
**Decision record:** [ADR 0043](../decisions/0043-vault-cryptography-and-recovery-proof.md).  
**Architecture:** [security-and-vault.md](../architecture/security-and-vault.md), [vault-attachment-encryption-evaluation.md](../architecture/vault-attachment-encryption-evaluation.md).  
**Release gates:** [release-gates.md](release-gates.md) — Vault section.

---

## 1. Threat model and trust boundaries

| Adversary | Assumption | Mitigation / limit |
|---|---|---|
| Backend / DB / object storage reader-writer | Full ciphertext + metadata access | Client-side AES-256-GCM; no server plaintext keys |
| Offline envelope theft | Extracted DB / sync dump | Argon2id memory-hard KDF on passphrase/recovery paths |
| Weak PIN guessing | 4–6 digit PIN | PIN must never be sole cloud-verifiable wrap secret |
| Stolen unlocked client | Process memory | Out of scope for confidentiality guarantees |
| Same-origin XSS / malicious web update | Delivered JS can exfiltrate keys after unlock | Deployment/signing integrity; web cannot claim strong key isolation |
| Metadata observer | Sizes, UUIDs, revisions, timestamps | Disclosed as unavoidable |
| Rollback / withholding | Server serves older ciphertext | AAD alone insufficient — needs client freshness/checkpoint design |

Exclusions: rooted devices, cold-boot, actively compromised unlocked runtimes.

---

## 2. Primitives, libraries, versions, envelope format

| Item | Choice |
|---|---|
| AEAD | AES-256-GCM, 96-bit nonce, 128-bit tag (NIST SP 800-38D) |
| KDF (application) | Argon2id (RFC 9106), candidate `m=65536 KiB`, `t=3`, `p=1`, 16-byte salt, 32-byte output |
| KDF bounds | Memory 16–256 MiB; passes 2–10; parallelism 1–4; exact 32-byte output; no silent downgrade |
| Comparative baseline | PBKDF2-HMAC-SHA256 (not a fallback) |
| Node prototype runtime | Record from `node -v` at test time (see phase report) |
| Node WebCrypto | `crypto.subtle` inside Node — **not browser evidence** |
| Node Cipher | `createCipheriv('aes-256-gcm')` — **not Android evidence** |
| Browser harness | `tests/security/vault/harnesses/browser-webcrypto.harness.html` — execute separately |
| Android harness | `tests/security/vault/harnesses/android-candidate.harness.md` — execute separately |

**Envelope profile v1:** `version=1`, `algorithm=AES-256-GCM`, `keyVersion` (positive int), base64 `nonce` (12), `ciphertext`, `tag` (16), canonical JSON `aad`. Outer `keyVersion` must match AAD `keyVersion`.

**Reference vectors:**

- RFC 9106 §5.3 complete (password, salt, secret, AD) → `0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659`
- Password+salt-only regression fixture (not complete RFC) → `03aab965…`
- McGrew/Viega GCM specification Appendix B Test Cases 13–14 (AES-256 empty/16-byte PT; empty AAD). **Not** SP 800-38D appendix cases.

---

## 3. Key hierarchy and lifecycle

1. **VRK** — 256-bit client CSPRNG root key.
2. **Passphrase KEK** — Argon2id(passphrase) wraps VRK (`wrap:vrk_under_passphrase`).
3. **Recovery KEK** — Argon2id(recovery secret) wraps VRK (`wrap:vrk_under_recovery`).
4. **DEK** — per-item 256-bit key wrapped under VRK (`wrap:dek_under_vrk`).
5. **Device wraps (future)** — OS-bound keys; Phase 46. Revocation does **not** erase keys already obtained by an attacker.

Account password reset ≠ vault reset. Loss of passphrase **and** recovery secret ⇒ permanent content loss.

---

## 4. Recovery and rotation limitations (critical)

| Operation | What it does | What it does **not** do |
|---|---|---|
| Publish new recovery envelope for **same** VRK | New secret unwraps new envelope | Invalidate attacker-held old envelope + old secret |
| Rotate VRK + re-wrap/re-encrypt all DEKs/content | Changes root of trust | Instantly erase plaintext already exfiltrated |
| Revoke device enrollment (future) | Stops new unwraps for that device wrap | Erase keys previously loaded in memory or backups |
| Checksum on recovery secret | Detects typos | Authenticate recovery packages |

Regression test: `documents that rewrapping the same VRK does NOT invalidate a saved old recovery envelope`.

---

## 5. Device enrollment / revocation (design intent)

- Enrollment produces a device-specific wrap of VRK under an OS-auth-bound key (Android Keystore) or web session memory-only unlock.
- Revocation deletes/rotates server-visible device wrap records and bumps device epoch for sync authorization.
- **Guarantee limit:** Revocation cannot prove destruction of previously obtained VRK/DEK/plaintext copies.

---

## 6. Replay and rollback analysis

- AAD binds identity (`workspaceId`, `itemId`, …) and prevents cross-item relocation.
- AAD **does not** by itself prevent replaying an older valid ciphertext for the same item.
- Required future design: trusted client checkpoint / monotonic version acceptance / sync receipt freshness, with explicit fresh-device recovery limits when checkpoints are absent.
- Documented in architecture and regression test for older-version replay.

---

## 7. Attachment encryption

See [vault-attachment-encryption-evaluation.md](../architecture/vault-attachment-encryption-evaluation.md).  
Large-file streaming format **pending review**. Homegrown chunk-index protocol **not authorized**.

---

## 8. Browser malicious-JavaScript / XSS limits

Web vault unlock holds keys in JS memory. Compromised origin script, malicious extension, or hostile deploy can exfiltrate keys after unlock. CSP, SRI, deploy signing, and XSS defenses reduce risk but do not create a hardware enclave. Memory zeroization is not reliable in JS engines.

---

## 9. Test fixtures, benchmarks, unresolved findings

| Evidence | Status |
|---|---|
| Vitest prototype suite | Runnable locally (`pnpm vitest run tests/security/phase44-vault-crypto.test.ts`) |
| Node↔Node AEAD interop | Evidence of wire format only |
| Browser harness | **PASS** Edge/Chromium headless 2026-10-19 — `harnesses/evidence/browser-harness-2026-10-19.md` |
| Android/JVM candidate harness | **PASS on host JVM** 2026-10-19 — `harnesses/evidence/android-jvm-harness-2026-10-19.md` |
| Physical Android device / emulator app | **Missing — still required** |
| KDF latency on Node/JVM hosts | Distributions with explicit non-claims (not GPU/ASIC proof) |
| Independent qualified review | **Missing — blocks gate** |
| Physical Android Keystore unlock binding | **Missing — blocks gate** (Phase 46 scope overlap) |
| Attachment streaming format decision | Proposed libsodium secretstream; **pending review** |

---

## 10. What would unblock Phase 44 for production implementation authorization

1. Written report from an independent qualified reviewer covering this packet, with findings disposition.
2. Recorded browser harness results (engine + versions).
3. Recorded Android candidate-library harness results on physical hardware (API level, library versions).
4. Explicit decision on attachment streaming format.
5. Accepted freshness/checkpoint design for rollback resistance.

Until then: Phase 44 remains **blocked**; Phase 45 may only prepare documentation and disconnected synthetic fixtures.
