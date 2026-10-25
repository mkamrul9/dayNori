# Phase 67 — Original visual direction and responsive journey prototypes

Group: V2 readiness and design. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [65 — Version 2 function inventory and readiness baseline](65-version-2-function-inventory-and-readiness-baseline.md)
- [66 — Simple navigation personalization and developer boundaries](66-simple-navigation-personalization-and-developer-boundaries.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- docs/design
- docs/roadmap/v2
- assets/brand

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Build a dated reference board from official product examples and compare two original Daynori visual directions without copying assets.
2. Prototype complete welcome/auth, Today, planning, Library, Journal, Settings, Help/tour and assistant flows for desktop and narrow mobile in light/dark.
3. Review hierarchy, placement, disclosure, professional icons, state coverage and motion with the owner and available usability participants; record the chosen direction.

## Acceptance

- A coherent selected direction covers real flows and empty/loading/error/offline states, not only colors or a landing screen.
- Mobile composition and keyboard-safe editing are explicitly designed; advanced controls do not overwhelm first use.
- No app-authored emoji, copied competitor assets or inaccessible unlabeled controls appear in the proposed interfaces.

## Verification and evidence

- Inspect prototypes at 320/360/390/412/768 and desktop widths in both themes.
- Record original asset provenance, rendered contrast estimates, task observations, owner decisions and remaining design uncertainties.

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
- [docs/design/design-system.md](../../design/design-system.md)
- [docs/design/accessibility.md](../../design/accessibility.md)

## Commit target

`docs(design): establish the Version 2 visual and mobile direction`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
