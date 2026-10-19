# Vault security review packet (Phase 44)

**Purpose:** Materials for an independent qualified cryptography / application-security reviewer.  
**Not a substitute for that review.** An AI agent review, Node simulation, successful build, or feature flag does **not** satisfy the vault release gate.

**Prototype location:** `tests/security/vault/` (isolated; not wired into apps).  
**Decision record:** [ADR 0043](../decisions/0043-vault-cryptography-and-recovery-proof.md).  
**Architecture:** [security-and-vault.md](../architecture/security-and-vault.md), [vault-attachment-encryption-evaluation.md](../architecture/vault-attachment-encryption-evaluation.md).  
**Release gates:** [release-gates.md](release-gates.md) — Vault section.

---

## Exact source revisions and dependency versions (for this packet)

| Item | Value |
|---|---|
| Phase 44 repair base | `0bf8200` (`fix(vault): harden empty payloads, harnesses, and KDF scheduling`) |
| Phase 45 prep base | `cfb7adf` (`docs(vault): strengthen encrypted records preparation models`) |
| Working-tree repairs (this session) | Transfer-model safety invariants; JVM fixture parsing; Android `:android-app` target — commit IDs recorded at session end |
| Node | Record from `node -v` in phase report (wanted `^24.21.0`) |
| pnpm | Record from `pnpm -v` in phase report |
| JDK | Temurin 17.0.20.1 |
| Gradle wrapper | 8.10.2 |
| Kotlin | 1.9.25 |
| JVM KDF candidate | `de.mkammerer:argon2-jvm:2.11` |
| Android KDF candidate | `org.bouncycastle:bcprov-jdk18on:1.78.1` (pure Java; ABI-portable) |
| Android compile/target SDK | 35; `minSdk` 26 |
| AGP | 8.7.2 |

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
| Browser harness | `tests/security/vault/harnesses/browser-webcrypto.harness.html` |
| JVM harness | `tests/security/vault/harnesses/android-candidate` `:harness` |
| Android harness | `tests/security/vault/harnesses/android-candidate` `:android-app` + instrumentation |

**Envelope profile v1:** `version=1`, `algorithm=AES-256-GCM`, `keyVersion` (positive int), base64 `nonce` (12), `ciphertext`, `tag` (16), canonical JSON `aad`. Outer `keyVersion` must match AAD `keyVersion`.

**Reference vectors / fixtures:** `tests/security/vault/harnesses/shared-fixtures.json` (required by harnesses).

- RFC 9106 §5.3 complete (password, salt, secret, AD) → `0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659` (Node suite)
- Password+salt-only regression → `03aab965…` (Node + JVM + Android expected-byte match)
- Application-bounds fixed Argon2id → `845cc46e…` (Node↔JVM↔Android)
- McGrew/Viega GCM Appendix B Cases 13–14 (NOT SP 800-38D appendix cases)
- Cross-impl AES fixtures with deterministic key/nonce for empty/Unicode/binary envelope exchange

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

## 6. Replay / freshness / checkpoint design and fresh-device limits

- AAD binds identity (`workspaceId`, `itemId`, …) and prevents cross-item relocation.
- AAD **does not** by itself prevent replaying an older valid ciphertext for the same item.
- **Design (Phase 45 prep models):** trusted client checkpoint with monotonic per-item accepted revisions and key epoch; stale envelopes rejected when checkpoint exists.
- **Fresh-device limitation:** missing checkpoint ⇒ `accept_with_reduced_assurance` until first trusted sync establishes a checkpoint. Reviewers must treat this as an explicit residual risk, not a closed finding.
- Executable model: `tests/security/vault/phase45-prep/protocol-models.ts` (`evaluateEnvelopeAgainstCheckpoint`).

---

## 7. Attachment encryption (proposed — not adopted)

See [vault-attachment-encryption-evaluation.md](../architecture/vault-attachment-encryption-evaluation.md).

- **Proposed for review:** libsodium `crypto_secretstream_*` with pinned `libsodium 1.0.20` (+ matching wrappers) for large attachments; retain Phase 44 single-envelope AES-256-GCM for ≤ 16 MiB objects.
- **Status:** proposed only — **not reviewed, not accepted, not implemented in production packages**.
- Homegrown chunk-index protocol **not authorized**.

### Unresolved adoption risks (must be closed by review)

1. Browser WASM performance / memory on low-end devices.
2. Android native wrapper ABI drift vs pinned libsodium.
3. Manifest binding to workspace/item/key version for truncated/resumable uploads.
4. Explicit rejection of reordering/duplication and missing finalization tags.
5. Product fallback if secretstream is rejected (Tink Streaming AEAD with deferred large web uploads).

---

## 8. Browser malicious-JavaScript / XSS limits

Web vault unlock holds keys in JS memory. Compromised origin script, malicious extension, or hostile deploy can exfiltrate keys after unlock. CSP, SRI, deploy signing, and XSS defenses reduce risk but do not create a hardware enclave. Memory zeroization is not reliable in JS engines.

---

## 9. Platform evidence (listed separately — do not conflate)

| Evidence lane | Status | Record |
|---|---|---|
| Vitest prototype suite | Runnable | `pnpm vitest run tests/security/phase44-vault-crypto.test.ts` |
| Node↔Node AEAD interop | Wire-format only | Phase 44 suite |
| **Browser** (Edge/Chromium headless) | **PASS** 2026-10-19 | `harnesses/evidence/browser-harness-2026-10-19.md` — McGrew Case 13, Unicode/binary/empty + tamper, 32-byte key policy |
| **Desktop JVM** candidate | **PASS** 2026-10-19 (post-repair) | `harnesses/evidence/android-jvm-harness-2026-10-19.md` — fixture parse, Node↔JVM envelope exchange both directions, Argon2id expected bytes |
| **Android emulator instrumentation** | Record actual result in evidence file; **APKs buildable** via `:android-app` | Must not be counted as physical-device clearance |
| **Physical Android device** | **Missing — still required for Phase 44 gate** | Procedure in `android-candidate/README.md` |
| KDF latency Node/JVM | Distributions with explicit non-claims | Not GPU/ASIC proof |
| Independent qualified review | **Missing — blocks gate** | This packet is the handoff, not the approval |
| Hardware-backed / biometric Keystore unlock | **Missing** (Phase 46 application unlock screens out of scope here; isolated Keystore AES smoke only) | Instrumentation includes optional Keystore smoke ≠ unlock UX |
| Attachment streaming format decision | Proposed; **pending review** | Evaluation doc |

**Gate wording (reconciled):** An emulator PASS does **not** satisfy the physical Android device gate. Physical-device installation, API/ABI/library recording, and harness PASS on hardware remain required unless the owner and an appropriate qualified reviewer explicitly change the gate.

---

## 10. Remaining findings and evidence required to close each

| Finding / gap | Evidence required to close |
|---|---|
| Independent qualified review absent | Written report from a real qualified reviewer covering this packet + findings disposition (AI approval insufficient) |
| Physical Android harness unverified | Device model, API, ABI, `bcprov-jdk18on:1.78.1`, instrumentation log with PASS lines, Keystore smoke note |
| Emulator may be unavailable/incomplete in a given environment | Separate emulator evidence file if run; never substitutes for physical-device row |
| Attachment format only proposed | Reviewer accept/reject of secretstream proposal (or alternate) with pinned versions |
| Fresh-device reduced assurance | Reviewer acceptance of checkpoint design + residual risk statement |
| Phase 37–38 still blocked | External release/beta prerequisites (orthogonal but blocks marketing/production enablement) |
| Phase 45 production implementation | Requires Phase 44 gate clearance + Phase 24/34 provisional scope verification |

---

## 11. External reviewer handoff (precise scope)

**Reviewer scope:**

1. Threat model, AEAD/KDF choices, envelope profile, recovery/rotation limitations in ADR 0043 and this packet.
2. Browser harness evidence + JVM harness evidence + (when present) emulator/physical Android evidence — each lane separately.
3. Cross-implementation fixtures in `shared-fixtures.json` and expected-byte verification approach.
4. Attachment streaming proposal (proposed secretstream; not adopted).
5. Freshness/checkpoint design and fresh-device reduced assurance.
6. Phase 45 transfer-model safety invariants (test-only) for ordinary→vault cleanup gates — preparation only.

**Device procedure (owner/operator):** follow `tests/security/vault/harnesses/android-candidate/README.md` physical-device section; deposit evidence under `harnesses/evidence/`.

**Missing artifacts that block implementation authorization:**

1. Independent review report + disposition.
2. Physical Android harness evidence file.
3. Attachment format accept/reject decision.
4. Explicit acceptance of fresh-device residual risk / checkpoint design.

Until then: Phase 44 remains **blocked**; Phase 45 remains **blocked/prepared**; vault stays disabled; no production vault migrations/routes/unlock UI.

---

## 12. What would unblock Phase 44 for production implementation authorization

1. Written report from an independent qualified reviewer covering this packet, with findings disposition.
2. Recorded browser harness results (engine + versions) — currently present for Edge headless 2026-10-19.
3. Recorded Android candidate-library harness results on **physical** hardware (API level, ABI, library versions).
4. Explicit decision on attachment streaming format.
5. Accepted freshness/checkpoint design for rollback resistance (including fresh-device limits).

Until then: Phase 44 remains **blocked**; Phase 45 may only prepare documentation and disconnected synthetic fixtures.
