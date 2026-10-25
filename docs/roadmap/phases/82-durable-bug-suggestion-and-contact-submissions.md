# Phase 82 — Durable bug suggestion and contact submissions

Group: V2 learning and support. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [66 — Simple navigation personalization and developer boundaries](66-simple-navigation-personalization-and-developer-boundaries.md)
- [68 — Design tokens components icons and motion](68-design-tokens-components-icons-and-motion.md)
- [77 — Safe offline reopen sync and upgrade recovery](77-safe-offline-reopen-sync-and-upgrade-recovery.md)
- [78 — Complete contextual Help and user instructions](78-complete-contextual-help-and-user-instructions.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/contracts
- apps/api
- apps/worker
- apps/web/src/app/support
- apps/mobile/src/views
- infra/supabase/migrations

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement validated scoped report records, Bug/Suggestion/Contact forms, local drafts, idempotent submission and clear queued/submitted/failure states.
2. Add opt-in reviewed diagnostics and private user-selected attachments with redaction/type/size/rate limits.
3. Prepare durable delivery adapters and receipts for restricted triage; keep unconfigured external destinations truthful.

## Acceptance

- Server acknowledgment is required for Submitted; offline retry and restart cannot duplicate or cross-submit another account report.
- Private bodies/tokens/prompts/audio are absent from automatic diagnostics and logs.
- Unauthorized report/attachment access, invalid input and abusive submission are rejected server-side.

## Verification and evidence

- Test offline/duplicate/cancel/account-switch, cross-tenant IDs, attachment validation and provider-delivery failure states.
- Submit synthetic reports through desktop, installed PWA and native controls and verify stored receipt identity.

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

`feat(feedback): add durable private bug and suggestion reports`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
