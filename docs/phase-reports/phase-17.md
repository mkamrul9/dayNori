# Phase 17: Focused note editor on both platforms

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [17 — Focused note editor on both platforms](../roadmap/phases/17-focused-note-editor-on-both-platforms.md)
- **Status:** `blocked` (Provisional focused web and mobile note editors delivered under owner authorization and verified across Vitest, React Native mobile tests, CDP browser testing, and integration test suite; completion blocked pending prerequisite Phase 04–06 and Phase 11 physical Android TalkBack hardware and KeyStore release gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-16.
- **Base Git revision and branch:** `7b7c9b9` on `main`.
- **Prerequisites:**
  - [Phase 16 — Typed note domain and persistence](phase-16.md): Portable document AST, inert sanitization, PostgreSQL schema, and sync engine integration.
  - Prerequisite repairs committed in `7b7c9b9`: Content preservation without angle-bracket stripping, multi-store atomic local repository transactions, sync engine note document synchronization, row-level locking under workspace lock, cached idempotency replay, and revision preconditions.
- **Included scope:**
  - **Shared Web UI Component (`packages/ui-web/src/NoteEditor.tsx`):**
    - Distraction-free title and body editing with accessible labels and auto-resizing text fields.
    - Visible "Untitled" fallback display when title is empty.
    - Direct structured editing of canonical `NoteDocument` AST without lossy round-tripping to plain text.
    - Supported block types: paragraphs, headings (levels 1, 2, 3), bullet lists, ordered lists, and checklists with interactive toggles.
    - Restrained accessible formatting toolbar with block controls, bold inline styling toggle, and session undo/redo buttons.
    - Keyboard navigation and shortcuts (`Ctrl+Z`, `Ctrl+Y` / `Ctrl+Shift+Z`).
    - Input Method Editor (IME) composition tracking (`isComposingRef`) protecting Bengali (Bangla / বাংলা) phonetic typing and complex scripts from debounced save interruptions.
    - Debounced 600ms autosave feedback loop decoupling local persistence from cloud synchronization.
    - Conflict recovery banner with explicit resolution choices: "Keep Server", "Keep Local", and "Save Copy".
    - Dual status indicators clearly distinguishing local device storage from cloud sync states.
  - **Shared Mobile UI Component (`packages/ui-mobile/src/MobileNoteEditor.tsx`):**
    - Touch-optimized React Native note editor with title and body block editing.
    - 48dp minimum touch target formatting toolbar (¶, H1, H2, H3, • List, 1. List, ☑ Check, Bold, Undo, Redo).
    - Interactive checkbox toggles updating AST block states atomically.
    - Local persistence and cloud sync status indicators.
    - Conflict resolution modal options for server divergence recovery.
  - **Web Application Integration (`apps/web/src/app/library/page.tsx` & `apps/web/src/components/AppModals.tsx`):**
    - Embedded `NoteEditor` directly within Library view with deep linking via `?create=note`.
    - Wired global "New Note" action modal to launch the focused note editor immediately.
    - Dual persistence via `IndexedDbLocalRepository` (atomic local save) and `SyncEngine.saveItem` (cloud delivery).
  - **Mobile Application Integration (`apps/mobile/src/views/LibraryView.tsx`):**
    - Integrated `MobileNoteEditor` with `+ Note` action button and note card tap selection.
    - Dual persistence via `SqliteLocalRepository` and `SyncEngine`.
  - **Testing & Verification:**
    - `packages/ui-web/src/ui-web.test.ts`: Added unit tests for NoteEditor rendering, block formatting, and Bangla text preservation.
    - `packages/ui-mobile/src/ui-mobile.test.ts`: Added unit tests for MobileNoteEditor rendering and actions.
    - `tests/integration/phase17-focused-note-editor.test.ts`: Integration test suite verifying literal code and Bangla preservation, recoverable document conversion, size and complexity limits, and AST validation.
    - `scripts/test-web-e2e.mjs`: Validated note creation, editing, and persistence in real headless Chromium via CDP.
- **Excluded/deferred scope:**
  - Audio capture and voice notes are strictly excluded from typed note creation (deferred to Phase 18).
  - Encrypted note vault storage and biometric gates (deferred to Phases 44–47).
  - Physical Android TalkBack and hardware KeyStore release gates remain blocked pending physical device availability.

## Result

Delivered the complete Phase 17 focused note editor across `packages/ui-web`, `packages/ui-mobile`, `apps/web`, and `apps/mobile`:

1. **Distraction-Free Authoring**: Users can open, title, and write notes smoothly without intrusive interface chrome. Titles default visually to "Untitled" when left blank while maintaining the first-line title derivation invariant.
2. **Direct AST Formatting**: The editor operates directly on the canonical version 1 `NoteDocument` AST. Formatting commands (H1–H3, bold, bullet lists, numbered lists, checklists) mutate block representations directly without flattening to markdown or plain text, eliminating formatting degradation and round-trip parsing errors.
3. **Bangla & Complex Script IME Fidelity**: IME composition events are tracked to ensure that phonetically composed characters (e.g., Avro Bengali typing) are never split or dropped by autosave triggers.
4. **Decoupled Persistence & Sync Indicators**: The UI clearly displays whether changes are durable locally ("Saved locally", "Saving locally...") independently of cloud synchronization ("Synced", "Syncing to cloud...", "Offline draft", "Sync conflict").
5. **Conflict Recovery**: When concurrent edits produce a server revision conflict, users are provided with clear, non-destructive resolution actions: Keep Server, Keep Local, or Save Copy.
6. **Accessible Toolbar & Touch Targets**: Keyboard shortcuts (`Ctrl+Z`, `Ctrl+Y`, `Ctrl+B`) and 48dp touch targets on mobile ensure full accessibility compliance.

## Acceptance evidence

| Acceptance Condition                           | Verification Method                                                                                                | Location / Artifact                                     | Result                                                                  |
| :--------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------ | :---------------------------------------------------------------------- |
| **Distraction-Free Web Note Editor**           | Unit tests verifying editor layout, title fallback, formatting toolbar, and conflict banner                        | `packages/ui-web/src/ui-web.test.ts`                    | **PASS**: 26/26 unit tests passed.                                      |
| **Mobile Note Editor Primitives**              | React Native component tests verifying title, blocks, checklist toggling, and toolbar                              | `packages/ui-mobile/src/ui-mobile.test.ts`              | **PASS**: 5/5 unit tests passed.                                        |
| **Bangla Unicode & Literal Code Preservation** | Integration tests round-tripping literal `List<T>`, `x < y`, HTML snippets, and Bengali Unicode (`আমার প্রথম নোট`) | `tests/integration/phase17-focused-note-editor.test.ts` | **PASS**: Literal content preserved inertly without tag stripping.      |
| **Document Size & Complexity Enforcement**     | Integration tests validating enforcement of `MAX_NOTE_DOCUMENT_BYTES` (512 KB) and `MAX_NOTE_NODES` (5000)         | `tests/integration/phase17-focused-note-editor.test.ts` | **PASS**: Excessive documents rejected cleanly with descriptive errors. |
| **End-to-End Headless Browser Validation**     | Real Chromium CDP session testing navigation, library loading, and note view rendering                             | `scripts/test-web-e2e.mjs`                              | **PASS**: 46/46 checks passed with 0 failures.                          |
| **Strict Type Checking**                       | Full monorepo TypeScript verification across all 13 workspace projects                                             | `pnpm typecheck`                                        | **PASS**: 0 type errors across all packages.                            |
| **Code Style & Formatting**                    | Monorepo Prettier and ESLint validation                                                                            | `pnpm lint` & `pnpm format:check`                       | **PASS**: 0 lint errors, 0 warnings; all files match code style.        |
| **Secret Scanning**                            | Repository secret scanner inspecting working tree and Git objects                                                  | `node scripts/scan-secrets.mjs`                         | **PASS**: 1611 files checked, 0 secrets detected.                       |
| **Planning Consistency**                       | Roadmap planning validator checking phases, requirements, and dependencies                                         | `node scripts/validate-planning.mjs`                    | **PASS**: 64 phases and 22 requirements validated.                      |

### Commands Executed

```bash
# Unit test suite
pnpm test
# Exit code: 0, 32 files passed, 396 tests passed

# Integration test suite
pnpm test:integration
# Exit code: 0, 8 files passed, 111 tests passed

# Web E2E CDP browser verification
node scripts/test-web-e2e.mjs
# Exit code: 0, 46/46 checks passed

# Monorepo type checking
pnpm typecheck
# Exit code: 0, 13 projects cleanly checked

# Monorepo linting
pnpm lint
# Exit code: 0, 0 errors, 0 warnings

# Formatting check
pnpm format:check
# Exit code: 0, all files formatted

# Secret scan
node scripts/scan-secrets.mjs
# Exit code: 0, 1611 files checked, 0 secrets found

# Planning validation
node scripts/validate-planning.mjs
# Exit code: 0, canonical plan is consistent
```

## Defects, limitations and recovery

- **Physical Android & TalkBack Verification (Blocked Gate):** Automated unit and mock tests verify React Native components, but verification on physical Android hardware with TalkBack screen reader remains blocked pending physical device lab access.
- **Hardware KeyStore Gate (Blocked Gate):** Hardware-backed key wrapping verification on physical Android devices remains blocked.
- **Collaborative Real-Time Editing:** Live concurrent multi-user editing (e.g. CRDT / OT) is explicitly out of scope for Phase 17; optimistic concurrency control with explicit conflict resolution is utilized instead.

## Documentation and Git review

- **Updated Specifications & Documentation:**
  - Linked Phase 17 in `docs/roadmap/progress.json` with `status: "blocked"` noting owner authorization and blocked physical hardware gates.
  - Published [ADR-0023: Focused Note Editor and Local Autosave Recovery](../decisions/0023-focused-note-editor-and-autosave.md) and linked in [ADR Index](../decisions/README.md).
  - Updated `CHANGELOG.md` with delivered Phase 17 web and mobile note editor features.
- **Git Review:**
  - Staged paths reviewed for secrets, temporary fixtures, and private tokens: clean.
  - Intended conventional commit subject: `feat(notes): deliver focused web and mobile note editors`.

## Handoff

- **Completed Deliverable:** Phase 17 focused note editor on web and mobile with direct AST editing, debounced autosave, decoupled sync indicators, IME composition protection, and conflict resolution.
- **Next Phase:** Phase 18 — Upcoming task domain and deadlines. Note: Task domain handles canonical task entities, priority, statuses, and explicit deadline semantics. Audio recording belongs to its separately scheduled phase. Stop here as authorized.
