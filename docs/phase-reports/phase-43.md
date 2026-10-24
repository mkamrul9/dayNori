# Phase 43: Custom Section Builder and Personal Templates (Provisional Local Implementation)

Group: Personal extensions. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [43 — Custom section builder and personal templates](../roadmap/phases/43-custom-section-builder-and-personal-templates.md)
- **Status:** `blocked` (Provisional local development completed and verified under explicit owner authorization; completion remains explicitly `blocked` pending prerequisite Phase 37 release gates, Phase 38 private beta deployment, and store submission).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-19.
- **Base Git revision and branch:** `main` (following prerequisite repairs commit `2f3481f` `fix(customization,audio)`).
- **Prerequisites:**
  - [Phase 30 — Today home and personal customization](phase-30.md): Layout and customization models.
  - [Phase 41 — Audio recording and attachment lifecycle](phase-41.md): Verified attachment models and audio draft durability.
  - [Phase 42 — Safe custom section schema and renderer contracts](phase-42.md): Declarative versioned schema ledger and fallback renderer contracts.
- **Prerequisite Defects Repaired Prior to Phase 43 (`2f3481f`):**
  - **Append-only & Versioned Archive Preservation:** Fixed `migrateRecordValues` so that successive schema evolutions append to versioned archive arrays (`ArchivedFieldValue[]`) with stable `archiveId`, `fromSchemaVersion`, `toSchemaVersion`, and reason metadata instead of overwriting earlier archives by field ID. Added recovery semantics via `getArchivedFieldValues` and `restoreArchivedFieldValue`.
  - **Prototype Key & Reserved Identifier Rejection:** Replaced unsafe indexing with strict own-property checks and validation rejecting `__proto__`, `constructor`, `prototype`, and duplicate block/field IDs.
  - **Schema Immutability at Database Boundary:** Created database trigger migration `00044_custom_section_schemas_immutability.sql` enforcing immutability of historical schema versions at the PostgreSQL boundary by throwing exceptions on runtime `UPDATE` or `DELETE` statements.
  - **Atomic Revisions & Concurrency Row Locking:** Hardened section and record mutation queries using `SELECT ... FOR UPDATE` row-level locks, eliminating race conditions and enforcing optimistic revision checks.
  - **Canonical Reference Verification:** Enforced workspace-scoped existence checks for attachments and item links (`app.items`, `app.files`), preventing cross-tenant reference leakage.
  - **Real Canonical Query & Preference Enforcement:** Corrected `queryExistingRecordView` to use established tables (`app.files`, `app.file_items`, `app.tasks`, `app.notes`, `app.routines`, `app.expenses`) and enforced module preferences (e.g. `expensesEnabled: false` safely returns empty view rather than bypassing user preferences).
  - **Audio Draft IndexedDB Durability:** Fixed web `audioDraftStore` to explicitly await transaction completion (`tx.oncomplete`) and surface persistence failures rather than silently reporting in-memory fallbacks as saved durable audio.
- **Included Scope (Guided Builder & Personal Templates):**
  - **ADR 0042 Authored (`docs/decisions/0042-custom-section-builder-and-personal-templates.md`):**
    - Architectural decision documenting discoverable section builder dialog/sheet, starter templates and personal templates lifecycle (fork-on-use model, strictly zero leakage of private user records), schema evolution preview with plain-language impact analysis, canonical folder and collection scoping, accessible non-drag reordering, and read-only fallback rendering for unknown block versions.
  - **Database Migrations (`infra/supabase/migrations/`):**
    - `00045_custom_section_templates.sql`: Created `app.custom_section_templates` table with workspace-scoped RLS policies, unique naming per workspace, and table grants.
    - `00046_custom_section_record_folder_and_collection.sql`: Added `folder_id` and `collection_id` to `app.custom_section_records` with composite indexes for canonical folder placement and collection scoping.
  - **Contracts & Schemas (`@daynori/contracts`):**
    - `CustomSectionTemplateItemSchema`, `CreateCustomSectionTemplateRequestSchema`, `ListCustomSectionTemplatesResponseSchema`.
    - `PreviewSchemaMigrationRequestSchema`, `FieldMigrationImpactSchema`, `SchemaMigrationPreviewResponseSchema`.
  - **Pure Domain Logic (`@daynori/domain`):**
    - `generateSchemaMigrationPreview`: Computes field differences (removed fields, type changes, constraint changes, added fields) and formats plain-language impact messages explaining what is preserved in append-only archives.
    - `createSectionPayloadFromTemplate`: Instantiates fresh sections from templates with isolated IDs and schemas, decoupling template edits from existing instances.
    - `APPROVED_CUSTOM_SECTION_TEMPLATES`: Predefined starters including Reading List, Study Hub, Project Tracker, and Equipment Log.
  - **API Service & Routes (`apps/api`):**
    - Custom section templates CRUD under `/v1/workspaces/:workspaceId/custom-section-templates`.
    - Schema migration preview endpoint under `/v1/workspaces/:workspaceId/custom-sections/:sectionId/schemas/preview`.
    - Record CRUD updated with `folderId` and `collectionId` scoping.
  - **API Client SDK (`@daynori/api-client`):**
    - Added `previewCustomSectionSchema`, `createCustomSectionTemplate`, `listCustomSectionTemplates`, `getCustomSectionTemplate`, and `deleteCustomSectionTemplate`.
  - **Accessible UI Components (`@daynori/ui-web` & `@daynori/ui-mobile`):**
    - Web `CustomSectionBuilderDialog`: Guided wizard supporting starter template selection, personal templates, collection vs existing-view vs combined modes, accessible non-drag field reordering ("Move Up" / "Move Down"), field constraints, and folder placement.
    - Web `SchemaMigrationPreviewModal`: Displays affected record count, plain-language field impact list, and archive preservation assurances with explicit Proceed/Cancel controls.
    - Web `CustomSectionRenderer`: Renders collection tables/cards/lists, existing-record views, archive recovery dialog, and read-only fallback for unknown block types.
    - Mobile `MobileCustomSectionBuilderSheet`: Native modal sheet with touch targets >= 48dp, keyboard/screen-reader reorder buttons, template pickers, and field builder.
    - Mobile `MobileCustomSectionRenderer`: Native block and record renderer with design token compliance and fallback card display.
- **Excluded / Blocked Scope:**
  - Arbitrary user JavaScript, formulas, or raw SQL evaluation (strictly prohibited).
  - External beta deployment, tester invites, app store distribution, or enabling unreleased features.

## Acceptance evidence

### Verification Matrix

| Deliverable / Artifact | Path / Command | Observed Result | Status |
| :--- | :--- | :--- | :--- |
| **ADR 0042** | `docs/decisions/0042-custom-section-builder-and-personal-templates.md` | Architectural decision covering builder dialogs, personal templates, schema preview, and canonical queries. | **PASS** |
| **Database Migrations** | `00045_custom_section_templates.sql`, `00046_custom_section_record_folder_and_collection.sql` | Applied cleanly via migrator; RLS policies, composite indexes, and grants verified. | **PASS** |
| **Contracts Schemas & Build** | `packages/contracts/src/api/customSections.ts` | Templates and migration preview schemas exported; builds cleanly via `tsc -b`. | **PASS** |
| **Domain Logic & Tests** | `packages/domain/src/customSections.ts` & `domain.test.ts` | 79/79 unit tests passing including schema migration preview, starter templates, and archive retention. | **PASS** |
| **UI Web Primitives & Tests** | `packages/ui-web` & `ui-web.test.ts` | 47/47 unit tests passing including builder dialog, migration modal, and renderer with unknown block fallback. | **PASS** |
| **UI Mobile Primitives & Tests** | `packages/ui-mobile` & `ui-mobile.test.ts` | 13/13 unit tests passing including mobile builder sheet and mobile renderer. | **PASS** |
| **API Client SDK** | `packages/api-client/src/client.ts` | 5 new template and preview methods added; builds cleanly via `tsc -b`. | **PASS** |
| **API Service & Routes** | `apps/api/src/modules/custom-sections/service.ts` & `routes/v1/customSections.ts` | Template CRUD, schema preview, and folder/collection record scoping verified. | **PASS** |
| **Phase 43 Integration Suite** | `tests/integration/phase43-custom-section-builder.test.ts` | 16/16 tests passing across all 6 core user journeys: Reading List creation with folder placement, field reordering, personal template save and reuse without private data leakage, Study Hub combining Software files and tasks without source deletion, schema preview with repeated migration archive recovery, and unknown block fallback. | **PASS** (809ms) |
| **Regression Integration Suites** | `phase41-audio-recording-attachment.test.ts`, `phase42-custom-sections.test.ts` | 38/38 tests passing (19 in Phase 41, 19 in Phase 42) confirming zero regressions in audio drafts and custom sections. | **PASS** |
| **Full Typecheck** | `pnpm typecheck` | All 13 workspace packages compiled cleanly with 0 errors. | **PASS** |
| **Linting & Code Style** | `pnpm eslint` | Zero lint errors or warnings across all modified packages. | **PASS** |
| **Planning Validation** | `pnpm validate:planning` | 64 phases, 22 mapped requirements, 216 Markdown files passed. | **PASS** |
| **Git Diff Validation** | `git diff --check` | Clean diff with zero whitespace or line-break errors. | **PASS** |
| **Secrets Audit** | `pnpm audit:secrets` | 1910 files scanned with zero unapproved secrets. | **PASS** |

## Phase 42/43 Defect Repairs & Application Integration

Prior to performing Phase 44, the following defects and integration gaps were repaired and verified:
1. **Canonical `app.items` Identity:** Created migration `00047_custom_record_items_and_attachments.sql` adding `'custom_record'` to `app.items.kind` CHECK constraint, backfilling canonical `app.items` entries for custom records, and foreign-key linking `custom_section_records.item_id`.
2. **Real Attachment Linking & Reconciliation:** Aligned `validateAndLinkReferences` to use real `app.item_attachments` columns (`attachment_type`, `file_name`, `mime_type`, `byte_size`, `created_by`, `item_id`). Implemented reconciliation on record update and delete without leaving orphaned records or deleting shared files.
3. **Tenant & Security Scope Validation:** Validated `folderId` strictly against the active workspace, active folder status, and `security_scope = 'standard'`. Validated `collectionId` strictly against active schema collections. Renderers filter records strictly by collection to prevent unscoped cross-collection record leakage.
4. **Existing Record View Expenses Hardening:** Enforced explicit user opt-in (`expensesEnabled === true`), exact integer BigInt arithmetic for refund subtraction, formatting via `formatMinorUnitsToDecimal`, and valid v4 UUID summary IDs matching the contract schema.
5. **Reachable Application Integration:**
   - Web: Added `/custom-sections` page (`apps/web/src/app/custom-sections/page.tsx`) and sidebar navigation link wiring builder dialog, entry dialog, renderer, and migration preview modal.
   - Mobile: Added `CustomSectionsView` (`apps/mobile/src/views/CustomSectionsView.tsx`), wired into `SettingsView` and `App.tsx` (`activeModal = 'custom-sections'`).
   - Platform Field Editors: Implemented `CustomSectionEntryDialog` (web) and `MobileCustomSectionEntrySheet` (mobile) for structured fields, folder placement, safe links, checklists, and attachments.
   - Verified Reading List and Study journeys through end-to-end integration tests and application callers.

## Commit target

Prerequisite repairs: `fix(customization): repair attachment linking, expense summaries, and application integration`
