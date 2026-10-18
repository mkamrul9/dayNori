# ADR-0037: Knowledge Guides, Cheatsheet Organization, and Saved Views

## Status

Accepted (Phase 32 implementation verified across web and mobile platforms with canonical NoteDocument AST v1, topic folder organization without duplicate note bodies, saved views with non-destructive filtering, accessible quick-reference views with clean text-only clipboard boundaries, and safe internal item link/backlink resolution with honest explanations; physical Android accessibility TalkBack and production external services remain explicit blocked release gates).

## Context

Phase 32 establishes knowledge guides and cheatsheet organization ([docs/roadmap/phases/32-knowledge-guides-and-cheatsheet-organization.md](../roadmap/phases/32-knowledge-guides-and-cheatsheet-organization.md)). Daynori users require structured guides, operational runbooks, and dense syntax cheatsheets with quick-copyable code blocks, without fragmenting the underlying document storage or duplicating note bodies across topic folders and filtered views.

Key architectural challenges and invariants addressed in this ADR:

1. **One Canonical Note Body (`NoteDocument` AST v1) Without Secondary Stores**:
   - Rather than creating a separate database table or divergent payload format for "knowledge articles", procedural how-to guides and cheatsheets are stored directly as standard notes in `app.notes` using the canonical `NoteDocument` AST (version 1).
   - This ensures full compatibility with existing note storage, full-text search, revision tracking, conflict handling, and offline synchronization engines.
   - Guides and cheatsheets compose approved block types (`heading`, `paragraph`, `ordered_list`, `bullet_list`, `checklist`, `code_block`); no user-supplied executable scripts or arbitrary HTML/SQL are ever evaluated.

2. **Procedural Guide & Cheatsheet Presets (`packages/domain/src/knowledge.ts`)**:
   - Pure domain factory functions `createGuideDocument()` and `createCheatsheetDocument()` produce structured Note documents with standard headings, steps, checklists, and key-value command syntax.
   - Tags (e.g. `#guide`, `#cheatsheet`, `#reference`) and title naming conventions classify knowledge documents without altering table schemas or adding redundant foreign keys.

3. **Quick-Reference Browsing & Clean Text-Only Capture Boundaries**:
   - `extractQuickReferenceSections()` scans the canonical `NoteDocument` AST to extract structured sections containing command labels, syntax/code values, checklists, and descriptions.
   - `cleanTextForClipboard()` establishes a strict plain text capture boundary:
     - Strips leading and trailing markdown code fences (with optional language identifiers like ```` ```bash ````) and backticks.
     - Strips ASCII control characters while preserving standard tabs and line breaks.
     - Ensures that copying commands grabs pure executable text directly for terminal or editor pasting, without Markdown formatting artifacts.

4. **Topic Folders & Non-Destructive Multi-View Filtering**:
   - Guides and cheatsheets reside in standard workspace folders (`app.folders` / `app.items`), allowing natural hierarchy and drag-and-drop reorganization.
   - Saved views (`app.saved_views`) provide non-destructive virtual lenses across the knowledge collection.
   - The pure predicate `matchesKnowledgeFilter()` allows a single canonical note body to match multiple saved views simultaneously (e.g., matching a "DevOps" topic folder view, a "Cheatsheets" preset view, and a "High Priority" pinned view) without duplicating content.

5. **Tenant-Scoped Saved Views Persistence (`app.saved_views`)**:
   - Migration `00028_saved_views_and_knowledge_organization.sql` introduces `app.saved_views` with UUID primary keys, workspace foreign keys with `ON DELETE CASCADE`, and strict row-level security policies (`USING app.user_has_workspace_role(workspace_id, 'viewer')`).
   - Saved views are strictly isolated by tenant; cross-tenant access, listing, or mutations are denied at both database RLS and API service layers.

6. **Safe Internal Item Links, Backlinks, and Honest Unavailable Target Notices**:
   - Internal references between items use `app.item_links`, referencing `(workspace_id, id)` in `app.items` to guarantee referential integrity.
   - `resolveItemLinksAndBacklinks()` resolves both forward outgoing links and reverse incoming backlinks in a single query.
   - Cross-tenant link creation is rejected (HTTP 404). Corrupted or cross-tenant references never leak titles of private items in other workspaces.
   - When a referenced target note is soft-deleted or trashed (`deleted_at IS NOT NULL`), `formatUnavailableLinkNotice()` provides an honest, accessible explanation (`"Item Title" has been moved to trash or deleted`) and renders the title with strikethrough styling instead of throwing silent errors or broken links.

7. **Cross-Platform Accessible Interfaces (`packages/ui-web` & `packages/ui-mobile`)**:
   - `QuickReferenceView` and `MobileQuickReferenceView` render accessible quick-reference panels with `aria-live="polite"` clipboard copy confirmations, accessible checkboxes, and structured links/backlinks lists.
   - Both Web (`/library`) and Mobile (`LibraryView`) support "+ Guide", "+ Cheatsheet", quick reference viewer toggle, and horizontal saved views navigation bars.

## Consequences

- No schema duplication or maintenance overhead from secondary note body tables.
- Zero drift between note editing and quick-reference viewing, as both read and write the exact same canonical `NoteDocument` AST.
- Copying syntax commands to clipboard provides clean, predictable text ready for terminal execution.
- Deleted or unavailable link targets degrade gracefully with honest user explanations.
