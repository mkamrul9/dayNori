# ADR-0003: Typed domains and safe configurable sections

Date: 2026-10-13. Status: accepted for planning.

## Context

Users want their own folders, navigation and sections, without the confusion or security risk of an unlimited application builder. Todos, recurring routines, journal days, binary files and money have different integrity rules.

## Decision

Use one canonical workspace folder hierarchy and one primary folder/Inbox per item, with typed payloads for built-in domains. Folders may contain mixed kinds: `Software` can contain a PDF, note and todo. Sections are filtered views, not competing ownership trees. Keep routines separate from occurrence completion history and date-only todos separate from timed events. Add custom sections as approved views or allowlisted templates/fields with bounded versioned JSON payloads. Store ownership, relations, lifecycle and indexed identity in relational columns. Use tags/links for additional organization.

## Alternatives

A universal JSON/EAV database makes schemas flexible but weakens domain invariants and querying. Hardcoded sections reject the customization requirement. User-supplied scripts/plugins increase abuse, migration and cross-platform risks far beyond the private-core scope.

## Consequences and validation

Custom sections have deliberate capability limits. Schema edits need preview/migration and stable field IDs. Validate folder cycles/security scope, typed payload pairing, routine day isolation, multi-currency calculations and old schema decoding. A new field type must have validators, UI/accessibility, export representation and migration behavior.

See [data model](../architecture/data-model.md).
