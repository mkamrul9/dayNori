# Phase 75 — Files and audio attachment readiness

Group: V2 everyday experience. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [74 — Library writing journal and search completion](74-library-writing-journal-and-search-completion.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web/src/app/files
- apps/mobile/src/audio
- apps/api
- apps/worker
- packages/contracts
- docs/roadmap/v2

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Complete approved private upload/audio capture and attachment journeys with bounded quotas, progress, cancellation, retry and processing states.
2. Verify file signatures, scanning/preview isolation, original-byte download, expired access refresh and offline cache controls through existing providers.
3. Prepare configuration and provider evidence for a real supported environment; retain blocked state if preview hosting/storage/audio prerequisites are unavailable.

## Acceptance

- Supported files and recordings can be created, attached, reopened/downloaded and deleted without duplicates or orphan quota.
- Invalid type/size, denied microphone, failed scan/upload, account switch and unauthorized downloads are safely handled.
- Actual provider/device evidence supports enabled claims; audio attachments remain distinct from assistant transcription.

## Verification and evidence

- Run upload/audio integration/security cases and compare downloaded synthetic bytes/checksums.
- Test capture/playback/cancel/background and previews on nominated browsers and physical Android; document operating limits.

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
- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)
- [docs/roadmap/v2/quality-and-release.md](../v2/quality-and-release.md)

## Commit target

`feat(attachments): complete private file and audio workflows`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
