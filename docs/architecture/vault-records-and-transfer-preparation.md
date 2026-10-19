# Phase 45 preparation — encrypted vault records, sync, and transfer

**Status:** `blocked/prepared`. ADR 0043 prohibits production vault tables, sync routes, and unlock screens until Phase 44 gates pass. This document and the synthetic fixtures under `tests/security/vault/phase45-prep/` are disconnected from application execution.

**Prerequisites consulted:** Phase 44 (blocked), Phase 34 (conflict/offline), Phase 24 (binary upload lifecycle).

---

## 1. Versioned ciphertext envelopes and metadata

### Stored objects (planned schema — not migrated)

| Object | Ciphertext fields | Server-visible metadata |
|---|---|---|
| `vault_items` | title envelope, body envelope | workspace_id, item id, kind, revision, key_version, schema_version, byte sizes, timestamps, tombstone |
| `vault_folders` | name envelope | hierarchy pointers (ids only), rank, revision |
| `vault_attachments` | filename envelope, content ciphertext / stream handle | parent item id, size, content hash of ciphertext, upload state |
| `vault_key_devices` | device wrap envelope | device id, wrap purpose, enrolled_at, revoked_at, key_version |

All envelopes use Phase 44 profile v1. Encrypted titles/folder names never appear in ordinary search indexes.

### Authorization invariants

- Every request scoped to authorized workspace + **current** membership.
- Device epoch / enrollment check before accepting vault mutations (when devices exist).
- Object-level ACL: only owner workspace; no cross-tenant id oracle via distinguishable errors where avoidable.
- Cross-scope attachment references (ordinary ↔ vault) **rejected**.

---

## 2. Ciphertext-only mutation receipts, sync, conflicts, tombstones

- Mutation receipts hash **ciphertext envelopes + metadata**, never plaintext.
- Change feed emits opaque envelopes; sync engine stores ciphertext in local vault stores only after unlock decrypt-on-read.
- Conflicts: preserve both ciphertext versions (Phase 34 patterns) without server merge of plaintext.
- Tombstones: durable delete markers; sync must not resurrect without explicit undo envelope.
- Encrypted export/recovery packages: ciphertext + key wraps; plaintext export only via explicit unlocked client path (later phase).

### Replay / version handling

- Clients accept envelopes only if `(itemId, revision, keyVersion)` advances per checkpoint policy.
- Resumable key upgrades: track `key_upgrade_cursor`; never claim complete while DEKs remain on old VRK.
- Fresh-device recovery without checkpoint: document reduced rollback resistance until first trusted sync.

---

## 3. Exclusion surfaces

Vault content must be excluded from:

- Ordinary search / FTS / trigram indexes
- Previews and thumbnail pipelines
- Reminder / notification bodies
- Analytics and crash breadcrumbs
- Chat / rooms sharing
- AI retrieval / transcription

Implementation plan: deny-lists in search indexer, notification formatter, export default filters, and AI context builders — verified by leak-scan tests in Phase 45 implementation (when unblocked).

### Plaintext leak prevention

| Channel | Rule |
|---|---|
| Local storage / IndexedDB / SQLite | Ciphertext only while locked; plaintext memory-only when unlocked |
| Logs / errors | Envelope ids and error codes only |
| Caches / CDNs | No vault plaintext |
| Queues / outbox | Ciphertext payloads + opaque operation ids |
| Telemetry | Counts/timings only |

---

## 4. Ordinary → vault transfer state machine

Goal: preserve **at least one verified recoverable copy** throughout. Upload success or a metadata flag is **not** completion.

```
┌─────────────┐
│  proposed   │  user confirms source + reference consequences
└──────┬──────┘
       ▼
┌─────────────┐
│ encrypting  │  client-side encrypt title/body/attachments → local vault drafts
└──────┬──────┘
       ▼
┌─────────────┐
│ uploading   │  idempotent ciphertext upload (resume-safe); ordinary source untouched
└──────┬──────┘
       ▼
┌──────────────────────┐
│ ciphertext_accepted  │  server ack + client decrypt verify of stored envelopes
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ cleanup_ordinary     │  remove ordinary indexes/previews/cache/versions via jobs
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ transfer_complete    │  only when cleanup observable OR explicit disclosure retained
└──────────────────────┘

Failure branches: encrypt_failed | upload_failed | verify_failed | cleanup_failed
→ retain ordinary source; retain any accepted ciphertext for retry; never delete last copy.
```

### Transition rules

1. **Client-side encryption** before any vault persistence.
2. **Idempotent retries** keyed by transfer operation id; short atomic DB transitions.
3. **Verified ciphertext acceptance** (round-trip decrypt or tag verify against expected AAD) before destructive ordinary cleanup.
4. **Recoverable failure states** survive process death (Phase 34 offline hardening).
5. **Observable cleanup** of ordinary search indexes, previews, caches, applicable versions.
6. **Shared binary references:** if another ordinary item still references a file, do not erase the blob; require move-all-references or **explicit disclosure** that an ordinary copy remains.
7. **Disclosure:** backup retention and already-shared copies cannot be made secret retroactively.

### Negative claims forbidden in UI copy

- “Moved to vault” while `cleanup_ordinary` pending
- “Secure” while ordinary copy explicitly retained
- “Revoked from backups” for provider backups outside app control

---

## 5. Implementation / review plan (when Phase 44 unblocks)

1. Confirm independent review disposition + device/browser harness evidence scope covers this design.
2. ADR amendment for chosen attachment streaming format.
3. Migrations for `app.vault_*` under feature flag default-off.
4. Contracts in `@daynori/contracts`, domain in `@daynori/domain`, sync adapters, API routes with tenant checks.
5. Integration tests: tamper, unauthorized read, conflict preservation, transfer interrupt before/after acceptance, cross-scope rejection, leak scans.
6. **Do not** enable unlock UI until Phases 46–47.

---

## 6. Synthetic fixtures (disconnected)

See `tests/security/vault/phase45-prep/`. These fixtures must not import application route modules or register Fastify plugins.
