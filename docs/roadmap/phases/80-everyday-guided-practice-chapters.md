# Phase 80 — Everyday guided practice chapters

Group: V2 learning and support. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [79 — Action-verified resumable tour engine](79-action-verified-resumable-tour-engine.md)
- [73 — Tasks routines and calendar workflow completion](73-tasks-routines-and-calendar-workflow-completion.md)
- [74 — Library writing journal and search completion](74-library-writing-journal-and-search-completion.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web
- apps/mobile
- packages/domain
- tests/e2e
- docs/roadmap/v2

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Build a short starter sequence and chapters for navigation, personalization, tasks/routines/calendar, notes/journal, folders/search and Help.
2. Guide actual Create/edit/save/reopen/complete/undo actions with durable result predicates and opt-in labeled practice records.
3. Add cleanup review, safe replay and chapter-specific troubleshooting; update every actual core action in the coverage register.

## Acceptance

- Users operate real controls and see their own saved/reopened records rather than only clicking tutorial Next.
- Skipping stays available; completed/skipped states differ; replay does not duplicate or delete edited content.
- All core action coverage is traceable and accessible on desktop, narrow PWA and native Android.

## Verification and evidence

- Run UI journeys asserting actual canonical IDs/receipts and negative failed-save/unrelated-event cases.
- Record keyboard/SR and physical phone chapter/resume runs with synthetic data.

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
- [docs/roadmap/v2/guided-tours.md](../v2/guided-tours.md)

## Commit target

`feat(tours): teach everyday workflows through real actions`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
