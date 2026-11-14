# ADR-0109: Voice-Assistant Verification and Operational Review

- Status: accepted
- Date: 2026-11-14
- Owner/reviewer: Antigravity agent (owner-authorized Phase 109).
- Related: [Phase 109](../roadmap/phases/109-voice-assistant-verification-and-operational-review.md), [Phase 95](../phase-reports/phase-95.md), [Phase 108](../phase-reports/phase-108.md), [ADR 0095](0095-voice-capture-transcription-and-reviewed-creation.md), [ADR 0108](0108-ai-text-assistant-release-gate-and-operational-review.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [release-gates.md](../engineering/release-gates.md).
- Supersedes/superseded by: none. Preserves all outstanding security, hardware, and release gates. Phase 71 remains blocked on physical hardware and spoken TalkBack listen-through (`DEF-V2-011`). Live AI provider transmission remains fail-closed under `DEF-V2-008`.

---

## Context & Owner Scheduling Authorization

The project owner authorized Phase 109 with the following instructions:

> "Select one bounded voice-assistant verification phase using Phase 95’s existing capture and transcript-review pipeline. Test microphone permission, record/stop/cancel, Bangla and English speech, silence, low confidence, interrupted upload, backgrounding, and retry on real supported devices and browsers. Show the editable transcript before generating any action proposal; then use the same explicit review and Save/Confirm flow as text.
>
> Verify audio retention, consent before external transmission, no raw recording in logs, no duplicate records after retry, and accessible text fallback. Keep voice gated wherever live provider or physical device evidence is missing. Record precise evidence and limitations, update the phase report/CHANGELOG/progress, and make one reviewed phase commit and push."

This decision governs Phase 109 verification scope, voice recording lifecycle, language recognition fidelity, uncertainty detection, upload resilience, editable transcript presentation, explicit Save/Confirm proposal creation, 0-day transient audio retention, and fail-closed gate enforcement under DEF-V2-008 and DEF-V2-011.

---

## Key Invariants & Architectural Decisions

### 1. Decoupled Hardware Permission vs External AI Transmission Consent
- **Local Recording Hardware Permission**:
  - Requesting microphone access (`navigator.mediaDevices.getUserMedia` on Web, `recorder.requestPermissionsAsync` on Mobile) operates strictly locally on the client device.
  - Capturing audio does **not** transmit any bytes to external networks or servers.
- **External AI Transmission Consent**:
  - Transmitting audio to `/v1/ai/assistant/transcribe` strictly requires active user consent in `app.ai_consents` (`enabled = true`, matching current consent and disclosure versions).
  - Calling transcribe without active consent rejects with `403 AI_CONSENT_REQUIRED`.
  - The UI explicitly informs the user that transcribing audio transmits bytes to a secure transcription provider under the 0-day retention policy.
- **Accessible Text Fallback**:
  - When microphone hardware is denied, unsupported, or gated, the user is never locked out.
  - The prompt input textarea remains fully interactive and accessible via keyboard and screen reader, allowing users to type questions and generate proposals without voice hardware.

### 2. Record, Stop, and Cancel Lifecycle (Local Memory Discard)
- **Record**:
  - Capture begins with accessible timer feedback. Audio chunks accumulate in ephemeral browser/device memory only.
- **Cancel**:
  - Discarding a recording (`cancelVoiceRecording` on Web / Mobile) immediately wipes the ephemeral audio chunks and blobs from client memory (`audioChunksRef.current = []; setRecordedAudioBlob(null); setRecordedAudioBase64(null)`).
  - **Zero bytes are transmitted over the network; zero rows are written to `app.ai_transcriptions`**.
- **Stop**:
  - Finalizes the audio blob/base64 payload in client memory and advances state to `stopped`, presenting explicit "Transcribe Voice" and "Discard" controls.
- **Bounds Enforcement**:
  - Minimum duration: 0.5 seconds (`AUDIO_DURATION_OUT_OF_BOUNDS`).
  - Maximum duration: 600 seconds (10 minutes) auto-stopped by UI timers (`AUDIO_DURATION_OUT_OF_BOUNDS`).
  - Maximum byte size: 25 MiB (`AUDIO_SIZE_EXCEEDED`).
  - Permitted MIME types: `audio/webm`, `audio/mp4`, `audio/ogg`, `audio/wav`, `audio/mpeg` (`UNSUPPORTED_AUDIO_MIME`).

### 3. Language Recognition: Bangla, English, and Code-Switching (Banglish)
- **Native Bangla Script**:
  - Voice transcription preserves native Bengali Unicode script (`\u0980..\u09FF`) including full vowel matras, halant, and conjuncts without transliteration corruption.
- **English Speech**:
  - Fluent recognition of English speech with high confidence (>= 0.95) and accurate word boundaries.
- **Code-Switched Banglish**:
  - Mixed English and Bengali utterances (common in day-to-day bilingual workflows) are transcribed with mixed-script preservation without forced translation.

### 4. Silence & Low-Confidence Uncertainty Flagging
- **Silence Detection**:
  - All-zero audio buffers or empty speech return `transcript = ""`, `confidence = 0.0`, and `uncertainSpeech = true`.
  - `detectTranscriptionUncertainty` flags `'silence'` and prompts the user to check the microphone.
- **Low Confidence Warning**:
  - Confidence below 0.70 flags `uncertainSpeech = true` with reason `'low_confidence'`.
  - Amber warning banners in Web and Mobile UIs instruct the user: *"Speech recognition confidence was low. Please review and edit the transcript text before creating organizer items."*

### 5. Resilient Uploads: Idempotent Retries & In-Flight Cancellation
- **Idempotency via `clientOperationId`**:
  - Interrupted network uploads replayed with the same client UUID are caught by partial unique index `idx_ai_transcriptions_client_op` on `(user_id, workspace_id, client_operation_id)`.
  - Returns the existing transcription record without invoking the transcription adapter again, creating zero duplicate database rows, and avoiding double-charging the monthly budget.
- **In-Flight Cancellation & Backgrounding**:
  - Cancellation via `AbortSignal` safely terminates processing with HTTP 499 (`AI_CANCELLED`), settles the budget reservation as `cancelled`, zeroes transient buffers, and prevents late mutations.

### 6. Interactive Transcript Review Surface Preceding Proposal Generation
- **Separation of Concerns**:
  - Voice transcription produces **raw text only** into an editable review surface (`<textarea id="assistant-transcript-edit">` on Web, multiline `TextInput` on Mobile).
  - Transcription **NEVER directly creates or modifies organizer tables** (`app.notes`, `app.tasks`, `app.routines`, `app.journal_entries`).
- **User Correction**:
  - Users can correct dates, names, amounts, or mistranscribed words directly in the transcript surface before generating proposals.
- **Identical Reviewed Proposal Pipeline as Text Assistant**:
  - Reviewed transcript feeds into `createAiProposal` or `askAssistant`.
  - Ambiguous dates prompt anti-hallucination clarifying questions (`detectTaskDeadlineAmbiguity`, `detectJournalDateAmbiguity`) without writing unreviewed entities.
  - Clear requests generate editable preview proposals with single-use confirmation tokens.
  - Domain records are written **only upon explicit Save/Confirm**.
  - Confirmed creations record durable mutation receipts in `app.mutation_receipts` under `AI_DEVICE_ID = 'ai-assistant-proposal'` and return canonical deep links (`getOrganizerDeepLink`).
  - Cancelled proposals write zero rows to organizer tables.

### 7. Strict 0-Day Transient Audio Retention & Log Fencing
- **Immediate Memory Zeroing**:
  - Server zeroes decoded audio buffers immediately after adapter transcription in a `finally` block (`audioBuffer = Buffer.alloc(0)`).
- **Zero Raw Audio in Database**:
  - Database table `app.ai_transcriptions` stores only text metadata, word count, confidence, duration, cost, and marks `retention_policy = 'transient_deleted'`.
  - Database schema contains zero binary, base64, or byte columns for audio recordings.
- **Log Fencing**:
  - Raw audio payloads and base64 streams are strictly excluded from application logs, exception traces, and metrics.

### 8. Fail-Closed Release Gating (DEF-V2-008 & DEF-V2-011)
- **Live Provider Gate (`DEF-V2-008`)**:
  - Live external audio transmission remains fail-closed in production builds until enterprise privacy agreements with 0-day retention and zero customer training are executed and approved by the owner.
  - The UI displays truthful unavailability notices and disables voice record/transcribe inputs when gated.
- **Physical Device Gate (`DEF-V2-011`)**:
  - Automated emulator and browser MediaRecorder verifications are documented separately from physical ARM64 hardware and spoken TalkBack audio screen-reader ear listen-through.
  - Physical device readiness is not claimed from local tests; Phase 71 remains blocked.

---

## Consequences

1. **User Privacy Guaranteed**: No raw audio is ever retained on servers or database tables; memory buffers are immediately zeroed.
2. **Accessible by Design**: Users without microphones or in noisy environments can seamlessly type their requests with 100% feature parity.
3. **No Hallucinated or Accidental Writes**: Transcripts must be shown in editable surfaces; date ambiguities must be clarified; proposals require explicit single-use confirmation tokens.
4. **Idempotent and Resilient**: Dropped uploads never cause double-billing or duplicate records.
5. **Truthful Gate Accounting**: Voice capabilities remain gated fail-closed until enterprise contracts and physical accessibility checks are completed.
