# Sync and offline protocol

Status: protocol baseline to implement and prove before multiple-device editing is released.

## Product contract

Mobile users can read cached ordinary items and create/edit notes, todos, routines, journals and expenses offline. Each local change displays `Saved on this device`, `Syncing`, `Synced`, `Conflict`, or `Needs attention`. Never label an unacknowledged local mutation as safely backed up. File metadata can be queued offline; uploading an uncached binary and server integrations require a connection. Web offline caching requires explicit trusted-device consent and remains subject to browser eviction.

The server owns accepted state, revision order, access control and durable receipts. The local database owns drafts, cache, pending operations and recoverable conflict copies. Sync is not a backup.

## Local write transaction

1. Validate with shared domain rules and generate UUIDs for new entities.
2. Write the optimistic projection and an operation into the local database atomically.
3. Operation fields: `operationId`, `deviceId`, `workspaceId`, command type, schema version, entity ID, base revision, required dependency operation IDs, creation time and canonical payload. Do not include auth tokens or provider credentials.
4. Sync sends dependencies first. Keep the operation until a durable terminal result is applied locally. Retry with the same operation ID and identical payload after timeouts; never mint a new ID just because the response was lost.

The local queue must survive crashes, app restarts and migration. A failed local transaction cannot show a successfully saved edit. Logout offers to sync/export unresolved drafts and explains their state; forced account/device revocation wipes credentials and cache as soon as the client observes it.

## Push and idempotency

`POST /v1/sync/push` accepts at most 50 commands and a bounded request body. Each command commits independently, in dependency order. A result includes operation ID, accepted revision, cursor/change references and status. The API must document partial success; a batch is not one transaction.

Within each command transaction:

1. Recheck active user, device, workspace membership and command permission.
2. Look up the receipt unique on `(actor_user_id, device_id, operation_id)`. If present, require the same canonical payload hash and workspace; return its authorized result. A mismatched payload returns `IDEMPOTENCY_KEY_REUSED`.
3. Lock the workspace sync-state row before domain writes. Lock/check the affected entity and relevant collection revisions; validate tenant links and lifecycle.
4. Apply the command, increment entity revision, allocate the next workspace change sequence, and write change projection/tombstone, receipt, and outbox intents in the same transaction.
5. Commit before returning success. A lost response is resolved by the receipt on retry.

A duplicate race must serialize using the receipt unique constraint/lock and return the original result, not apply twice. Terminal conflicts and validation rejections can be receipted; transient infrastructure failures must not become permanently cached failures. Reading a stored receipt still requires current authorization. Do not leak a formerly shared item's payload to a removed room member.

Initial supported offline horizon is 90 days. Keep terminal receipts for at least 180 days and reject automatic replay of operations outside the supported horizon. Reconnect must offer a safe rebase/import of retained local drafts rather than discard them or replay old mutations blindly. Establish actual retention cost before launch.

## Pull and commit ordering

`GET /v1/sync/pull?workspaceId=...&cursor=...&limit=...` returns changes ordered by a monotonically increasing sequence per workspace and an opaque cursor. The cursor binds workspace, protocol version and retention epoch. Do not use timestamps, UUID order, a raw global sequence, or a PostgreSQL `bigserial` assigned before concurrent commits as a sync checkpoint: those can skip a transaction that commits late.

All mutations of a workspace acquire its sync-state row lock at transaction start and hold it through commit. The counter and changes therefore follow commit order. This serializes writes within one workspace, which is acceptable for the initial private workload; other workspaces proceed concurrently. Large shared-room workloads may justify a later proven ordered log design.

Change records include entity kind/ID/revision, command result projection or tombstone, and sequence. Local application of an entire pull page and advancement of its cursor happen in one database transaction. Applying an old/duplicate revision is a no-op. Persisted data must never lag the persisted cursor.

Membership changes increment the workspace access epoch and force reauthorization of every pull. A removed member receives a revoked result and clears that workspace cache, including attachments and local reminder schedules, on next contact. Previously downloaded bytes cannot be remotely recalled; state this limit for rooms.

## Bootstrap and expired cursors

A bootstrap returns a consistent workspace snapshot and its high-water cursor. For a small workspace, generate both in one repeatable-read transaction. For pagination, materialize an immutable snapshot/manifest with that cursor and short retention; never assemble separate live pages with one cursor. New changes after the watermark are subsequently pulled.

When cursor history is expired, return `SYNC_RESET_REQUIRED` with a new snapshot path. Preserve drafts and pending operations locally, install the snapshot into a fresh cache, then rebase pending commands against it. Show conflicts/deleted targets explicitly. Do not empty the operation queue as a side effect of reset.

## Conflict policy

Use optimistic concurrency with entity and collection revisions. Client clock time is never a conflict winner.

- Notes/journals/custom long text: preserve the original local draft, base version when available and current server version; offer compare, keep server, keep local as a new revision, or save a separate copy. Never silently overwrite paragraphs.
- Tasks/expenses/custom scalar fields: a stale revision returns a field-level conflict representation. The user chooses values; only provably independent field changes may merge automatically after that feature has specific tests.
- Routine completion: conflict-check the occurrence, not the routine template. A retry of the same operation is idempotent. Concurrent contradictory completion/skip corrections require an explicit resolution.
- Folder/reorder changes: validate cycle/depth/scope and sibling collection revision. Return current collection order on conflict; do not replay a stale drag position onto a changed tree.
- Delete versus edit: a tombstoned item remains deleted. Preserve the offline edit as a recoverable draft; restoration is a separate authorized command with a new revision.
- Vault: same protocol operates on opaque ciphertext/version envelopes. The server cannot merge plaintext; only an unlocked client can present a conflict comparison.

Each conflict resolution creates a new operation ID and references the rejected operation for audit. Keep draft copies until the resolution is acknowledged.

## Deletion and retention

Trash produces a new revision and tombstone rather than immediately erasing history. Retain sync tombstones/change history for at least the 90-day offline horizon. Hard deletion later removes payload and attachments according to the deletion runbook while retaining minimal non-content anti-resurrection markers until no supported device can replay the prior state. Restoring from trash is versioned.

Account deletion bypasses ordinary trash recovery: revoke sessions/devices/integration grants, block new work, purge active rows/objects/derived data through an auditable job, and expire backup copies on the published retention schedule. Keep only a minimal deletion suppression record where needed to prevent a disaster restore from resurrecting the account.

## Binary synchronization

Metadata sync and binary transfer are separate state machines. An upload reserves a file ID and immutable object key, obtains a limited capability, transfers bytes, then finalizes. Finalization verifies ownership, actual size/type/checksum and state; scan/preview work is durable. Orphan reservations/objects expire and are garbage-collected. Failed binary transfer must not create a falsely ready attachment.

Queueing a recording or file retains its local bytes until finalization/acknowledgment or explicit removal. Vault encryption finishes on the client before upload; plaintext never enters the ordinary upload or preview path.

## Required failure tests

Prove response loss after commit, duplicate concurrent push, restart during local write and pull, reordered change delivery, permission revocation, cursor expiry with pending drafts, 90-day-old queue rejection, offline delete/edit conflict, routine completion at midnight, folder cycle, expense duplicate retry, upload finalize twice, and interrupted vault sync. Use two users, two devices and a real PostgreSQL transaction test; a mocked success response is insufficient.
