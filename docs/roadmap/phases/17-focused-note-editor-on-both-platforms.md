# Phase 17 — Focused note editor on both platforms

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [16 — Typed note domain and persistence](16-typed-note-domain-and-persistence.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web notes
- apps/mobile notes
- packages/ui-web
- packages/ui-mobile

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Add distraction-free title/body editing, autosave feedback, folder selection, and a restrained formatting toolbar.
2. Keep keyboard focus stable and preserve selection while saving.
3. Add unsaved/failure/conflict recovery and accessible note actions; do not mix audio capture into typed note creation.

## Acceptance

- The user can type, close, reopen, and find the same note without an explicit save ritual.
- Editor handles long text and native/browser keyboards comfortably.
- The UI distinguishes local persistence from cloud synchronization.

## Verification and evidence

- Test restart during typing, offline edits, navigation while saving, and failed persistence.
- Review typing responsiveness and text scaling with real devices and browser assistive technology.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/design/journeys.md](../../design/journeys.md)
- [docs/architecture/sync-and-offline.md](../../architecture/sync-and-offline.md)

## Commit target

`feat(notes): deliver focused web and mobile note editors`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
