# Phase 15 — Folder browsing and organization interfaces

Group: Foundation and sync. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [14 — Collections folders and shared item metadata](14-collections-folders-and-shared-item-metadata.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web library
- apps/mobile library
- packages/ui-web
- packages/ui-mobile

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement folder browsing, breadcrumbs, typed item lists, create/rename/move, and folder selection.
2. Provide reorder gestures plus keyboard/menu alternatives and explicit undo for reversible actions.
3. Add empty states, counts, loading/pagination, and offline status without exposing hidden modules.

## Acceptance

- A user can create Software and Government Jobs folders and organize items inside each.
- Move/reorder works with keyboard and TalkBack as well as pointer/touch.
- Long names and large folders remain usable without blocking navigation.

## Verification and evidence

- Run folder CRUD/move journeys across platforms and nested folder accessibility checks.
- Verify offline changes and concurrent folder movement messages.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/design/journeys.md](../../design/journeys.md)
- [docs/design/design-system.md](../../design/design-system.md)

## Commit target

`feat(library): add accessible folder browsing and organization`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
