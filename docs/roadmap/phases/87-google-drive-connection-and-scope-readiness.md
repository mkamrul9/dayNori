# Phase 87 — Google Drive connection and scope readiness

Group: V2 advanced capability gates. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [75 — Files and audio attachment readiness](75-files-and-audio-attachment-readiness.md)
- [77 — Safe offline reopen sync and upgrade recovery](77-safe-offline-reopen-sync-and-upgrade-recovery.md)
- [81 — Advanced recovery and optional-feature tour coverage](81-advanced-recovery-and-optional-feature-tour-coverage.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web/src/components/DriveConnectionsPanel.tsx
- apps/mobile/src/views/DriveConnectionsSheet.tsx
- apps/api
- apps/worker
- docs/engineering

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Recheck approved least-privilege scope and actual selected-file/folder workflow against current Google documentation and owner target.
2. Verify connect/select/copy-reference/upload/sync/revoke/disconnect behavior with private provider credentials and no unrelated file indexing.
3. Keep full folder mirroring separately deferred unless explicitly selected; activate supported live workflows and their Help/tour with exact limitations.

## Acceptance

- Real authorized provider evidence covers supported Drive scope, failures and safe disconnect without deleting remote originals.
- No promise that drive.file automatically exposes arbitrary pre-existing folders; tokens and signed URLs stay private.
- Phase 50 deferred history remains intact; missing OAuth/verification prerequisites block unsupported claims.

## Verification and evidence

- Run Drive integration/security/retry/membership checks plus actual selected-scope provider scenarios.
- Record current scope/verification decision, consent/revocation and web/native connection journeys.

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
- [docs/decisions/0046-drive-scope-and-folder-access.md](../../decisions/0046-drive-scope-and-folder-access.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`fix(drive): verify supported live connection and revocation`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
