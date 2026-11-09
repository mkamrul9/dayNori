# Phase 95: Voice capture, transcription, and reviewed creation

## Identity and scope

- Phase: [95 — Voice capture, transcription, and reviewed creation](../roadmap/phases/95-voice-capture-transcription-and-reviewed-creation.md).
- Status: **blocked** — Foundational implementation, domain services, database migration, contract schemas, transcription adapters, envelope bounds, privacy/consent decoupling, transient 0-day retention, uncertainty detection, Web and Mobile UI voice recording and transcript review controls, and independent integration verification complete: audio transcription adapter comparative analysis completed selecting Gemini 1.5 Flash multimodal ($0.00002/s) with `MockAudioTranscriptionAdapter` for zero-cost testing; migration `00080_ai_transcriptions.sql` applied with partial unique index on `(user_id, workspace_id, client_operation_id)`; distinct device microphone permission decoupled from external AI transmission consent (`403 AI_CONSENT_REQUIRED`); 0-day transient retention policy enforced with immediate buffer purge (`audioBuffer = Buffer.alloc(0)`); raw audio binaries excluded from database; zero unreviewed writes verified (transcription produces text only, item attachments decoupled); duration (0.5s–600s) and size (<= 25 MiB) bounds enforced; silence and low confidence (<0.70) uncertainty detected; interactive editable `<textarea>` / `TextInput` review surfaces delivered on web and mobile; reviewed transcripts feed directly into Phase 93/94 proposal pipeline; all 13 integration tests in `phase95-voice-transcription-reviewed-creation.test.ts` and 103 domain tests pass; production AI activation and live provider calls remain fail-closed pending explicit owner approval of synthetic test package (`DEF-V2-008` retained).
- Contributor/date: Antigravity agent, 2026-11-09.
- Base revision/branch: `a0d35731295217e89b0bad2ec8c9e12f31fd76d5`, `codex/free-core-preview`.
- Hard prerequisites: Phase **75**, **90**, **93**.
- Owner Scheduling Authorization: The owner authorized Phase 95 implementation and local verification before final acceptance of Phases 75, 90, and 93 ([ADR 0095](../decisions/0095-voice-capture-transcription-and-reviewed-creation.md)). Phase 95 is recorded as `blocked` due to unmet owner live synthetic test approval and enterprise provider contract gates (`DEF-V2-008` retained). Outstanding checks for earlier phases remain preserved. Standing push authorized under ADR 0074. No unverified production capability, live calls, or paid infrastructure claimed.

---

## Result

### Implementation and Verifications Delivered

1. **Transcription Provider Comparative Analysis (VCE-001 Remediation):**
   - Evaluated Gemini 1.5 Flash multimodal ($0.00002/s = 20 micro-USD/s) vs OpenAI Whisper-1 ($0.006/min = 100 micro-USD/s) vs Deepgram Nova-2 ($0.0043/min).
   - Selected Gemini 1.5 Flash multimodal as primary provider adapter for native Bangla script recognition and 5x cost advantage over Whisper.
   - Built `MockAudioTranscriptionAdapter` in `@daynori/domain` for deterministic local verification of English, Bangla, and Banglish code-switching without network calls or costs.

2. **Decoupled Microphone Hardware Permission vs External Transmission Consent (VCE-002 Remediation):**
   - Decoupled device microphone access from external AI transmission consent. Local recording operates independently.
   - Transmitting audio to `/v1/ai/assistant/transcribe` strictly requires active AI consent (`app.ai_consents.enabled = true`). Calls without consent reject with `403 AI_CONSENT_REQUIRED`.
   - UI discloses external transmission and 0-day retention policy before audio bytes leave the client.

3. **Duration & Size Bounds Enforcement (VCE-003 Remediation):**
   - Enforced bounds in `@daynori/domain` via `validateAudioForTranscription`: `MIN_AUDIO_RECORDING_SECONDS = 0.5`, `MAX_AUDIO_RECORDING_SECONDS = 600` (10 minutes), `MAX_AUDIO_RECORDING_BYTES = 25 MiB`.
   - Client UI timers automatically stop capture at the 600-second boundary.

4. **Interactive Transcript Review & User Correction (VCE-004 Remediation):**
   - Decoupled recording, transcribing, reviewing, and proposal generation into distinct user actions.
   - Delivered editable `<textarea>` on web (`data-tour="assistant-transcript-edit"`) and `TextInput` on mobile (`testID="assistant-transcript-input"`), allowing the user to refine names, dates, times, and amounts before generating drafts.
   - Feeding reviewed text into `createAiProposal` routes through Phase 93/94 proposal confirmation cards, guaranteeing zero automated writes.

5. **Silence & Low-Confidence Uncertainty Detection (VCE-005 Remediation):**
   - Implemented `detectTranscriptionUncertainty` in `@daynori/domain`.
   - Detects silence and low confidence (<0.70), returning `uncertainSpeech: true` with explanatory reason.
   - Web and mobile UIs render prominent amber warning banners prompting the user to verify or edit text before proposing actions.

6. **Strict 0-Day Transient Audio Retention & Memory Zeroing (VCE-006 Remediation):**
   - Server zeroes and discards decoded audio buffers immediately after adapter execution (`audioBuffer = Buffer.alloc(0)`).
   - Database table `app.ai_transcriptions` stores only text metadata and flags rows as `retention_policy = 'transient_deleted'`. Binary audio is NEVER stored.

7. **Item Attachment Decoupling (VCE-007 Remediation):**
   - Verified that transcription produces text drafts without creating attachments in `app.item_attachments`. Retaining raw audio as an item attachment requires an explicit separate user action.

8. **Idempotent Retry & Request Cancellation (VCE-008 Remediation):**
   - Created partial unique index `idx_ai_transcriptions_client_op` on `(user_id, workspace_id, client_operation_id)`.
   - Replay requests with stable `clientOperationId` return cached results without double-billing or duplicate records.
   - Supported cancellation via `AbortSignal`, safely terminating execution and settling token reservations.
   - Server-enforced kill switch (`DAYNORI_AI_KILL_SWITCH = 'true'`) halts transcription with `503 AI_KILL_SWITCH_ACTIVE`.

9. **Web & Mobile UI Voice Recording Controls:**
   - Web: `apps/web/src/components/AssistantPanel.tsx` with mic toggle, red pulse recording indicator, accessible `MM:SS` timer, stop/cancel controls, pre-transmission disclosure, editable transcript textarea, uncertainty alerts, and "Generate Proposal" / "Use in Question" buttons.
   - Mobile: `apps/mobile/src/views/AssistantSheet.tsx` with 48dp mic button, active recording timer banner, stop/transcribe controls, multiline editable `TextInput`, and direct transition to reviewed proposal cards.

10. **Phase 95 Integration Test Suite Delivered:**
    - Authored `tests/integration/phase95-voice-transcription-reviewed-creation.test.ts` covering 13 comprehensive scenarios (P95-01 through P95-13), all passing in 1018ms.
    - Verified 55/55 regression tests across all assistant suites.

---

## Artifacts and Evidence

- Findings register: `artifacts/phase95/findings-register.json` (VCE-001 to VCE-008).
- Live synthetic test package: `artifacts/phase95/synthetic-provider-package.json` (5 synthetic audio scenarios, $0.05 budget limit, pending owner approval under `DEF-V2-008`).
- Manual UI evidence: `artifacts/phase95/manual-ui-evidence.json`.
- Evidence summary: `artifacts/phase95/evidence-summary.json`.
- Architecture Decision Record: `docs/decisions/0095-voice-capture-transcription-and-reviewed-creation.md`.
- Engineering Guide: `docs/engineering/voice-transcription-and-creation-guide.md`.
