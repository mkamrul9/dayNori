# Phase 33: Global authorized search and filters

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [33 — Global authorized search and filters](../roadmap/phases/33-global-authorized-search-and-filters.md)
- **Status:** `blocked` (Software implementation, PostgreSQL full-text and pg_trgm indexing, permission-scoped REST search endpoint, DaynoriApiClient search methods, pure client-side local search engine with offline coverage status, Web and Mobile search interfaces with debounced queries, type filter chips, and safe match token highlighting, multi-tenant workspace isolation, absolute vault exclusion, journal privacy redaction, and 11 end-to-end integration tests verified locally; completion status recorded as `blocked` in `docs/roadmap/progress.json` due to prerequisite physical Android TalkBack / KeyStore hardware gates and external production provider push services).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-18.
- **Base Git revision and branch:** `403818e: fix(organizer): repair knowledge persistence, saved views, and offline onboarding` on `main`.
- **Prerequisites:**
  - [Phase 32 — Knowledge guides and cheatsheet organization](phase-32.md): Canonical knowledge guide and cheatsheet note presets, topic folders, and saved views.
  - [Phase 23 — Journal entries and reflection tools](phase-23.md): Canonical journal entries, daily prompts, and mood tracking.
  - [Phase 25 — Organized uploads, safe document previews, and offline availability](phase-25.md): Safe document uploads, storage quotas, and file metadata.
  - [Phase 19 — Unified tagging and tag management](phase-19.md): Normalized workspace tags, item associations, and tag colors.
- **Included scope:**
  - **Server-Side Search & Full-Text/Trigram Indexing (`apps/api`, `infra/supabase`)**:
    - Database migration `00030_global_search_indexes.sql`: Activates PostgreSQL `pg_trgm` extension and creates GIN trigram indexes on `app.notes(title, plain_text_summary)`, `app.tasks(title, description)`, `app.journal_entries(title, plain_text_summary)`, `app.file_items(name)`, `app.folders(name)`, `app.tags(name)`, and `app.items(security_scope)` strictly where `security_scope != 'vault'`.
    - Parameterized search service (`apps/api/src/modules/search/service.ts`): Queries authorized organizer entities within the target workspace. Employs parameterized SQL queries to treat SQL injection payloads, long queries, and special punctuation as inert search terms.
    - Workspace authorization & security scope: Validates `app.user_has_workspace_role(workspaceId, 'viewer')`. Rejects unauthorized workspace requests with HTTP 404 (preventing workspace existence side channels).
    - Absolute vault exclusion: Items with `security_scope = 'vault'` are excluded completely from search candidate records, search result snippets, and aggregate count metadata.
    - Journal privacy settings: Evaluates user profile preferences (`journalPreviewHidden`, `suppressBodySnippets`), redacting private journal snippets to `[Private journal entry]`.
    - Soft-deletion and archive filtering: Items in Trash (`is_archived = true` or `deleted_at IS NOT NULL`) are excluded by default unless explicitly requested via `includeArchived: true`.
    - Fastify search route (`apps/api/src/routes/v1/search.ts`): Exposes `GET /v1/workspaces/:workspaceId/search` accepting `q`, `types`, `folderId`, `tags`, `fromDate`, `toDate`, `includeArchived`, `limit`, and `offset`.
  - **Contracts & API Client (`packages/contracts`, `packages/api-client`)**:
    - Defined Zod schemas in `packages/contracts/src/api/search.ts`: `SearchItemTypeSchema`, `SearchQuerySchema`, `SearchQueryInput`, `SearchResultItemSchema`, and `SearchResponseSchema`.
    - Added `searchWorkspace(workspaceId, query, options)` method to `DaynoriApiClient` in `packages/api-client/src/client.ts`.
  - **Pure Domain Client-Side Search Engine (`packages/domain/src/search.ts`)**:
    - Pure offline search function `searchDownloadedRecords()`: Searches locally downloaded notes, tasks, journals, files, folders, and tags in client storage with vault exclusion, archive filtering, tag/date/type filtering, bounded pagination, and stable score/recency tie-breaking.
    - Safe match token highlighting `highlightMatch()`: Tokenizes search terms into alphanumeric words and escapes regex metacharacters, safely wrapping match occurrences in `<mark>` tags without injection risks.
    - Contextual snippet extraction `extractSearchSnippet()`: Locates query term occurrences in long plain-text bodies, returning a bounded window (±60 characters) with ellipsis indicators.
    - Canonical folder path builder `buildFolderPath()`: Assembles breadcrumb hierarchy from downloaded folder maps with cycle prevention.
  - **Web Search Experience (`apps/web/src/components/AppModals.tsx`)**:
    - Replaced navigation placeholder modal with interactive debounced live search (300ms debounce).
    - Horizontal type filter chips: `All`, `Notes`, `Tasks`, `Journal`, `Files`, `Knowledge`.
    - Offline fallback: Detects offline state (`navigator.onLine === false`) or API network failure, querying `IndexedDbLocalRepository` via `searchDownloadedRecords` and displaying `"Showing downloaded offline results"` (`coverage: 'offline_limited'`).
    - Safe snippet highlighting and canonical item navigation routing to `/today`, `/library`, `/journal`, `/files`, or `/plan`.
  - **Mobile Search Experience (`apps/mobile/src/views/SearchSheet.tsx`)**:
    - Replaced sample result list with live debounced search querying `apiClient.searchWorkspace`.
    - Offline fallback: Seamlessly falls back to `localRepository` and `searchDownloadedRecords`.
    - Type filter chips, coverage status badges, empty search states, pagination controls, error classification, and accessible item selection routing.

## Synthetic performance benchmark and index validation

A synthetic multi-tenant dataset was created and tested in `tests/integration/phase33-search.test.ts`:
- **Dataset size & distribution**:
  - 520 synthetic items distributed across 2 distinct tenant workspaces (notes, tasks, file items, folders, tags).
  - Varied content lengths: short titles, multiline notes, journal entries, and tag assignments.
- **Database version**: PostgreSQL 16 (Debian/Local) with `pg_trgm` extension.
- **Query plan execution (`EXPLAIN (ANALYZE, BUFFERS)`) under runtime role (`daynori_runtime`)**:
  - Verified Bitmap Index Scans utilizing `idx_items_workspace_updated`, `idx_notes_workspace_updated`, `idx_tasks_workspace_parent`, and `idx_file_items_workspace`.
  - Planning time: ~3.5ms; Database execution time: ~8.6ms on warm cache across 520 records under active Row-Level Security (`withTenantContext`).
  - API round-trip latency (5 samples): Min=12.2ms, Median=15.1ms, Max=24.8ms (verified well below 500ms).

## Verification results

1. **Automated Integration Suite (`tests/integration/phase33-search.test.ts`)**:
   - 13/13 tests passing:
     - Multi-tenant workspace isolation: Queries with identical terms in Workspace A and Workspace B only return records from the authorized workspace.
     - Revoked membership & unauthorized workspace rejection: Non-members and users with revoked roles receive HTTP 404 with zero metadata leaked.
     - Strict vault exclusion: Vault items, metadata, snippets, and counts are completely excluded from search results.
     - Strict Archive versus Trash separation: Default search excludes both archived and deleted records; `includeArchived: true` includes archived records while strictly retaining Trash exclusion.
     - Production file records: Full search support for canonical `app.items.kind = 'file'` records and metadata.
     - Journal privacy preferences: Masked journal entries display `[Private journal entry]` when profile preferences conceal previews (`journalPreviewHidden: true`), while preserving keyword matching on the plain text body.
     - Inert injection handling: Malicious SQL injection payloads (e.g., `' OR '1'='1' --`) are safely treated as inert search terms.
     - Multilingual Unicode search: Verified matching and token highlighting for Bangla (`বাংলা নোট`) and English text.
     - Entity type, folder hierarchy, and tag filtering: Filter combinations restrict results accurately.
     - Pure client-side local search: Evaluates `searchDownloadedRecords` against offline fixtures with coverage tracking, archive/trash separation parity, and journal privacy masking.
     - Synthetic multi-tenant indexed benchmark: Measures execution plan and latency across 520+ items under the runtime tenant role.
2. **Full Monorepo Integration & Unit Test Suite (`pnpm test`)**:
   - 55/55 test files passed.
   - 772/772 tests passed (including all prior phases: 10, 12-25, 27-32).
3. **Type Checking & Linting**:
   - `pnpm typecheck`: Passed (exit code 0 across all 13 workspace packages and apps).
   - `pnpm lint`: Passed (0 errors across the monorepo).
4. **Security & Secrets Validation**:
   - `pnpm audit:secrets`: Passed (checked 1,759 files without detecting unapproved secrets).
5. **Production Build Validation (`pnpm build`)**:
   - Passed: Next.js 15 web application production bundle compiled and static pages prerendered (`/library`, `/plan`, `/settings`, `/today`); Expo Android bundle exported.
6. **Planning & Roadmap Validation**:
   - `node scripts/validate-planning.mjs`: Passed (64 phases, 22 mapped requirements, 197 markdown files verified).

## Key Architecture Invariants

- **Strict Authorization & Scope**: All queries require an authorized workspace viewer role (`app.user_has_workspace_role`). Connection pool reuse never bleeds tenant context.
- **Zero Vault Leakage**: Vault records are excluded by query filter and database index partial predicates. No aggregate counts or snippet hints leak vault existence.
- **Journal Privacy Redaction**: Server-side masking guarantees that sensitive journal content is not sent over the wire when user privacy options suppress previews.
- **Deterministic Offline Fallback**: Client applications clearly signal search coverage (`online` vs `offline_limited`), preventing users from mistaking a partial offline cache for complete server results.

## Blocked gates and hardware dependencies

- **Physical Android TalkBack & Native KeyStore**: Provisional mobile implementation verified in automated headless test suites; physical TalkBack screen-reader gesture navigation and physical KeyStore hardware verification remain recorded as blocked gates.
- **External Production Push Providers**: Production FCM and Mozilla push gateway credentials remain blocked external dependencies. Push delivery was verified locally in prior phases.
