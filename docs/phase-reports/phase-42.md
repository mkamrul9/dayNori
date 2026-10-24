# Phase 42: Safe custom section schema and renderer contracts (Provisional Local Implementation)

Group: Personal extensions. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [42 — Safe custom section schema and renderer contracts](../roadmap/phases/42-safe-custom-section-schema-and-renderer-contracts.md)
- **Status:** `blocked` (Provisional local development completed and verified under explicit owner authorization; completion remains explicitly `blocked` pending prerequisite Phase 37 release gates, Phase 38 private beta deployment, and store submission).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-19.
- **Base Git revision and branch:** `main` (following prerequisite repairs commit `e6cad77` `fix(audio,expenses)`).
- **Prerequisites:**
  - [Phase 37 — Core quality and usability release gate](phase-37.md): Evaluated; release gate decision remains `blocked` on physical Android hardware and production credentials.
  - [Phase 38 — Controlled private beta](phase-38.md): Local preparation completed; release gate decision remains `blocked` pending cloud staging, external signing credentials, and tester cohort.
  - [Phase 39 — Expense tracking domain](phase-39.md): Verified financial models.
  - [Phase 40 — Expense capture reports and budgets](phase-40.md): Hardened interfaces and reports.
  - [Phase 41 — Audio recording and attachment lifecycle](phase-41.md): Verified attachment and storage models.
- **Included Scope (Safe Versioned Schema & Renderer Contracts)**:
  - **ADR 0041 Authored (`docs/decisions/0041-safe-custom-section-schema-and-renderer-contracts.md`)**:
    - Architectural decision documenting declarative schema architecture, two approved block families (`field_collection` and `existing_record_view`), strict rejection of user-supplied scripts/SQL/raw HTML, zero-data-loss evolution via `archivedValues`, and the fallback representation contract for forward/backward compatibility.
  - **Contracts & Schemas (`@daynori/contracts`)**:
    - `CustomBlockTypeSchema`: `'existing_record_view' | 'field_collection'`.
    - `ExistingRecordTargetKindSchema`: `'note' | 'task' | 'routine' | 'file' | 'journal' | 'expense_summary'`.
    - `ExistingRecordViewBlockSchema`: Strongly typed view configuration with filter (`folderId`, `tags`, `status`, `dateRange`), `displayMode` (`'list' | 'card' | 'compact'`), `limit`, `sortBy`, and `sortDirection`.
    - `CustomFieldDefinitionSchema`: Discriminated union supporting `text`, `checklist`, `date`, `number`, `link`, `attachment`.
    - `CustomSectionSchemaPayloadSchema`: Versioned block list with bounds (`MAX_BLOCKS_PER_SECTION = 10`, `MAX_FIELDS_PER_COLLECTION = 20`, `MAX_TEXT_FIELD_LENGTH = 5000`).
    - `CustomSectionItemSchema`, `CreateCustomSectionRequestSchema`, `UpdateCustomSectionRequestSchema`.
    - `CustomSectionRecordItemSchema`, `CreateCustomSectionRecordRequestSchema`, `UpdateCustomSectionRecordRequestSchema`.
    - `QueryExistingRecordViewRequestSchema`, `QueryExistingRecordViewResponseSchema`.
  - **Pure Domain & Validation Logic (`@daynori/domain`)**:
    - `validateFieldValue`: Validates field types, regex constraints, numerical bounds/precision, calendar validity, and canonical item link format (`item:<uuid>`).
    - Malicious payload rejection: Script tags (`<script>`), `javascript:` protocol, event handlers (`onerror=`, `onload=`), and unsafe protocols are rejected.
    - `validateRecordAgainstSchema`: Enforces required fields, validates every field against schema block definitions, and sanitizes input.
    - `migrateRecordValues`: Zero-data-loss migration function that preserves removed fields or type-mismatched fields into `archivedValues` tagged with `{ value, reason: 'field_removed' | 'type_changed' }`.
    - `isBlockSupported` and `createFallbackBlockRepresentation`: Implements the fallback renderer contract, translating unknown/future block formats into a safe `{ type: 'fallback', unsupportedType, title, message, rawData }` structure without crashes.
    - `APPROVED_SECTION_TEMPLATES`: Canonical templates for "Reading List", "Study & Research Hub", "Project Milestones", and "Vehicle Maintenance Log".
  - **Database Migration (`infra/supabase/migrations/00043_custom_sections_and_schemas.sql`)**:
    - `app.custom_sections`: Workspace-scoped custom sections with layout mode, current schema version, status, rank, and optimistic revision counter.
    - `app.custom_section_schemas`: Immutable historical version ledger storing schema payloads per version number.
    - `app.custom_section_records`: Structured record storage with `field_values`, `archived_values`, rank, and revision counter.
    - Cross-tenant Row Level Security (`tenant_isolation_policy`) and table grants for `authenticated`.
    - Cascade deletion on workspace removal (`ON DELETE CASCADE`).
  - **API Service & Routes (`apps/api`)**:
    - Service (`apps/api/src/modules/custom-sections/service.ts`): Section CRUD, versioned schema creation, record CRUD with automated migration, optimistic concurrency checks (`409 REVISION_CONFLICT`), and existing record view aggregation across notes, tasks, routines, files, journals, and expense summaries.
    - Routes (`apps/api/src/routes/v1/customSections.ts`): Registered under authenticated workspace scope, parsing actor from `request.actor`, returning typed responses and error mapping (`404 NOT_FOUND`, `409 REVISION_CONFLICT`, `400 VALIDATION_ERROR`).
    - Emits change events into `app.changes` for real-time synchronization.
  - **API Client SDK (`@daynori/api-client`)**:
    - Added 12 methods for custom sections, schemas, records, and existing-record queries to `DaynoriApiClient`.
- **Excluded / Blocked Scope**:
  - Phase 43 Custom Section UI Builder (strictly preserved for Phase 43).
  - Arbitrary user JavaScript, Python, CSS stylesheets, or raw SQL evaluation (strictly prohibited).
  - External beta deployment or app store release gate bypass.

## Acceptance evidence

### Verification Matrix

| Deliverable / Artifact | Path / Command | Observed Result | Status |
| :--- | :--- | :--- | :--- |
| **ADR 0041** | `docs/decisions/0041-safe-custom-section-schema-and-renderer-contracts.md` | Decision documented with declarative schema architecture, two block families, and zero-data-loss migration. | **PASS** |
| **Contracts Schemas & Build** | `packages/contracts/src/api/customSections.ts` | All schemas and limits exported; `@daynori/contracts` builds cleanly with 0 errors. | **PASS** |
| **Domain Logic & Tests** | `packages/domain/src/customSections.ts` & `domain.test.ts` | 76/76 unit tests passing including field validation, XSS/script rejection, zero-data-loss migration, and fallback contract. | **PASS** |
| **Database Migration** | `infra/supabase/migrations/00043_custom_sections_and_schemas.sql` | Applied via migrator; RLS policies, table grants, and cascade deletion verified. | **PASS** |
| **API Client SDK & Build** | `packages/api-client/src/client.ts` | 12 custom section client methods added; `@daynori/api-client` builds cleanly with 0 errors. | **PASS** |
| **API Service & Routes** | `apps/api/src/modules/custom-sections/service.ts` & `routes/v1/customSections.ts` | Registered in `server.ts`; `@daynori/api` builds cleanly with 0 errors. | **PASS** |
| **Phase 42 Integration Suite** | `tests/integration/phase42-custom-sections.test.ts` | 14/14 tests passing covering both block families, script rejection, zero-data-loss schema evolution, 409 conflict handling, tenant isolation, cascade cleanup, sync change emission, and fallback renderer contract. | **PASS** (861ms) |

## Defects, limitations, and recovery

### Release Gate Status: BLOCKED

Phase 42 safe custom section schema and renderer contracts are fully implemented and verified in provisional local development. However, per project rules (`AGENTS.md`) and roadmap specifications:
- Phase 42 depends on Phase 38 (Controlled private beta), which remains blocked pending cloud staging infrastructure, release keystore credentials, push provider service accounts, and beta participant cohorts.
- Phase 37 release gate remains blocked pending physical Android TalkBack hardware and production app store credentials.
- Custom section UI builder components are intentionally excluded and reserved for Phase 43.
- In accordance with safety invariants, custom sections compose approved declarative block types only; user-supplied scripts and SQL are strictly prohibited. Status is recorded as `blocked` (provisional local development). Work stops before Phase 43.

## Commit target

`feat(customization): add safe versioned custom section schemas`
