# ADR-0022: Typed Note Domain and Persistence

## Status

Accepted (Provisional typed note domain AST, sanitization, PostgreSQL schema, RLS policies, API endpoints, and sync integration implemented and verified; physical Android hardware and TalkBack verification remain pending).

## Context

Phase 16 establishes the foundational typed note domain and persistence layer for Daynori, satisfying requirements R-NOTE and R-CAPTURE in [docs/product/requirements.md](../product/requirements.md) and adhering to the data model in [docs/architecture/data-model.md](../architecture/data-model.md).

Prior to this phase, Daynori established personal workspace ownership ([ADR-0016](0016-personal-workspace-ownership-concurrency-and-legacy-reconciliation.md)), local client storage ([ADR-0017](0017-local-storage-and-encryption-key-lifecycle.md)), commit-safe synchronization ([ADR-0018](0018-commit-safe-change-ordering-and-mutation-receipts.md)), client sync coordination ([ADR-0019](0019-shared-client-sync-engine.md)), and workspace folder organization ([ADR-0020](0020-workspace-folders-and-organization.md), [ADR-0021](0021-folder-browsing-and-library-interfaces.md)).

Notes in Daynori must satisfy several architectural invariants:

1. **Portable Versioned Document AST**: Note formatting must not rely on fragile browser-specific HTML strings. It requires a versioned, portable JSON Abstract Syntax Tree (AST) supporting structured blocks (paragraphs, headings 1–3, bullet lists, ordered lists, checklists) and inline styling (text, hard breaks, bold, italic).
2. **Inert Rendering & Security**: User input must never execute scripts or unsanitized HTML. The domain AST strips or neutralizes executable tags (`<script>`, `<iframe>`, `javascript:`, inline event handlers) and renders inertly across web and native mobile clients.
3. **Unicode & Bengali (Bangla) Preservation**: Daynori is designed for bilingual (English & Bangla) organization. The AST, plain-text projection, and database storage must fully preserve multi-byte UTF-8 grapheme clusters, conjuncts (যুক্তবর্ণ), and diacritics without distortion, double-encoding, or clipping.
4. **Relational Integrity & Tenant Isolation**: Notes participate in workspace folder hierarchies. `app.notes` is linked to `app.items` via a composite primary key and foreign key `(workspace_id, id) REFERENCES app.items(workspace_id, id) ON DELETE CASCADE`. Row-Level Security (RLS) ensures tenant isolation via PostgreSQL session contexts.
5. **Optimistic Concurrency Control**: Mutating endpoints require `baseRevision === currentRevision`. Out-of-order or concurrent edits yield HTTP 409 `REVISION_CONFLICT` and preserve server content alongside client drafts.
6. **Sync Engine Integration**: Notes must participate in offline creation, draft queuing, and background synchronization via the client `SyncEngine` and server `SyncService`.

## Decision

### 1. Pure Domain AST (`packages/domain/src/notes.ts`)

We implemented note document AST definitions and processing functions as pure TypeScript in `@daynori/domain`, with zero runtime dependencies:

- **Block Types**:
  - `paragraph`: Inline node array.
  - `heading`: Heading levels 1, 2, 3 with inline node array.
  - `bullet_list`: Array of `list_item` nodes.
  - `ordered_list`: Array of `list_item` nodes.
  - `checklist`: Array of `checklist_item` nodes with boolean `checked` status.
- **Inline Types**:
  - `text`: Plain text string with optional `marks: ('bold' | 'italic')[]`.
  - `hard_break`: Explicit newline marker.
- **Document Envelope**:
  - `{ version: 1, type: 'doc', content: NoteBlockNode[] }`.
- **Invariants & Safeguards**:
  - `MAX_NOTE_DOCUMENT_BYTES = 512 * 1024` (512 KiB max serialized JSON AST size).
  - `MAX_NOTE_NODES = 5000` (max block and inline node count to prevent deep tree DOS).
  - `extractPlainText`: Extracts legible plain text from block content with normalized line breaks.
  - `calculateWordCount` & `calculateCharCount`: Unicode-aware word and character counters.
  - `sanitizeNoteDocument`: Sanitizes raw text nodes, stripping dangerous HTML markup while keeping valid Unicode text intact.
  - `validateNoteDocument`: Structural validation ensuring document structure adheres to version 1 AST rules.

### 2. Contract Schemas (`packages/contracts/src/api/note.ts` & `sync.ts`)

- Defined Zod schemas: `NoteDocumentSchema`, `NoteSchema`, `CreateNoteRequestSchema`, `UpdateNoteRequestSchema`, `NoteListQuerySchema`, `NoteResponseSchema`, `NoteListResponseSchema`.
- Extended `SyncCommandTypeSchema` to include note commands: `'createNote'`, `'updateNote'`, `'trashNote'`, `'restoreNote'`.
- Extended `SyncCommandSchema` `entityType` enum to include `'note'` alongside `'item'` and `'folder'`.

### 3. Database Migration (`infra/supabase/migrations/00014_typed_notes_and_persistence.sql`)

- Created `app.notes` table:
  - `id uuid NOT NULL`: Note identifier.
  - `workspace_id uuid NOT NULL`: Workspace tenant boundary.
  - `title varchar(255) NOT NULL DEFAULT 'Untitled'`: Indexed note title.
  - `document jsonb NOT NULL`: Versioned document AST.
  - `plain_text text NOT NULL DEFAULT ''`: Searchable plain-text projection.
  - `word_count integer NOT NULL DEFAULT 0`: Cached word count.
  - `char_count integer NOT NULL DEFAULT 0`: Cached character count.
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `updated_at timestamptz NOT NULL DEFAULT now()`
  - `CONSTRAINT pk_notes PRIMARY KEY (workspace_id, id)`
  - `CONSTRAINT fk_notes_items FOREIGN KEY (workspace_id, id) REFERENCES app.items (workspace_id, id) ON DELETE CASCADE`
- Added indexes:
  - `idx_notes_workspace_updated`: B-tree index on `(workspace_id, updated_at DESC)`.
  - `idx_notes_fts`: GIN full-text search index on `to_tsvector('simple', title || ' ' || plain_text)`.
- Enforced Row-Level Security:
  - Policies `p_notes_select`, `p_notes_insert`, `p_notes_update`, `p_notes_delete` matching `app.current_workspace_id()`.
  - Granted `SELECT, INSERT, UPDATE, DELETE` to `daynori_runtime`.

### 4. API Endpoints (`apps/api/src/routes/v1/notes.ts`)

- `POST /v1/workspaces/:workspaceId/notes`: Creates note and item envelope atomically, recording change log entry and outbox intent.
- `GET /v1/workspaces/:workspaceId/notes`: Lists active notes with folder filtering (`folderId`), archive filtering (`isArchived`), and search (`search`).
- `GET /v1/workspaces/:workspaceId/notes/:noteId`: Retrieves single note by ID.
- `PATCH /v1/workspaces/:workspaceId/notes/:noteId`: Updates note document, plain text, title, folder, pin, or archive status with `baseRevision` precondition checking.
- `POST /v1/workspaces/:workspaceId/notes/:noteId/trash`: Soft-deletes note into trash (`deleted_at = now()`).
- `POST /v1/workspaces/:workspaceId/notes/:noteId/restore`: Restores trashed note.

### 5. Sync Engine and Local Repository Integration

- Integrated note commands (`createNote`, `updateNote`, `trashNote`, `restoreNote`) into `apps/api/src/modules/sync/service.ts` `dispatchCommand`.
- Joined `app.notes` in `apps/api/src/modules/sync/repository.ts` `listActiveItemsForBootstrap` to populate note titles during initial client hydration.
- Updated `packages/sync/src/engine.ts` `saveItem` to detect note items and serialize note payloads and draft projections into pending mutations.
- Local draft persistence via `DraftRecord` (`entityType: 'note'`) preserved in `IndexedDbLocalRepository` and `SqliteLocalRepository`.

## Alternatives Considered

1. **Storing Raw HTML**: Rejected. HTML strings are prone to cross-site scripting (XSS), lack structured semantics for checklists or mobile rendering, and suffer from dialect differences across browser rich-text engines.
2. **Storing Markdown Only**: Rejected. While markdown is portable, a structured AST provides deterministic node hierarchy, avoids parsing ambiguities, enables direct manipulation of checklist state, and serves as the clean AST target for Phase 17's rich-text editor.
3. **Storing Document in `app.items.metadata`**: Rejected. Keeping `app.notes` in a child table maintains relational normalization, keeps `app.items` lightweight for high-speed folder and collection queries, and enables dedicated GIN indexing without bloating generic item metadata.

## Consequences

- Notes have a strictly typed, versioned AST that can be safely extended in Phase 17 (rich-text editor).
- Bangla and multi-byte Unicode content round-trips reliably across local and server storage.
- Concurrent updates are safely detected via revision precondition checks, preventing silent overwrites.
- Physical Android hardware, TalkBack accessibility, and hardware KeyStore gates remain explicitly blocked pending dedicated testing environments.
