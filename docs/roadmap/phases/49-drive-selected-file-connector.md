# Phase 49 — Drive selected-file connector

Group: Vault and Drive. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [48 — Drive scope and external folder feasibility](48-drive-scope-and-external-folder-feasibility.md)
- [25 — Files folders and safe previews](25-files-folders-and-safe-previews.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api integrations drive
- apps/worker drive
- apps/web connections
- apps/mobile connections

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement reviewed OAuth/PKCE flow, encrypted server token storage, Picker/app-created file import, and app uploads to authorized locations.
2. Store external IDs/version/provenance rather than duplicating canonical binaries without intent.
3. Add disconnect/revoke, source unavailable states, sync retries, external quota limits, and explicit offline download options.

## Acceptance

- Users can connect Drive and work with the exact selected/app-created files permitted by the approved scope.
- App uploads and external reads cannot escape authorized provider context.
- Disconnect stops jobs and removes stored tokens while explaining retained local/imported copies.

## Verification and evidence

- Test revoked/expired OAuth, external deletion/move, quota errors, permission loss, and upload retry.
- Review redirect validation, token redaction, provider access, and synthetic external file provenance.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/integrations-and-reminders.md](../../architecture/integrations-and-reminders.md)
- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)

## Commit target

`feat(drive): connect authorized files and app-managed uploads`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
