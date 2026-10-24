# ADR-0023: Focused Note Editor and Local Autosave Recovery

## Status

Accepted (Provisional focused web and mobile note editors delivered under owner authorization and verified across Vitest, React Native mobile tests, CDP browser testing, and integration test suite; physical Android TalkBack hardware and KeyStore release gates remain pending).

## Context

Phase 17 builds on the foundational typed note AST and persistence established in Phase 16 ([ADR-0022](0022-typed-note-domain-and-persistence.md)), satisfying requirements R-NOTE and R-CAPTURE in [docs/product/requirements.md](../product/requirements.md) and journey patterns in [docs/design/journeys.md](../design/journeys.md).

Notes require an authoring experience that balances distraction-free text entry with structural integrity:

1. **Direct Structured AST Manipulation**: Editing must directly manipulate the canonical `NoteDocument` AST (`packages/contracts/src/api/note.ts` and `packages/domain/src/notes.ts`) rather than flattening the document into lossy plain text or ad-hoc markdown strings that must be parsed on every keystroke.
2. **Debounced Local Autosave & Synchronization Decoupling**: Users should type naturally without an explicit manual save ritual. Local persistence must happen promptly on device (600ms debounce), while cloud sync occurs asynchronously in the background. The UI must clearly distinguish local save state from cloud synchronization status.
3. **IME Composition & Bilingual Safeguards**: Full support for complex scripts, particularly Bengali (Bangla / বাংলা), where composition events (e.g., Avro / OpenBangla phonetic typing) require undisturbed input buffers until composition completes (`compositionstart` / `compositionend`).
4. **Accessible Formatting Toolbar**: A restrained, accessible formatting toolbar supporting paragraphs, headings (H1–H3), bold inline marks, bullet lists, ordered lists, and checklists with keyboard navigation and screen-reader accessibility.
5. **Conflict Recovery & Session Undo/Redo**: When concurrent edits or offline divergences occur, the editor must surface conflict resolution options (Keep Server, Keep Local, Save Copy) without data loss, while preserving transient in-session undo/redo stacks.
6. **Strict Feature Boundaries**: Audio recording and capture must remain outside typed note creation (deferred to Phase 18).

## Decision

### 1. Web Note Editor (`packages/ui-web/src/NoteEditor.tsx`)

- Implemented an accessible, distraction-free rich note editor component in `@daynori/ui-web`:
  - **Title Editing**: Auto-resizing input with visible "Untitled" fallback and accessible label.
  - **Direct Block Rendering**: Structured blocks rendered directly from `NoteDocument.content` (`paragraph`, `heading` levels 1–3, `bullet_list`, `ordered_list`, `checklist_item`).
  - **Inline Text & Formatting**: Supports text editing with bold formatting toggle, preserving literal code snippets (`List<T>`, `x < y`) and Unicode without destructive tag-stripping.
  - **IME Composition Tracking**: Uses an `isComposingRef` flag to prevent debounced autosave triggers from interrupting active IME composition sessions.
  - **Session Undo/Redo**: Internal history stack tracking up to 50 document revisions, accessible via toolbar buttons and keyboard shortcuts (`Ctrl+Z`, `Ctrl+Y` / `Ctrl+Shift+Z`).
  - **Conflict Resolution Banner**: Prominently displays server conflict alerts with distinct action buttons: "Keep Server", "Keep Local", and "Save Copy".
  - **Dual Status Indicator**: Displays local storage status ("Saved locally", "Saving locally...") alongside cloud sync status ("Synced", "Syncing to cloud...", "Offline draft", "Sync conflict").

### 2. Mobile Note Editor (`packages/ui-mobile/src/MobileNoteEditor.tsx`)

- Implemented a touch-friendly React Native note editor in `@daynori/ui-mobile`:
  - **Native Input Experience**: Optimized `TextInput` fields with `scrollEnabled={false}` for responsive height expansion.
  - **Touch Formatting Toolbar**: 48dp minimum touch target buttons for block type switching (¶, H1, H2, H3, • List, 1. List, ☑ Check), bold toggle, and undo/redo.
  - **Interactive Checklists**: Tappable checkbox icons that toggle item completion status and update the underlying AST block atomically.
  - **Safe Text Projections**: Preserves Bangla Unicode and literal programming syntax without platform clipping.
  - **Conflict Actions**: Clean modal actions for resolving multi-device conflicts.

### 3. Application Integration (`apps/web` & `apps/mobile`)

- **Web Library (`apps/web/src/app/library/page.tsx`)**:
  - Embedded `NoteEditor` directly within the Library view when a note is active.
  - Supported URL deep linking and creation flow via `?create=note` query parameter.
  - Integrated with `IndexedDbLocalRepository` for atomic local draft saves and `SyncEngine.saveItem` for background cloud delivery.
- **Global Web Quick Actions (`apps/web/src/components/AppModals.tsx`)**:
  - Wired the global New Note modal entry to route directly to `/library?create=note`.
- **Mobile Library (`apps/mobile/src/views/LibraryView.tsx`)**:
  - Embedded `MobileNoteEditor` modal/view when a note is selected or newly created via the `+ Note` action button.
  - Integrated with `SqliteLocalRepository` and `SyncEngine` for offline SQLite storage and background synchronization.

## Consequences

- Direct AST editing eliminates structural corruption and round-trip parsing overhead.
- IME composition safeguards ensure seamless typing for bilingual and non-Latin script users.
- Independent status badges give users full visibility into whether their thoughts are durable on the current device vs. uploaded to the server.
- Phase 18 audio capture remains completely decoupled from typed note creation.
- Physical Android hardware and TalkBack verification gates remain tracked and required prior to production deployment.
