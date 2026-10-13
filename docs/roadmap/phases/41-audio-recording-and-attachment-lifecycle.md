# Phase 41 — Audio recording and attachment lifecycle

Group: Personal extensions. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [25 — Files folders and safe previews](25-files-folders-and-safe-previews.md)
- [38 — Controlled private beta](38-controlled-private-beta.md)
- [03 — Platform and integration feasibility spikes](03-platform-and-integration-feasibility-spikes.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/mobile recording
- apps/web recording
- packages/domain attachments
- apps/api files

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement explicit microphone permission, start/pause/stop where supported, duration limits, playback, and upload using the file lifecycle.
2. Handle background/interruption/browser capability differences, local drafts, quota, and cancellation.
3. Attach deliberately recorded audio as a file link to permitted note, journal, knowledge, or custom-compatible items, or keep it in Files; initial note creation remains typed, and automatic transcription is deferred.

## Acceptance

- Recording requires deliberate user action and an unmistakable active indicator.
- Interrupted sessions leave a recoverable valid recording or a clear failure without a false saved claim.
- Audio files follow private storage, export, and account cleanup rules.

## Verification and evidence

- Test permission refusal, calls/app background, process restart, unsupported codecs, long recordings, and offline upload.
- Review playback controls with screen readers and verify no microphone starts on onboarding.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/integrations-and-reminders.md](../../architecture/integrations-and-reminders.md)
- [docs/product/requirements.md](../../product/requirements.md)

## Commit target

`feat(audio): add deliberate private recording and playback`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
