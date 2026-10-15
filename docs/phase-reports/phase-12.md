# Phase 12: Server mutation receipts and change feed

Group: Foundation and sync. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [12 — Server mutation receipts and change feed](../roadmap/phases/12-server-mutation-receipts-and-change-feed.md)
- **Status:** `provisional` (Authorized provisional Phase 12 server development delivered and verified against real PostgreSQL; physical-device gates remain pending; Phase 13 client synchronization engine follows in Phase 13).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-15.
- **Base Git revision and branch:** `2f21532` on `main`.
- **Prerequisites:**
  - [Phase 08 — API contracts and service foundation](phase-08.md): Fastify REST service, canonical shared schemas, typed API client.
  - [Phase 10 — Personal workspace and preferences](phase-10.md): RLS tenant isolation, personal workspace provisioning, and member profile boundaries.
- **Included scope:**
  - **Commit-Safe Change Ordering & Row-Lock Protocol**:
    - Created `app.workspace_sync_state` with `next_change_seq bigint NOT NULL DEFAULT 1` and `access_epoch text NOT NULL`.
    - Implemented row-level lock protocol: `SELECT next_change_seq, access_epoch FROM app.workspace_sync_state WHERE workspace_id = $1 FOR UPDATE;` held inside PostgreSQL transaction until commit.
    - Guarantees strictly monotonic, gapless sequence numbers matching commit order. Maintains concurrent execution across different workspaces.
  - **Durable Mutation Receipts & Canonical Payload Hashing**:
    - Created `app.mutation_receipts` with unique constraint `uq_mutation_receipts_actor_device_op` on `(actor_user_id, device_id, operation_id)`.
    - Implemented `computeCanonicalPayloadHash` with deterministic object key sorting and SHA-256 over `(workspaceId, command, entityType, entityId, baseRevision, schemaVersion, payload)`.
    - Identical retries return durable receipts without creating duplicate changes or re-executing mutations.
    - Reused operation IDs with different payload or target workspace return status `rejected` and error code `IDEMPOTENCY_KEY_REUSED`.
    - Concurrent duplicate races are safely handled via unique constraint violation (code `23505`), safely re-reading the committed receipt.
  - **Ordered Change Feed & Tombstone Retention**:
    - Created `app.changes` indexed by `(workspace_id, seq ASC)` with unique constraint on `(workspace_id, seq)`.
    - Records entity type, entity ID, revision, `is_tombstone`, operation ID, change data, and timestamp.
    - Item deletions write tombstones (`is_tombstone = true`) retained across the 90-day offline horizon.
  - **Opaque Checkpoint Cursors & Safe Reset Protocol**:
    - Encodes/decodes base64url cursor: `{ v: 1, ws: string, seq: number, epoch: string, ts: string }`.
    - Cursors exceeding 90 days (`SUPPORTED_OFFLINE_HORIZON_MS`) or encountering access epoch mismatch return HTTP 409 Conflict with message `SYNC_RESET_REQUIRED`.
    - Reset contract directs clients to perform a clean bootstrap snapshot while strictly preserving local unsent drafts.
  - **Snapshot Bootstrap**:
    - `GET /v1/sync/bootstrap`: returns active items (`deleted_at IS NULL`) paired with high-watermark cursor `next_change_seq - 1`. Tombstoned items are excluded.
  - **Foundation Commands & Batch Processing**:
    - Implemented minimal foundation commands: `createItem`, `updateItem`, `archiveItem`, `unarchiveItem`, `pinItem`, `unpinItem`, `trashItem`, `restoreItem`.
    - `POST /v1/sync/push`: processes up to 50 commands with independent per-command transaction isolation in dependency order.
    - Partial batch success: failing commands (e.g. revision conflict) return individual error results without rolling back successful commands.
  - **Transactional Outbox Intents**:
    - Created `app.outbox_intents` with status `pending`, recorded atomically with mutations. Outbox delivery workers confirmed outside scope.
  - **PostgreSQL Migration**:
    - Applied `infra/supabase/migrations/00010_server_mutation_receipts_and_change_feed.sql`.
    - Configured Row Level Security (RLS) policies and granted least-privilege permissions to `daynori_runtime`.
  - **Shared Contracts & Client**:
    - Defined schemas in `@daynori/contracts` (`SyncCommandSchema`, `SyncPushRequestSchema`, `SyncPushResponseSchema`, `SyncPullQuerySchema`, `SyncPullResponseSchema`, `SyncBootstrapQuerySchema`, `SyncBootstrapResponseSchema`).
    - Added `syncPush`, `syncPull`, and `syncBootstrap` to `@daynori/api-client`.
    - Synchronized OpenAPI 3.0.3 specification without drift (`tests/contract/contract.test.ts`).
  - **Architecture Decision Record**:
    - Recorded design in [ADR-0018: Commit-Safe Change Ordering and Durable Mutation Receipts](../decisions/0018-commit-safe-change-ordering-and-mutation-receipts.md).
- **Prerequisite repairs applied in subsequent hardening**:
  - Deterministic topological dependency ordering in `pushBatch` with 3-color DFS cycle rejection (`DEPENDENCY_CYCLE`).
  - Terminal failure persistence for missing and failed dependencies (`DEPENDENCY_MISSING`, `DEPENDENCY_FAILED`).
  - Rechecking mutation receipts inside `workspace_sync_state` lock to guarantee idempotent concurrent retries.
  - Constraint-specific duplicate recovery strictly targeting `uq_mutation_receipts_actor_device_op`.
  - Recursive key-sorted canonical hashing over command version, dependencies, and nested payloads.
  - Complete projection in `bootstrap` (revision, rank, isArchived, isPinned, securityScope) under `REPEATABLE READ` snapshot isolation.
  - Integrated REST API writes (`POST` / `DELETE` items) into the change feed and monotonic sequence.
  - Explicit nullable `folderId` update support and tombstone preservation (`ENTITY_TOMBSTONED`).
  - Access epoch rotation on workspace membership changes and receipt RLS repair enforcing active workspace viewer role.
- **Excluded/deferred scope:**
  - Client synchronization engine, offline queue draining, background workers, and conflict UI — deferred to Phase 13.
  - Outbox delivery workers — deferred to background worker phases.
  - Product domain entity workflows (notes, todos, routines, journals) — deferred to Phase 14+.
  - Physical Android TalkBack hardware release gates (Phases 04, 06, 09, 11) — remain pending physical hardware.

## Result

Delivered the complete Phase 12 server synchronization infrastructure across PostgreSQL migrations, Fastify API routes, domain repository, service layer, shared validation contracts, and typed API client.

Verified under real PostgreSQL:

1. **Durable Idempotency**: Sequential retries, concurrent duplicate races, and response loss simulations return the identical durable receipt without duplicate changes.
2. **Commit-Safe Monotonicity**: 8 concurrent writers on the same workspace are serialized by the row lock, producing strictly contiguous and gapless sequence numbers (`seq` 1, 2, 3, ...).
3. **Optimistic Concurrency**: Stale base revisions return `REVISION_CONFLICT` with preserved current server revision and server state.
4. **Failure Isolation**: Multi-command batches commit valid commands independently of conflicting commands.
5. **Cursor Lifecycle**: Cursors older than 90 days or with altered access epochs return `SYNC_RESET_REQUIRED`.
6. **Cross-Tenant Boundaries**: Unauthorized users are rejected with `FORBIDDEN` on push, pull, and bootstrap.
7. **Dependency Graph Integrity**: Validated topological ordering, cycle rejection, and missing/failed dependency isolation.
8. **REST API Sync Integration**: Resource writes through standard endpoints allocate monotonic change sequences and feed events.

## Acceptance evidence

| Acceptance Condition                  | Verification Method                                                                                       | Location / Artifact                                           | Result                                                                                         |
| :------------------------------------ | :-------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------ | :--------------------------------------------------------------------------------------------- |
| **Commit-Safe Sequence Ordering**     | Row-lock protocol on `app.workspace_sync_state` held through commit; verified via concurrent writers test | `tests/integration/phase12-sync-receipts-change-feed.test.ts` | **PASS**: 8 concurrent writers serialized with strictly contiguous, unique sequences.          |
| **Durable Idempotency**               | Duplicate sequential & concurrent push with identical operation ID & payload                              | `tests/integration/phase12-sync-receipts-change-feed.test.ts` | **PASS**: Returns original receipt (`revision`, `seq`); no duplicate change generated.         |
| **Idempotency Key Reuse Detection**   | Reused operation ID with altered payload or target workspace                                              | `tests/integration/phase12-sync-receipts-change-feed.test.ts` | **PASS**: Rejected with status `rejected` and code `IDEMPOTENCY_KEY_REUSED`.                   |
| **Revision Conflict Preserved State** | Stale base revision pushed against modified item                                                          | `tests/integration/phase12-sync-receipts-change-feed.test.ts` | **PASS**: Returns status `conflict`, code `REVISION_CONFLICT`, with server revision and state. |
| **Opaque Cursor & Horizon Expiry**    | Pull with cursor older than 90 days or mismatched epoch                                                   | `tests/integration/phase12-sync-receipts-change-feed.test.ts` | **PASS**: Throws HTTP 409 `SYNC_RESET_REQUIRED`.                                               |
| **Bootstrap Watermark Pairing**       | Bootstrap query returning active items and watermark cursor                                               | `tests/integration/phase12-sync-receipts-change-feed.test.ts` | **PASS**: Returns active items; pull with watermark cursor yields 0 new changes.               |
| **Cross-Tenant RLS Enforcement**      | User B attempts to push, pull, or bootstrap User A workspace                                              | `tests/integration/phase12-sync-receipts-change-feed.test.ts` | **PASS**: Rejected with `FORBIDDEN` (403/404).                                                 |
| **Batch Partial Success**             | Batch containing valid command and conflicting command                                                    | `tests/integration/phase12-sync-receipts-change-feed.test.ts` | **PASS**: Valid command committed; conflicting command isolated.                               |
| **Topological Dependency Order**      | Out-of-order parent-child batch with cycle detection                                                      | `tests/integration/phase12-sync-receipts-change-feed.test.ts` | **PASS**: Parent executed before child; cycles rejected with `DEPENDENCY_CYCLE`.                |
| **OpenAPI Drift Verification**        | Automated drift check against canonical OpenAPI 3.0.3 spec                                                | `tests/contract/contract.test.ts`                             | **PASS**: Routes `/v1/sync/push`, `/pull`, `/bootstrap` verified.                              |
| **Monorepo Type Safety & Lint**       | Strict TypeScript and ESLint across all 13 workspaces                                                     | `pnpm typecheck` & `pnpm lint`                                | **PASS**: 0 errors across 13 projects.                                                         |
| **Secret Audit**                      | Custom repository secret scanner (`scripts/scan-secrets.mjs`) of all files, commits, and diffs           | `node scripts/scan-secrets.mjs`                               | **PASS**: 0 secrets detected across 1496 files.                                                |
