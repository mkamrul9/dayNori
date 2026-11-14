# Phase 108 — AI text-assistant release-gate and operational review

Group: V2 advanced capability gates. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [94 — Structured organizer tools and multi-action creation](94-structured-organizer-tools-and-multi-action-creation.md)
- [107 — Bounded Google Drive folder authorization and scope boundary review](107-bounded-google-drive-folder-authorization-and-scope-boundary-review.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain
- apps/api
- apps/web
- apps/mobile
- docs/decisions
- docs/roadmap
- docs/phase-reports
- artifacts/phase108
- tests/integration

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Evaluate existing Phase 90–94 AI text-assistant implementation against release gate DEF-V2-008, ensuring Ask Nori is easily discoverable on desktop and mobile while presenting truthful unavailability explanations when gated.
2. Implement anti-hallucination date ambiguity verification for task deadlines (detectTaskDeadlineAmbiguity) and journal entries, prompting clarifying questions for relative dates without creating unreviewed proposals.
3. Verify proposal review lifecycle: preview editing, single-use confirmation tokens, explicit Save/Confirm execution, durable mutation receipts under AI_DEVICE_ID in app.mutation_receipts, and canonical deep links via getOrganizerDeepLink.
4. Enforce strict privacy fencing: current disclosure versions, multi-tenant workspace isolation, strict journal opt-in (contentScope.journal), and unconditional vault exclusion.
5. Separate mock provider testing (FakeAiProvider) from live provider wire protocol evaluation (OpenAiCompatibleProvider with store: false, error mapping for HTTP 429/503/401/malformed, and in-flight cancellation) and keep live enterprise transmission gated under DEF-V2-008.

## Acceptance

- Ask Nori surfaced in desktop sidebar navigation and header with truthful gating banner and disabled inputs under DEF-V2-008.
- Ambiguous date queries for journals and task deadlines trigger clarifying questions rather than guessing or saving unreviewed items.
- Explicit Confirm/Save produces durable sync mutation receipts in app.mutation_receipts and canonical deep links to created items.
- Unreviewed and cancelled proposals never modify domain organizer tables.
- Vault items and keys are unconditionally excluded with 403 AI_VAULT_FORBIDDEN.
- Mock and live provider evaluation records generated separately; live provider wire protocol verified with store: false.

## Verification and evidence

- pnpm vitest run tests/integration/phase108-ai-assistant-release-gate.test.ts tests/integration/phase90-ai-consent-privacy-readiness.test.ts tests/integration/phase91-scoped-retrieval-evaluation.test.ts tests/integration/phase92-assistant-chat-stream-guidance.test.ts tests/integration/phase93-reviewed-organizer-creation.test.ts tests/integration/phase94-structured-organizer-tools.test.ts
- pnpm --filter @daynori/domain typecheck
- pnpm --filter @daynori/web typecheck
- pnpm --filter @daynori/mobile typecheck
- pnpm --filter @daynori/api typecheck
- pnpm lint
- node scripts/validate-planning.mjs

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/decisions/0090-ai-provider-consent-privacy-and-operating-decisions.md](../../decisions/0090-ai-provider-consent-privacy-and-operating-decisions.md)
- [docs/decisions/0091-scoped-retrieval-indexing-and-grounding-quality.md](../../decisions/0091-scoped-retrieval-indexing-and-grounding-quality.md)
- [docs/decisions/0093-reviewed-note-task-and-journal-creation.md](../../decisions/0093-reviewed-note-task-and-journal-creation.md)
- [docs/decisions/0108-ai-text-assistant-release-gate-and-operational-review.md](../../decisions/0108-ai-text-assistant-release-gate-and-operational-review.md)
- [docs/phase-reports/phase-90.md](../../phase-reports/phase-90.md)
- [docs/phase-reports/phase-94.md](../../phase-reports/phase-94.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`test(ai): verify assistant release gate proposals and provider operational limits`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
