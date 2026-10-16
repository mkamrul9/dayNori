# Phase 22: Journal entries and privacy defaults

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [22 — Journal entries and privacy defaults](../roadmap/phases/22-journal-entries-and-privacy-defaults.md)
- **Status:** `blocked` (Provisional journal domain, PostgreSQL persistence with Row-Level Security, REST API routes, SyncEngine integration, Web IndexedDB and Mobile SQLite local storage adapters, and privacy defaults delivered under owner authorization and verified across Vitest pure domain, multi-client integration journeys, SQLite storage, and PostgreSQL RLS tests; completion blocked pending prerequisite Phase 04–06 and Phase 11 physical Android TalkBack hardware and KeyStore release gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-16.
- **Base Git revision and branch:** `bcf7355` on `main`.
- **Prerequisites:**
  - [Phase 15 — Folder browsing and organization interfaces](phase-15.md): Folder hierarchy, item containment, and library organization.
  - [Phase 20 — Daily routine schedules and occurrences](phase-20.md): Occurrence scheduling and date-scoped lifecycle foundations.
  - [Phase 21 — Daily routine experience and history](phase-21.md): Today agenda runtime integration and history preservation.
- **Included scope:**
  - **Shared Domain Model (`packages/domain/src/journal.ts`)**:
    - Defined `JournalEntry` entity with stable UUID identity (`id`), user-selected local calendar date (`entryDate`), authoring timezone (`timezone`), portable AST document (`document`), plain text, word/char counts, optional non-clinical mood (`great`, `good`, `okay`, `difficult`, `reflective`), optional reflection prompts (`JournalPromptEntry[]`), tags, draft status, and folder placement.
    - Implemented `isEntryBackdated` comparing user-selected calendar date against current local date in the authoring timezone to detect intentional backdating without timezone drift.
    - Implemented `computeJournalStats` for accurate multilingual word/char counts, preserving Unicode script and multiline formatting bit-for-bit.
  - **API Contracts & User Preferences (`packages/contracts`)**:
    - Created `packages/contracts/src/api/journal.ts` specifying Zod schemas for entry creation, updates, date-filtered queries, and lifecycle state changes.
    - Extended `DisplayPreferencesSchema` in `packages/contracts/src/api/user.ts` with privacy defaults: `journalPreviewHidden: true` and `suppressBodySnippets: true`.
  - **PostgreSQL Persistence & Tenant Isolation (`infra/supabase`)**:
    - Added migration `00019_journal_entries.sql` creating `app.journal_entries` table with foreign key to `app.items(id)`.
    - Enforced strict personal workspace isolation: journal entries cannot be created or queried in shared workspaces or collaborative rooms via Row-Level Security (RLS) policies.
  - **Fastify API Endpoints & Sync Dispatcher (`apps/api`)**:
    - Added transactional routes under `/v1/workspaces/:workspaceId/journal` with optimistic concurrency protection (`baseRevision`).
    - Integrated change feed emission producing `journal_entry` events on workspace sync streams.
  - **Privacy Guardrails & Log Sanitization (`apps/api/src/plugins/logger.ts`)**:
    - Enhanced `SafeLogger` to redact journal titles, document contents, plain text snippets, mood strings, and prompt responses from operational logs and error diagnostics.
  - **Client Synchronization & Local Adapters (`@daynori/sync`, `apps/web`, `apps/mobile`)**:
    - Extended `SyncEngine` with typed journal sync commands (`createJournalEntry`, `updateJournalEntry`, `trashJournalEntry`) and non-destructive conflict recovery (`save_copy` and recovery drafts).
    - Extended Web IndexedDB adapter (`apps/web/src/data/indexedDbRepository.ts`, `DB_VERSION = 6`) with `journal_entries` object store and indices.
    - Extended Mobile SQLite adapter (`apps/mobile/src/data/sqliteRepository.ts`, migration version 7) with `local_journal_entries` table.
  - **Integration & Unit Test Coverage (`tests/integration/phase22-journal-entries.test.ts`)**:
    - Validated multiple entries on a single date, intentional backdating, Bengali (Bangla) Unicode preservation, personal workspace isolation, cross-account authorization rejection, offline sync, revision conflict resolution via `save_copy`, operational log sanitization, and SQLite storage lifecycle.
- **Excluded/deferred scope:**
  - Phase 23 (Journal writing and reflection interfaces): Full web/mobile editor interfaces, reflection prompt selector UI, and mood picker components belong to Phase 23.
  - Vault client-side end-to-end encryption belongs to Phase 30+; ordinary journals rely on PostgreSQL RLS and local storage access controls.
  - Physical Android TalkBack and hardware KeyStore release gates remain blocked pending physical hardware testing.

## Result

Delivered the complete Phase 22 journal domain, persistence, API, synchronization, and privacy defaults across shared packages, server services, and client repositories:

1. **Flexible Chronological Model**:
   - Multiple journal entries can be created on the same calendar day without uniqueness conflicts.
   - Entry dates remain stable regardless of viewing timezone changes, travel, or DST transitions.
   - Physical server creation instants (`createdAt`) remain distinct from user-selected journal entry dates (`entryDate`).

2. **Multilingual & Unicode Preservation**:
   - Complex Bengali (Bangla) text (e.g., `"আজকের দিনটি ছিল চমৎকার..."`) and English multiline documents are preserved bit-for-bit across API persistence, IndexedDB storage, SQLite storage, and sync change feeds without corruption or script injection vulnerabilities.

3. **Non-Clinical, Gentle Reflection Model**:
   - Reflection prompts and mood tracking are strictly optional, editable, and clearable.
   - Clinical diagnostics, forced numerical scores, streak counters, and unconsented AI processing are completely omitted.

4. **Strict Privacy Defaults & Log Sanitization**:
   - Journals are strictly confined to personal workspaces; creation and listing in shared workspaces or rooms are rejected with 403 Forbidden.
   - Operational logs, error messages, and telemetry redact journal titles, bodies, moods, and reflection responses with `[REDACTED_JOURNAL_CONTENT]`.
   - User display preferences default to hiding journal previews in Today views and notifications.

5. **Durable Multi-Platform Persistence & Sync**:
   - Full transactional CRUD and optimistic concurrency control implemented in PostgreSQL, Web IndexedDB, and Mobile SQLite.
   - Full offline sync support with explicit conflict recovery via `save_copy` and recovery drafts, ensuring zero silent data loss.

## Acceptance evidence

### Automated Test Suites

```
1. Unit Tests (All 39 test files, 532 tests passing):
   pnpm test:unit
   Output: Test Files 39 passed (39), Tests 532 passed (532), Duration 9.57s

2. Integration Tests (All 14 test files, 196 tests passing):
   pnpm test:integration
   Output: Test Files 14 passed (14), Tests 196 passed (196), Duration 12.75s

3. Phase 22 Dedicated Integration Test Suite (9/9 tests passing):
   pnpm exec vitest run tests/integration/phase22-journal-entries.test.ts
   Output:
   ✓ creates and lists multiple entries on the same date without overwriting
   ✓ preserves physical creation instant when intentionally backdating an entry
   ✓ preserves complex Bengali script bit-for-bit across save, fetch, and search
   ✓ rejects creating or querying journal entries in shared workspaces/rooms
   ✓ rejects cross-account access between two personal workspaces
   ✓ persists offline journal entry and synchronizes via SyncEngine
   ✓ detects revision conflict on stale update and enables save_copy recovery
   ✓ guarantees that sensitive journal contents NEVER leak into server logs or logger output
   ✓ persists, queries, filters, and cleanly erases journal entries in SQLite storage

4. Monorepo-wide Production Build (All 13 workspace projects, 0 errors):
   pnpm build
   Output: Next.js static pages generated (13/13), Android bundle exported (2.44 MB), Exit status 0

5. Monorepo-wide Typecheck (All 13 workspace projects, 0 errors):
   pnpm typecheck
   Output: tsc --noEmit (Exit status 0 across 13 projects)

6. Monorepo-wide Linting (0 warnings, 0 errors):
   pnpm lint
   Output: eslint . (Exit status 0)

7. Code Style Verification:
   pnpm format:check
   Output: All matched files use Prettier code style! (Exit status 0)

8. Secret Scanning:
   node scripts/scan-secrets.mjs
   Output: Secret scanning passed: checked 1652 files without detecting unapproved secrets.

9. Planning Validation:
   node scripts/validate-planning.mjs
   Output: Planning validation passed: 64 phases, 22 mapped requirements, 176 Markdown files.
```

## Decisions and deviations

- **Decision [ADR-0028](../decisions/0028-journal-entries-and-privacy-defaults.md)**: Journal Entries, Dated Local Semantics, and Privacy Defaults.
- **Contract & Schema Alignment**: Extended `DisplayPreferencesSchema` in `@daynori/contracts` with `journalPreviewHidden: true` and `suppressBodySnippets: true`, and updated `phase10-workspaces-preferences.test.ts` to reflect the expanded schema.
- **Conflict Copy Entity ID Fix**: Fixed `save_copy` conflict resolution in `SyncEngine` to ensure `copyPayload.id` is populated with `copyEntityId`, preventing duplicate key collisions on server replay.
- **Synchronous IDB Conflict Resolution**: Ensured IndexedDB conflict resolution reads the conflict record before starting the write transaction and executes all store operations synchronously to avoid premature commit races in browser/fake-indexeddb runtimes.

## Limitations and blocked release gates

- **Physical Android Device & TalkBack Hardware Gate**: Testing was executed in Node/Vitest using `react-test-renderer` and accessibility property verification. Physical Android device verification with TalkBack audio output is blocked in the local development environment pending physical hardware.
- **Hardware KeyStore Gate**: Native Android hardware KeyStore release gate remains blocked pending physical device deployment.

## Next steps

- Stop strictly before Phase 23 in accordance with contributor rules.
- Next ready phase is [Phase 23 — Journal writing and reflection interfaces](../roadmap/phases/23-journal-writing-and-reflection-interfaces.md).
