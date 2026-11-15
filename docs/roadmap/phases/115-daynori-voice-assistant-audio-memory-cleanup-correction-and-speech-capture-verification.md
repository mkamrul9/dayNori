# Phase 115 — Daynori voice-assistant audio memory cleanup correction and speech capture verification

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [95 — Voice capture transcription and reviewed creation](95-voice-capture-transcription-and-reviewed-creation.md)
- [109 — Voice-assistant verification and operational review](109-voice-assistant-verification-and-operational-review.md)
- [114 — Daynori Ask Nori text-assistant release-gate verification and reviewed organizer creation audit](114-daynori-ask-nori-text-assistant-release-gate-verification-and-reviewed-organizer-creation-audit.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain
- apps/api
- apps/web
- apps/mobile
- docs/engineering
- docs/policy
- docs/decisions
- docs/roadmap
- docs/phase-reports
- artifacts/phase115
- tests/fixtures/audio
- tests/integration
- tests/unit
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Remediate server audio-memory cleanup vulnerability by implementing and exporting zeroAudioBuffer (buffer.fill(0)) in packages/domain/src/audioTranscription.ts and scrubAudioMemory in apps/api/src/modules/ai/transcriptionService.ts.
2. Wrap server audio decoding in a guaranteed try ... finally block ensuring scrubAudioMemory(audioBuffer) executes across all 7 exit paths: validation failure, idempotent replay hit, budget exhaustion, client abort/cancellation, adapter error, normal completion, and runtime exception.
3. Author docs/engineering/voice-audio-memory-scrubbing-and-privacy-limits.md establishing the technical reality of V8 and Node.js memory management (mutable binary buffer zeroing vs immutable V8 string primitives and OS socket buffers).
4. Update docs/policy/ai-privacy-and-consent-disclosures-2026-11-06.md with Section 6 detailing voice capture, local discard semantics, 0-day transient retention (app.ai_transcriptions stores metadata only, zero audio binary columns), buffer zeroing, and release gating.
5. Generate 5 valid 16-bit mono 16000Hz PCM WAV audio fixtures in tests/fixtures/audio/ (synthetic-bangla-appointment.wav, synthetic-english-deadline.wav, synthetic-banglish-report.wav, synthetic-silence-5s.wav, synthetic-low-confidence-noise.wav).
6. Author and execute 20 integration tests in tests/integration/phase115-voice-assistant-correction.test.ts verifying buffer memory zeroing on all 7 exit paths, Bangla Unicode script preservation ([ঀ-৿]), English recognition, Banglish recognition, silence classification, low-confidence uncertainty, microphone permission denied typing fallback, client cancel discard semantics (zero network/DB rows), stop recording finalization, ambiguous deadline clarification, explicit confirmation with durable receipt (AI_DEVICE_ID), 0-day transient retention, consent requirement, server kill-switch (DAYNORI_AI_KILL_SWITCH='true'), and workspace multi-tenant isolation.
7. Author and execute UI interface tests in tests/unit/phase115-voice-assistant-ui.test.ts (6 tests) and mobile view tests in apps/mobile/src/phase115-voice-mobile-views.test.ts (2 tests) verifying Web AssistantPanel gating state, mobile AssistantSheet voice recording chip disabled under isGated=true, DEF-V2-011 fail-closed verification, and accessible text typing fallback.
8. Update function register docs/roadmap/v2/function-register.json for assistant.voice-capture, author ADR 0115, Phase 115 report, artifacts/phase115 package, update progress.json, CHANGELOG.md, and rebuild blueprint.

## Acceptance

- Server audio memory cleanup vulnerability remediated: zeroAudioBuffer proactively zeroes binary buffer memory in place via buffer.fill(0).
- try ... finally block guarantees audio buffer scrubbing across all 7 exit paths (validation failure, replay cache hit, budget exhaustion, abort/cancel, adapter error, normal completion, unhandled exception).
- Practical V8 and Node.js runtime limits documented accurately without false claims in docs/engineering/voice-audio-memory-scrubbing-and-privacy-limits.md.
- Zero raw audio binaries stored in database, logs, or persistent disks (0-day transient retention; app.ai_transcriptions schema stores metadata only).
- Speech recognition accuracy evaluated with 5 real synthetic WAV fixtures; Bengali script ([ঀ-৿]) preserved; silence and low confidence flagged as uncertain; mock adapter evaluations explicitly labeled as adapter: 'mock'.
- Reviewed organizer creation lifecycle verified for voice: editable transcript review, date ambiguity prompts clarification, explicit confirmation writes durable mutation receipt under AI_DEVICE_ID, canonical deep link provided, and cancellation executes zero writes.
- Microphone permission denied preserves 100% accessible text typing fallback.
- All 28 automated tests (20 integration, 6 UI unit, 2 mobile view) pass cleanly.
- Standing release gates (DEF-V2-001, DEF-V2-004, DEF-V2-005, DEF-V2-007, DEF-V2-008, DEF-V2-011, DEF-V2-013, OWNER-SIGNING-KEYS, OWNER-RELEASE-AUTH, Phase 71) remain strictly blocked.
- docs/roadmap/plan.json, progress.json, and blueprint.html updated and pass all planning validators.

## Verification and evidence

- node scripts/validate-planning.mjs
- node scripts/build-phase-plans.mjs --check
- node scripts/build-blueprint.mjs --check
- pnpm validate:function-register
- pnpm vitest run tests/integration/phase115-voice-assistant-correction.test.ts tests/unit/phase115-voice-assistant-ui.test.ts apps/mobile/src/phase115-voice-mobile-views.test.ts
- pnpm --filter @daynori/domain typecheck
- pnpm --filter @daynori/api typecheck
- pnpm --filter @daynori/web typecheck
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
- [docs/decisions/0095-voice-capture-transcription-and-reviewed-creation.md](../../decisions/0095-voice-capture-transcription-and-reviewed-creation.md)
- [docs/decisions/0109-voice-assistant-verification-and-operational-review.md](../../decisions/0109-voice-assistant-verification-and-operational-review.md)
- [docs/decisions/0114-ask-nori-text-assistant-release-gate-and-reviewed-creation-audit.md](../../decisions/0114-ask-nori-text-assistant-release-gate-and-reviewed-creation-audit.md)
- [docs/decisions/0115-voice-assistant-audio-memory-cleanup-and-speech-capture-correction.md](../../decisions/0115-voice-assistant-audio-memory-cleanup-and-speech-capture-correction.md)
- [docs/phase-reports/phase-95.md](../../phase-reports/phase-95.md)
- [docs/phase-reports/phase-109.md](../../phase-reports/phase-109.md)
- [docs/phase-reports/phase-114.md](../../phase-reports/phase-114.md)
- [docs/phase-reports/phase-115.md](../../phase-reports/phase-115.md)
- [docs/engineering/voice-audio-memory-scrubbing-and-privacy-limits.md](../../engineering/voice-audio-memory-scrubbing-and-privacy-limits.md)
- [docs/policy/ai-privacy-and-consent-disclosures-2026-11-06.md](../../policy/ai-privacy-and-consent-disclosures-2026-11-06.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`test(voice): verify audio memory cleanup and speech capture release gates`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
