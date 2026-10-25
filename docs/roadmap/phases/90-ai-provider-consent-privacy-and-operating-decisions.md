# Phase 90 — AI provider consent privacy and operating decisions

Group: V2 daily assistant. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [65 — Version 2 function inventory and readiness baseline](65-version-2-function-inventory-and-readiness-baseline.md)
- [68 — Design tokens components icons and motion](68-design-tokens-components-icons-and-motion.md)
- [77 — Safe offline reopen sync and upgrade recovery](77-safe-offline-reopen-sync-and-upgrade-recovery.md)
- [78 — Complete contextual Help and user instructions](78-complete-contextual-help-and-user-instructions.md)
- [81 — Advanced recovery and optional-feature tour coverage](81-advanced-recovery-and-optional-feature-tour-coverage.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api
- packages/contracts
- docs/decisions
- docs/engineering
- tests/integration

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Compare current providers using official capability/privacy/cost documentation; prepare concrete retention/region/training and budget choices for owner review.
2. Reuse consent generations, cancellation fencing and durable request budgets; verify provider adapter schema, secrets, timeouts and kill switch.
3. Obtain explicit authorization before a live provider test with synthetic material; keep real-user transmission off until the dedicated gate passes.

## Acceptance

- Provider/retention/residency/cost decisions and explicit consent text are recorded; fake tests are labeled.
- Journal opt-in is separate, vault excluded, and disable/cancel fences in-flight results and indexed artifacts.
- No public API secret, unlimited-spend assumption or implied zero retention; missing owner/provider evidence remains blocked.

## Verification and evidence

- Run existing AI privacy/budget/cancel/adapter tests plus malformed/provider-outage cases.
- Record dated primary sources, authorized live synthetic transport evidence and measured per-request cost.

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
- [docs/decisions/0052-ai-provider-privacy-and-retrieval.md](../../decisions/0052-ai-provider-privacy-and-retrieval.md)

## Commit target

`feat(ai): verify provider privacy consent and budgets`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
