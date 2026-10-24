# ADR-0019: Shared Client Synchronization Engine

## Status

Accepted (Provisional client synchronization engine delivered; verified against real PostgreSQL and browser IndexedDB; physical Android hardware and TalkBack verification remain pending).

## Context

Phase 13 delivers the shared client-side synchronization engine across web and mobile platforms for Daynori. Building on the local-first storage architecture ([ADR-0004](0004-offline-command-sync.md), [ADR-0009](0009-offline-storage-and-session-persistence.md), [ADR-0017](0017-local-storage-and-encryption-key-lifecycle.md)) and the server receipt protocol ([ADR-0018](0018-commit-safe-change-ordering-and-mutation-receipts.md)), the client synchronization engine coordinates offline mutations, incremental pulls, multi-tab execution, and conflict lifecycle.

The client engine must satisfy the following critical architectural invariants:

1. **Atomic Local Projection & Draft Save**: Any user edit or creation must write to local storage (projection header and draft) and enqueue an immutable mutation atomically before returning to the caller. Local save must succeed even when offline.
2. **Explicit Decoupled State**: Local save status ("Saved on this device") must be strictly separated from cloud synchronization status ("Synced", "Syncing", "Offline", "Conflict", "Error"). An unacknowledged mutation must never be marked as synced.
3. **Deterministic Dependency-Aware Queue Draining**: When sending batches of mutations, operations must be topologically sorted respecting `dependencyOperationIds` so that parent creations precede dependent updates or deletions.
4. **Transactional Acknowledgment & Crash Resilience**: A pending mutation must only be removed from the local queue when the durable server receipt is committed locally to storage. If a crash or network disconnect occurs after the server commits but before acknowledgment is received, the client must safely replay the identical operation on restart, where the server's durable receipt deduplicates it without creating duplicate change feed entries.
5. **Multi-Tab Coordination & Leader Election**: In browser environments with multiple open tabs, only one leader tab performs network synchronization against the backend. Follower tabs route synchronization requests to the leader via `BroadcastChannel`. If the leader tab crashes or closes, followers detect the expired lease and elect a new leader.
6. **Explicit Conflict Lifecycle**: When the server returns `REVISION_CONFLICT`, the client must preserve both the local user intent and current server state. It must never silently overwrite or discard either version. Resolution must mint a fresh operation ID referencing the current server revision; it must never reuse the rejected operation ID or base revision.
7. **Safe Snapshot Reset**: When receiving `SYNC_RESET_REQUIRED` (e.g. cursor older than 90 days or access epoch rotated), the client must reconstruct its local projection from a fresh bootstrap snapshot while strictly preserving unsent local drafts, pending mutations, and active conflict state.
8. **Operational Diagnostics Without Secrets**: Operational diagnostics must expose metrics (queue length, network status, cloud status, consecutive failures, last synced revision) without leaking passwords, tokens, encryption keys, or private user content.

## Decision

### 1. Engine Architecture & Package Structure

The synchronization subsystem is implemented in `packages/sync` with zero framework dependencies, exposing:

- `SyncEngine`: The central finite state machine coordinating queue draining, change pulling, retry backoff, and lifecycle transitions.
- `SyncTransportPort`: Abstract transport interface implemented by `ApiClientSyncTransport` wrapping `@daynori/api-client`.
- `TabCoordinationPort`: Multi-process coordination contract implemented by `BroadcastChannelTabCoordinator` (web) and `SingleProcessCoordinator` (mobile/node).
- Platform adapters:
  - `apps/web/src/data/syncAdapter.ts`: `createWebSyncEngine` integrating `IndexedDbLocalRepository` and `BroadcastChannelTabCoordinator`.
  - `apps/mobile/src/data/syncAdapter.ts`: `createMobileSyncEngine` integrating `SqliteLocalRepository` and `SingleProcessCoordinator`.

### 2. Transactional Write & Enqueue Protocol

When `engine.saveItem(item, draft, command, options)` is invoked:

1. Resolves dependency operations: if previous pending mutations exist for the target entity, the new mutation automatically includes them in `dependencyOperationIds`.
2. Encapsulates the mutation envelope with a freshly minted UUID `operationId`, client timestamp, and the current `serverRevision` as `baseRevision`.
3. Atomically commits the draft (if present), the mutation record, and the item projection header to the local repository.
4. Marks the entity's in-memory state as `{ savedOnDevice: true, cloudSyncStatus: 'saved_locally' }`.
5. If the engine is online and `autoSync` is not disabled, requests immediate synchronization via the tab coordinator.

### 3. Queue Draining & Monotonic Incremental Pulls

In each synchronization cycle:

1. **Pull First**: Pulls incremental server changes using the stored cursor.
   - For each change, updates the local projection header if `change.revision > existing.serverRevision`.
   - Protects tombstones: does not resurrect deleted entities unless the incoming change is an explicit restoration with higher revision.
   - Advances the cursor atomically with the applied changes.
   - If the server returns HTTP 409 `SYNC_RESET_REQUIRED`, catches the error and executes `resetAndBootstrap()`: downloads a complete snapshot, upserts active items, and updates the watermark cursor while keeping all unsent local drafts and pending mutations intact.
2. **Push Pending**:
   - Queries pending mutations from local storage.
   - Performs a topological sort respecting `dependencyOperationIds`.
   - Takes a batch of up to 50 operations and sends them via `transport.push({ commands })`.
   - On receipt of server results:
     - `accepted`: updates projection `serverRevision`, deletes the pending mutation from storage, marks state as `synced`.
     - `conflict`: creates an explicit `ConflictRecord`, retains the mutation in local storage with status `failed`, sets item state to `conflict`, and emits `conflict_detected`.
     - `rejected`: retains the mutation in local storage with status `failed` and server rejection error.
3. **Bounded Exponential Backoff with Jitter**:
   - If an iteration fails due to a network error, schedules a retry using bounded exponential backoff:
     `delay = min(maxDelayMs, initialDelayMs * factor ^ failures) * (1 ± jitter)`.
   - Consecutive failures reset to 0 upon any successful pull/push.

### 4. Tab Coordination & Leader Election

`BroadcastChannelTabCoordinator` implements lease-based leader election:

- Emits periodic heartbeats every `heartbeatIntervalMs` (default 1000ms).
- A tab claims leadership if no heartbeat has been observed for longer than `leaseDurationMs` (default 3000ms).
- Tie-breaking: if two tabs claim leadership simultaneously, the tab with the lexicographically lower `tabId` wins and the other tab yields.
- Follower tabs forward manual or auto-sync triggers by sending `{ type: 'sync_requested' }` to the leader.
- When the leader tab resigns or closes, it broadcasts `{ type: 'leader_resigning' }`, prompting followers to immediately initiate an election without waiting for the full lease expiration.

### 5. Explicit Conflict Recovery

When a conflict occurs:

- The user or UI is presented with the conflict through `engine.getConflicts()`.
- The user may select:
  - `keep_local`: takes the local payload, deletes the rejected mutation, and mints a fresh mutation record with a new `operationId` and `baseRevision = conflict.serverRevision`.
  - `keep_server`: accepts the server version, discards the rejected local mutation, and updates local state to `synced`.
  - `custom`: merges fields into a custom payload, mints a fresh mutation record with a new `operationId` and `baseRevision = conflict.serverRevision`.
- Invariant: The rejected operation ID and stale base revision are never reused.

### 6. Privacy & Safety Guarantees

Diagnostics returned by `engine.getDiagnostics()` strictly contain operational metadata:

- `workspaceId`, `userId`, `deviceId`, `networkStatus`, `cloudSyncStatus`, `isLeader`, `queueLength`, `inFlightCount`, `failedCount`, `consecutiveFailures`, `activeConflictsCount`, `lastSyncedAt`, `lastSyncSequence`, `accessEpoch`.
- Passwords, access tokens, encryption keys, draft contents, and personal notes are excluded.

## Consequences

- Web and mobile platforms share 100% identical synchronization state machine logic, retry algorithms, and conflict contracts.
- Offline edits survive process crashes, page reloads, and network drops with zero data loss.
- Multi-tab browser sessions execute safely without write contention or redundant network requests.
- Conflicts are transparently resolved by users rather than suffering silent data loss from "last write wins" strategies.
- Software tests verify all 7 core fault scenarios; physical Android and TalkBack gates remain explicitly tracked and pending hardware execution.
