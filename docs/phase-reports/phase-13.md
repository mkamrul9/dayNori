# Phase 13: Shared client synchronization engine

Group: Foundation and sync. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [13 — Shared client synchronization engine](../roadmap/phases/13-shared-client-synchronization-engine.md)
- **Status:** `provisional` (Authorized provisional Phase 13 client synchronization engine delivered and verified against real PostgreSQL and production browser IndexedDB; physical-device gates remain pending; Phase 14 follows).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-15.
- **Base Git revision and branch:** `d8d75b6` on `main`.
- **Prerequisites:**
  - [Phase 11 — Local data repositories and migrations](phase-11.md): Production IndexedDB and SQLite local repositories, trusted-device consent, quarantined draft persistence.
  - [Phase 12 — Server mutation receipts and change feed](phase-12.md): Monotonic change feed, durable mutation receipts, canonical hashing, cursor checkpoints, and snapshot bootstrap.
- **Included scope:**
  - **Atomic Local Projection & Draft Save Protocol**:
    - Implemented `SyncEngine.saveItem(item, draft, command, options)` performing an atomic write to local storage (projection header and draft) while enqueuing an immutable mutation record.
    - Guarantees immediate local persistence even when offline.
    - Decoupled state: marks `savedOnDevice: true` and `cloudSyncStatus: 'saved_locally'`. Never marks an unacknowledged mutation as synced.
  - **Dependency-Aware Queue Draining & Topological Ordering**:
    - Automatically resolves dependencies across pending mutations for the same entity or explicit options.
    - Topologically sorts the local mutation queue respecting `dependencyOperationIds` before dispatching batches of up to 50 commands.
    - Transports commands using canonical mutation schemas defined in `@daynori/contracts`.
  - **Transactional Acknowledgment & Crash Resilience**:
    - Retains pending mutations in durable storage until the server returns an acknowledgment (`accepted`).
    - Applies the durable revision to the local item projection and updates state to `synced` in the same local step.
    - Safe idempotent recovery: replaying identical operations after a lost response recovers the original receipt without creating duplicate changes on the server.
    - Queue survives engine crashes and restarts, draining successfully upon reconnection.
  - **Incremental Pulls & Monotonic Revision Application**:
    - Paginates through server change feed up to 100 changes per batch.
    - Discards stale out-of-order revisions (`existing.serverRevision >= change.revision`).
    - Enforces tombstone protection: deleted entities are not resurrected by older updates unless an explicit newer restore operation is received.
    - Advances the local sync cursor atomically with projection updates.
  - **Safe Snapshot Reset Protocol (`SYNC_RESET_REQUIRED`)**:
    - Catches HTTP 409 `SYNC_RESET_REQUIRED` triggered by 90-day horizon expiry or access epoch rotations.
    - Executes `resetAndBootstrap()`: reconstructs projection from a fresh bootstrap snapshot paired with a watermark cursor.
    - Strictly preserves unsent local drafts, pending mutation queue, and active conflicts across resets.
  - **Multi-Tab Browser Coordination & Leader Election**:
    - Implemented `BroadcastChannelTabCoordinator` for web browser environments.
    - Periodic heartbeat emission (1000ms) with lease expiration detection (3000ms).
    - Single leader executes background synchronization against the backend; follower tabs route sync requests to the leader.
    - Resignation broadcast (`leader_resigning`) on tab close allows immediate failover without waiting for lease timeout.
    - Implemented `SingleProcessCoordinator` for single-instance native mobile applications.
  - **Explicit Conflict Lifecycle**:
    - When the server detects a revision conflict, creates a durable `ConflictRecord` preserving both the local payload and current server revision/state.
    - Item state transitions to `conflict` and emits `conflict_detected`.
    - User resolution via `resolveConflict(conflictId, resolution, customPayload)`:
      - `keep_local` or `custom`: deletes rejected mutation, mints a fresh mutation record with a new `operationId` and `baseRevision = conflict.serverRevision`.
      - `keep_server`: accepts server version and marks item state as `synced`.
      - Invariant: Rejected operation IDs and stale base revisions are never reused.
  - **Operational Diagnostics Without Secrets**:
    - Exposes comprehensive diagnostic metrics via `getDiagnostics()`: queue length, in-flight count, network status, cloud status, consecutive failures, active conflicts, last synced timestamp, and sequence.
    - Passwords, access tokens, encryption keys, and draft contents are strictly excluded.
  - **Platform Adapters**:
    - Web adapter in `apps/web/src/data/syncAdapter.ts` (`createWebSyncEngine`).
    - Mobile adapter in `apps/mobile/src/data/syncAdapter.ts` (`createMobileSyncEngine`).
- **Prerequisite repairs completed in commit `d8d75b6`**:
  - Browser CDP test rewritten to load and exercise production `IndexedDbLocalRepository` bundle across 6 scenarios.
  - SQLite local repository hardened: enforced `requireSqlCipher: true`, genuine file-existence check, mutex `runWithLock` preventing concurrent transaction overlap.
  - Deterministic topological dependency ordering in server `pushBatch` with 3-color cycle detection.
  - Receipt rechecking inside workspace row lock for concurrent duplicate create race conditions.
  - Constraint-specific duplicate recovery strictly targeting `uq_mutation_receipts_actor_device_op`.
  - Recursive key-sorted canonical hashing over command versions and nested objects.
  - Full item projection in bootstrap under `REPEATABLE READ` snapshot isolation.
  - REST API write sync integration, nullable `folderId` update fix, tombstone preservation, device ID verification, receipt RLS repair, and access epoch rotation.
- **Excluded/deferred scope:**
  - Product domain entity workflows (notes, todos, routines, journals) — deferred to Phase 14+.
  - Outbox background delivery workers — deferred to background worker phases.
  - Physical Android TalkBack hardware release gates (Phases 04, 06, 09, 11, 13) — remain pending physical hardware.

## Result

Delivered the complete Phase 13 shared client synchronization engine in `packages/sync`, transport in `packages/api-client`, and platform integration in `apps/web` and `apps/mobile`.

Verified against the real PostgreSQL-backed API and production browser adapter:

1. **Offline Create/Edit followed by Reconnect**: Offline operations save with `saved_locally` status and push successfully upon reconnect to transition to `synced`.
2. **Lost Response Idempotent Recovery**: A network disconnection immediately following server commit is replayed with the identical operation ID and recovers the durable receipt without duplicate changes.
3. **Restart Durability**: Enqueued mutations persist across engine stops and drain automatically on restart.
4. **Multi-Tab Leader Election**: Follower tabs forward sync requests to the elected leader; crashing the leader tab triggers election and follower promotion within 1000ms.
5. **Dependency Ordering & Explicit Conflict Recovery**: Stale edits yield explicit conflicts; user resolution mints a fresh operation ID with updated base revision and syncs cleanly.
6. **Snapshot Reset Resilience**: Cursors encountering `SYNC_RESET_REQUIRED` execute snapshot bootstrap without losing unsent local drafts or pending mutations.
7. **Auth Loss & Safe Diagnostics**: HTTP 401 transitions engine to `needs_attention`; restoring credentials resumes sync; operational diagnostics expose zero secret or draft content.

## Acceptance evidence

| Acceptance Condition                   | Verification Method                                                                                     | Location / Artifact                                           | Result                                                                               |
| :------------------------------------- | :------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------ | :----------------------------------------------------------------------------------- |
| **Offline Create & Reconnect**         | Save item + draft offline; reconnect and verify state transitions and server commit                      | `tests/integration/phase13-client-sync-engine.test.ts`         | **PASS**: `saved_locally` -> `synced` at revision 1.                                |
| **Commit Followed by Lost Response**   | Fault transport simulating network drop post-commit; verify retry recovers receipt without duplicates    | `tests/integration/phase13-client-sync-engine.test.ts`         | **PASS**: Operation recovers receipt; exactly 1 change feed record created.         |
| **Restart Durability**                 | Offline write; stop engine; restart second engine against same storage and drain                        | `tests/integration/phase13-client-sync-engine.test.ts`         | **PASS**: Mutation persisted in IndexedDB; successfully drained on restart.          |
| **Multi-Tab Coordination & Election**  | Two `BroadcastChannelTabCoordinator` instances; leader crash failover and sync routing                  | `tests/integration/phase13-client-sync-engine.test.ts`         | **PASS**: Follower routes sync to leader; leader crash promotes follower.            |
| **Conflict Detection & Recovery**      | Server modification followed by stale local edit; explicit resolution with fresh operation ID           | `tests/integration/phase13-client-sync-engine.test.ts`         | **PASS**: Conflict detected; resolution mints new op ID at revision 2 -> synced at 3. |
| **Cursor Reset Draft Preservation**    | Pull returning 409 `SYNC_RESET_REQUIRED`; bootstrap reconstruction with unsent draft                    | `tests/integration/phase13-client-sync-engine.test.ts`         | **PASS**: Snapshot bootstrap succeeds; unsent local draft intact and pushed.         |
| **Auth Loss & Diagnostics Privacy**    | 401 error pausing sync, restored session resuming; verify diagnostics contain no tokens/content         | `tests/integration/phase13-client-sync-engine.test.ts`         | **PASS**: Status transitions cleanly; 0 tokens or private text in diagnostics JSON. |
| **Production Browser IndexedDB CDP**   | Real Microsoft Edge browser CDP execution testing consent, persistence, isolation, rollback, tabs      | `scripts/test-indexeddb-browser.mjs`                          | **PASS**: All 6 scenarios passed against real browser engine.                        |
| **Full Workspace Test Suite**          | Full Vitest run across 29 test files and 320 tests                                                      | `pnpm test`                                                   | **PASS**: 29/29 files passed, 320/320 tests passed.                                  |
| **Strict Typecheck & Lint**            | Strict TypeScript across 13 workspace projects and zero ESLint warnings/errors                          | `pnpm typecheck` & `pnpm lint`                                | **PASS**: 0 typecheck errors, 0 lint warnings/errors.                               |
| **Roadmap Planning Validation**        | Automated validator checking 64 phases, 22 requirements, local links                                    | `node scripts/validate-planning.mjs`                          | **PASS**: Planning validation passed cleanly.                                        |
| **Secret Audit**                       | Custom repository secret scanner checking all files and git diffs                                       | `node scripts/scan-secrets.mjs`                               | **PASS**: 0 secrets detected across 1504 files.                                      |

## Remaining gates and next steps

- **Remaining Hardware Gates**:
  - Physical Android execution and TalkBack accessibility navigation on real devices remain blocked by physical hardware availability.
  - Software development proceeds under owner authorization with hardware gates explicitly documented as blocked.
- **Next Ready Phase**:
  - Phase 14: Collections, folders, and shared item metadata (workspace folder hierarchy, item routing, rank, tags, and item links).
