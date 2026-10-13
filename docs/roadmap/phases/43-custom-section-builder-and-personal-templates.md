# Phase 43 — Custom section builder and personal templates

Group: Personal extensions. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [42 — Safe custom section schema and renderer contracts](42-safe-custom-section-schema-and-renderer-contracts.md)
- [41 — Audio recording and attachment lifecycle](41-audio-recording-and-attachment-lifecycle.md)
- [30 — Today home and personal customization](30-today-home-and-personal-customization.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web custom-sections
- apps/mobile custom-sections
- packages/ui-web
- packages/ui-mobile

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Build guided create-section workflows for approved existing-item view blocks or typed-field collections, with field/filter selection, preview, reorder, and template save.
2. Implement approved native/web block renderers and item creation from templates.
3. Allow layout placement, hide/archive, and restore while warning before schema edits that affect existing records.

## Acceptance

- A user can create a Reading List section with text/date/number fields and organize entries into folders.
- Touch/pointer/keyboard alternatives can reorder both section and fields.
- Users never need to understand JSON, database tables, or programming terms.
- A user can also create a Study section combining the Software file view and upcoming tasks, then remove the section without deleting sources.

## Verification and evidence

- Run create/edit/migrate/export journeys with existing records on each platform.
- Review discovery, error copy, and accessible field labels using pilot users.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/design/journeys.md](../../design/journeys.md)
- [docs/product/requirements.md](../../product/requirements.md)

## Commit target

`feat(customization): add guided section and template creation`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
