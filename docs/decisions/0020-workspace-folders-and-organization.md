# ADR-0020: Workspace Folders, Collections, and Shared Item Metadata

## Status

Accepted (Provisional organization infrastructure delivered; verified against real PostgreSQL, change feed, outbox, and browser IndexedDB; physical Android hardware and TalkBack verification remain pending).

## Context

Phase 14 delivers the organization and classification infrastructure for Daynori across all supported item types. In accordance with the system design ([ADR-0002](0002-modular-monolith-and-managed-core.md), [ADR-0003](0003-typed-domains-and-configurable-sections.md)), Daynori maintains a single canonical workspace hierarchy rather than isolated folders per feature.

The organization infrastructure must satisfy the following critical architectural invariants:

1. **Unified Hierarchy**: All items (notes, tasks, routines, journals) and folders share a single workspace-scoped hierarchy. Folders themselves are items (`kind = 'folder'`) linked to typed metadata in `app.folders`.
2. **Inbox Semantics**: Items with `folder_id = NULL` reside in the workspace Inbox. Items may be moved between Inbox and any folder freely.
3. **Strict Depth Bounds**: Folder nesting is constrained to a maximum depth of 5 (`MAX_FOLDER_DEPTH = 5`). Subtree moves must verify that `target_parent_depth + moved_subtree_depth <= 5` so no descendant exceeds depth 5.
4. **Cycle Prevention**: A folder cannot be its own parent, nor can it be moved under any of its own descendants. Cycle validation must be enforced transactionally in the database.
5. **Security Scope Compatibility**: Folders and their contained items must maintain compatible security scopes (`standard` vs `vault`). An item in `vault` scope cannot be placed in a `standard` folder.
6. **Sparse Fractional Ranking**: Sibling ordering is determined by lexicographical rank strings with UUID tie-breakers. A rebalancing operation allows reclaiming rank spacing when consecutive insertions exhaust rank gap precision.
7. **Workspace-Scoped Tags**: Tags are workspace-scoped entities with case-insensitive unique names per workspace (`uq_tags_workspace_name`). Tags are attached to items via `app.item_tags` join records without copying or duplicating item feature bodies.
8. **Item-to-Item Associations**: Directed links between items are recorded in `app.item_links` with explicit link types (e.g. `related`, `blocks`, `references`). Self-links are forbidden.
9. **Explicit Folder Deletion Policies**:
   - `preserve_to_parent`: Direct child folders and items are reparented to the deleted folder's parent (or to Inbox `NULL` if deleted folder was at root).
   - `trash_subtree`: The folder and all its descendant folders and items are recursively tombstoned (`deleted_at = now()`).
10. **Sync & Outbox Integration**: All folder creations, renames, moves, reorders, archives, trashes, and restorations generate monotonic change feed entries (`app.changes`) and outbox intents (`app.outbox_intents`) for client synchronization.

## Decision

### 1. Database Schema & Invariant Enforcement

The organization subsystem is implemented in `infra/supabase/migrations/00012_organization_folders_and_metadata.sql`:

- `app.folders`: Typed folder metadata table referencing `app.items(workspace_id, id)` via composite foreign key with cascade deletion:
  ```sql
  CREATE TABLE IF NOT EXISTS app.folders (
      id uuid NOT NULL,
      workspace_id uuid NOT NULL,
      parent_id uuid,
      name text NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 120),
      color text CHECK (color IS NULL OR color ~* '^#[0-9a-f]{6}$'),
      icon text CHECK (icon IS NULL OR char_length(icon) <= 50),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, id),
      FOREIGN KEY (workspace_id, id) REFERENCES app.items (workspace_id, id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id, parent_id) REFERENCES app.folders (workspace_id, id) ON DELETE RESTRICT
  );
  ```
- `app.validate_folder_parent()`: PL/pgSQL validation trigger function that executes on `INSERT` or `UPDATE` of `app.folders`:
  - Verifies parent exists, belongs to the same workspace, and has `deleted_at IS NULL`.
  - Walks ancestor hierarchy to detect cycles (`curr = parent_id`).
  - Computes target parent depth and moved subtree depth to enforce `depth <= 5`.
  - Verifies security scope compatibility.
- `app.tags`: Workspace-scoped tags with case-insensitive unique index:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_workspace_name ON app.tags (workspace_id, lower(name));
  ```
- `app.item_tags`: Composite join table `(workspace_id, item_id, tag_id)` with foreign keys to `app.items` and `app.tags`.
- `app.item_links`: Directed item link table `(workspace_id, source_item_id, target_item_id, link_type)` with check `source_item_id != target_item_id`.

### 2. Domain Logic & Contracts

- `packages/domain/src/organization.ts`:
  - `MAX_FOLDER_DEPTH = 5`.
  - `isInboxItem(folderId)`: returns `folderId === null`.
  - `compareRanks(rankA, idA, rankB, idB)`: lexicographical comparison with UUID tie-breaker.
  - `generateInitialRank()` / `generateBetweenRanks()`: computes midpoint keys for sparse ordering.
  - `rebalanceRanks()`: redistributes sibling ranks evenly spaced by step 1000.
  - `detectCycle()`: walks parent links to detect cycle conditions client-side.
- `packages/contracts/src/api/organization.ts`:
  - Schemas for `CreateFolderRequest`, `UpdateFolderRequest`, `MoveFolderRequest`, `ReorderFolderRequest`, `ArchiveFolderRequest`, `PinFolderRequest`, `FolderDeletePolicy` (`preserve_to_parent` | `trash_subtree`), `CreateTagRequest`, `CreateItemLinkRequest`, and their response envelopes.
- `packages/contracts/src/api/sync.ts`:
  - Extended `SyncCommandTypeSchema` with folder operations (`createFolder`, `updateFolder`, `moveFolder`, `reorderFolder`, `archiveFolder`, `trashFolder`, `restoreFolder`).

### 3. Service Layer & API Routes

- `apps/api/src/modules/organization/service.ts`:
  - Implements transactional folder CRUD, moves, reorders, archives, pins, deletions, and restorations under PostgreSQL serializable or row-locked transactions (`FOR UPDATE`).
  - Emits changes to `app.changes` and outbox intents to `app.outbox_intents`.
  - Validates folder delete policies: `preserve_to_parent` moves direct children to target parent, while `trash_subtree` recursively sets `deleted_at = now()`.
  - Implements tag management and item-tag attachments.
  - Implements item-to-item directed links.
- `apps/api/src/routes/v1/organization.ts`:
  - Fastify routes mounted at `/v1/workspaces/:workspaceId/folders*`, `.../tags*`, `.../items/:itemId/tags*`, and `.../items/:itemId/links*`.
- `apps/api/src/routes/v1/items.ts`:
  - Validates folder invariants during generic item creation (parent folder exists, is not deleted, has kind `'folder'`, and matches security scope).

## Consequences

### Positive
- A single unified folder hierarchy eliminates duplicate organization models across features.
- Strict depth enforcement (depth <= 5) and cycle prevention at both domain and database trigger levels guarantee tree integrity.
- Inbox semantics provide a clear fallback destination for newly captured items and orphaned items during folder deletion.
- Sparse ranking enables fast reordering without re-indexing all siblings on every move.
- Tags and item links enrich knowledge navigation without duplicating or polluting feature body content.
- Integration with sync change feeds and outbox intents ensures multi-device consistency.

### Neutral
- Sibling rebalancing requires a batch update of all siblings when rank key collisions or precision limits occur.
- Recursive queries (`WITH RECURSIVE`) are used for subtree deletion and hierarchy retrieval; indexed performance benchmarks confirm sub-millisecond retrieval on hierarchies exceeding 300 nodes.
