# Phase 44: Vault cryptography and recovery proof

## Identity and scope

- **Phase ID/specification:** [Phase 44 — Vault cryptography and recovery proof](../roadmap/phases/44-vault-cryptography-and-recovery-proof.md).
- **Status:** `blocked`. Local cryptographic prototype repaired again; browser (Edge headless) and JVM candidate harnesses executed. Independent qualified review and **physical Android device** evidence remain unmet. Gate not advanced.
- **Contributor and report date:** Cursor agent, 2026-10-19 (Asia/Dhaka).
- **Base revisions:** `98c0830` (prior repair), this session continues on `2e53c29` tree.
- **Prerequisites:** Phase 38 blocked; Phase 03 complete for earlier spikes only.

## Defects repaired in this session

| Defect | Repair |
|---|---|
| Empty-payload encrypt then self-reject (`decodeStrictBase64` rejected `""` ciphertext) | Allow empty ciphertext encoding; keep nonce/tag non-empty; adapter cross-round-trip tests |
| Browser harness expected native `importKey` to reject 16-byte AES-GCM keys | Profile validator rejects non-32-byte keys **before** import; native 128-bit capability logged separately |
| Android harness was markdown-only | Buildable Gradle/Kotlin candidate with AES-GCM + `argon2-jvm:2.11`; JVM host PASS; physical device still unverified |
| `deriveKeyArgon2idLimited` sync-on-main + unbounded waiters | Worker-thread scheduler, bounded active(2)+queue(4), validate-before-admit, cancel/fail release, overload reject |
| AES vectors mis-attributed to SP 800-38D Appendix C | Corrected to **McGrew/Viega GCM spec Appendix B** Cases 13–14 |
| Unsupported “prevent cost-effective GPU/ASIC cracking” claim | Removed; parameters justified for interactive cost / review required |

## Platform evidence obtained

| Platform | Result | Record |
|---|---|---|
| Node Vitest adapters | PASS | `tests/security/phase44-vault-crypto.test.ts` |
| Browser (Edge/Chromium headless via Playwright) | **PASS** | `tests/security/vault/harnesses/evidence/browser-harness-2026-10-19.md` |
| Android-class JVM candidate (`AES/GCM` + Argon2id) | **PASS (host JVM)** | `tests/security/vault/harnesses/evidence/android-jvm-harness-2026-10-19.md` |
| Physical Android device / emulator instrumentation | **UNVERIFIED** | Procedure in `android-candidate/README.md` |

## Automated checks (this session)

Environment: Windows 11, Node `v24.11.1` (wanted `^24.21.0`), pnpm `9.15.5`, Temurin JDK `17.0.20.1`.

| Command | Exit | Result |
|---|---|---|
| `pnpm vitest run tests/security/phase44-vault-crypto.test.ts` | 0 | 30 tests (after empty-payload + scheduler coverage) |
| `node run-browser-harness.mjs` (harnesses/) | 0 | Edge headless PASS |
| `gradlew.bat :harness:runHarness` | 0 | JVM candidate PASS |
| `pnpm typecheck` / `validate-planning` / `audit:secrets` / `git diff --check` | (session end) | recorded in commit verification |

## Remaining gate requirements

1. Independent qualified security review of [vault-security-review-packet.md](../engineering/vault-security-review-packet.md).
2. Physical Android (or at minimum emulator instrumentation on device image) harness evidence with device/API/library versions.
3. Attachment streaming format decision after review ([evaluation](../architecture/vault-attachment-encryption-evaluation.md)).
4. Phases 37–38 release/beta gates remain blocked.

## Handoff

Phase 44 remains **BLOCKED**. Phase 45 may only prepare documentation/models while blocked. Stop before Phase 46.
