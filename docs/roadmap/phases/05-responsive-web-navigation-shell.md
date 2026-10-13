# Phase 05 — Responsive web navigation shell

Group: Foundation and sync. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [04 — Design tokens and accessible primitives](04-design-tokens-and-accessible-primitives.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web
- packages/ui-web

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement desktop sidebar, tablet transitions, and compact navigation using the documented information architecture.
2. Provide Today, Plan, Library, and Journal parent routes; place Calendar under Plan and Settings/Search/Create in consistent reachable controls. Include explicit empty/loading/error behavior.
3. Add browser shortcuts, focus restoration, deep-link handling, and responsive page containers; use synthetic content only.

## Acceptance

- Navigation works at compact, tablet, and wide widths without horizontal clipping.
- Back/forward and direct links preserve the expected location.
- Keyboard focus and navigation labels are clear on every route.

## Verification and evidence

- Run responsive browser smoke tests and keyboard navigation checks.
- Inspect light/dark screenshots for hierarchy and readable density.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/design/information-architecture.md](../../design/information-architecture.md)
- [docs/design/design-system.md](../../design/design-system.md)

## Commit target

`feat(web): add responsive organizer navigation`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
