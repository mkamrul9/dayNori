# Phase 44: Vault cryptography and recovery proof

## Identity and scope

- **Phase ID/specification:** [Phase 44 — Vault cryptography and recovery proof](../roadmap/phases/44-vault-cryptography-and-recovery-proof.md).
- **Status:** `blocked`. Local cryptographic prototype repaired and verified under owner authorization; external release gates remain unmet. Gate status is **not** advanced merely to unlock Phase 45 numbers.
- **Contributor and report date:** Cursor agent, 2026-10-19 (Asia/Dhaka).
- **Base Git revision and branch:** Commit `e07c454` on `main` (initial prototype); repair session based on clean tree after `65c31c1` Phase 43 repairs.
- **Prerequisites:**
  - [Phase 38 — Controlled private beta](phase-38.md): Status `blocked`.
  - [Phase 03 — Platform and integration feasibility spikes](phase-03.md): Complete for synthetic/browser IndexedDB spikes; does not substitute vault crypto review.
- **Included scope:** Isolated prototype under `tests/security/vault/`, ADR 0043 repair, architecture updates, review packet, platform harnesses (runnable; browser/Android execution unverified here), attachment-format evaluation (pending).
- **Excluded:** Production `app.vault_*` migrations, sync routes, unlock UI, real private content, store/deploy.

## Prerequisite verification (Phase 43, commit `65c31c1`)

Verified against application callers and tests — **not** assumed from the prior report alone:

| Check | Result |
|---|---|
| `pnpm vitest run tests/integration/phase43-custom-section-builder.test.ts` | Exit 0 — 16/16 passed |
| `validateAndLinkReferences` → `app.item_attachments` columns + reconciliation | Present in `apps/api/src/modules/custom-sections/service.ts` |
| Canonical `custom_record` in `app.items` + FK migration `00047_…` | Present |
| Expense summary: explicit `expensesEnabled === true`, BigInt arithmetic, `formatMinorUnitsToDecimal` | Present |
| Web `/custom-sections` + mobile `CustomSectionsView` wiring | Present in `65c31c1` |

No separate Phase 43 regression repair was required in this session. Beta/release gates for Phases 37–38 remain blocked and visible in `progress.json`.

## Confirmed Phase 44 defects (reproduced) and repairs

| Defect | Reproduction | Repair |
|---|---|---|
| RFC 9106 §5.3 vector omitted secret + AD; `03aab965…` mislabeled as complete RFC | Node `argon2Sync` without secret/AD yields `03aab965…`; with secret/AD yields `0d640df5…` | Complete RFC fixture via `computeArgon2idReferenceVector`; keep `03aab965…` as password+salt-only regression fixture; isolate from app KDF bounds |
| NIST appendix mis-cited as Appendix B | Document structure | Corrected to **Appendix C** Test Cases 13–14 |
| `verifyAndDecodeRecoverySecret` accepted invalid hex → empty buffer (`z…` + `e3b0`) | Confirmed empty-buffer exploit | Strict hex + separators; require exactly 32 decoded bytes; checksum is transcription-only |
| WebCrypto accepted 16-byte key as AES-256-GCM | Round-trip succeeded | Reject ≠32-byte keys before crypto |
| Outer `keyVersion` change left decrypt successful | Confirmed | Require outer `keyVersion` == AAD `keyVersion` |
| 16-byte nonce accepted | Confirmed on both adapters | Enforce exactly 12-byte nonce profile |
| KDF allowed 4-byte output | Confirmed | Application output exactly 32 bytes; no silent downgrade |
| Adapters named as Browser/Android while both Node | Code inspection | Renamed `NodeWebCryptoVaultAdapter` / `NodeCreateCipherivVaultAdapter`; separate harnesses |
| Recovery rewrap claimed to invalidate old secrets | Old envelope + old secret still unwraps same VRK | Regression test + ADR correction |
| Homegrown chunked attachment protocol authorized | ADR text | Replaced with maintained-format evaluation; **pending review** |
| Benchmark over-claims | Heap delta / few samples | Honest limitations on latency distributions + RSS/heap deltas |

## Result (honest)

Delivered a **repaired isolated prototype** and review packet. Node↔Node AEAD interoperability and published vectors pass in Vitest. Browser and Android execution remain **unverified** until harness results are recorded. Independent qualified security review is **absent**. Phase remains **blocked**.

## Acceptance evidence

### Automated (executed this session)

Environment: Windows 10 (win32 10.0.26200), Node `v24.11.1` (engine wanted `^24.21.0` — warning only), pnpm `9.15.5`.

| Command | Exit | Result |
|---|---|---|
| `pnpm vitest run tests/integration/phase43-custom-section-builder.test.ts` | 0 | 16/16 passed |
| `pnpm vitest run tests/security/phase44-vault-crypto.test.ts` | 0 | 29/29 passed |
| `pnpm vitest run tests/security/` | 0 | Security suite passed (Phase 44 crypto tests included; count depends on sibling prep files present in the tree) |
| `pnpm typecheck` | 0 | 13 workspace projects |
| `pnpm audit:secrets` | 0 | 1930 files, no unapproved secrets |
| `node scripts/validate-planning.mjs` | 0 | 64 phases, planning validation passed |
| `git diff --check` | 0 | clean |

Not reported as passing: browser harness JS execution in a real browser engine; Android candidate-library on device; independent security review.

### Platform harnesses

| Harness | Status |
|---|---|
| `tests/security/vault/harnesses/browser-webcrypto.harness.html` | Runnable; **execution unverified** in this session |
| `tests/security/vault/harnesses/android-candidate.harness.md` | Procedure prepared; **execution unverified** (no device) |

Node WebCrypto ↔ Node createCipheriv is **not** browser↔Android evidence.

### Benchmark interpretation

`runKdfBenchmark` records min/avg/p50/p95/max latency plus process RSS and JS heap deltas, each result carrying explicit limitations: heap ≠ peak native Argon2 memory; Node ≠ Android/browser; small N ≠ guessing resistance. Candidate parameters (64 MiB / 3 passes) are retained without silent weakening.

## Defects, limitations and recovery

1. **Independent security review** — missing; required to unblock production vault work ([review packet](../engineering/vault-security-review-packet.md)).
2. **Browser + physical Android harness evidence** — unverified here.
3. **Attachment streaming format** — pending ([evaluation](../architecture/vault-attachment-encryption-evaluation.md)).
4. **Freshness/checkpoint design** — specified as required; not implemented in apps.
5. **Web XSS / malicious JS** — residual risk after unlock.
6. **Metadata disclosure** — unchanged.
7. **Phases 37–38 beta/release gates** — still blocked; not waived.

## Documentation and Git review

- ADR 0043 updated; architecture + review packet + attachment evaluation + harnesses.
- Changelog and `progress.json` updated consistently.
- No production vault migrations or app routes added.

## Handoff

Phase 44 remains **BLOCKED**. Phase 45 may only prepare documentation and disconnected synthetic fixtures while this gate holds.

**Exact unblocking actions:**

1. Independent qualified reviewer completes the review packet with findings disposition.
2. Record browser harness output (engine + versions) and Android candidate-library results on physical hardware.
3. Decide attachment streaming format under review.
4. Accept freshness/checkpoint design for rollback resistance.
