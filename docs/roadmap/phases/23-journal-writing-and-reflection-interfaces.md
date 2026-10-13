# Phase 23 — Journal writing and reflection interfaces

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [22 — Journal entries and privacy defaults](22-journal-entries-and-privacy-defaults.md)
- [17 — Focused note editor on both platforms](17-focused-note-editor-on-both-platforms.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web journal
- apps/mobile journal

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Create a calm writing canvas, optional prompt tray, mood input, draft recovery, and dated timeline.
2. Add day/month browse and search entry points with meaningful empty states.
3. Support folders/templates without crowding the editor; hide journal body previews on Today and notifications by default, and honor timeline/search snippet preferences.

## Acceptance

- The user can start an entry in a few actions, write freely, and revisit a date.
- Prompts can be dismissed and no journal action automatically sends content to AI.
- Long sessions survive interruption with a visible recoverable draft.

## Verification and evidence

- Run interrupted writing, backdated entry, timeline, and privacy preview journeys.
- Review comfort, text hierarchy, large text, keyboard behavior, and TalkBack.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/design/journeys.md](../../design/journeys.md)
- [docs/design/design-system.md](../../design/design-system.md)

## Commit target

`feat(journal): add focused writing and reflection journeys`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
