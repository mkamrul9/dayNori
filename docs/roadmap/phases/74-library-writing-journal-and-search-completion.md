# Phase 74 — Library writing journal and search completion

Group: V2 everyday experience. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [69 — Desktop shell and focused Today experience](69-desktop-shell-and-focused-today-experience.md)
- [70 — Mobile web and PWA layout redesign](70-mobile-web-and-pwa-layout-redesign.md)
- [72 — Welcome startup onboarding and authentication polish](72-welcome-startup-onboarding-and-authentication-polish.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web/src/app/library
- apps/web/src/app/journal
- apps/mobile/src/views
- apps/api
- packages/domain

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Deliver focused note/journal editors, canonical mixed folders, knowledge views, filters and authorized search using the new visual system.
2. Repair inventoried formatting/autosave/reopen, folder move/depth, preview privacy and source-link behavior without replacing stable IDs.
3. Keep metadata secondary, support long English/Bangla content and map actual actions to Help/tour coverage.

## Acceptance

- Users can write/reopen, organize/find, archive/trash/restore supported content with preserved IDs and revisions.
- Journal entry dates, multiple entries, private previews and opt-in prompts behave consistently across clients.
- Unauthorized/vault data never enters ordinary search; filtered folders explain their scope and clear filters safely.

## Verification and evidence

- Run relevant note/journal/folder/search tests with two synthetic accounts and long documents.
- Verify keyboard/mobile writing, interruption recovery, rich-content sanitization and canonical-link round trips.

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
- [docs/product/requirements.md](../../product/requirements.md)
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/phase-reports/phase-71.md](../../phase-reports/phase-71.md)

## Commit target

`feat(content): complete focused writing and library workflows`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
