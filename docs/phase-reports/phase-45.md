# Phase 45: Encrypted vault records and sync protocol

## Identity and scope

- **Phase ID/specification:** [Phase 45 — Encrypted vault records and sync protocol](../roadmap/phases/45-encrypted-vault-records-and-sync-protocol.md).
- **Status:** `blocked` (**preparation repaired**; implementation **not** authorized).
- **Prerequisites verified as still unmet for implementation:**
  - Phase 44: blocked (browser/JVM/emulator improved; independent review + **physical Android** still missing).
  - Phase 34: blocked (provisional conflict/offline; hardware gates).
  - Phase 24: blocked (provisional binary lifecycle; hardware/scanner gates).

## Preparation repaired (not implementation)

Safety defects in the disconnected transfer model were repaired so callers cannot bypass guards by omitting helper calls:

| Bypass | Repair |
|---|---|
| `ciphertext_accepted` auto-set `ciphertextVerified` without evidence / vault id | Require `CiphertextVerificationEvidence` (destination, source revision, ciphertext identity, decryptVerified) inside `transitionTransfer` |
| Source revision can change yet cleanup still allowed | Require `restart_reconcile` or `preserve_changed_source` (+ disclosure); never silent delete of newer content |
| `cleanup_ordinary → transfer_complete` when `canMarkTransferComplete` false | Completion guard enforced inside `transitionTransfer` |
| Versions job scheduled counted as cleanup done | `versionsCleanupCompleted` required; scheduling alone insufficient |
| Idempotent retry could substitute destination/ciphertext | Binding checks reject substitutions under same `operationId` |
| Shared-reference cleanup without disclosure | Enforced at cleanup transition boundary |

Executable **test-only** models remain at `tests/security/vault/phase45-prep/protocol-models.ts` with focused negative tests in `tests/security/phase45-vault-prep.test.ts`.

Attachment format comparison remains **proposed** (libsodium secretstream) pending review — not adopted.

## Explicit non-claims

- Preparation model tests ≠ production authorization, durable DB recovery, or leak scans of live app paths.
- Listing transfer state names ≠ proof of durable recovery.
- No `app.vault_*` migrations, API routes, sync registration, or unlock screens.

## Checks

| Command | Exit | Result |
|---|---|---|
| `pnpm vitest run tests/security/phase45-vault-prep.test.ts` | 0 | 22 tests (includes negative bypass cases) |

## What would unblock implementation

Phase 44 independent review disposition + **physical Android** harness evidence within scope + attachment format decision; then verify Phases 24/34 provisional scopes before implementing the canonical Phase 45 feature commit.

## Handoff

Stop before Phase 46. Vault remains disabled. Do not start another broad preparation exercise — remaining blockers are external evidence/review.
