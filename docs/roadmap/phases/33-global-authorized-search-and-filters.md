# Phase 33 — Global authorized search and filters

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [32 — Knowledge guides and cheatsheet organization](32-knowledge-guides-and-cheatsheet-organization.md)
- [23 — Journal writing and reflection interfaces](23-journal-writing-and-reflection-interfaces.md)
- [25 — Files folders and safe previews](25-files-folders-and-safe-previews.md)
- [19 — Upcoming task lists and detail views](19-upcoming-task-lists-and-detail-views.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api search module
- packages/domain search
- apps/web search
- apps/mobile search

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement PostgreSQL full-text/trigram search over allowed plain content and metadata with type/folder/date filters.
2. Add account-scoped local search for downloaded items with explicitly limited offline coverage.
3. Exclude vault ciphertext and enforce current authorization before returning snippets or counts.

## Acceptance

- Search finds notes, task titles, journal entries, and file metadata the user can access.
- No unauthorized content or count leaks through global search.
- Results state offline coverage and allow clear context-aware navigation.

## Verification and evidence

- Test permissions, injection-like input, deleted items, pagination, and multilingual content.
- Measure indexed search with the documented synthetic dataset.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)
- [docs/architecture/operations-and-scaling.md](../../architecture/operations-and-scaling.md)

## Commit target

`feat(search): add permission-scoped organizer search`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
