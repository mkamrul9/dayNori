# ADR 0042: Custom Section Builder, Personal Templates, and Safe Evolution

## Context

Phase 42 established safe, versioned custom section schemas, append-only archived value preservation, and immutable database boundaries. Phase 43 provides the user-facing guided builder and personal template creation for web and mobile interfaces.

Users need to customize their Daynori workspace without encountering database terminology, SQL, JSON syntax, or programming constructs. At the same time, the system must enforce strict boundaries:
1. **Plain Product Language:** Users assemble named structured collections, existing-record views, or combined dashboards using natural terminology (e.g. "Reading List", "Course Materials", "Upcoming Assignments").
2. **Personal Templates & Independent Evolution:** Users can save custom layouts as personal templates. Templates must never copy private record data by default, and editing a template must never silently mutate or migrate existing saved section instances (fork-on-create semantics).
3. **Existing-Record Views:** Views query real canonical records (notes, tasks, routines, files, journals, expenses) with server-side tenant isolation, module availability checks, and source privacy. Removing a view section must never delete canonical items.
4. **Accessible Placement & Ordering:** Reordering sections, blocks, and fields must offer accessible touch, pointer, keyboard, and screen-reader alternatives (Move Up, Move Down, Move To) rather than requiring drag-and-drop.
5. **Pre-Migration Review:** Before destructive or incompatible schema changes (such as field removal or incompatible type changes), users must be presented with an explicit preview detailing affected fields, records, and explaining that historical values are retained in `archivedValues`. Users must be free to cancel without losing draft state.
6. **Robust Read-Only Fallbacks:** Any future or newer block types must render in a friendly, read-only fallback mode without executing unapproved scripts or discarding unrecognized attributes.

## Decision

1. **Personal Templates Table (`app.custom_section_templates`):**
   - Stores workspace-scoped templates with name, description, icon, layout mode, and validated block schemas.
   - Distinct from live section instances: creating a section from a template creates an independent section row with its own version 1 schema. Updating a template does not retroactively migrate existing sections.
   - Private record data is excluded from templates.

2. **Migration Preview Contract:**
   - A dedicated preview API (`POST /v1/workspaces/:workspaceId/custom-sections/:sectionId/schemas/preview`) and domain function `generateSchemaMigrationPreview` calculate affected fields, change classifications (`removed`, `type_changed`, `constraint_changed`, `added`, `unmodified`), affected record counts, and plain-language data retention explanations.
   - Publishing a schema requires passing the reviewed changes against `expectedRevision`.

3. **Existing-Record Query Architecture:**
   - Uses canonical item tables (`app.items`, `app.notes`, `app.tasks`, `app.file_items`, `app.routines`, `app.journal_entries`, `app.expense_items`) with deterministic ordering and pagination.
   - Enforces profile preferences (e.g. `expensesEnabled`) and excludes soft-deleted records.
   - Retains canonical references (`item:<UUID>`) so interactions navigate directly to the authoritative source editor without content duplication.

4. **Accessible Non-Drag Controls:**
   - Every builder list and placement interface provides explicit Move Up and Move Down buttons equipped with accessible labels (`aria-label="Move {item} up"`).
   - Keyboard navigation supports arrow keys and standard focus order.

5. **Read-Only Fallback & Safety:**
   - Any block failing shape validation or bearing an unrecognized `type` renders via `FallbackBlockRepresentation` (`isReadOnly: true`), displaying a friendly explanation and preserving raw data intact.

## Consequences

- Users gain flexible, guided section creation across web and Android without exposure to technical complexity.
- Schema evolution remains completely lossless, audited, and transparent to the user.
- Personal templates remain clean, reusable, and decoupled from private records.
- Deleting custom sections remains safe for all canonical workspace notes, tasks, files, and finances.
