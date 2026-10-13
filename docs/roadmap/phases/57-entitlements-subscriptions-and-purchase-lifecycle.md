# Phase 57 — Entitlements subscriptions and purchase lifecycle

Group: Business and public launch. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [38 — Controlled private beta](38-controlled-private-beta.md)
- [03 — Platform and integration feasibility spikes](03-platform-and-integration-feasibility-spikes.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api billing
- apps/worker billing events
- apps/web billing
- apps/mobile billing

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Decide free/paid boundaries and storage/AI quotas from measured costs; preserve export/access rules when plans change.
2. Implement provider-specific purchase adapters, verified server entitlements, idempotent events, renewal/grace/refund handling, and restore purchases.
3. Validate applicable Play billing and web purchasing rules before exposing purchase flows; configure sandbox accounts first.

## Acceptance

- Clients cannot grant premium access by modifying local state.
- Duplicate/out-of-order events, refunds, expiry, and restore are reflected correctly.
- Prices and renewal terms are transparent; plan expiry does not silently delete personal content.

## Verification and evidence

- Run store/web sandbox purchase, restore, refund, renewal, failure, and event replay scenarios.
- Review current store payment policy and reconcile entitlement state with providers.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/engineering/release-gates.md](../../engineering/release-gates.md)
- [docs/architecture/operations-and-scaling.md](../../architecture/operations-and-scaling.md)

## Commit target

`feat(billing): add verified subscriptions and entitlement lifecycle`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
