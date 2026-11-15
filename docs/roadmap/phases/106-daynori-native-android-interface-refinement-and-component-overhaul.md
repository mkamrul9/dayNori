# Phase 106 — Daynori native Android interface refinement and component overhaul

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [105 — Daynori web/PWA visual refinement and modern interface overhaul](105-daynori-web-pwa-visual-refinement-and-modern-interface-overhaul.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/mobile
- packages/ui-mobile
- packages/design-tokens
- tests/unit
- tests/e2e
- artifacts/phase106
- docs/roadmap
- docs/phase-reports

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Read Phase 71 and its remaining blockers; adapt the new visual hierarchy, navigation, menus, forms, and dark theme to native Android components rather than copying desktop layout.
2. Refine MobileCard, MobileListRow, MobileEmptyState, MobileHeader, and MobileNavigationBar to reduce repeated card borders, establish clean elevation, and ensure >= 48dp touch targets.
3. Modernize CreateSheet and SettingsHubView into clean native mobile cards and divided list rows while preserving local drafts, Back navigation, and accessibility.
4. Truthfully present gated Ask Nori assistant state (DEF-V2-008) in AssistantSheet and MobileHeader on native Android.
5. Test Today, Plan, Library, Journal, Settings, Create, and Assistant entry point across light/dark themes, large text scaling, landscape orientation, and keyboard-open states.
6. Recheck account switching and multi-tenant workspace isolation on native Android; record emulator evidence separately from physical hardware and spoken TalkBack, leaving Phase 71 blocked.

## Acceptance

- Native Android components (MobileCard, MobileListRow, MobileEmptyState, MobileHeader, MobileNavigationBar) adapted to calm modern warm notebook direction without copying desktop layouts.
- Today, Plan, Library, Journal, Settings, Create, and Assistant entry point verified in light/dark themes, large text scaling, landscape orientation, and keyboard-open states.
- Local drafts preserved on dismiss/cancel, Android hardware Back navigation verified across sheets and modals, and touch targets meet >= 48dp.
- Account switching and workspace isolation verified with zero state leakage.
- Emulator evidence recorded separately from physical device and spoken TalkBack evidence; Phase 71 remains blocked.

## Verification and evidence

- pnpm vitest run tests/unit/phase106-native-android-tokens-and-a11y.test.ts tests/e2e/phase106-native-android-refinement.test.ts apps/mobile/src/views/AccountSheet.test.ts apps/mobile/src/views/CreateSheet.test.ts
- pnpm typecheck
- pnpm lint
- node scripts/validate-planning.mjs

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/design/design-system.md](../../design/design-system.md)
- [docs/design/accessibility.md](../../design/accessibility.md)
- [docs/engineering/handoff.md](../../engineering/handoff.md)
- [docs/decisions/0106-daynori-native-android-interface-refinement-and-component-overhaul.md](../../decisions/0106-daynori-native-android-interface-refinement-and-component-overhaul.md)
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/phase-reports/phase-71.md](../../phase-reports/phase-71.md)
- [docs/phase-reports/phase-105.md](../../phase-reports/phase-105.md)

## Commit target

`refactor(mobile): adapt modern visual hierarchy and calm card borders to native android components`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
