# Phase 45: Encrypted vault records and sync protocol

## Identity and scope

- **Phase ID/specification:** [Phase 45 — Encrypted vault records and sync protocol](../roadmap/phases/45-encrypted-vault-records-and-sync-protocol.md).
- **Status:** `blocked` (**preparation strengthened**; implementation **not** authorized).
- **Prerequisites verified as still unmet for implementation:**
  - Phase 44: blocked (local proof improved; independent review + physical Android still missing).
  - Phase 34: blocked (provisional conflict/offline; hardware gates).
  - Phase 24: blocked (provisional binary lifecycle; hardware/scanner gates).

## Preparation delivered (not implementation)

- Design: [vault-records-and-transfer-preparation.md](../architecture/vault-records-and-transfer-preparation.md)
- Executable **test-only** models: `tests/security/vault/phase45-prep/protocol-models.ts`
  - Purpose/field-role AAD binding
  - Checkpoint / replay decisions + fresh-device reduced assurance
  - Ciphertext conflict preservation (no silent overwrite)
  - Transfer state machine with idempotency, cleanup-before-accept forbidden, ordinary edits, retained-copy disclosure, cleanup evidence gate
  - Default-deny exclusion registry
- Fixture inventory checks remain labeled as **preparation checks** in `tests/security/phase45-vault-prep.test.ts`
- Attachment format comparison completed with pinned candidate versions and a **proposed** libsodium secretstream choice pending review — not adopted

## Explicit non-claims

- Preparation model tests ≠ production authorization, durable DB recovery, or leak scans of live app paths.
- Listing transfer state names ≠ proof of durable recovery.
- No `app.vault_*` migrations, API routes, sync registration, or unlock screens.

## Checks

| Command | Exit | Result |
|---|---|---|
| `pnpm vitest run tests/security/phase45-vault-prep.test.ts` | 0 | Preparation + model tests |

## What would unblock implementation

Phase 44 independent review disposition + physical Android harness evidence within scope + attachment format decision; then verify Phases 24/34 provisional scopes before implementing the canonical Phase 45 feature commit.

## Handoff

Stop before Phase 46. Vault remains disabled.
