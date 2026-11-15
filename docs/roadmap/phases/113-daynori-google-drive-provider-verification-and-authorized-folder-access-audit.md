# Phase 113 — Daynori Google Drive provider-verification and authorized folder access audit

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [87 — Google Drive connection and scope readiness](87-google-drive-connection-and-scope-readiness.md)
- [107 — Bounded Google Drive folder authorization and scope boundary review](107-bounded-google-drive-folder-authorization-and-scope-boundary-review.md)
- [112 — Daynori core web/PWA browser release verification and staging isolation audit](112-daynori-core-web-pwa-browser-release-verification-and-staging-isolation-audit.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain
- apps/api
- docs/engineering
- docs/decisions
- docs/roadmap
- docs/phase-reports
- artifacts/phase113
- tests/spikes/drive
- tests/integration
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Prepare owner review package in docs/engineering/google-drive-oauth-verification-guide.md specifying Google Cloud Console setup, OAuth consent screen with drive.file, Web Application OAuth 2.0 client IDs, HTTP referrer-restricted API keys, and synthetic test account requirements.
2. Provide gitignored tests/spikes/drive/config.local.env.example template to ensure zero credential or secret leakage into Git or logs.
3. Execute live spike runner via node tests/spikes/drive/run-spike.mjs --mode=live, truthfully recording outcome=blocked with missing_oauth_config under DEF-V2-005.
4. Author comprehensive integration test suite in tests/integration/phase113-drive-provider-verification.test.ts auditing all 11 required scenarios (selected folder with existing files, new externally added file, nested folders, individually picked files, app-created files, move/delete, permission loss, pagination, token expiry, revoke and disconnect, vault exclusion & workspace isolation).
5. Verify buildAuthorizedDriveTree hierarchy presentation, suppression of unpicked descendants, and remote original preservation on disconnect (remoteOriginalDeleted: false).
6. Assess broader restricted scope (drive.readonly / drive) CASA AL2 third-party lab audit obligations ($2,500-$6,000+/yr) and preserve recursive mirroring fail-closed under DEF-V2-005.
7. Update Help article help.drive-optional to contentVersion 2 explaining narrow drive.file boundaries, folder container selection, copy vs. reference distinctions, and remote original preservation.
8. Author ADR 0113, Phase 113 report, evidence-summary.json, drive-scope-capabilities-matrix.json, and provider-evidence.json.

## Acceptance

- All 11 required provider scenarios are thoroughly tested and passing in tests/integration/phase113-drive-provider-verification.test.ts.
- Google Cloud OAuth configuration package and synthetic test account requirements prepared for owner review in docs/engineering/google-drive-oauth-verification-guide.md.
- Zero credentials, client secrets, API keys, or tokens committed to Git; config.local.env strictly gitignored.
- Live provider execution outcome recorded truthfully as blocked (DEF-V2-005 fail-closed) in artifacts/phase113/live-blocked.json.
- Disconnect and revocation guarantee remote Google Drive originals are never deleted or trashed (remoteOriginalDeleted: false).
- Vault items and cryptographic keys fail closed under isVaultDriveTarget with HTTP 403 vault_excluded.
- CASA AL2 restricted scope requirements and annual cost model ($2,500-$6,000+/yr) fully documented; recursive mirroring remains gated.
- Help article help.drive-optional updated to version 2 with accurate scope and folder boundary guidance.
- Standing release gates (DEF-V2-001, DEF-V2-004, DEF-V2-005, DEF-V2-007, DEF-V2-008, DEF-V2-011, DEF-V2-013, OWNER-SIGNING-KEYS, OWNER-RELEASE-AUTH, Phase 71) remain strictly blocked.
- docs/roadmap/plan.json, progress.json, and blueprint.html updated and pass all planning validators.

## Verification and evidence

- node scripts/validate-planning.mjs
- node scripts/build-phase-plans.mjs --check
- node scripts/build-blueprint.mjs --check
- pnpm validate:function-register
- pnpm vitest run tests/integration/phase113-drive-provider-verification.test.ts
- pnpm --filter @daynori/domain typecheck
- pnpm --filter @daynori/api typecheck
- pnpm lint

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/decisions/0087-google-drive-connection-and-scope-readiness.md](../../decisions/0087-google-drive-connection-and-scope-readiness.md)
- [docs/decisions/0107-bounded-google-drive-folder-authorization-and-scope-boundary.md](../../decisions/0107-bounded-google-drive-folder-authorization-and-scope-boundary.md)
- [docs/decisions/0113-google-drive-provider-verification-and-scope-boundary-audit.md](../../decisions/0113-google-drive-provider-verification-and-scope-boundary-audit.md)
- [docs/phase-reports/phase-87.md](../../phase-reports/phase-87.md)
- [docs/phase-reports/phase-107.md](../../phase-reports/phase-107.md)
- [docs/phase-reports/phase-112.md](../../phase-reports/phase-112.md)
- [docs/phase-reports/phase-113.md](../../phase-reports/phase-113.md)
- [docs/engineering/google-drive-oauth-verification-guide.md](../../engineering/google-drive-oauth-verification-guide.md)
- [docs/engineering/google-drive-restricted-scope-mirroring-proposal.md](../../engineering/google-drive-restricted-scope-mirroring-proposal.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`test(drive): verify google drive provider boundaries and folder access scope`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
