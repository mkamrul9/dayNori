# ADR-0018: Commit-Safe Change Ordering and Durable Mutation Receipts

## Status

Accepted (Provisional server synchronization infrastructure delivered; Phase 13 shared client engine and offline sync manager to follow).

## Context

Phase 12 establishes the foundational server synchronization infrastructure for Daynori, providing durable idempotency receipts, a commit-safe ordered change feed, and an opaque cursor checkpoint protocol. Under the local-first architecture ([ADR-0004](0004-offline-command-sync.md) and [ADR-0009](0009-offline-storage-and-session-persistence.md)), mobile and web clients push offline mutations, pull incremental changes, and bootstrap local storage.

The server synchronization subsystem must satisfy strict consistency, integrity, and authorization invariants:

1. **Commit-Safe Monotonic Ordering**: The server must assign strictly monotonic change feed sequences (`seq`) that match transaction commit order. Gaps, out-of-order changes, or uncommitted sequence leaks are unacceptable.
2. **Durable Idempotency**: Network retries or duplicate client requests must be safely deduplicated using `(actor_user_id, device_id, operation_id)`. Replaying identical operations must return the original durable receipt without creating duplicate changes or re-executing side effects.
3. **Idempotency Key Reuse Protection**: Reusing an `operationId` with different payloads, different commands, or different target workspaces must be detected and rejected with `IDEMPOTENCY_KEY_REUSED`.
4. **Optimistic Concurrency & Explicit Conflicts**: Stale base revisions must produce an explicit `REVISION_CONFLICT` result preserving current server revision and server state rather than silently overwriting concurrent changes.
5. **Cursor Expiry & Access Epoch Invalidation**: The server must define a bounded offline horizon (90 days). If a client cursor exceeds the horizon or the workspace access epoch changes (e.g. membership change), the server must return `SYNC_RESET_REQUIRED`, directing the client to perform a clean bootstrap snapshot without discarding unsent local drafts.
6. **Cross-Tenant Authorization & Least Privilege**: Every sync push, pull, and bootstrap operation must verify caller authentication, tenant context, and workspace role (`editor` for mutations; `viewer` for pulls/bootstraps) under PostgreSQL Row Level Security (RLS) using the unprivileged `daynori_runtime` role.

## Decision

### 1. Workspace Sync State Row Lock Protocol

To guarantee that change feed sequences are strictly contiguous and strictly match transaction commit order:

- Each workspace maintains a single sync state record in `app.workspace_sync_state`:
  ```sql
  CREATE TABLE app.workspace_sync_state (
      workspace_id uuid PRIMARY KEY REFERENCES app.workspaces(id) ON DELETE CASCADE,
      next_change_seq bigint NOT NULL DEFAULT 1,
      access_epoch text NOT NULL DEFAULT gen_random_uuid()::text,
      updated_at timestamptz NOT NULL DEFAULT now()
  );
  ```
- Before executing any domain mutation or generating a change feed entry, the transaction acquires an exclusive row lock:
  ```sql
  SELECT next_change_seq, access_epoch
  FROM app.workspace_sync_state
  WHERE workspace_id = $1
  FOR UPDATE;
  ```
- The row lock is held until `COMMIT`. This serializes feed-affecting mutations strictly within the target workspace, guaranteeing that `seq` values are strictly monotonic without gaps.
- Concurrency across different workspaces is preserved: transactions on workspace A never block transactions on workspace B.

### 2. Durable Mutation Receipts & Canonical Payload Hashing

- All mutations write a durable receipt to `app.mutation_receipts` with a unique constraint on `(actor_user_id, device_id, operation_id)`.
- The receipt records `status`, `accepted_revision`, `applied_change_seq`, `result_payload`, and `canonical_payload_hash`.
- `computeCanonicalPayloadHash` normalizes the mutation envelope by sorting all payload and command object keys deterministically before computing a SHA-256 digest:
  `canonicalPayloadHash = SHA256(canonicalJson({ workspaceId, command, entityType, entityId, baseRevision, schemaVersion, payload }))`.
- Idempotency lifecycle:
  - If a receipt exists with matching `workspaceId` and `canonicalPayloadHash`, the server returns the existing result immediately without incrementing sequences or writing changes.
  - If a receipt exists with mismatched `workspaceId` or mismatched `canonicalPayloadHash`, the server rejects the request with status `rejected` and code `IDEMPOTENCY_KEY_REUSED`.
  - Concurrent duplicate race conditions are caught via PostgreSQL error code `23505` (unique constraint violation), safely re-reading the committed receipt.

### 3. Ordered Change Feed & Tombstone Retention

- Changes are recorded in `app.changes (workspace_id, seq, entity_type, entity_id, revision, is_tombstone, operation_id, change_data, created_at)`.
- Unique constraint `uq_changes_workspace_seq UNIQUE (workspace_id, seq)` and index `idx_changes_workspace_seq (workspace_id, seq ASC)` provide high-performance linear pagination.
- Item deletions are recorded as tombstones (`is_tombstone = true`) and remain in the change feed across the supported 90-day offline horizon so that offline clients receive explicit deletion events.

### 4. Opaque Cursor Lifecycle & Bootstrap Contract

- Sync cursors are opaque, URL-safe base64 strings encoding `{ v: 1, ws: string, seq: number, epoch: string, ts: string }`.
- Cursors are validated on pull:
  - **Schema Validation**: Invalid structure or unsupported cursor version (`v !== 1`) returns HTTP 400.
  - **Tenant Boundary**: Cursor `ws` must match query `workspaceId`.
  - **Supported Offline Horizon (90 days)**: If `Date.now() - cursor.ts > 90 days`, the server returns HTTP 409 Conflict with message `SYNC_RESET_REQUIRED`.
  - **Access Epoch**: If `cursor.epoch !== syncState.accessEpoch`, the server returns HTTP 409 Conflict with message `SYNC_RESET_REQUIRED`.
- On `SYNC_RESET_REQUIRED`:
  - Clients must reset their local sync position and call `GET /v1/sync/bootstrap`.
  - Clients **MUST NEVER** erase local uncommitted drafts or pending mutation queues.
- `GET /v1/sync/bootstrap`:
  - Fetches active items (`deleted_at IS NULL`).
  - Fetches current sync state `accessEpoch` and high-watermark sequence `nextChangeSeq - 1`.
  - Returns the consistent snapshot paired with its watermark cursor.

### 5. Atomic Effects & Failure Isolation in Batches

- Pushed batches (up to 50 commands) execute each command in its own database transaction in caller dependency order.
- Each command atomically commits:
  1. Domain entity modification (`app.items`).
  2. Workspace sync counter increment (`app.workspace_sync_state`).
  3. Change feed record (`app.changes`).
  4. Outbox intent record (`app.outbox_intents`).
  5. Mutation receipt (`app.mutation_receipts`).
- If an individual command fails (e.g. revision conflict), that command rolls back completely leaving zero partial effects. Preceding or succeeding independent commands in the batch are committed independently.
- HTTP 200 response contains an array of `MutationResult` objects detailing individual status (`accepted`, `conflict`, `rejected`).

## Consequences

### Positive

- **Strict Consistency**: No gaps or phantom sequence numbers can appear in the change feed.
- **Robust Idempotency**: Retried push requests return identical receipts safely under network timeouts, response packet loss, or client crashes.
- **Cross-Tenant Safety**: Enforced at the PostgreSQL RLS layer with least-privilege `daynori_runtime` role.
- **Predictable Recovery**: 90-day offline horizon and access epoch checks ensure clients resynchronize cleanly after membership revocation or prolonged disconnection.

### Tradeoffs & Limitations

- **Workspace Lock Contention**: Serializing writes via `FOR UPDATE` on `workspace_sync_state` serializes concurrent mutations within the same workspace. This is optimal for personal workspaces and small collaborative rooms (typical Daynori workspaces), while multi-workspace operations scale linearly across CPU cores.
- **Outbox Worker Separation**: `app.outbox_intents` records event intents transactionally, but outbox delivery workers remain decoupled and are implemented in later background worker phases.
