# @daynori/domain

Framework-independent business rules, branded value objects, and domain invariants.

## Status

Established in Phase 01. Contains:

- Branded entity identifiers (`WorkspaceId`, `UserId`, `ItemId`, `NoteId`, `TaskId`, `RoutineId`)
- Core invariants: minor unit safe-integer money validation and calendar date-only parsing
- Pure domain logic isolated from UI frameworks, persistence drivers, and network clients

See [repository layout](../../docs/engineering/repository-layout.md) and [data model](../../docs/architecture/data-model.md).
