# Phase 59 — Google Play and web launch preparation

Group: Business and public launch. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [38 — Controlled private beta](38-controlled-private-beta.md)
- [57 — Entitlements subscriptions and purchase lifecycle](57-entitlements-subscriptions-and-purchase-lifecycle.md)
- [58 — Reliability scale and operating cost gate](58-reliability-scale-and-operating-cost-gate.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/mobile release metadata
- apps/web legal and support
- docs/engineering/release-gates.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Finalize brand/domain/store clearance, privacy/terms, account-deletion URL, support routes, truthful screenshots, and paid plan disclosures.
2. Verify current target API, permissions, data safety declarations, signing, test-track requirements, content rating, accessibility, and billing.
3. Inventory enabled features: vault needs Phase 47, Drive scope promises need Phase 48/50 as applicable, chat needs Phase 54, and AI needs Phase 56; hide incomplete modules.

## Acceptance

- Store/web claims exactly match enabled tested functionality.
- A signed release candidate passes clean install/upgrade and current policy requirements.
- Launch checklist records real operator approvals, external prerequisites, and remaining review status.

## Verification and evidence

- Run release candidate smoke/security/accessibility checks on supported browsers and physical devices.
- Review current primary store policies and verify privacy declarations against actual network/storage behavior.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/engineering/release-gates.md](../../engineering/release-gates.md)
- [docs/product/naming.md](../../product/naming.md)
- [docs/research/sources.md](../../research/sources.md)

## Commit target

`chore(release): prepare verified Play and web launch materials`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
