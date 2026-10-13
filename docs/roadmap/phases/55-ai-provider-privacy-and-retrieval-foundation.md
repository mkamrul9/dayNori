# Phase 55 — AI provider privacy and retrieval foundation

Group: AI assistant. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [38 — Controlled private beta](38-controlled-private-beta.md)
- [33 — Global authorized search and filters](33-global-authorized-search-and-filters.md)
- [35 — Portable export and controlled import](35-portable-export-and-controlled-import.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api ai module
- apps/worker indexing
- packages/contracts ai
- docs/decisions

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Select a provider only after reviewing current data retention, region, cost, rate limits, and explicit user consent requirements.
2. Implement server-side provider adapter, eligible content index, workspace/collection authorization filters, deletion/version refresh, and per-user budgets.
3. Treat stored document text as untrusted; exclude vault and unconsented journals, restrict context length, and return source references.

## Acceptance

- Retrieval cannot include another workspace or excluded sensitive source.
- Users can disable AI and remove derived indexes through a documented lifecycle.
- Provider failures/budget exhaustion do not block core app use and secrets remain server-side.

## Verification and evidence

- Run retrieval authorization, stale/deleted item, prompt-injection, budget, and log-redaction tests.
- Review provider data handling and measure grounded responses on synthetic eval fixtures.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)
- [docs/engineering/risks-and-decisions.md](../../engineering/risks-and-decisions.md)

## Commit target

`feat(ai): add consent-based authorized retrieval and provider boundaries`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
