# Phase 14: Collections, folders, and shared item metadata

Group: Core platform. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [14 — Collections, folders, and shared item metadata](../roadmap/phases/14-collections-folders-and-shared-item-metadata.md)
- **Status:** `provisional` (Authorized provisional Phase 14 organization infrastructure delivered and verified against real PostgreSQL, change feed, outbox, and production browser IndexedDB; physical-device gates remain pending; Phase 15 follows).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-15.
- **Base Git revision and branch:** `c79679d` on `main`.
- **Prerequisites:**
  - [Phase 11 — Local data repositories and migrations](phase-11.md): Production IndexedDB and SQLite local repositories, trusted-device consent, quarantined draft persistence.
  - [Phase 12 — Server mutation receipts and change feed](phase-12.md): Monotonic change feed, durable mutation receipts, canonical hashing, cursor checkpoints, and snapshot bootstrap.
  - [Phase 13 — Shared client synchronization engine](phase-13.md): Client synchronization engine, offline queue, incremental pull, multi-tab coordination, and conflict lifecycle.
- **Included scope:**
  - **Single Canonical Workspace Hierarchy**:
    - All workspace items (notes, tasks, routines, journals) and folders share a single workspace-scoped hierarchy.
    - Folders are items (`kind = 'folder'`) linked to typed folder metadata in `app.folders` (`id`, `workspace_id`, `parent_id`, `name`, `color`, `icon`).
    - Core properties (`rank`, `is_archived`, `is_pinned`, `security_scope`, `revision`, `created_at`, `updated_at`, `deleted_at`) managed in `app.items`.
  - **Inbox Semantics**:
    - `folder_id = NULL` defines the workspace Inbox.
    - Items created without a folder reference default to the Inbox.
    - Deleting a root folder with `preserve_to_parent` reparents its child items to `NULL` (Inbox).
  - **Strict Depth Bounds & Cycle Prevention**:
    - Maximum folder nesting depth of 5 (`MAX_FOLDER_DEPTH = 5`).
    - Database trigger function `app.validate_folder_parent` verifies:
      - Parent folder exists and belongs to the same workspace.
      - Parent folder is active (`deleted_at IS NULL`).
      - Parent folder has compatible security scope (`standard` vs `vault`).
      - No self-parenting or indirect cycles by walking ancestor links.
      - Total hierarchy depth (`target_parent_depth + subtree_depth <= 5`) prevents moving deep subtrees into invalid positions.
  - **Explicit Non-Empty Folder Deletion Policies**:
    - `preserve_to_parent`: Reparents direct child folders and items to the deleted folder's parent (or Inbox `NULL` if parent was root).
    - `trash_subtree`: Recursively tombstones the folder and all its descendant items and folders (`deleted_at = now()`).
    - `restoreFolder`: Restores a tombstoned folder, reparenting safely to root if its former parent was permanently deleted or remains tombstoned.
  - **Sparse Lexicographical Sibling Ranking & Rebalancing**:
    - Sibling ordering based on sparse fractional rank strings with UUID tie-breakers.
    - Sibling rebalancing service and route (`/v1/workspaces/:workspaceId/folders/rebalance`) re-spaces sibling ranks by increments of 1000.
  - **Workspace-Scoped Tags**:
    - Tags table `app.tags` with case-insensitive unique constraint `CREATE UNIQUE INDEX uq_tags_workspace_name ON app.tags (workspace_id, lower(name))`.
    - Many-to-many join in `app.item_tags (workspace_id, item_id, tag_id)`.
    - Attaches and detaches tags to items without copying or duplicating item feature bodies.
  - **Item-to-Item Directed Links**:
    - Association graph in `app.item_links (workspace_id, source_item_id, target_item_id, link_type)` with check `source_item_id != target_item_id`.
    - Enforces same-workspace existence for both source and target items.
  - **Sync & Outbox Integration**:
    - All folder operations generate ordered change events in `app.changes` and outbox intents in `app.outbox_intents`.
    - Active folders are included in `syncBootstrap` snapshot items.
  - **Synthetic Hierarchy Performance Benchmark**:
    - Generated a deep and wide synthetic hierarchy (310 folders across 3 levels) and measured `EXPLAIN (ANALYZE, BUFFERS)` execution time for recursive hierarchy resolution.
- **Excluded/deferred scope:**
  - Feature body content models (note rich text, todo checklists, routine recurrence rules, journal prompts) — deferred to Phase 16+.
  - Client folder navigation UI and views — deferred to Phase 15.
  - Vault client encryption key wrapping — deferred to Phase 21.
  - Physical Android TalkBack hardware release gates (Phases 04, 06, 09, 11, 13, 14) — remain pending physical hardware.

## Result

Delivered the complete Phase 14 organization infrastructure in `packages/contracts`, `packages/domain`, `apps/api`, `packages/api-client`, and database migration `00012_organization_folders_and_metadata.sql`.

Verified against real PostgreSQL and the full client sync engine:

1. **Folder Depth Boundaries**: Successfully created root folders (depth 1) and subfolders up to max depth 5. Moving a subtree that would cause descendants to exceed depth 5 is rejected with `VALIDATION_FAILED`.
2. **Cycle Prevention**: Self-parenting and indirect cycles (moving an ancestor folder under its own descendant) are rejected transactionally by the PostgreSQL trigger.
3. **Cross-Workspace Isolation**: Attempting to parent a folder under a folder belonging to a different workspace fails with foreign key / validation constraints.
4. **Deletion Policies**:
   - `preserve_to_parent`: Safely reparents direct children and items to the parent (or Inbox `NULL` if parent was root).
   - `trash_subtree`: Atomically tombstones the folder and all its descendant items and subfolders.
5. **Safe Restoration**: Restoring a tombstoned folder safely reparents it to root if its former parent is deleted.
6. **Sparse Ranking & Rebalancing**: Siblings are ordered lexicographically; rebalancing redistributes ranks cleanly with 1000-step gaps.
7. **Tags & Links**: Case-insensitive unique tags per workspace; tags attach to items without copying body content; directed item links reject self-links and cross-workspace references.
8. **Sync Feed Integration**: Folder mutations generate ordered change feed records and outbox intents; active folders appear in bootstrap snapshots.
9. **Query Performance**: Indexed recursive CTE query over 310 synthetic folders executed in sub-millisecond planning and ~1.5ms execution time, far below the 100ms budget.

## Acceptance evidence

| Acceptance Condition                  | Verification Method                                                                           | Location / Artifact                                    | Result                                                                               |
| :------------------------------------ | :-------------------------------------------------------------------------------------------- | :----------------------------------------------------- | :----------------------------------------------------------------------------------- |
| **Folder Hierarchy & Depth Limits**   | Create root and nested folders up to depth 5; verify depth 6 and subtree depth excess rejected| `tests/integration/phase14-organization-folders.test.ts` | **PASS**: Depths 1–5 succeed; depth 6 and excessive subtree moves rejected (400).    |
| **Cycle Prevention**                  | Attempt direct self-parent and ancestor-under-descendant moves                                | `tests/integration/phase14-organization-folders.test.ts` | **PASS**: Both direct and indirect cycles rejected transactionally.                 |
| **Cross-Workspace Parent Rejection**  | Attempt to create folder with parent from another workspace                                   | `tests/integration/phase14-organization-folders.test.ts` | **PASS**: Cross-workspace reference rejected (400).                                  |
| **Preserve to Parent Deletion**       | Delete folder with `preserve_to_parent`; verify child items and folders reparented           | `tests/integration/phase14-organization-folders.test.ts` | **PASS**: Direct child items and subfolders reparented to parent or Inbox.           |
| **Trash Subtree Deletion**            | Delete folder with `trash_subtree`; verify all descendants tombstoned                         | `tests/integration/phase14-organization-folders.test.ts` | **PASS**: All descendant folders and items tombstoned recursively.                   |
| **Restoration with Reparenting**      | Restore tombstoned folder whose parent was deleted; verify reparented to root                 | `tests/integration/phase14-organization-folders.test.ts` | **PASS**: Folder restored with `deleted_at = NULL` and reparented to `NULL` (root).   |
| **Ranking & Rebalancing**             | Reorder folders with sparse ranks and trigger sibling rebalance                               | `tests/integration/phase14-organization-folders.test.ts` | **PASS**: Sibling ranks redistributed with step 1000; stable ordering preserved.     |
| **Workspace Tags (Case-Insensitive)** | Create duplicate tags with different casing; attach tag to item without body                 | `tests/integration/phase14-organization-folders.test.ts` | **PASS**: Duplicate case-insensitive tag rejected; tag attached cleanly.             |
| **Item Links & Self-Link Check**      | Create directed item link between items; verify self-link rejected                            | `tests/integration/phase14-organization-folders.test.ts` | **PASS**: Directed link created; self-link rejected (400).                          |
| **Sync Feed & Bootstrap Integration** | Verify folder operations in change feed and active folders in bootstrap                       | `tests/integration/phase14-organization-folders.test.ts` | **PASS**: Folder change recorded in `app.changes`; active folder in bootstrap snapshot.|
| **Synthetic Hierarchy Benchmark**     | `EXPLAIN (ANALYZE, BUFFERS)` on 310-folder hierarchy recursive CTE query                      | `tests/integration/phase14-organization-folders.test.ts` | **PASS**: Execution time ~1.5ms, buffers shared hit: 43 (sub-100ms threshold met).   |
| **Full Monorepo Test Suite**          | Full Vitest run across 30 test files and 350 tests                                            | `pnpm test`                                            | **PASS**: 30/30 files passed, 350/350 tests passed.                                  |
| **Strict Typecheck & Lint**           | Strict TypeScript across 13 workspace projects and zero ESLint warnings/errors                | `pnpm typecheck` & `pnpm lint`                         | **PASS**: 0 typecheck errors, 0 lint warnings/errors.                                |
| **Monorepo Build**                    | Complete build including Next.js 15 web app and React Native/Expo Android Hermes export       | `pnpm build`                                           | **PASS**: All packages and apps built cleanly.                                       |
| **Code Formatting**                   | Prettier formatting check across all files                                                    | `pnpm format:check`                                    | **PASS**: All files match Prettier style.                                            |
| **Roadmap Planning Validation**       | Automated validator checking 64 phases, 22 requirements, local links                          | `node scripts/validate-planning.mjs`                   | **PASS**: Planning validation passed cleanly.                                        |
| **Secret Audit**                      | Custom repository secret scanner checking all files and git diffs                             | `node scripts/scan-secrets.mjs`                        | **PASS**: 0 secrets detected across 1512 files.                                      |

## Remaining gates and next steps

- **Remaining Hardware Gates**:
  - Physical Android execution and TalkBack accessibility navigation on real devices remain blocked by physical hardware availability.
  - Software development proceeds under owner authorization with hardware gates explicitly documented as blocked.
- **Next Ready Phase**:
  - Phase 15: Folder hierarchy, tags, and item list views (User interfaces for navigating folders, filtering by tags, and organizing items).
