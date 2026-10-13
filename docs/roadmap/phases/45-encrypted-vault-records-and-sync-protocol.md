# Phase 45 — Encrypted vault records and sync protocol

Group: Vault and Drive. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [44 — Vault cryptography and recovery proof](44-vault-cryptography-and-recovery-proof.md)
- [34 — Conflict recovery and offline hardening](34-conflict-recovery-and-offline-hardening.md)
- [24 — Private binary upload lifecycle](24-private-binary-upload-lifecycle.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain vault
- packages/sync vault
- apps/api vault
- infra/supabase migrations

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement versioned encrypted envelopes, encrypted attachment handling, key/device metadata, and authorization without server-held plaintext keys.
2. Exclude vault content from server search, previews, reminders, analytics, chat, and AI retrieval.
3. Implement encrypted export/recovery, enrollment/revocation, and conflict handling that preserves ciphertext versions.
4. Implement vault create/edit/trash and an encrypted folder hierarchy. Add a deliberate ordinary-to-vault resumable multi-step transfer workflow with short atomic state transitions that client-encrypts content/attachments, removes ordinary active indexes/previews/cache and versions through lifecycle jobs, preserves recoverable failure state, and discloses backup/prior-sharing limits.
5. Resolve attachment references before ordinary-to-vault cleanup: do not silently erase a binary still needed by another ordinary item; require moving all references or explicitly disclose the retained ordinary copy.

## Acceptance

- Server database/object/log inspection cannot recover vault body or encrypted attachment content.
- Unauthorized devices and tenants cannot access envelopes.
- Sync and export do not accidentally serialize decrypted values.
- Vault folder titles and content never appear in ordinary metadata views; cross-scope attachment links are rejected and transfer cleanup has observable completion.

## Verification and evidence

- Test envelope tamper, replay/version rules, unauthorized reads, revoked devices, and sync conflict preservation.
- Scan client/server persistence and telemetry paths for plaintext leaks.
- Test encrypted folder CRUD, transfer interrupted before/after ciphertext acceptance, normal search/cache/preview cleanup, cross-scope attachment rejection, backup-retention disclosure, and already-shared copy limits.
- Test shared ordinary attachment references during vault transfer and verify no unexpected data loss or misleading secrecy claim.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)
- [docs/architecture/sync-and-offline.md](../../architecture/sync-and-offline.md)

## Commit target

`feat(vault): add client-encrypted records and ciphertext synchronization`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
