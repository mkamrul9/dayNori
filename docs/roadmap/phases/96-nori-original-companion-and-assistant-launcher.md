# Phase 96 — Nori original companion and assistant launcher

Group: V2 daily assistant. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [68 — Design tokens components icons and motion](68-design-tokens-components-icons-and-motion.md)
- [70 — Mobile web and PWA layout redesign](70-mobile-web-and-pwa-layout-redesign.md)
- [92 — Text assistant chat and contextual guidance](92-text-assistant-chat-and-contextual-guidance.md)
- [93 — Reviewed note task and journal creation](93-reviewed-note-task-and-journal-creation.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- assets/brand
- apps/web
- apps/mobile
- packages/design-tokens
- docs/design

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Validate the proposed Nori name and folded-paper design; create original professional artwork with provenance and small-size light/dark variants.
2. Implement optional launcher states for greeting/listening/thinking/success/error/offline/sleeping, sharing the existing assistant state and consent.
3. Add hide/show, safe corner placement, reduced-motion/static and ordinary labeled-button alternatives; stop hidden animation.

## Acceptance

- The companion is distinct original Daynori artwork, with no emoji substitute or copied Codex character.
- It never covers navigation, editors, Save, banners or phone keyboard and never implies unsolicited monitoring.
- Assistant accessibility and functionality remain complete with the companion disabled or motion reduced.

## Verification and evidence

- Inspect assets/state transitions at actual display sizes and both themes; verify provenance.
- Test placement/keyboard/screen reader/reduced-motion/background CPU and assistant open/close continuity.

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
- [docs/roadmap/v2/assistant.md](../v2/assistant.md)
- [docs/roadmap/v2/design-and-mobile.md](../v2/design-and-mobile.md)
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/phase-reports/phase-71.md](../../phase-reports/phase-71.md)

## Commit target

`feat(companion): add the optional original Nori assistant launcher`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
