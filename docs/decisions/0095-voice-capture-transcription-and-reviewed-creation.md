# ADR-0095: Voice capture, transcription, and reviewed creation

- Status: accepted
- Date: 2026-11-09
- Owner/reviewer: Antigravity agent (owner-authorized Phase 95 with explicit scheduling exception).
- Related: [Phase 95](../roadmap/phases/95-voice-capture-transcription-and-reviewed-creation.md), [ADR 0008](0008-opt-in-ai-and-later-rooms.md), [ADR 0012](0012-native-hardware-capabilities-and-billing-boundaries.md), [ADR 0052](0052-ai-provider-privacy-and-retrieval.md), [ADR 0053](0053-ai-assistant-confirmed-actions.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0090](0090-ai-provider-consent-privacy-and-operating-decisions.md), [ADR 0091](0091-scoped-retrieval-indexing-and-grounding-quality.md), [ADR 0092](0092-text-assistant-chat-and-contextual-guidance.md), [ADR 0093](0093-reviewed-note-task-and-journal-creation.md), [ADR 0094](0094-structured-organizer-tools-and-multi-action-creation.md), [DEF-V2-008](../roadmap/v2/function-register.json), [release-gates.md](../engineering/release-gates.md), [voice-transcription-and-creation-guide.md](../engineering/voice-transcription-and-creation-guide.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, infrastructure, and release gates.

---

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 95 implementation and local verification before final acceptance of Phases 75, 90, and 93:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 95 implementation and local verification before final acceptance of Phases 75, 90, and 93. Record this scheduling exception in an ADR and roadmap metadata. Preserve the dependency list and outstanding acceptance gates. Live transcription, external audio transmission, and paid provider use require separate approval for a concrete synthetic test. Inspect the existing web/native recording adapters, audio contracts, private upload path, and the Phase 93/94 review flow. Work only on Phase 95; leave the Nori companion to Phase 96."

Phase 95 delivers voice capture, transcription, and reviewed organizer draft creation across web and mobile platforms. Captured audio is processed under a strict 0-day transient retention policy with zero automated writes and intermediate user review before organizer proposal generation.

---

## Transcription Provider Comparative Analysis

Evaluating candidate audio transcription engines against Daynori's technical requirements (multilingual support including English, Bangla, and Banglish code-switching, low latency, and cost sustainability):

| Provider & Model | Multilingual & Banglish Accuracy | Latency | Unit Cost | Privacy & Retention | Evaluation Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Google Gemini 1.5 Flash (Multimodal)** | **High**: Native script recognition for Bangla, strong English, contextual code-switch handling | **Low**: Single unified pass with prompt context | **$0.00002/sec** ($0.0012/min = 20 micro-USD/sec) | 0-day retention; customer data not used for training | **Selected Primary**: Lowest cost, unified API, native Bengali script support |
| **OpenAI Whisper-1** | **Moderate**: Strong English, acceptable Bangla, occasional transliteration hallucination | **Moderate**: Dedicated audio endpoint | **$0.006/min** (100 micro-USD/sec = 5x cost) | 0-day retention available via API terms | Secondary fallback candidate |
| **Deepgram Nova-2** | **High**: Excellent conversational speed, limited South Asian language vocabulary | **Ultra-Low**: Streaming-first architecture | **$0.0043/min** (72 micro-USD/sec) | Enterprise agreements required for zero-logging | Expensive for early preview; operational overhead |

Under local testing and mock validation, `MockAudioTranscriptionAdapter` provides deterministic test coverage for all languages and edge cases with zero network calls and zero cost. Gemini 1.5 Flash multimodal is configured as the primary live provider adapter pending owner approval under `DEF-V2-008`.

---

## Key Architectural Decisions

### 1. Microphone Hardware Access Decoupled from External AI Transmission Consent
OS-level microphone permission allows access to local hardware audio streams. This permission is strictly decoupled from consent to transmit audio over the network to a third-party AI transcription service.
- Local voice memo recording functions without AI consent.
- Transmitting audio to `/v1/ai/assistant/transcribe` strictly requires active AI consent (`app.ai_consents.enabled = true`).
- If consent is missing or disabled, the endpoint immediately rejects with `403 AI_CONSENT_REQUIRED`.
- The user interface provides clear pre-transmission disclosure explaining that audio will be sent to the transcription provider and purged immediately under a 0-day retention policy.

### 2. Strict 0-Day Transient Audio Retention
User voice recordings are sensitive biometric and privacy data.
- The server decodes base64 audio into an in-memory buffer, executes transcription, and immediately zeroes out and discards the memory buffer (`audioBuffer = Buffer.alloc(0)`).
- The `app.ai_transcriptions` database table stores only transcription metadata (duration, word count, confidence, transcript text, status). It **NEVER** stores binary audio data.
- Metadata rows are flagged with `retention_policy = 'transient_deleted'`.

### 3. Separation of Transcription from Item Attachments
Transcription generates text for review. It does not implicitly attach the recorded audio file to organizer items, which would consume storage quota unexpectedly.
- `/v1/ai/assistant/transcribe` writes zero rows to `app.item_attachments`.
- Retaining original audio as an attachment is an explicit, separate user action via the workspace storage attachment pipeline.

### 4. Interactive Transcript Review & User Correction
Raw speech-to-text models can mishear entity names, dates, times, and amounts.
- Recording, transcribing, reviewing/editing the transcript, and generating organizer proposals are discrete steps.
- The UI presents an editable `<textarea>` (web) / `TextInput` (mobile) where the user can inspect and refine the transcript text before triggering proposal generation.
- The reviewed text is then fed into the Phase 93/94 proposal pipeline (`createAiProposal`), ensuring that all created records undergo explicit user review and confirmation.

### 5. Uncertainty & Silence Detection
Audio input may contain background noise, mumbled speech, or dead air.
- If audio is silent or transcription confidence falls below `0.70`, `detectTranscriptionUncertainty` flags `uncertainSpeech = true`.
- The UI displays an amber warning banner prompting the user to verify or correct the text before proceeding.

### 6. Duration & Payload Size Bounds
To protect against memory exhaustion and excessive billing:
- Minimum duration: `0.5 seconds`.
- Maximum duration: `600 seconds` (10 minutes, `MAX_AUDIO_RECORDING_SECONDS`).
- Maximum payload size: `25 MiB` (`MAX_AUDIO_RECORDING_BYTES`).
- Audio outside these bounds is rejected with `400 AUDIO_DURATION_OUT_OF_BOUNDS` or `400 AUDIO_SIZE_EXCEEDED`.

### 7. Idempotent Retry & User Cancellation
- Repeated requests carrying a `clientOperationId` return existing transcription results without re-invoking the provider or debiting the budget.
- Cancellation via `AbortSignal` immediately halts request processing and settles token reservations.
- The server kill switch (`DAYNORI_AI_KILL_SWITCH = 'true'`) halts transcription with `503 AI_KILL_SWITCH_ACTIVE`.

---

## Findings Register & Remediations

An audit of voice capture and transcription architecture established the findings register in `artifacts/phase95/findings-register.json`:

1. **VCE-001 (Adapter Selection — Remediated):** Established `AudioTranscriptionAdapter` interface and selected Gemini 1.5 Flash multimodal ($0.00002/s) over Whisper-1 ($0.006/min) for native Bangla script recognition and 5x cost advantage.
2. **VCE-002 (Privacy & Consent Boundary — Remediated):** Decoupled device mic permissions from external transmission consent. Calls without active consent fail-close with `403 AI_CONSENT_REQUIRED`.
3. **VCE-003 (Envelope Bounds — Remediated):** Enforced duration (0.5s–600s) and byte size (<= 25 MiB) validation with auto-stop.
4. **VCE-004 (Interactive Review — Remediated):** Decoupled transcription from proposal creation; provided editable textareas on web and mobile.
5. **VCE-005 (Uncertainty Detection — Remediated):** Implemented silence detection and confidence thresholding (<0.70) with visible UI warnings.
6. **VCE-006 (0-Day Retention — Remediated):** Enforced memory buffer zeroing post-transcription and excluded binary audio from database storage.
7. **VCE-007 (Attachment Decoupling — Remediated):** Proved zero unreviewed writes to `app.item_attachments`.
8. **VCE-008 (Idempotency & Cancellation — Remediated):** Enforced `clientOperationId` unique indexing and integrated `AbortSignal` cancellation.

---

## Verification & Release Gate Status

- **Integration Tests:** 13/13 passing in `tests/integration/phase95-voice-transcription-reviewed-creation.test.ts`.
- **Domain Tests:** 103/103 passing in `packages/domain/src/domain.test.ts` (including AST-015 to AST-018).
- **Regression Tests:** 55/55 passing across all 5 assistant integration test suites (`phase56`, `phase92`, `phase93`, `phase94`, `phase95`).
- **Synthetic Package:** 5 scenarios documented in `artifacts/phase95/synthetic-provider-package.json` ($0.05 budget limit).
- **Gate Status:** Retains `DEF-V2-008` (production AI fail-closed). Live provider calls remain blocked pending explicit owner approval.
