# Phase 131 — Daynori Day Path identity and core interface refresh

Group: V2 visual refresh. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [67 — Original visual direction and responsive journey prototypes](67-original-visual-direction-and-responsive-journey-prototypes.md)
- [68 — Design tokens components icons and motion](68-design-tokens-components-icons-and-motion.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- assets/brand
- packages/design-tokens
- packages/ui-web
- packages/ui-mobile
- apps/web
- apps/mobile
- docs/design
- docs/decisions
- docs/phase-reports
- docs/roadmap
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Replace the owner-rejected green and cream identity with a violet and coral Day Path palette and original vector logo across web and mobile assets.
2. Reduce visual weight and improve core navigation, surfaces, spacing and dark mode; add restrained motion with reduced-motion support.
3. Validate contrast, brand assets, type safety and representative light/dark layouts; reconcile release documentation without claiming publication.

## Acceptance

- Core web and mobile use the new semantic palette and matching logo/icon assets.
- Core navigation and Today surfaces are clearer at desktop and mobile sizes with accessible focus and reduced-motion behavior.
- Contrast and type checks pass; manual visual evidence and publication gates are recorded honestly.

## Verification and evidence

- pnpm vitest run packages/design-tokens/src/tokens.test.ts packages/ui-mobile/src/ui-mobile.test.ts packages/ui-web/src/phase68-primitives.test.ts
- pnpm typecheck
- node scripts/check-brand-assets.mjs
- node scripts/validate-planning.mjs

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/design/design-system.md](../../design/design-system.md)
- [docs/architecture/system-overview.md](../../architecture/system-overview.md)
- [docs/engineering/handoff.md](../../engineering/handoff.md)
- [docs/decisions/0131-cool-slate-indigo-visual-refresh.md](../../decisions/0131-cool-slate-indigo-visual-refresh.md)
- [docs/phase-reports/phase-131.md](../../phase-reports/phase-131.md)

## Commit target

`feat(design): refresh Daynori identity and core interface`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
