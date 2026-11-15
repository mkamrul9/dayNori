# Phase 111 — Daynori web/PWA design verification and theme capture correction

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [105 — Daynori web/PWA visual refinement and modern interface overhaul](105-daynori-web-pwa-visual-refinement-and-modern-interface-overhaul.md)
- [110 — Evidence-integrity audit and verification truth reconciliation](110-evidence-integrity-audit-and-verification-truth-reconciliation.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web
- packages/ui-web
- scripts
- tests
- docs/decisions
- docs/roadmap
- docs/phase-reports
- artifacts/phase111
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Diagnose the Phase 105 capture defect where 40/40 baseline and 39/40 post-refinement light/dark captures were byte-identical due to direct DOM attribute setting bypassing React state in ShellContext.
2. Update ShellContext to initialize themePreference from localStorage, persist preference mutations, and synchronize documentElement data-theme and style.colorScheme while exposing window.__daynoriShell for verified interaction.
3. Enhance ListRow primitive to support custom IDs, ensuring mobile drawer theme toggle and interactive rows have robust touch targets and accessibility semantics.
4. Streamline Today view header hierarchy by demoting #today-create-btn to secondary desktop-only and promoting #customize-today-btn to primary, eliminating button wrapping on 320px–412px viewports.
5. Add #mobile-menu-theme-toggle in the mobile drawer Utilities section with dynamic labels and >= 48px touch targets.
6. Eliminate the redundant 80px Feedback informational banner in the Global Create Dialog to bring all 5 entity creation chips into the first viewport on mobile, and add dark mode boundary borders to chip badges.
7. Add explicit :focus-visible ring styles (2px solid border.focus, -2px offset) and dark mode icon badge borders in the Settings Hub.
8. Collapse non-functional auxiliary interactive controls in Ask Nori AssistantPanel when gated under DEF-V2-008, presenting a calm, truthful 220px view with direct links to Privacy and Help.
9. Implement scripts/capture-phase111-visual-evidence.mjs with CDP navigation and hydration synchronization, UI/React theme selection, render settling, and mandatory failure upon identical image hashes.
10. Capture 80 baseline (before) and 80 post-refinement (after) screenshots across desktop (1280px) and mobile (320-412px) viewports in light and dark themes, verifying 40/40 distinct pairs and zero horizontal overflow.
11. Record qualitative human design feedback separately from automated checks in artifacts/phase111/human-design-review.md, author ADR 0111, update phase report, progress.json, CHANGELOG.md, and regenerate blueprint.

## Acceptance

- scripts/capture-phase111-visual-evidence.mjs fails verification immediately if any light and dark capture pair shares the same SHA-256 hash.
- artifacts/phase111/capture-manifest-before.json and capture-manifest-after.json both record exactly 80 captures with 40/40 pairs verified distinct (0 identical).
- Zero horizontal overflow across all 80 captures and 5 viewports (1280px, 412px, 390px, 360px, 320px).
- Human design review recorded separately from automated checks in artifacts/phase111/human-design-review.md.
- Visual verification report authored in artifacts/phase111/visual-verification-report.md.
- Automated unit and integration test suites in tests/unit/phase111-web-pwa-design-verification.test.ts and tests/e2e/phase111-theme-capture-and-visual-verification.test.ts pass cleanly.
- Standing release gates (DEF-V2-004, DEF-V2-005, DEF-V2-008, DEF-V2-011, DEF-V2-013, OWNER-SIGNING-KEYS, OWNER-RELEASE-AUTH, Phase 71) remain strictly blocked.
- docs/roadmap/plan.json, progress.json, and blueprint.html updated and pass all planning validators.

## Verification and evidence

- node scripts/validate-planning.mjs
- node scripts/build-phase-plans.mjs --check
- node scripts/build-blueprint.mjs --check
- pnpm validate:function-register
- pnpm vitest run tests/unit/phase111-web-pwa-design-verification.test.ts tests/e2e/phase111-theme-capture-and-visual-verification.test.ts
- pnpm --filter @daynori/domain typecheck
- pnpm --filter @daynori/web typecheck
- pnpm lint

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/decisions/0105-daynori-web-pwa-visual-refinement-and-modern-interface-overhaul.md](../../decisions/0105-daynori-web-pwa-visual-refinement-and-modern-interface-overhaul.md)
- [docs/decisions/0110-evidence-integrity-audit-and-verification-truth-reconciliation.md](../../decisions/0110-evidence-integrity-audit-and-verification-truth-reconciliation.md)
- [docs/decisions/0111-web-pwa-design-verification-and-theme-capture-correction.md](../../decisions/0111-web-pwa-design-verification-and-theme-capture-correction.md)
- [docs/phase-reports/phase-105.md](../../phase-reports/phase-105.md)
- [docs/phase-reports/phase-110.md](../../phase-reports/phase-110.md)
- [docs/phase-reports/phase-111.md](../../phase-reports/phase-111.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`refactor(ui): verify web design with genuine theme captures and calm hierarchy`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
