# ADR 0040: Audio Recording and Attachment Lifecycle

- **Status:** Accepted (Provisional local development authorized)
- **Date:** 2026-10-19
- **Deciders:** Antigravity (Google DeepMind)
- **Consulted:** Architecture team, Security & Privacy review
- **Informs:** Phase 41 — Audio recording and attachment lifecycle

## Context and Problem Statement

Users need the ability to record deliberate audio memos, reflections, and spoken notes directly within Daynori on Web and Android. However, audio recording introduces critical privacy, resource, and data integrity concerns:
1. **Privacy & Consent:** Recording must never occur without deliberate, explicit user action. Ambient or background recording is strictly forbidden. Recording must never be triggered during onboarding, tutorials, or app startup.
2. **Resource & Quota Limits:** Raw audio can quickly exhaust device memory and workspace storage quotas. Recordings must be bounded in duration and file size.
3. **Session Interruption & Crash Recovery:** Mobile calls, audio focus loss, backgrounding, or browser tab termination can interrupt recording. The system must never make a false "saved" claim for lost audio, but should salvage valid recorded chunks into a recoverable draft where possible.
4. **Codec & Browser Differences:** Different browsers and platforms support distinct audio codecs (e.g. MediaRecorder Opus/WebM vs AAC/M4A on Android).
5. **Private Attachment Lifecycle:** Recorded audio must integrate with the existing private file lifecycle (reservation, quarantine verification, signed short-lived capabilities, tenant isolation, and GDPR/CCPA purge cascade). Initial note creation must remain typed; automated speech-to-text transcription is deferred to a future consented AI phase.

## Decision Drivers

- Zero ambient or automatic recording; unmistakable active recording indicator with elapsed timer.
- Strict session bounds: maximum 10 minutes (600 seconds) and 25 MiB file size limit.
- Resilient recovery: interrupted sessions preserve partial audio in local draft storage without false claims.
- Universal cross-platform playback: standard HTML5 `<audio>` and mobile player cards with accessible controls.
- Full workspace tenant isolation, quota accounting, and cascading cleanup on workspace or account deletion.

## Considered Options

1. **Option 1 (Ad-hoc blobs in note bodies):** Store Base64-encoded audio directly in note document JSON.
   - *Rejected:* Bloats database rows, circumvents storage quota accounting, bypasses virus/quarantine inspection, and breaks change-feed synchronization.
2. **Option 2 (Third-party audio streaming / cloud transcription API):** Stream audio directly to external speech-to-text providers.
   - *Rejected:* Violates offline-first architectural tenets, introduces external API costs and credentials prematurely, and contradicts the privacy-first model where transcription requires explicit later user consent.
3. **Option 3 (First-class file lifecycle with attachment metadata — Selected):**
   - Record locally using platform MediaRecorder / native audio recorder.
   - Stage in client memory / local draft store with pause/resume support.
   - Upload via standard private binary upload lifecycle (`reserveFileUpload` -> binary upload -> `finalizeFileUpload`).
   - Store audio file in `app.files` with quarantine verification (`quarantine_status = 'verified'`).
   - Attach file reference to notes, journal entries, or knowledge items via typed `AudioAttachment` contracts.

## Detailed Architecture

### 1. Deliberate Recording & Unmistakable Active Indicator
- Recording is initiated ONLY by explicit user tap/click on a dedicated "Record Audio" button.
- While active, the UI displays an unmistakable active indicator:
  - A prominent red recording badge with pulsing indicator.
  - Live elapsed time display formatted as `MM:SS`.
  - Accessible ARIA live announcement (`role="status"`, `aria-live="polite"`) and accessibility labels for screen readers (TalkBack / NVDA / VoiceOver).
  - Explicit action buttons: Pause, Resume, Stop & Save, and Discard.

### 2. Duration & File Size Limits
- **Maximum Duration:** 600 seconds (10 minutes).
- **Maximum File Size:** 25 MiB (26,214,400 bytes).
- At 9 minutes (540s), a visual warning appears.
- At 10 minutes (600s), recording stops automatically and transitions to playback/review mode.

### 3. Codec & Format Strategy
- **Web:** MediaRecorder negotiates preferred MIME types in order:
  1. `audio/webm;codecs=opus`
  2. `audio/webm`
  3. `audio/ogg;codecs=opus`
  4. `audio/mp4`
  5. `audio/wav`
- **Mobile (Android):** AAC in MP4 container (`audio/mp4`) or WebM (`audio/webm`).
- Fallback for unsupported browsers/devices displays an informative notice directing the user to upload a pre-recorded file.

### 4. Interruption & Draft Recovery
- If an ongoing session is interrupted by a phone call, audio focus loss, or tab closure:
  - Any accumulated chunks are assembled and cached in client draft storage (`daynori_audio_draft_${sessionId}`).
  - When the app is re-opened, a draft recovery banner offers the user to:
    - Listen to the salvaged audio.
    - Save/Upload the salvaged audio.
    - Discard the draft.
- The system never displays a "Saved" confirmation unless the file upload is finalized and verified by the backend.

### 5. Attachment Lifecycle & Storage Invariants
- Once recorded, the audio is uploaded through the workspace file reservation pipeline:
  - Quota is verified against the workspace storage allowance.
  - The file is uploaded and inspected by `inspector.ts` for valid audio magic bytes (OggS, RIFF WAVE, ID3/MPEG, ftyp, or EBML WebM).
  - Quarantined files are verified before playback capability is granted.
- The verified file ID is linked to the target note, journal entry, or knowledge item as an `AudioAttachment`:
  ```ts
  interface AudioAttachment {
    fileId: string;
    fileName: string;
    durationSeconds: number;
    byteSize: number;
    mimeType: string;
    createdAt: string;
  }
  ```
- Audio files follow standard workspace cascading deletion: deleting the workspace or user account purges all associated audio blobs and database records.

## Consequences

### Positive
- Users can capture voice memos and reflections securely without third-party data leakage.
- Strict duration and file limits protect against memory leaks and excessive bandwidth/quota usage.
- Interrupted recordings are safely salvageable without corrupting notes or displaying false success claims.
- Integrates seamlessly with existing Phase 24/25 file storage, quarantine, and portability archive systems.

### Negative / Tradeoffs
- Automatic speech-to-text transcription is not provided in this phase; notes remain primarily typed text.
- MediaRecorder codec support varies across older browsers, requiring standard container fallbacks.
- Physical device testing on Android TalkBack hardware remains blocked pending release gate clearance.
