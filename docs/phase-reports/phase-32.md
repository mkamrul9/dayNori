# Phase 32: Knowledge guides and cheatsheet organization

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [32 — Knowledge guides and cheatsheet organization](../roadmap/phases/32-knowledge-guides-and-cheatsheet-organization.md)
- **Status:** `blocked` (Software implementation, canonical NoteDocument AST v1 presets, topic folder organization without duplicate bodies, saved views with non-destructive multi-view filtering, Web QuickReferenceView, Mobile MobileQuickReferenceView, clean plain-text clipboard boundaries, safe internal item links and reverse backlinks with honest unavailable target notices, cross-tenant isolation, and 12 integration tests verified locally; completion status recorded as `blocked` in `docs/roadmap/progress.json` due to prerequisite physical Android TalkBack / KeyStore hardware gates and external production provider push services).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-18.
- **Base Git revision and branch:** `59a2e6b: fix(organizer): repair Phase 21 and Phase 22 organizer defects` on `main`. Follow-up defect repairs committed in `403818e: fix(organizer): repair knowledge persistence, saved views, and offline onboarding`.
- **Prerequisites:**
  - [Phase 17 — Focused note editor on both platforms](phase-17.md): Canonical NoteDocument editor, persistence, and synchronization.
  - [Phase 15 — Folder browsing and organization interfaces](phase-15.md): Folder hierarchy, navigation, and library organization.
- **Included scope:**
  - **Canonical Note Presets (`packages/domain/src/knowledge.ts`)**:
    - Procedural how-to guide factory `createGuideDocument()` composing approved block types (`heading`, `paragraph`, `ordered_list`, `checklist`) into standard `NoteDocument` AST v1.
    - Reference cheatsheet factory `createCheatsheetDocument()` composing headings, summary, and bulleted code/command syntax items into standard `NoteDocument` AST v1.
    - Zero separate or secondary note body stores; one canonical document format across notes and knowledge items.
  - **Quick-Reference Browsing & Clean Text-Only Capture Boundaries**:
    - Pure extraction function `extractQuickReferenceSections()`: Scans `NoteDocument` AST blocks to produce categorized quick-reference sections, syntax entries, and checklists.
    - Pure clipboard cleaner `cleanTextForClipboard()`: Strips Markdown code block fences (with optional language identifiers like ```` ```bash ````), single/triple backticks, and ASCII control characters to ensure clean, pure text-only capture without unintended formatting.
  - **Saved Views & Non-Destructive Multi-View Filtering**:
    - Database migration `00028_saved_views_and_knowledge_organization.sql`: Creates `app.saved_views` with UUID primary keys, workspace scoping, RLS policies, and compound indexes.
    - API contracts in `packages/contracts/src/api/knowledge.ts`: Zod schemas for `SavedView`, `CreateSavedViewRequest`, `UpdateSavedViewRequest`, and `KnowledgeSavedViewFilter`.
    - API service and routes in `apps/api/src/modules/knowledge/service.ts` and `apps/api/src/routes/v1/knowledge.ts`: Full workspace-scoped CRUD for saved views.
    - Pure filter predicate `matchesKnowledgeFilter()` in `packages/domain/src/knowledge.ts`: Tests items against saved filters (presetKind, folderId, tagNames, isPinned, isArchived, searchQuery) non-destructively. A single canonical note appears across multiple views without body duplication.
  - **Internal Item Links, Reverse Backlinks, and Honest Unavailable Target Explanations**:
    - Link resolution endpoint `GET /v1/workspaces/:workspaceId/items/:itemId/links/resolved` in `apps/api/src/modules/knowledge/service.ts`: Resolves both forward outgoing links and reverse incoming backlinks with item metadata.
    - `formatUnavailableLinkNotice()` in `packages/domain/src/knowledge.ts`: Honest explanations for unavailable targets (e.g., `'Item Title' has been moved to trash or deleted`, or `does not exist or could not be found`) with strikethrough presentation.
    - Cross-tenant link creation rejection (HTTP 404) and leak prevention: Corrupted or cross-tenant references never reveal titles of items from other workspaces.
  - **Web & Mobile Library Interfaces**:
    - `packages/ui-web/src/QuickReferenceView.tsx`: Accessible quick-reference viewer with `aria-live="polite"` clipboard copy confirmations, checklist display, and internal links/backlinks panel.
    - `packages/ui-mobile/src/MobileQuickReferenceView.tsx`: Mobile quick-reference viewer with touch targets (≥48dp), TalkBack accessibility announcements, and links/backlinks panel.
    - Web Library Page (`apps/web/src/app/library/page.tsx`): "+ Guide", "+ Cheatsheet", quick-reference toggle, horizontal saved views filter bar, and "Save Current Filter as View" dialog.
    - Mobile Library View (`apps/mobile/src/views/LibraryView.tsx`): "+ Guide", "+ Cheatsheet", quick-reference viewer toggle, and horizontal saved views scroll list.

## Verification results

1. **Automated Integration Suite (`tests/integration/phase32-knowledge.test.ts`)**:
   - 12/12 tests passing:
     - Canonical `NoteDocument` procedural guide preset generation.
     - Canonical `NoteDocument` cheatsheet preset generation with clean text-only clipboard boundary.
     - Topic folder creation and guide storage without secondary stores.
     - Guide relocation to another folder while preserving exact canonical AST body.
     - Saved view CRUD (create, list, get, update, delete) scoped to workspace.
     - One canonical note body matching across multiple saved views without body duplication.
     - Clean deletion and isolation of saved views.
     - Forward outgoing links and reverse incoming backlinks resolution.
     - Soft-deleted note link honestly reported as `unavailableReason: 'deleted'` with user explanation.
     - Dangling link honestly reported as `unavailableReason: 'not_found'`.
     - Strict isolation of saved views between tenants.
     - Rejection of cross-tenant item links (HTTP 404) and leak protection.
2. **Full Monorepo Integration & Unit Test Suite (`pnpm test`)**:
   - 54/54 test files passed.
   - 753/753 tests passed (including all prior phases: 10, 12-25, 27-31).
3. **Type Checking & Linting**:
   - `pnpm typecheck`: Passed (exit code 0 across all 13 workspace packages and apps).
   - `npx eslint`: Passed (0 errors, 0 warnings on modified Phase 32 code).
4. **Production Build Validation (`pnpm build`)**:
   - Passed: Next.js 15 web application production bundle compiled and static pages prerendered (`/library` statically built at 13.1 kB); Expo Android bundle exported.
5. **Planning & Roadmap Validation**:
   - `node scripts/validate-planning.mjs`: Passed (64 phases, 22 mapped requirements, 195 markdown files verified).

## Key Architecture Invariants

- **Canonical Document Representation**: Guides, cheatsheets, and general notes share a single canonical document model (`NoteDocument` AST v1). No secondary stores or divergent body formats are introduced.
- **Non-Destructive Filtering**: Saved views are pure virtual lenses over the canonical repository. Creating, updating, or deleting saved views never mutates or deletes note content.
- **Accurate Target Availability**: Internal links honestly convey target state (`deleted`, `not_found`, `unauthorized`) without throwing unhandled exceptions or presenting dead/broken interactions.
- **Tenant Scope Enforcement**: All saved views and item links are strictly validated against `workspace_id`. Cross-tenant links are rejected and cross-tenant titles are never leaked.

## Blocked gates and hardware dependencies

- **Physical Android TalkBack & Native KeyStore**: Provisional mobile implementation verified in automated headless test suites; physical TalkBack screen-reader gesture navigation and physical KeyStore hardware verification remain recorded as blocked gates.
- **External Production Push Providers**: Production FCM and Mozilla push gateway credentials remain blocked external dependencies. Push delivery was verified locally in prior phases.
