# Phase 32 — Knowledge guides and cheatsheet organization

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [17 — Focused note editor on both platforms](17-focused-note-editor-on-both-platforms.md)
- [15 — Folder browsing and organization interfaces](15-folder-browsing-and-organization-interfaces.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain knowledge
- apps/api saved views
- apps/web knowledge
- apps/mobile knowledge

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Add a knowledge collection preset for typed guides/cheatsheets using the existing note format and folders.
2. Support pins, tags, safe internal item links/backlinks, and saved filters without duplicating note bodies.
3. Provide quick-reference browsing and copyable text/code blocks with clear text-only capture boundaries.

## Acceptance

- A user can maintain guides and cheatsheets inside custom topic folders.
- An item has one canonical body even if shown in several saved views.
- Links validate workspace access and unavailable targets are explained.

## Verification and evidence

- Test saved-view queries, backlinks, move/delete targets, and cross-tenant link rejection.
- Review quick-reference use and accessibility on small and wide displays.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/data-model.md](../../architecture/data-model.md)
- [docs/product/requirements.md](../../product/requirements.md)

## Commit target

`feat(knowledge): add organized guides cheatsheets and saved views`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
