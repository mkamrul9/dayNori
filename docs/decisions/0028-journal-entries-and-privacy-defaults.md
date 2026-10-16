# ADR-0028: Journal Entries, Dated Local Semantics, and Privacy Defaults

## Status

Accepted (Provisional dated journal domain, optional reflection metadata, PostgreSQL persistence with Row-Level Security, Fastify journal REST endpoints, SyncEngine journal integration, Web IndexedDB and Mobile SQLite encrypted storage adapters, and account-scoped privacy defaults delivered under owner authorization and verified across Vitest pure domain, multi-client integration journeys, SQLite storage, and PostgreSQL RLS tests; physical Android TalkBack hardware and KeyStore release gates remain pending).

## Context

Phase 22 implements the foundational journal domain, storage, synchronization, and privacy defaults for the Daynori ecosystem ([docs/roadmap/phases/22-journal-entries-and-privacy-defaults.md](../roadmap/phases/22-journal-entries-and-privacy-defaults.md)), satisfying requirement **R-JOURNAL** in [docs/product/requirements.md](../product/requirements.md) and adhering to the threat model in [docs/architecture/security-and-vault.md](../architecture/security-and-vault.md).

Key architectural and product requirements:

1. **Multiple Dated Entries per Calendar Day**:
   - Unlike rigid single-log tools, users must be allowed to write multiple distinct journal reflections on the same calendar day (e.g., morning intentions, afternoon notes, and evening wrap-up).
   - Local entry date (`entryDate: YYYY-MM-DD`) is a user-selected chronological attribute, never the entity primary key or a database uniqueness constraint. Entry identity is governed by a stable UUID (`id`).
2. **Intentional Backdating and Timezone Stability**:
   - Users frequently record thoughts about yesterday or past events. Intentional backdating must be first-class.
   - The selected calendar date (`entryDate`) and authoring timezone (`timezone`) are permanently separated from physical server creation and update timestamps (`createdAt`, `updatedAt`). Traveling across timezones, daylight saving transitions, or changing account viewing preferences must never alter or shift the historical `entryDate`.
3. **Portable Document AST & Multilingual Preservation**:
   - Journal bodies reuse the versioned portable block document AST (`NoteDocument`), preserving complex Bengali (Bangla) Unicode script, multiline text, paragraphs, headings, and formatting bit-for-bit across storage, network transfer, and indexing.
4. **Gentle, Non-Clinical Reflection Prompts and Optional Mood**:
   - Reflection prompts (e.g. "What went well today?", "What am I grateful for?") and mood selections are strictly optional, editable, and clearable.
   - Clinical diagnostic labeling, forced numerical mood scores, guilt-inducing streak meters, and unconsented AI analysis are strictly prohibited.
5. **Privacy Defaults and Personal Workspace Isolation**:
   - Journals are strictly personal. Shared workspaces and collaborative team rooms must reject journal entry creation, listing, and synchronization.
   - Display preferences default to privacy-preserving postures (`journalPreviewHidden: true`, `suppressBodySnippets: true`), omitting journal contents from generic Today agenda views, unauthenticated previews, and system notifications.
6. **Operational Telemetry & Log Sanitization**:
   - Journal titles, document content, plain text snippets, mood strings, and prompt answers must never enter server operational logs, metrics, telemetry, error responses, or diagnostic exception traces.
7. **Offline-First Persistence and Explicit Conflict Recovery**:
   - Local storage adapters (Web IndexedDB and Android SQLite) must persist journal headers, bodies, drafts, and pending mutation intents atomically.
   - When concurrent edits produce a revision conflict (HTTP 409), local changes must never be silently discarded. The synchronization engine must support non-destructive recovery via `save_copy` or durable recovery drafts.

## Decision

### 1. Shared Domain Logic & Contracts (`@daynori/domain`, `@daynori/contracts`)

- **Domain Model (`packages/domain/src/journal.ts`)**:
  - `JournalEntry`: Entity containing `id`, `workspaceId`, `folderId`, `title`, `entryDate` (`YYYY-MM-DD`), `timezone` (IANA), `document` (`NoteDocument`), `plainText`, `wordCount`, `charCount`, `mood` (`JournalMood | null`), `prompts` (`JournalPromptEntry[]`), `tags`, `isDraft`, `isArchived`, `isPinned`, `securityScope`, `serverRevision`, `createdAt`, `updatedAt`, `deletedAt`.
  - Defined optional non-clinical mood values: `'great' | 'good' | 'okay' | 'difficult' | 'reflective'`.
  - `isEntryBackdated(entryDate, authorTimezone, nowInstant)`: Compares authoring date against current local date in the specified timezone to flag historical entries without altering timestamps.
  - `computeJournalStats(plainText)`: Computes word and character counts deterministically, supporting Unicode script and multiline content.
- **API Contracts (`packages/contracts/src/api/journal.ts`)**:
  - Defined Zod schemas for entry creation, updates, date-filtered queries, search requests, and item responses with strict validation rules.

### 2. PostgreSQL Persistence & API Services (`infra/supabase`, `apps/api`)

- **Database Migration (`00019_journal_entries.sql`)**:
  - Created `app.journal_entries` linked by foreign key to `app.items(id)` with cascading deletion.
  - Indexes on `(workspace_id, entry_date)`, `(workspace_id, is_draft)`, and `(workspace_id, folder_id)`.
  - Configured PostgreSQL Row-Level Security (RLS) enforcing that journal records can only be accessed by personal workspace owners. Shared workspaces are blocked at both route and database levels.
- **REST Endpoints (`apps/api/src/routes/v1/journal.ts`)**:
  - Implemented transactional routes under `/v1/workspaces/:workspaceId/journal`:
    - `POST /`: Creates dated entry with optimistic locking preconditions.
    - `GET /`: Lists entries with date and pagination filters.
    - `GET /:id`: Retrieves single entry.
    - `PATCH /:id`: Updates entry with `baseRevision` concurrency checking.
    - `POST /:id/archive`, `POST /:id/restore`, `POST /:id/trash`: Lifecycle state transitions.
- **Sync Change Feed Integration (`apps/api/src/modules/sync/service.ts`)**:
  - Integrated `journal_entry` change feed events into sync pull, push, and snapshot bootstrap generations.

### 3. Client Synchronization & Multi-Platform Storage (`@daynori/sync`, `apps/web`, `apps/mobile`)

- **Sync Engine Integration (`packages/sync/src/engine.ts`)**:
  - Added typed methods: `saveJournalEntry`, `getJournalEntry`, `listJournalEntries`.
  - Enhanced `pushPending` and `pullChanges` to process `createJournalEntry`, `updateJournalEntry`, and `trashJournalEntry` commands.
  - In `resolveConflict` under `save_copy`, ensured minted copy mutation uses a fresh entity ID and assigns `id: copyEntityId` in the local payload to prevent duplicate key collisions on server replay.
- **Web IndexedDB Adapter (`apps/web/src/data/indexedDbRepository.ts`)**:
  - Extended object store schema (`DB_VERSION = 6`) with `journal_entries` store and indices `by_workspace_date` and `by_workspace_draft`.
  - Ensured conflict resolution queues all mutation removals, header updates, and journal writes synchronously within the IDB transaction to eliminate race conditions.
- **Mobile SQLite Adapter (`apps/mobile/src/data/sqliteRepository.ts`)**:
  - Added migration version 7 creating `local_journal_entries` table with full CRUD, date filtering, pagination, and conflict resolution transactions.

### 4. Privacy Guardrails and Log Sanitization (`apps/api/src/plugins/logger.ts`)

- Enhanced `SafeLogger` with recursive payload sanitization for journal fields: `title`, `document`, `plainText`, `mood`, `prompts`, and `localPayload`. Sensitive content is replaced with `[REDACTED_JOURNAL_CONTENT]` before serialization.
- Updated `DisplayPreferences` contract with `journalPreviewHidden: true` and `suppressBodySnippets: true` defaults.

## Consequences

- **Positive**:
  - Flexible, human-friendly journaling supporting multiple entries per day and intentional backdating without timezone corruption.
  - Complete Unicode fidelity for international users, preserving Bengali (Bangla) text bit-for-bit.
  - Non-punitive, supportive environment free from streak shaming, clinical diagnostic pressure, or unsolicited AI intrusion.
  - Strict privacy defaults preventing accidental leakage into shared workspaces, notifications, or server logs.
  - Full offline-first authoring, synchronization, and conflict resolution across web and mobile.
- **Negative / Tradeoffs**:
  - Searching journals requires explicit user-selected Journal scope because global search omits journal entries to preserve preview privacy.
  - End-to-end client encryption remains deferred to the later dedicated vault release (Phase 30+); standard journals rely on PostgreSQL RLS and local storage security.
