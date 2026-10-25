# Phase 93 — Reviewed note task and journal creation

Group: V2 daily assistant. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [92 — Text assistant chat and contextual guidance](92-text-assistant-chat-and-contextual-guidance.md)
- [73 — Tasks routines and calendar workflow completion](73-tasks-routines-and-calendar-workflow-completion.md)
- [74 — Library writing journal and search completion](74-library-writing-journal-and-search-completion.md)
- [77 — Safe offline reopen sync and upgrade recovery](77-safe-offline-reopen-sync-and-upgrade-recovery.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api
- packages/contracts
- packages/domain
- apps/web/src/components/AssistantPanel.tsx
- apps/mobile/src/views/AssistantSheet.tsx

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Reuse existing proposal/confirm services to generate typed note/task/journal previews with destination/date/timezone/source fields.
2. Allow edit/cancel/confirm and execute through canonical domain services, stable operation IDs, expected revisions and durable receipts.
3. Teach the write/review/save/open-created-item flow; preserve facts and ask about ambiguous dates rather than inventing journal events.

## Acceptance

- No model-generated change executes before explicit user confirmation; one clear confirmation can cover a reviewed batch.
- Timeout/crash/retry cannot duplicate records or overwrite concurrent manual edits.
- Saved receipt/deep link opens the actual note/task/journal and clearly distinguishes local/cloud state.

## Verification and evidence

- Run proposal schema/consent/expiry/revision/IDOR/concurrent-confirm/crash-retry tests.
- Verify live synthetic note/task/journal requests through real controls and their action-based tour.

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
- [docs/decisions/0053-ai-assistant-confirmed-actions.md](../../decisions/0053-ai-assistant-confirmed-actions.md)

## Commit target

`feat(assistant): create notes tasks and journals through reviewed actions`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
