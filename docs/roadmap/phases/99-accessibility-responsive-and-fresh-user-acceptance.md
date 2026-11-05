# Phase 99 — Accessibility responsive and fresh-user acceptance

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [98 — Measured performance and resource optimization](98-measured-performance-and-resource-optimization.md)
- [80 — Everyday guided practice chapters](80-everyday-guided-practice-chapters.md)
- [81 — Advanced recovery and optional-feature tour coverage](81-advanced-recovery-and-optional-feature-tour-coverage.md)
- [95 — Voice capture transcription and reviewed creation](95-voice-capture-transcription-and-reviewed-creation.md)
- [96 — Nori original companion and assistant launcher](96-nori-original-companion-and-assistant-launcher.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web
- apps/mobile
- packages/ui-web
- packages/ui-mobile
- tests/e2e
- docs/design

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Audit every released screen/chapter at required widths/themes/text scaling with keyboard, screen reader, reduced motion and non-drag controls.
2. Run fresh-user sessions on capture/reopen, discovery/hide/restore, guided actions, denied permissions, feedback and reviewed AI creation.
3. Repair bounded accessibility/mobile/usability defects and verify all gated tour chapters against now-enabled real features.

## Acceptance

- Applicable WCAG/native targets and no essential control clipping/occlusion pass with actual manual evidence.
- At least five representative consenting participants are recorded, with at least four completing capture/reopen and finding Help without intervention.
- No unresolved blocking usability, data-loss or account-isolation defects; skipped/unavailable tour steps are not counted as completed.

## Verification and evidence

- Run final responsive/e2e/accessibility checks and physical PWA/native TalkBack/keyboard/large-text journeys.
- Record participant methodology, observed tasks, failures, fixes and limitations without private user fixtures.

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
- [docs/roadmap/v2/quality-and-release.md](../v2/quality-and-release.md)
- [docs/roadmap/v2/design-and-mobile.md](../v2/design-and-mobile.md)
- [docs/roadmap/v2/guided-tours.md](../v2/guided-tours.md)

## Commit target

`fix(usability): close accessibility mobile and guided-learning gaps`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
