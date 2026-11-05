# Phase 70 — Mobile web and PWA layout redesign

Group: V2 everyday experience. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [68 — Design tokens components icons and motion](68-design-tokens-components-icons-and-motion.md)
- [69 — Desktop shell and focused Today experience](69-desktop-shell-and-focused-today-experience.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web/src/components
- apps/web/src/app/globals.css
- apps/web/src/app/settings
- packages/ui-web

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement compact mobile chrome, labeled bottom destinations, reachable creation and grouped Settings subpages with device-appropriate sheets.
2. Adapt long forms, editors, calendar composition and menu placement using responsive adapters; respect dynamic viewport, safe area, keyboard and browser Back.
3. Coordinate install/update/status banners and future companion placement so no essential control or final list row is covered.

## Acceptance

- 320–412px layouts have no unintended page overflow, duplicated navigation or hidden primary actions.
- 200% text, landscape, open keyboard, install mode and long labels remain usable.
- Desktop keeps its approved composition and shared record behavior is unchanged.

## Verification and evidence

- Run responsive e2e journeys and record overflow measurements plus screenshots at the required widths.
- Perform physical installed-Android-PWA keyboard/Back/safe-area review where available; do not substitute emulation for physical acceptance.

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
- [docs/decisions/0065-mobile-pwa-usability-preview.md](../../decisions/0065-mobile-pwa-usability-preview.md)

## Commit target

`feat(pwa): deliver phone-specific layouts and settings`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
