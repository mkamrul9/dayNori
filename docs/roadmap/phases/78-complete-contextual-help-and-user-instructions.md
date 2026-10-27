# Phase 78 — Complete contextual Help and user instructions

Group: V2 learning and support. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [73 — Tasks routines and calendar workflow completion](73-tasks-routines-and-calendar-workflow-completion.md)
- [74 — Library writing journal and search completion](74-library-writing-journal-and-search-completion.md)
- [76 — Expenses and safe custom sections completion](76-expenses-and-safe-custom-sections-completion.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web/src/app/help
- apps/mobile/src/views
- docs/roadmap/v2
- packages/domain

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Create versioned task-based articles and searchable categories for every inventory family, with platform differences and expected results.
2. Add contextual Help to unfamiliar controls and preserve drafts when opening instructions; support offline essential recovery articles.
3. Add Learn the app catalog and chapter links ready for the tour engine, separating user guidance from restricted developer docs.

## Acceptance

- Every in-scope action has article coverage and a clear entry point; unavailable features are described honestly.
- Search, troubleshooting, account/privacy/export/install instructions and human-feedback entry points are accessible without AI.
- Instructions use actual labels, professional icons and concise language, with localization-ready content.

## Verification and evidence

- Validate article/feature/deep-link mappings and invalid/unavailable capability behavior.
- Manually follow representative articles on desktop, mobile PWA and native Android without losing editor content.

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
- [docs/roadmap/v2/help-and-feedback.md](../v2/help-and-feedback.md)

## Commit target

`feat(help): add complete contextual instructions and learning catalog`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
