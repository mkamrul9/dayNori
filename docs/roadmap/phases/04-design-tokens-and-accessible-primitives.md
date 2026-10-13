# Phase 04 — Design tokens and accessible primitives

Group: Foundation and sync. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [01 — Toolchain and executable workspace](01-toolchain-and-executable-workspace.md)
- [03 — Platform and integration feasibility spikes](03-platform-and-integration-feasibility-spikes.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/design-tokens
- packages/ui-web
- packages/ui-mobile
- docs/design

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Encode the approved light/dark palette, typography, spacing, radii, focus treatment, and motion preferences as semantic tokens.
2. Implement a small set of buttons, fields, dialogs/sheets, feedback, and list row primitives separately for browser and native semantics.
3. Create a component review surface and include errors, disabled, loading, focus, large text, and right-to-left readiness.

## Acceptance

- Text and control contrast meets the documented AA target in both themes.
- Components are operable with keyboard or native screen reader and do not rely on color alone.
- Touch targets, safe areas, reduced motion, and large text are reviewed on a real device.

## Verification and evidence

- Run web accessibility checks, contrast calculations, and keyboard journeys.
- Review native primitives with TalkBack and increased system font size.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/design/design-system.md](../../design/design-system.md)
- [docs/engineering/quality.md](../../engineering/quality.md)

## Commit target

`feat(design): add accessible light and dark interface primitives`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
