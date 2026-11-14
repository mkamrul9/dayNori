# Phase 107 — Bounded Google Drive folder authorization and scope boundary review

Group: V2 advanced capability gates. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [87 — Google Drive connection and scope readiness](87-google-drive-connection-and-scope-readiness.md)
- [106 — Daynori native Android interface refinement and component overhaul](106-daynori-native-android-interface-refinement-and-component-overhaul.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain
- apps/web
- apps/mobile
- docs/engineering
- docs/decisions
- docs/roadmap
- docs/phase-reports
- artifacts/phase107
- tests/integration

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Review deferred Phase 50 decision (ADR 0046) and Phase 87 audit (ADR 0087); run live and synthetic Google Picker/OAuth tests to evaluate whether drive.file grants descendants and future additions.
2. Formulate bounded folder tree hierarchy (buildAuthorizedDriveTree) in domain and present authorized folder structures with familiar hierarchy and truthful empty/unpicked notices in Web and Mobile UI.
3. Enforce strict traversal boundaries preventing root Drive enumeration or unselected parent/sibling folder crawling; preserve vault exclusion and multi-tenant workspace isolation.
4. Verify disconnect and revocation guarantees: tokens wiped, in-flight jobs fenced, imported copies retained in app storage, and remote Drive originals never deleted or trashed.
5. Since drive.file does not authorize unpicked descendants, author a comprehensive broader-scope proposal detailing candidate restricted scopes (drive.readonly, drive), mandatory ADA CASA AL2 security assessment, annual recertification, and cost requirements; keep recursive mirroring gated fail-closed under DEF-V2-005.

## Acceptance

- Synthetic tests prove drive.file authorizes folder container and app-created/picked children, but denies unpicked pre-existing or external descendants.
- Authorized folder tree hierarchy rendered with familiar nesting and clear copy vs. reference indicators on Web and Mobile.
- Disconnect and revocation cleanly wipe tokens without deleting or trashing remote Google Drive originals.
- Vault items and keys are strictly excluded (isVaultDriveTarget), failing closed with 403 vault_excluded.
- Multi-tenant workspace scoping verified with zero cross-workspace data leakage.
- Concrete broader-scope proposal authored with current Google verification and CASA AL2 cost requirements; recursive mirroring remains gated.

## Verification and evidence

- pnpm vitest run tests/integration/phase107-drive-folder-boundary.test.ts tests/integration/phase87-drive-connection-readiness.test.ts tests/spikes/drive/drive-scope.synthetic.test.ts
- pnpm --filter @daynori/web typecheck
- pnpm --filter @daynori/mobile typecheck
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
- [docs/decisions/0046-drive-scope-and-folder-access.md](../../decisions/0046-drive-scope-and-folder-access.md)
- [docs/decisions/0087-google-drive-connection-and-scope-readiness.md](../../decisions/0087-google-drive-connection-and-scope-readiness.md)
- [docs/decisions/0107-bounded-google-drive-folder-authorization-and-scope-boundary.md](../../decisions/0107-bounded-google-drive-folder-authorization-and-scope-boundary.md)
- [docs/engineering/google-drive-restricted-scope-mirroring-proposal.md](../../engineering/google-drive-restricted-scope-mirroring-proposal.md)
- [docs/phase-reports/phase-50.md](../../phase-reports/phase-50.md)
- [docs/phase-reports/phase-87.md](../../phase-reports/phase-87.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`feat(drive): verify bounded drive folder trees and proposal for restricted scope`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
