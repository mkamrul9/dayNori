# Phase 68 — Design tokens components icons and motion

Group: V2 readiness and design. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [67 — Original visual direction and responsive journey prototypes](67-original-visual-direction-and-responsive-journey-prototypes.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/design-tokens
- packages/ui-web
- packages/ui-mobile
- docs/design

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement the chosen semantic palette, typography, spacing, focus, state and motion tokens through separate web/native primitives.
2. Complete professional icon mappings and component states for fields, lists, dialogs/sheets, segmented controls, feedback, navigation and coachmarks.
3. Keep galleries restricted; implement reduced-motion behavior, scalable text and licensed/original asset provenance.

## Acceptance

- Rendered light/dark controls meet the scoped contrast and focus targets and have accessible names.
- No emoji or improvised pictograms in authored chrome; user content remains unchanged.
- Primitives survive long English/Bangla labels, 200% text and keyboard/mobile interactions without clipped essential actions.

## Verification and evidence

- Run icons:check, affected package checks and contrast/accessibility checks against rendered states.
- Inspect web keyboard/screen reader and available native text-scaling/reduced-motion behavior; record physical evidence limits.

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
- [docs/design/accessibility.md](../../design/accessibility.md)

## Commit target

`feat(design): implement polished accessible interface primitives`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
