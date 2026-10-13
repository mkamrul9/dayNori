# Phase 56 — AI assistant and confirmed organizer actions

Group: AI assistant. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [55 — AI provider privacy and retrieval foundation](55-ai-provider-privacy-and-retrieval-foundation.md)
- [19 — Upcoming task lists and detail views](19-upcoming-task-lists-and-detail-views.md)
- [23 — Journal writing and reflection interfaces](23-journal-writing-and-reflection-interfaces.md)
- [32 — Knowledge guides and cheatsheet organization](32-knowledge-guides-and-cheatsheet-organization.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web assistant
- apps/mobile assistant
- apps/api ai tools

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Add optional source-linked answers and planning/reflection assistance with visible context scope.
2. Permit limited draft actions through typed server tools; require review before create/update/delete/share and bind confirmation to the specific proposed operation.
3. Provide cancel, no-network/provider failure, budget, and consent controls; never unlock/read the vault through AI.

## Acceptance

- Answers point to authorized source items and acknowledge insufficient context.
- No destructive/sharing action occurs from model output without explicit user confirmation.
- Prompt injection in a guide/file cannot change authorization or silently call external tools.

## Verification and evidence

- Run adversarial evals, expired confirmation, cross-tenant tool arguments, consent changes, and hallucinated-source checks.
- Review assistant accessibility and simple language with realistic organizer prompts.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/product/requirements.md](../../product/requirements.md)
- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)

## Commit target

`feat(assistant): add grounded answers and reviewable organizer actions`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
