# Phase 91 — Scoped retrieval indexing and grounding quality

Group: V2 daily assistant. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [90 — AI provider consent privacy and operating decisions](90-ai-provider-consent-privacy-and-operating-decisions.md)
- [74 — Library writing journal and search completion](74-library-writing-journal-and-search-completion.md)
- [78 — Complete contextual Help and user instructions](78-complete-contextual-help-and-user-instructions.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api
- apps/worker
- packages/domain
- tests/fixtures
- tests/integration

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Build on current FTS retrieval for versioned Help plus opted-in personal data; evaluate hybrid/embedding changes only against measured benefit.
2. Implement revision-aware lifecycle handling for edits/deletion/import/consent/revocation and bounded approved attachment extraction.
3. Bind citations to authorized sources and evaluate English/Bangla relevance, abstention, freshness and injected-document boundaries.

## Acceptance

- Workspace/membership/privacy filters precede retrieval and source access is rechecked before results.
- Stale/deleted/disallowed content is excluded or clearly stale; vault and unconsented journal never enter context.
- Known-answer/citation/unknown-answer evaluations have measured results and real-provider limits, not only fake fixtures.

## Verification and evidence

- Run lifecycle/cross-tenant/revocation/injection/citation-binding tests with a synthetic versioned evaluation set.
- Measure retrieval quality, latency and reindex/deletion completion; record why any vector/hybrid complexity is justified.

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
- [docs/roadmap/v2/quality-and-release.md](../v2/quality-and-release.md)

## Commit target

`feat(rag): add evaluated scoped retrieval and source lifecycle`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
