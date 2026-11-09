# Daynori Voice Capture, Transcription, and Reviewed Creation Engineering Guide

This guide documents the architecture, data models, privacy boundaries, audio transcription adapters, transient data retention, and interactive review workflow for voice-assisted organizer creation (Phase 95).

---

## 1. Architectural Principles

1. **Decoupled Hardware Permission vs Network AI Consent:**
   - Operating system microphone permission grants access to local device hardware audio buffers only.
   - Transmitting recorded audio bytes across the network to an external transcription service is a distinct data transmission action requiring active user consent (`app.ai_consents.enabled = true`).
   - If AI consent is disabled or revoked, audio transcription fails closed with `403 AI_CONSENT_REQUIRED`.
   - Before audio bytes are sent to the network, the user interface discloses the transmission step and the strict 0-day retention policy.

2. **Strict 0-Day Transient Audio Retention:**
   - User voice recordings are sensitive personal data.
   - The server decodes base64 audio into an in-memory buffer, executes transcription, and immediately zeroes out and discards the memory buffer (`audioBuffer = Buffer.alloc(0)`).
   - The `app.ai_transcriptions` database table records metadata only (`duration_seconds`, `words_count`, `confidence`, `transcript`, `status`, `retention_policy = 'transient_deleted'`).
   - The server **NEVER** stores raw audio binaries in the database or persistent disk storage.

3. **Separation of Transcription from Item Attachments:**
   - Voice transcription converts speech into editable text for draft creation. It does not implicitly create file attachments on organizer items, which would consume storage quota unexpectedly.
   - Retaining the original recorded audio as an attachment is an explicit, separate user action via the workspace storage attachment pipeline.

4. **Zero Unreviewed Mutations & Interactive Editing:**
   - Audio transcription alone NEVER writes tasks, notes, journal entries, or routines to the database.
   - Speech-to-text models can mishear entity names, numbers, dates, times, and amounts.
   - The UI presents an intermediate review surface featuring an editable `<textarea>` (web) / `TextInput` (mobile). Users can correct recognized text before triggering organizer proposal generation.
   - Proposal creation feeds the reviewed text into the Phase 93/94 proposal pipeline (`createAiProposal`), ensuring that all created records require explicit user review and confirmation.

5. **Silence & Low-Confidence Uncertainty Detection:**
   - Recordings containing only ambient noise or muffled speech trigger uncertainty flags (`detectTranscriptionUncertainty`).
   - When silence is detected or confidence is below `0.70`, `uncertainSpeech: true` is returned.
   - The UI renders an amber warning banner prompting the user to review, edit, or re-record.

6. **Idempotent Retry & User Cancellation:**
   - Mobile network instability may cause requests to retry. Including a `clientOperationId` ensures idempotency: repeated requests return cached transcription results without re-invoking the provider or debiting budget.
   - Request cancellation via `AbortSignal` terminates network processing and safely settles token reservations.
   - The server kill switch (`DAYNORI_AI_KILL_SWITCH = 'true'`) halts transcription with `503 AI_KILL_SWITCH_ACTIVE`.

---

## 2. Transcription Pipeline & Adapter Lifecycle

The transcription pipeline is abstracted through `@daynori/domain`:

```
User Voice Capture (Mic)
         │
         ▼
Local Audio Buffer (Web: MediaRecorder / Mobile: NativeAudioRecorderAdapter)
         │
         ▼
Pre-Transmission Disclosure & Consent Verification
         │
         ▼
POST /v1/ai/assistant/transcribe
         │
         ├─► Server-enforced Kill Switch Check (503 AI_KILL_SWITCH_ACTIVE)
         ├─► Production Fail-Closed Gate Check (DEF-V2-008)
         ├─► AI User Consent Check (403 AI_CONSENT_REQUIRED)
         ├─► Audio Validation (0.5s–600s, <= 25 MiB, supported MIME)
         ├─► Idempotent Deduplication Check (clientOperationId)
         ├─► Concurrency-Safe Budget Reservation (app.ai_create_reservation)
         │
         ▼
AudioTranscriptionAdapter.transcribeAudio()
         │
         ├─► In-Memory Buffer Zeroed (audioBuffer = Buffer.alloc(0))
         ├─► Durable Budget Settlement (app.ai_settle_request)
         ├─► Metadata Insert (app.ai_transcriptions, retention_policy = 'transient_deleted')
         │
         ▼
Response: { transcriptionId, transcript, confidence, detectedLanguage, uncertainSpeech, retentionPolicy }
         │
         ▼
Interactive UI Review & User Text Editing (<textarea> / TextInput)
         │
         ▼
User Clicks "Generate Proposal" -> POST /v1/ai/proposals (Phase 93/94 Reviewed Proposal Workflow)
```

### Provider Comparative Analysis & Selection

| Provider & Model | Multilingual & Banglish Accuracy | Latency | Unit Cost | Privacy & Retention | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Google Gemini 1.5 Flash (Multimodal)** | High (Bangla script, English, Banglish code-switching) | Low | **$0.00002/sec** ($0.0012/min = 20 micro-USD/sec) | 0-day retention; no customer training | **Selected Primary Adapter** |
| **OpenAI Whisper-1** | Moderate (strong English, acceptable Bangla) | Moderate | **$0.006/min** (100 micro-USD/sec = 5x cost) | 0-day retention via API terms | Secondary candidate |
| **MockAudioTranscriptionAdapter** | Deterministic mock for unit and integration testing | < 5ms | $0.00 | Local mock | Active test adapter |

---

## 3. Database Schema & API Contracts

### Database Migration: `00080_ai_transcriptions.sql`

```sql
CREATE TABLE app.ai_transcriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES app.workspaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.profiles (id) ON DELETE CASCADE,
  client_operation_id uuid,
  duration_seconds numeric(6, 2) NOT NULL,
  byte_size integer NOT NULL,
  mime_type text NOT NULL,
  transcript text NOT NULL,
  detected_language text NOT NULL DEFAULT 'en',
  confidence numeric(4, 3) NOT NULL DEFAULT 1.000,
  words_count integer NOT NULL DEFAULT 0,
  cost_micro_usd integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('processing', 'completed', 'failed', 'cancelled')),
  error_code text,
  retention_policy text NOT NULL DEFAULT 'transient_deleted'
    CHECK (retention_policy IN ('transient_deleted', 'transient_purged')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);

CREATE UNIQUE INDEX idx_ai_transcriptions_client_op
  ON app.ai_transcriptions (user_id, workspace_id, client_operation_id)
  WHERE client_operation_id IS NOT NULL;
```

### API Endpoint: `POST /v1/ai/assistant/transcribe`

- **Request Body:**
  ```json
  {
    "workspaceId": "uuid",
    "audioBase64": "base64_encoded_audio_bytes",
    "mimeType": "audio/webm",
    "durationSeconds": 5.2,
    "byteSize": 45000,
    "languageHint": "en",
    "clientOperationId": "uuid"
  }
  ```

- **Response Body (200 OK):**
  ```json
  {
    "data": {
      "transcriptionId": "uuid",
      "transcript": "Create a task to review the quarterly roadmap tomorrow",
      "detectedLanguage": "en",
      "confidence": 0.95,
      "durationSeconds": 5.2,
      "byteSize": 45000,
      "wordsCount": 9,
      "costMicroUsd": 104,
      "uncertainSpeech": false,
      "retentionPolicy": "transient_deleted"
    }
  }
  ```

---

## 4. UI Implementation: Web & Mobile

### Web: `apps/web/src/components/AssistantPanel.tsx`
- **Voice Trigger:** Microphone icon button in the prompt input bar (`data-tour="assistant-voice-record"`).
- **Recording State:** Active recording panel displays red pulsing indicator and live elapsed timer formatted as `MM:SS`. Auto-stops at 600s boundary.
- **Stop & Cancel:** Distinct "Stop Recording" and "Cancel Recording" buttons.
- **Pre-Transmission Disclosure:** Displays clear notice: *"Audio will be sent to the transcription provider and purged immediately (0-day retention). Raw audio is never stored."*
- **Permission Denial Handling:** Displays clear instructions on granting browser mic permissions while keeping typed input fully functional.
- **Transcript Review:** Editable `<textarea>` (`data-tour="assistant-transcript-edit"`) allows post-transcription editing.
- **Action Buttons:**
  - *"Generate Proposal"* (`data-tour="assistant-voice-propose"`): Parses reviewed text into an organizer draft.
  - *"Use in Question"*: Inserts text into prompt input.
  - *"Clear"*: Resets transcript and returns to idle voice state.

### Mobile: `apps/mobile/src/views/AssistantSheet.tsx`
- **Voice Controls:** Integrated microphone chip (`testID="assistant-voice-record-btn"`) adhering to 48dp minimum touch target.
- **Recording Banner:** Displays live recording timer and Stop button (`testID="assistant-voice-stop-btn"`).
- **Transcription Preview:** Stopped audio displays duration and Transcribe button (`testID="assistant-voice-transcribe-btn"`).
- **Transcript Editing:** Multiline `TextInput` (`testID="assistant-transcript-input"`) allows review and corrections on mobile keyboard.
- **Proposal Trigger:** "Generate Proposal" button (`testID="assistant-voice-propose-btn"`) transitions directly to reviewed proposal cards.

---

## 5. Operational Verification & Release Gates

1. **Test Coverage:**
   - 13 integration tests in `tests/integration/phase95-voice-transcription-reviewed-creation.test.ts` verifying recording bounds, English/Bangla/Banglish transcription, silence/uncertainty detection, consent boundaries, 0-day retention, attachment decoupling, idempotency, cancellation, kill switch, and IDOR tenant isolation.
   - 103 unit tests in `@daynori/domain` including AST-015 to AST-018.
   - 55 regression tests passing across all assistant integration suites.

2. **Synthetic Package (`artifacts/phase95/synthetic-provider-package.json`):**
   - 5 synthetic scenarios covering English, Bangla, code-switched Banglish, ambient silence, and low-confidence speech.
   - Budget capped at $0.05 USD (50,000 micro-USD).
   - Marked `pending_owner_approval` under `DEF-V2-008`.

3. **Release Gate Status (`DEF-V2-008`):**
   - Production AI capabilities remain fail-closed by default.
   - Live external audio transmission remains gated until separate owner approval of the synthetic evaluation test package.
