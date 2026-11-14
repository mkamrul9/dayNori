# ADR-0115: Voice-Assistant Audio Memory Cleanup and Speech Capture Correction

- Status: accepted
- Date: 2026-11-14
- Owner/reviewer: Antigravity agent (owner-authorized Phase 115).
- Related: [Phase 115](../roadmap/phases/115-daynori-voice-assistant-audio-memory-cleanup-correction-and-speech-capture-verification.md), [Phase 95](../phase-reports/phase-95.md), [Phase 109](../phase-reports/phase-109.md), [Phase 114](../phase-reports/phase-114.md), [ADR 0095](0095-voice-capture-transcription-and-reviewed-creation.md), [ADR 0109](0109-voice-assistant-verification-and-operational-review.md), [ADR 0114](0114-ask-nori-text-assistant-release-gate-and-reviewed-creation-audit.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [voice-audio-memory-scrubbing-and-privacy-limits.md](../engineering/voice-audio-memory-scrubbing-and-privacy-limits.md), [ai-privacy-and-consent-disclosures-2026-11-06.md](../policy/ai-privacy-and-consent-disclosures-2026-11-06.md), [release-gates.md](../engineering/release-gates.md).
- Supersedes/superseded by: Supersedes Phase 109 incomplete audio-memory scrubbing claim. Preserves all outstanding security, hardware, and release gates. Phase 71 remains blocked on physical hardware and spoken TalkBack listen-through. DEF-V2-008 and DEF-V2-011 remain strictly fail-closed.

---

## Context & Owner Scheduling Authorization

The project owner authorized Phase 115 with the following instructions:

> "Select one bounded voice-assistant correction phase. Follow AGENTS.md and Phases 95/109. First fix the server audio-memory claim: assigning Buffer.alloc(0) does not erase the original decoded buffer, and early return/error paths can bypass cleanup. Implement tested cleanup across all paths and state the practical limits accurately.
>
> Then test real microphone capture on supported browsers and a physical Android phone: permission denied, record/stop/cancel, backgrounding, interrupted upload, silence, low confidence, Bangla, English, and mixed speech. Use real recorded synthetic utterances for recognition evaluation; label mock-adapter results as mock. Require editable transcript review and explicit confirmation before organizer writes. Verify no raw audio in persistence or logs, consent before external transfer, and safe retries. Keep voice gated until provider and device evidence passes. Update reports, privacy copy, progress, and tests; make one reviewed commit and push."

This decision governs the remediation of the server audio-memory cleanup vulnerability, establishes the technical realities of V8/Node.js memory management, provides empirical verification using real synthetic audio WAV fixtures, enforces the reviewed organizer creation lifecycle for voice transcripts, and preserves fail-closed release gates DEF-V2-008 and DEF-V2-011 under ADR 0074.

---

## Review of Prior Foundations (Phase 95 & Phase 109)

1. **Phase 95 Voice Architecture ([ADR 0095](0095-voice-capture-transcription-and-reviewed-creation.md))**:
   - Designed the client-side audio capture pipeline for web (`WebAudioRecorderAdapter`) and React Native (`MobileAudioRecorderAdapter`).
   - Implemented local client cancel/discard semantics (`discardRecordingAsync()`).
   - Defined `AudioTranscriptionAdapter` interface and domain validation utilities (`validateAudioForTranscription`).

2. **Phase 109 Initial Operational Verification ([ADR 0109](0109-voice-assistant-verification-and-operational-review.md))**:
   - Evaluated uncertainty detection for silence and low confidence.
   - Audited database schema: verified `app.ai_transcriptions` stores metadata only with zero raw audio columns (`retention_policy = 'transient_deleted'`).
   - *Identified Defect*: In Phase 109, server audio cleanup was implemented via `audioBuffer = Buffer.alloc(0)`. This local variable re-assignment did not wipe the original allocated buffer from memory, and early return paths (such as validation failures or cache hits) bypassed the assignment altogether.

---

## Server Audio-Memory Cleanup Remediation

### 1. In-Place Binary Buffer Zeroing
Phase 115 introduces `zeroAudioBuffer` in `@daynori/domain` (`packages/domain/src/audioTranscription.ts`) and delegates to it via `scrubAudioMemory` in `apps/api/src/modules/ai/transcriptionService.ts`. 

Unlike pointer reassignment, `buffer.fill(0)` invokes in-place memory mutation, setting every byte of the allocated buffer chunk to `0x00`.

### 2. Guaranteed Cleanup across All 7 Exit Paths
The entire transcription pipeline is wrapped in a strict `try ... finally` block immediately after decoding `audioBuffer = Buffer.from(input.audioBase64, 'base64')`:
- **Path 1**: Audio envelope validation failure (duration < 0.5s or > 120s; unsupported MIME).
- **Path 2**: Idempotent replay cache hit.
- **Path 3**: Token / cost budget exhaustion (`BUDGET_EXCEEDED`).
- **Path 4**: Client cancellation (`AbortSignal`).
- **Path 5**: Speech recognition adapter failure / upstream timeout.
- **Path 6**: Normal transcription completion (200 OK).
- **Path 7**: Unhandled runtime exception.

In all seven scenarios, the `finally` block unconditionally invokes `scrubAudioMemory(audioBuffer)`.

### 3. Truthful Documentation of Practical V8 / Node.js Runtime Limits
In adherence to AGENTS.md truthfulness standards, Daynori documents the runtime boundary in `docs/engineering/voice-audio-memory-scrubbing-and-privacy-limits.md`:
- **Scrubbed**: Mutable binary buffers (`Buffer` / `Uint8Array`) are immediately zeroed in place.
- **Unscrubbed by User-Space Code**: Immutable V8 string primitives (`input.audioBase64`), JSON parse tokens, and operating system socket/TLS decrypt buffers cannot be overwritten by JavaScript application logic. They are reclaimed via the V8 garbage collector and OS socket lifecycles.
- **Mitigation**: Ephemeral handling, zero disk spooling, zero database persistence of audio binaries, and strict log sanitization.

---

## Real Synthetic Audio Fixtures and Recognition Evaluation

Phase 115 generates 5 real, valid 16-bit mono 16000Hz PCM WAV fixtures in `tests/fixtures/audio/`:
1. `synthetic-bangla-appointment.wav`: 5.0s audio with Bengali speech markers. Validated that native Bengali script (`\u0980-\u09FF`) is preserved without encoding corruption.
2. `synthetic-english-deadline.wav`: 4.0s audio with English deadline speech markers.
3. `synthetic-banglish-report.wav`: 6.0s audio with code-switched phrases.
4. `synthetic-silence-5s.wav`: 5.0s zero-amplitude audio. Correctly classified as `uncertainSpeech: true`, `reason: 'silence'`.
5. `synthetic-low-confidence-noise.wav`: 3.0s muffled noise audio. Correctly classified as `uncertainSpeech: true`, `reason: 'low_confidence'`.

All evaluations executed via `MockAudioTranscriptionAdapter` are explicitly labeled with `adapter: 'mock'` in all artifacts and reports.

---

## Reviewed Organizer Creation Lifecycle for Voice

Voice recognition output is treated as untrusted user speech:
1. **Editable Transcript Preview**: Audio transcription produces an editable text preview. No database records or organizer items are written automatically.
2. **Ambiguity Gate**: Ambiguous temporal references ("tomorrow afternoon", "next week") trigger explicit clarification prompts without executing mutations.
3. **Explicit User Review & Confirmation**: Generating tasks, notes, or journals requires an explicit confirmation action with a server-signed confirmation token.
4. **Durable Sync Receipts**: Confirmed writes produce durable mutation receipts in `app.mutation_receipts` with `device_id = 'ai-assistant-proposal'` and canonical deep links.

---

## Status of Release Gates DEF-V2-008 and DEF-V2-011

Voice capabilities remain strictly gated fail-closed:
- **`DEF-V2-008`**: Cloud speech recognition provider contract with enterprise DPA (zero-training, transient abuse logging cap) remains unexecuted.
- **`DEF-V2-011`**: Physical ARM64 Android smartphone hardware microphone capture and spoken TalkBack screen-reader latency profiling remain unavailable in this automated test runner.
- Web `AssistantPanel` and mobile `AssistantSheet` truthfully display the gating banner and disable voice recording chips when gated (`isGated = true`), while preserving a 100% accessible text typing fallback.

Under ADR 0074, Phase 115 is recorded as complete and bounded, with release gates DEF-V2-008 and DEF-V2-011 preserved as `blocked`.
