# Phase 30 — Today home and personal customization

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [23 — Journal writing and reflection interfaces](23-journal-writing-and-reflection-interfaces.md)
- [25 — Files folders and safe previews](25-files-folders-and-safe-previews.md)
- [26 — Calendar and deadline views](26-calendar-and-deadline-views.md)
- [28 — Android notifications and local reminders](28-android-notifications-and-local-reminders.md)
- [29 — Web reminder delivery and PWA support](29-web-reminder-delivery-and-pwa-support.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web today
- apps/mobile today
- packages/domain preferences
- apps/api preferences

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Combine today's routine occurrences, upcoming priorities, recent items, and quick capture in a calm configurable home.
2. Support section hide/show, rename labels, favorite folders, widget ordering, density, and theme with restore defaults.
3. Keep personalization as versioned user layout metadata; do not generate executable UI or expose every future feature.

## Acceptance

- A new account shows a small useful default home.
- Users can rearrange widgets with touch/pointer and accessible move controls.
- Hidden content remains discoverable through Library and layout resets preserve user data.

## Verification and evidence

- Test cross-device layout sync/conflicts, missing modules, restore defaults, and keyboard reordering.
- Review home usability at compact/wide widths with realistic synthetic data.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/design/information-architecture.md](../../design/information-architecture.md)
- [docs/product/requirements.md](../../product/requirements.md)

## Commit target

`feat(home): add a customizable daily organizer dashboard`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
