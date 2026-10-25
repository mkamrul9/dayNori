# Phase 69 — Desktop shell and focused Today experience

Group: V2 everyday experience. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [66 — Simple navigation personalization and developer boundaries](66-simple-navigation-personalization-and-developer-boundaries.md)
- [68 — Design tokens components icons and motion](68-design-tokens-components-icons-and-motion.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web/src/components
- apps/web/src/app/today
- packages/ui-web

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Rebuild desktop/sidebar/page-header composition using the approved hierarchy and registry; preserve routes/deep links and keyboard commands.
2. Simplify Today to a few useful task/routine groups and optional reflection; collapse history and keep one clear Create path.
3. Apply pin/hide/restore preferences and clear local/sync/error feedback without repeating navigation across cards/chips/tabs.

## Acceptance

- Primary destinations, creation, Search and Help are obvious and operable with keyboard.
- Today uses real scoped records and user preferences with no unsolicited samples or developer diagnostics.
- Existing create/save/reopen, sync and task/routine semantics survive the layout change.

## Verification and evidence

- Run affected web build/type checks and actual desktop shell/Today journeys.
- Capture light/dark, empty/populated/offline/error desktop evidence and inspect focus/order.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/roadmap/v2/feature-coverage.md](../v2/feature-coverage.md)
- [docs/engineering/handoff.md](../../engineering/handoff.md)
- [docs/roadmap/v2/design-and-mobile.md](../v2/design-and-mobile.md)

## Commit target

`feat(web): redesign desktop navigation and Today`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
