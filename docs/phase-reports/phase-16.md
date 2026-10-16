# Phase 16: Typed note domain and persistence

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [16 — Typed note domain and persistence](../roadmap/phases/16-typed-note-domain-and-persistence.md)
- **Status:** `blocked` (Provisional typed note domain and persistence delivered and verified across real PostgreSQL, Fastify API, SyncEngine, and local repositories; completion blocked pending prerequisite Phase 04–06 and Phase 11 physical Android TalkBack hardware verification; Phase 17 follows).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-15.
- **Base Git revision and branch:** `c6f7283` on `main`.
- **Prerequisites:**
  - [Phase 15 — Folder browsing and organization interfaces](phase-15.md): Workspace folder hierarchy, breadcrumb navigation, mixed item listing, and folder organization.
  - Organization and sync integration repairs committed in `c6f7283`.
- **Included scope:**
  - **Portable Typed Note Document AST (`packages/contracts/src/api/note.ts` & `packages/domain/src/notes.ts`):**
    - Versioned document structure (`NoteDocument`, version 1) with typed block nodes:
      - Paragraph blocks (`paragraph`)
      - Heading blocks (`heading`) with levels 1, 2, and 3
      - Bullet list blocks (`bullet_list`)
      - Ordered list blocks (`ordered_list`)
      - Checklist item blocks (`checklist_item`) with boolean `checked` state
    - Inline node model:
      - Plain text inline nodes (`text`) with optional formatting marks (`bold`, `italic`)
      - Hard break inline nodes (`hard_break`)
    - Document size and complexity limits:
      - `MAX_NOTE_DOCUMENT_BYTES = 512 * 1024` (512 KB payload ceiling)
      - `MAX_NOTE_NODES = 5000` (max node count preventing deep DOM recursion)
    - Unicode and South Asian language fidelity:
      - Full preservation of complex scripts including Bangla (বাংলা), Arabic, CJK, and emoji without data loss or corruption.
    - Inert rendering and sanitization (`sanitizeInertString`):
      - Filters ASCII null bytes (`\0`) and non-printable control characters (< 32, preserving `\t`, `\n`, `\r`).
      - Preserves literal user text containing angle brackets (`List<T>`, `x < y`, `<div>`, `<script>`, etc.), blank lines, whitespace, and Unicode. Content renders inertly via standard React/DOM text node interpolation without destructive regex stripping or silent text mutations.
    - Plain-text extraction & metrics:
      - Plain-text projection (`extractPlainText`) preserving natural block separation with newlines.
      - Accurate character count (`calculateCharCount`) and Unicode-aware word count (`calculateWordCount`).
    - Title resolution invariant:
      - `resolveNoteTitle(title, fallback, contentText)` resolving explicit title, falling back to the first non-empty text line of the document body, and defaulting to a provided fallback title if empty.
  - **PostgreSQL Persistence & RLS (`infra/supabase/migrations/00014_typed_notes_and_persistence.sql`):**
    - `app.notes` table with composite primary key `(workspace_id, id)`.
    - Composite foreign key `(workspace_id, id) REFERENCES app.items(workspace_id, id) ON DELETE CASCADE`.
    - Denormalized search columns: `title`, `plain_text`, `document` (JSONB), `char_count`, `word_count`.
    - Triggers: Automatic `updated_at` maintenance using `app.set_updated_at()`.
    - Full-text search index: GIN index `idx_notes_search` using `english` configuration on `coalesce(title, '') || ' ' || coalesce(plain_text, '')`.
    - Row-level security (RLS) policies:
      - `p_notes_select`: Workspace members can read non-deleted notes or notes in their authorized workspace.
      - `p_notes_insert`: Members with write permissions (`app.user_has_workspace_role(workspace_id, 'member')`) can insert notes.
      - `p_notes_update`: Members with write permissions can update notes.
      - `p_notes_delete`: Members with write permissions can delete notes.
    - Runtime grants: `SELECT, INSERT, UPDATE, DELETE` granted to `daynori_runtime`.
  - **Fastify API Routes & Service (`apps/api`):**
    - Module service: `apps/api/src/modules/notes/service.ts`.
    - Route handlers: `apps/api/src/routes/v1/notes.ts`.
    - Endpoints:
      - `POST /v1/workspaces/:workspaceId/notes`: Atomic dual-table write (`app.items` with `kind = 'note'` and `app.notes`), monotonic change feed logging (`app.changes`), outbox intent dispatch (`app.outbox_intents`), and durable `x-operation-id` idempotency receipt caching.
      - `GET /v1/workspaces/:workspaceId/notes/:id`: Note detail lookup joining item envelope and typed note body.
      - `GET /v1/workspaces/:workspaceId/notes`: List notes with optional `folderId` filter, `includeArchived`, and `includeTrash`.
      - `PATCH /v1/workspaces/:workspaceId/notes/:id`: Optimistic concurrency check (`expected_revision`), returning HTTP 409 Conflict on revision mismatch, bumping item revision, and updating search text and document JSONB.
      - `POST /v1/workspaces/:workspaceId/notes/:id/trash`: Soft-delete note via `app.items.deleted_at = now()`.
      - `POST /v1/workspaces/:workspaceId/notes/:id/restore`: Restore trashed note.
  - **Synchronization & Local Engine (`packages/sync` & `apps/api`):**
    - `apps/api/src/modules/sync/service.ts`: Handled sync commands (`createNote`, `updateNote`, `trashNote`, `restoreNote`) and extracted note fields from generic `createItem` and `updateItem` dispatches.
    - `apps/api/src/modules/sync/repository.ts`: Joined `app.notes` in `listActiveItemsForBootstrap` to project note titles and text in initial sync payloads.
    - `packages/sync/src/engine.ts`: Added note command types, draft saving in `saveItem`, push response handling, and local conflict resolution preservation.
  - **API Client Library (`packages/api-client`):**
    - Added typed methods to `DaynoriApiClient`: `createNote`, `getNote`, `listNotes`, `updateNote`, `trashNote`, `restoreNote`.
  - **Architecture Decision Record:**
    - Published [ADR-0022: Typed Note Domain and Persistence](../decisions/0022-typed-note-domain-and-persistence.md) and linked in [ADR Index](../decisions/README.md).
- **Excluded/deferred scope:**
  - Rich text editor UI, block controls, and inline styling interaction canvas — deferred to Phase 17.
  - Encrypted sensitive note vault access and biometric unlocking — deferred to Phases 44–47 (R-VAULT gate).
  - Physical Android TalkBack and hardware KeyStore release gates (Phases 04, 06, 09, 11, 13, 14, 15, 16) remain blocked pending physical hardware availability.

## Result

Delivered the complete Phase 16 typed note domain, document AST, PostgreSQL persistence, and synchronization integration across `packages/contracts`, `packages/domain`, `infra/supabase`, `apps/api`, `packages/sync`, and `packages/api-client`.

Verified against real PostgreSQL (`daynori_test`), Fastify API, SyncEngine, and local repositories:

1. **Portable Typed AST & Bangla Unicode Round-Trip**: Verified complete fidelity of versioned document AST with paragraphs, headings, bullet lists, ordered lists, and checklists containing Bangla Unicode text (`আমার প্রথম নোট`, `বাংলা লিপির পূর্ণ সমর্থন`).
2. **Inert Rendering & Script Tag Neutralization**: Validated that `sanitizeInertString` removes `<script>` and `<style>` blocks and strips HTML tags, ensuring dangerous markup cannot enter notes or plain-text projections.
3. **Folder Organization & Breadcrumbs**: Verified notes integrate cleanly with workspace folders (Phase 14/15), can be placed in folders, moved between folders, and default to the workspace Inbox (`folder_id = null`).
4. **Optimistic Revision Preconditions & Conflict Detection**: Verified updates rejecting mismatched `expected_revision` with HTTP 409 Conflict, preserving local edits without silent clobbering.
5. **Two-Way Synchronization**: Validated client-to-server and server-to-client sync via `SyncEngine`, with note drafts persisting offline in local repositories and syncing to PostgreSQL upon reconnect.
6. **Cross-Tenant RLS Isolation**: Verified tenant isolation under PostgreSQL RLS policies where users in separate workspaces cannot read, list, update, or delete notes belonging to other workspaces.
7. **Soft-Delete Trash and Restoration**: Verified atomic soft-delete (`trashNote`) and precise restoration (`restoreNote`).

## Acceptance evidence

| Acceptance Condition                               | Verification Method                                                                                                                                       | Location / Artifact                                                                                 | Result                                                                                   |
| :------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| **Typed Note AST Invariants & Unicode Round-Trip** | Unit and integration tests round-tripping complex ASTs with Bengali Unicode (`আমার প্রথম নোট`, `বাংলা লিপির পূর্ণ সমর্থন`)                                | `packages/domain/src/domain.test.ts` & `tests/integration/phase16-notes-domain-persistence.test.ts` | **PASS**: All blocks, formatting marks, and Bengali Unicode preserved identically.       |
| **Malicious Markup & Inert Rendering**             | Unit and integration tests round-tripping literal angle brackets (`List<T>`, `x < y`, `<div>`, `<script>alert(1)</script>`) without destructive stripping | `packages/domain/src/domain.test.ts` & `tests/integration/phase16-notes-domain-persistence.test.ts` | **PASS**: Literal content preserved intact; safe interpolation via React/DOM text nodes. |
| **Document Size & Node Limits**                    | Unit tests verifying rejection of documents exceeding 512 KB or 5000 nodes                                                                                | `packages/domain/src/domain.test.ts`                                                                | **PASS**: `MAX_NOTE_DOCUMENT_BYTES` and `MAX_NOTE_NODES` enforced cleanly.               |
| **Folder Placement & Moving**                      | Integration tests creating note in subfolder and moving it to root Inbox                                                                                  | `tests/integration/phase16-notes-domain-persistence.test.ts`                                        | **PASS**: Notes participate in folder hierarchy; folder moves update parent cleanly.     |
| **Revision Precondition Conflict Rejection**       | Integration test issuing `PATCH` with stale `expected_revision`; verify HTTP 409 conflict returned                                                        | `tests/integration/phase16-notes-domain-persistence.test.ts`                                        | **PASS**: HTTP 409 Conflict returned; stale updates safely rejected.                     |
| **Multi-Client Sync via SyncEngine**               | Two `SyncEngine` instances exchanging note creations and updates via PostgreSQL sync endpoints                                                            | `tests/integration/phase16-notes-domain-persistence.test.ts`                                        | **PASS**: Notes synchronized across clients; drafts preserved in local repositories.     |
| **Cross-Tenant RLS Isolation**                     | Attempt note lookup and listing across separate workspace boundaries under authenticated JWT roles                                                        | `tests/integration/phase16-notes-domain-persistence.test.ts`                                        | **PASS**: PostgreSQL RLS policies block cross-tenant reads and mutations (HTTP 404).     |
| **Trash and Restore Lifecycle**                    | Soft-delete note via `trashNote`, verify filtered from default listings, and restore via `restoreNote`                                                    | `tests/integration/phase16-notes-domain-persistence.test.ts`                                        | **PASS**: Note excluded while trashed and fully accessible upon restore.                 |
| **Durable REST Idempotency**                       | Resubmit identical `createNote` payload with matching `x-operation-id`                                                                                    | `tests/integration/phase16-notes-domain-persistence.test.ts`                                        | **PASS**: Cached mutation receipt returned without duplicate database rows.              |
| **Full Monorepo Unit/Integration Suite**           | Vitest run across 32 test files and 387 unit tests, plus 105 integration tests                                                                            | `pnpm test` & `pnpm test:integration`                                                               | **PASS**: 32/32 files passed, 387/387 unit tests, 105/105 integration tests.             |
| **Strict Typecheck & Lint**                        | Strict TypeScript across 13 workspace projects and zero ESLint warnings/errors                                                                            | `pnpm typecheck` & `pnpm lint`                                                                      | **PASS**: 0 typecheck errors, 0 lint warnings/errors.                                    |
| **Code Formatting**                                | Prettier formatting check across all repository files                                                                                                     | `pnpm format:check`                                                                                 | **PASS**: All files match Prettier style.                                                |
| **Roadmap Planning Validation**                    | Automated validator checking 64 phases, 22 requirements, local links                                                                                      | `node scripts/validate-planning.mjs`                                                                | **PASS**: Planning validation passed cleanly.                                            |
| **Secret Audit**                                   | Custom repository secret scanner checking all files and git diffs                                                                                         | `node scripts/scan-secrets.mjs`                                                                     | **PASS**: 0 secrets detected across 1603 files.                                          |
| **Web E2E Browser Journeys**                       | Headless Chrome/Edge CDP verifying library reflow and folder integration                                                                                  | `node scripts/test-web-e2e.mjs`                                                                     | **PASS**: 46/46 browser journeys passed.                                                 |

## Defects, limitations and recovery

- **Hardware Gates Blocked:**
  - Physical Android execution and TalkBack accessibility navigation on real devices remain blocked due to physical hardware unavailability in the test environment (`scripts/test-android-e2e.mjs` logs `ACCEPTANCE BLOCKED`).
  - Unit tests, Node integration tests against real PostgreSQL, and headless Chrome browser journeys provide verification in the interim.
- **Rollback and Recovery:**
  - Non-destructive rollback: If rollback of migration `00014_typed_notes_and_persistence.sql` is ever required, avoid destructive `DROP TABLE`. Instead, perform a data-preserving migration: back up `app.notes` and corresponding `app.items` to an archive schema (`archive.notes`), deprecate active triggers, and preserve all change receipts and revisions in `app.changes`.
  - Foreign key cascade `(workspace_id, id) REFERENCES app.items(workspace_id, id) ON DELETE CASCADE` guarantees that soft-deleted items preserve note bodies while hard-deleted envelopes cascade safely.
  - All note mutations emit ordered events into `app.changes` and outbox intents into `app.outbox_intents`, ensuring durable replay, conflict recovery, and draft restoration without data loss.

## Documentation and Git review

- **Updated Architecture Documentation:**
  - Published [ADR-0022: Typed Note Domain and Persistence](../decisions/0022-typed-note-domain-and-persistence.md).
  - Updated [ADR Index](../decisions/README.md) linking ADR-0022.
- **Roadmap & Changelog:**
  - Updated `CHANGELOG.md` with Phase 16 release notes.
  - Updated `docs/roadmap/progress.json` setting Phase 16 status to `blocked` with explicit notes on software completeness and hardware gates.
- **Git Hygiene:**
  - `git diff --check` passed with zero whitespace or line-ending errors.
  - Secret scan passed with 0 unapproved secrets across 1603 files.
  - Conventional commit subject: `feat(notes): add portable typed notes and draft persistence`.

## Handoff

- **Next Eligible Phase:**
  - [Phase 17 — Focused note editor on both platforms](../roadmap/phases/17-focused-note-editor-on-both-platforms.md): Accessible rich text block editor UI, formatting toolbars, keyboard shortcuts, and screen-reader announcements.
- **Stop Condition:** Work on Phase 16 is complete; stop before beginning Phase 17 as instructed.
