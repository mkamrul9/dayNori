# Phase 95 — Voice capture transcription and reviewed creation

Group: V2 daily assistant. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [90 — AI provider consent privacy and operating decisions](90-ai-provider-consent-privacy-and-operating-decisions.md)
- [93 — Reviewed note task and journal creation](93-reviewed-note-task-and-journal-creation.md)
- [75 — Files and audio attachment readiness](75-files-and-audio-attachment-readiness.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web
- apps/mobile/src/audio
- apps/api
- apps/worker
- packages/contracts
- docs/decisions

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Choose and document a transcription adapter with language, retention, consent, duration/size/cost and background-interruption constraints.
2. Implement explicit record/stop/cancel, upload/transcribe, editable transcript and permission/text fallback; no always-listening behavior.
3. Route corrected text through the same reviewed proposals and delete transient audio under the documented policy unless separately saved as an attachment.

## Acceptance

- English/Bangla and code-switched recordings produce reviewable text; uncertain recognition cannot silently save or execute.
- Denied microphone, silence, interruption, timeout and offline/retry retain safe user control without leaking recording bytes.
- Actual authorized transcription/provider and physical device evidence exists with bounded retention/cost.

## Verification and evidence

- Run audio validation/cancel/retry/account-switch/retention and proposal-confirm boundary cases.
- Record live synthetic transcription quality, correction and save journeys on supported browsers and Android.

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
- [docs/roadmap/v2/assistant.md](../v2/assistant.md)
- [docs/roadmap/v2/quality-and-release.md](../v2/quality-and-release.md)

## Commit target

`feat(voice): turn reviewed transcripts into organizer drafts`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
