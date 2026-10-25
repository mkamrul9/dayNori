# Phase 89 — Billing entitlements and sustainable plan readiness

Group: V2 advanced capability gates. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [71 — Native Android interface and navigation parity](71-native-android-interface-and-navigation-parity.md)
- [75 — Files and audio attachment readiness](75-files-and-audio-attachment-readiness.md)
- [81 — Advanced recovery and optional-feature tour coverage](81-advanced-recovery-and-optional-feature-tour-coverage.md)
- [83 — Developer feedback triage and verified support contact](83-developer-feedback-triage-and-verified-support-contact.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api
- apps/worker
- apps/web/src/components/BillingPanel.tsx
- apps/mobile/src/views/BillingSheet.tsx
- docs/engineering

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Prepare concrete feature/usage/cost boundaries and owner commercial decisions before choosing a real purchase configuration.
2. Verify approved web/Play purchase, restore, renewal/refund/expiry/grace and durable provider events under current market/account policy.
3. Keep existing data readable/exportable after downgrade, bind server quotas and provide accurate non-charging tutorial guidance.

## Acceptance

- Server-verified entitlements survive duplicate/out-of-order events and cannot be granted by client settings.
- Sandbox evidence and owner-approved pricing/merchant/policy configuration exist; no real charges are implicit in this phase.
- Billing never unlocks independently gated vault/AI/rooms and downgrade preserves read/export/delete.

## Verification and evidence

- Run entitlement/provider-event/quota/repair tests and real approved sandbox scenarios.
- Record current official policy check, cost model and cross-client restore/downgrade evidence.

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
- [docs/decisions/0054-billing-entitlements-and-purchase-lifecycle.md](../../decisions/0054-billing-entitlements-and-purchase-lifecycle.md)
- [docs/roadmap/v2/quality-and-release.md](../v2/quality-and-release.md)

## Commit target

`fix(billing): verify purchase lifecycle and sustainable quotas`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
