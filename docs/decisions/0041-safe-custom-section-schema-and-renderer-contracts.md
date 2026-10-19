# ADR 0041: Safe Custom Section Schema and Renderer Contracts

- **Status:** Accepted (Provisional local development authorized)
- **Date:** 2026-10-19
- **Deciders:** Antigravity (Google DeepMind)
- **Consulted:** Architecture team, Security & Privacy review
- **Informs:** Phase 42 — Safe custom section schema and renderer contracts

## Context and Problem Statement

Users need personal customization beyond fixed views (Today, Notes, Tasks, Routines, Journal, Expenses). They need to organize workspace content according to their personal workflows (e.g. "Software Architecture Study", "Reading List", "Client Project Hub", "Personal Health Journal").

However, user-defined sections present significant reliability, safety, and security challenges:
1. **Security & Injection Risks:** Custom customization must NEVER allow arbitrary executable code, eval scripts, unsafe HTML/DOM injection, untrusted URL protocols (`javascript:`, `data:`), or arbitrary SQL queries.
2. **Access Control & Tenant Isolation:** Sections combining existing items must strictly respect workspace membership, role authorization, and existing item lifecycles. They must never bypass tenant isolation or copy unauthorized data.
3. **Schema Evolution Without Data Loss:** When users edit custom section fields (adding, renaming, removing, or changing types), existing records must not be corrupted or permanently deleted.
4. **Cross-Platform Renderability & Fallbacks:** Schemas created on one device or future client version must render reliably on web and mobile, or degrade safely to a non-destructive fallback representation if a block type or schema version is unrecognized.
5. **Bounded Resource Quotas:** Arbitrary field nesting or unbounded record creation could degrade database performance, memory usage, and sync throughput.

## Decision Drivers

- **Zero Executable Code:** Custom sections compose approved, declarative block types only. Absolutely no user scripts, dynamic SQL, or executable templates.
- **Two Approved Block Families:**
  1. *Existing-Record Views:* Filtered, query-backed projections of canonical workspace items (notes, tasks, routines, files, journals, expense summaries).
  2. *Structured Field Collections:* Bounded collections of typed fields (text, checklist, date, number, link, attachment).
- **Immutable Schema Versioning:** Every schema modification creates an incremented schema version.
- **Safe Field Evolution & Archival:** Removing a field or changing its type archives old values into `archivedValues` rather than silently deleting them.
- **Unknown Version Fallback Contract:** Clients encounter unfamiliar block types or newer schema versions render an accessible fallback badge with read-only preservation.
- **Strict Bounded Limits:** Max 10 blocks per section, max 20 fields per collection, max 5000 chars per text value, max 1000 records per section.

## Considered Options

1. **Option 1 (Ad-hoc JSON Document Blobs in Note Items):**
   - Treat custom sections as special notes with arbitrary JSON bodies.
   - *Rejected:* Prevents typed indexing, breaks cross-item referencing, makes schema migrations prone to corruption, and bypasses query filtering.
2. **Option 2 (Dynamic Database Table / Column Creation):**
   - Create dynamic tables/columns in PostgreSQL for each user custom section.
   - *Rejected:* DDL migrations at runtime introduce extreme concurrency bottlenecks, vulnerability to SQL injection, and administrative complexity.
3. **Option 3 (Versioned Declarative Schemas with Typed JSONB Record Storage — Selected):**
   - Declarative schemas stored in `app.custom_section_schemas` with explicit version numbers.
   - Structured records stored in `app.custom_section_records` with validated `field_values` JSONB and `archived_values` JSONB.
   - Existing-record views query canonical item tables using strict filter allowlists.

## Detailed Architecture

### 1. Entity Identifiers & Relational Structure

- **`app.custom_sections`**:
  - `id` (UUID, PK)
  - `workspace_id` (UUID, FK `app.workspaces(id)` ON DELETE CASCADE)
  - `name` (text, 1-100 chars)
  - `description` (text, max 500 chars, optional)
  - `icon` (text, max 50 chars, optional)
  - `current_schema_version` (integer, starts at 1)
  - `layout_mode` (enum: `'single_column'`, `'two_column'`, `'grid'`)
  - `status` (enum: `'active'`, `'archived'`)
  - `rank` (text, lexorank ordering)
  - `created_by`, `updated_by` (UUID, FK `app.profiles(id)`)
  - `revision` (integer, optimistic concurrency control)
  - `created_at`, `updated_at`, `deleted_at`

- **`app.custom_section_schemas`**:
  - `id` (UUID, PK)
  - `section_id` (UUID, FK `app.custom_sections(id)` ON DELETE CASCADE)
  - `version` (integer, >= 1)
  - `blocks` (JSONB, array of approved `CustomBlockDefinition`)
  - `created_by` (UUID)
  - `created_at` (timestamptz)
  - Unique constraint: `(section_id, version)`

- **`app.custom_section_records`**:
  - `id` (UUID, PK)
  - `section_id` (UUID, FK `app.custom_sections(id)` ON DELETE CASCADE)
  - `workspace_id` (UUID, FK `app.workspaces(id)` ON DELETE CASCADE)
  - `schema_version` (integer, references version used at creation/update)
  - `field_values` (JSONB, mapping `fieldId -> typedValue`)
  - `archived_values` (JSONB, mapping `fieldId -> { value, archivedAt, reason }`)
  - `rank` (text, lexorank ordering)
  - `created_by`, `updated_by` (UUID)
  - `revision` (integer, optimistic concurrency control)
  - `created_at`, `updated_at`, `deleted_at`

### 2. Approved Block Families & Schemas

#### Family 1: Existing-Record View Block (`existing_record_view`)
```typescript
interface ExistingRecordViewBlock {
  id: string; // UUID or stable key
  type: 'existing_record_view';
  title: string;
  targetKind: 'note' | 'task' | 'routine' | 'file' | 'journal' | 'expense_summary';
  filter: {
    folderId?: string;
    tags?: string[];
    status?: 'all' | 'active' | 'completed' | 'archived';
    dateRange?: 'all' | 'today' | 'upcoming_7_days' | 'current_month';
  };
  displayMode: 'list' | 'card' | 'compact';
  limit: number; // 1 to 50
  sortBy: 'updated_at' | 'created_at' | 'deadline' | 'name';
  sortDirection: 'asc' | 'desc';
}
```
*Security invariant:* This block never duplicates canonical item records. The renderer evaluates the view by issuing an authorized query scoped to the user's workspace membership and item permissions.

#### Family 2: Structured Field Collection Block (`field_collection`)
```typescript
interface FieldCollectionBlock {
  id: string;
  type: 'field_collection';
  title: string;
  fields: CustomFieldDefinition[];
  defaultViewMode: 'table' | 'cards' | 'list';
}

type CustomFieldDefinition =
  | TextFieldDefinition
  | ChecklistFieldDefinition
  | DateFieldDefinition
  | NumberFieldDefinition
  | LinkFieldDefinition
  | AttachmentFieldDefinition;
```

Supported Field Types:
- **`text`**: Single-line or multiline, max 5000 characters, optional pattern regex allowlist.
- **`checklist`**: Boolean checked state with optional label.
- **`date`**: ISO 8601 date `YYYY-MM-DD`, optional bounds.
- **`number`**: Numeric value, min/max bounds, optional decimal precision, unit label.
- **`link`**: URL string strictly matching `https?://[^\s/$.?#].[^\s]*`. Rejects `javascript:`, `data:`, `vbscript:`.
- **`attachment`**: UUID reference to verified file in `app.file_items`.

### 3. Safe Schema Evolution & Migration Rules

1. **Adding Fields:**
   - Increments schema version from $N$ to $N+1$.
   - Old records automatically gain default values or null when read under schema $N+1$.
2. **Renaming Fields:**
   - Field `id` is immutable; only user-visible `label` changes. No record transformation required.
3. **Removing Fields or Changing Types:**
   - When field $F_1$ is removed or its type is incompatible in schema $N+1$, the record's existing value for $F_1$ is copied to `archived_values[F_1]`.
   - Data is preserved indefinitely and can be restored if the field is re-added.
4. **Renderer Fallback Contract:**
   - If a client encounters a block with an unknown `type` or unsupported `version`, it displays a non-blocking `UnsupportedBlockFallbackCard`.
   - The card states: *"This block requires a newer version of Daynori. Your data is safely preserved."*
   - Saving records with unknown blocks preserves all raw JSON payloads without mutation.

### 4. Tenant Isolation, RLS & Synchronization

- Row-level security strictly enforces `app.user_has_workspace_role(workspace_id, 'viewer')` for SELECT, and `'editor'` for INSERT/UPDATE/DELETE.
- All mutations emit change events to `app.changes` with entity types `'custom_section'` and `'custom_section_record'`.
- Deleting a workspace cascades deletion across all custom sections, schemas, and records.

## Consequences

### Positive
- Users can create tailored dashboards, trackers, and collections with zero coding.
- Eliminates script execution, XSS, and SQL injection risks by design.
- Full data preservation across schema iterations via explicit archival.
- Seamless integration with existing workspace items without duplicating data or breaking authorization.

### Negative / Trade-offs
- Custom sections cannot run arbitrary computations or user formulas in Phase 42 (safe calculated fields deferred).
- Maximum limits (10 blocks per section, 20 fields per collection) constrain hyper-complex data modeling, but protect mobile performance and sync payloads.
