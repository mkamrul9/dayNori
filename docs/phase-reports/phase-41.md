# Phase 41: Audio recording and attachment lifecycle (Provisional Local Implementation)

Group: Personal extensions. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [41 — Audio recording and attachment lifecycle](../roadmap/phases/41-audio-recording-and-attachment-lifecycle.md)
- **Status:** `blocked` (Provisional local development completed and verified under explicit owner authorization; completion remains explicitly `blocked` pending prerequisite Phase 37 release gates, Phase 38 private beta deployment, physical Android microphone test hardware, and production credentials).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-19.
- **Base Git revision and branch:** `main` (following prerequisite repairs commit `7f37337` `fix(expenses)`).
- **Prerequisites:**
  - [Phase 25 — Files folders and safe previews](phase-25.md): Storage quota accounting, magic byte inspection, quarantine verification, and signed capabilities.
  - [Phase 38 — Controlled private beta](phase-38.md): Local preparation completed; release gate decision remains `blocked` pending cloud staging, external signing credentials, and tester cohort.
  - [Phase 37 — Core quality and usability release gate](phase-37.md): Evaluated; release gate decision remains `blocked` on physical Android hardware and production credentials.
- **Included Scope (Deliberate Audio Recording, Review, Playback & Attachment Lifecycle)**:
  - **ADR 0040 Authored (`docs/decisions/0040-audio-recording-and-attachment-lifecycle.md`)**:
    - Architectural decision documenting deliberate user recording consent, unmistakable recording status indicators, 10-minute (600s) duration and 25 MiB byte limits with 9-minute warning, incoming phone call / OS interruption handling, draft recovery without false saved claims, and attachment linking.
  - **Pure Domain & Constraints (`@daynori/domain`)**:
    - `validateAudioDuration`: Enforces duration strictly between 1s and 600s (`MAX_AUDIO_RECORDING_SECONDS`).
    - `formatAudioDuration`: Converts elapsed seconds into `MM:SS` representation.
    - `calculateAudioProgress`: Computes clamped percentage (0-100%) against duration bounds.
    - `isSupportedAudioMimeType`: Validates supported codecs (`audio/webm`, `audio/mp4`, `audio/ogg`, `audio/wav`, `audio/mpeg`).
    - `canAttachAudioToItem`: Enforces valid attachment item targets (`note`, `journal`, `knowledge`, `file`).
    - `createAudioAttachment`: Constructs canonical `AudioAttachment` record linking fileId, metadata, duration, and timestamp.
  - **API Contracts & Zod Schemas (`@daynori/contracts`)**:
    - `AudioAttachmentSchema` & `AudioAttachmentResponseSchema`: Validates validated attachments with UUID, filename, duration bounds, and byte constraints.
    - `AudioRecordingDraftSchema`: Validates draft session state (`recording`, `paused`, `stopped`, `interrupted`, `uploaded`) with target item references for recovery.
  - **Accessible Web Audio Components (`@daynori/ui-web`)**:
    - `AudioRecorderDialog`: Accessible modal dialog with explicit consent button (`"Request Mic & Start Recording"`), pulsing red recording indicator banner, big timer display with `role="timer"`, 10-minute progress bar with warning at 9m, pause/resume, review/preview player, localStorage draft recovery, and permission refusal error alerts.
    - `AudioPlayerCard`: Accessible audio player card with play/pause button (`aria-label`), scrub slider input (`type="range"`), formatted metadata (size, mime type, duration), and download / delete actions.
  - **Accessible Mobile Audio Components (`@daynori/ui-mobile`)**:
    - `MobileAudioRecorderSheet`: Bottom sheet with explicit request button, high-contrast active indicator, timer, 10-minute progress bar, pause/resume, review stage, and `AppState` interruption listener pausing on incoming phone calls or background switching.
    - `MobileAudioPlayerCard`: React Native audio card with design token compliance, touch targets >= 48dp, and accessible scrub bar.
  - **Application Wiring (Web & Mobile)**:
    - Web Library (`apps/web/src/app/library/page.tsx`): Added `🎙️ Record Audio` button to folder toolbar; wired `AudioRecorderDialog` to reserve file storage, upload binary, finalize file with SHA-256 client checksum, and announce completion to screen readers.
    - Mobile App (`apps/mobile/App.tsx` & `types.ts`): Added `'audio-recorder'` to `ActiveModal` and wired `MobileAudioRecorderSheet`.
  - **Private Storage, Inspection & Tenant Isolation**:
    - Audio binaries uploaded through standard private file pipeline (`reserveFileUpload`, PUT capability, `finalizeFileUpload`).
    - Sniffed via magic bytes (`1A 45 DF A3` WebM, `ftyp` MP4, `RIFF...WAVE`, `OggS`, `ID3`) and passed through quarantine inspection.
    - Tenant isolation verified: unauthorized cross-workspace upload finalization and download capability requests are rejected (403/404).
    - Cascades cleanup upon workspace deletion verified.
  - **No Auto-Recording Invariant**:
    - Initial phase is strictly `idle`. Audio recording never begins automatically on render, route navigation, or during onboarding.
- **Excluded / Blocked Scope**:
  - Continuous background listening, hotword detection, or always-on recording (strictly rejected for privacy).
  - Automated cloud transcription or speech-to-text (deferred to future AI integration phase).
  - Physical microphone testing on Android hardware (blocked pending physical test device).
  - Live deployment or app store release gate bypass.

## Acceptance evidence

### Verification Matrix

| Deliverable / Artifact | Path / Command | Observed Result | Status |
| :--- | :--- | :--- | :--- |
| **ADR 0040** | `docs/decisions/0040-audio-recording-and-attachment-lifecycle.md` | Decision documented with 10m/25MB limits, interruption handling, and privacy defaults. | **PASS** |
| **Domain Logic & Tests** | `packages/domain/src/audio.ts` & `domain.test.ts` | 70/70 domain unit tests passing including audio duration validation, progress calculation, and mime support. | **PASS** (158ms) |
| **Contracts Schemas** | `packages/contracts/src/api/audio.ts` | `AudioAttachmentSchema`, `AudioRecordingDraftSchema`, and limits exported and built cleanly. | **PASS** (Contracts Build) |
| **Web UI Components** | `packages/ui-web` | `AudioPlayerCard` and `AudioRecorderDialog` exported; 44/44 unit tests passing. | **PASS** (82ms) |
| **Mobile UI Components** | `packages/ui-mobile` | `MobileAudioPlayerCard` and `MobileAudioRecorderSheet` exported; 11/11 unit tests passing. | **PASS** (8ms) |
| **Web & Mobile Wiring** | `apps/web` & `apps/mobile` | Toolbar triggers, modal states, and file upload lifecycle wired cleanly. | **PASS** (Typecheck Clean) |
| **Monorepo Typecheck** | `pnpm typecheck` | Clean run across all 13 workspace projects with 0 errors. | **PASS** (0 Errors) |
| **Phase 41 Integration Suite** | `tests/integration/phase41-audio-recording-attachment.test.ts` | 17/17 tests passing covering permission refusal, 10m/25MB limits, WebM/MP4 inspection, interruption draft recovery, quota reservation, attachment lifecycle, tenant isolation, cascade cleanup, and no auto-recording invariant. | **PASS** (765ms) |
| **Comprehensive Test Run** | Vitest combined 4 test files | 142/142 tests passing across domain, web UI, mobile UI, and Phase 41 integration suite. | **PASS** (142/142 Passed) |

## Defects, limitations, and recovery

### Release Gate Status: BLOCKED

Phase 41 audio recording and attachment lifecycle is fully implemented and verified in provisional local development. However, per project rules (`AGENTS.md`) and roadmap specifications:
- Phase 41 depends on Phase 38 (Controlled private beta), which remains blocked pending cloud staging infrastructure, release keystore credentials, push provider service accounts, and beta participant cohorts.
- Phase 37 release gate remains blocked pending physical Android TalkBack hardware and production app store credentials.
- Actual microphone hardware input on physical Android devices cannot be tested in headless emulation; verification relies on unit, contract, and integration tests with synthetic audio streams and mock MediaRecorder.
- In accordance with safety invariants, audio recording requires deliberate user action, and status is recorded as `blocked` (provisional local development). Work stops before Phase 42.

## Commit target

`feat(audio): add deliberate private recording and playback`
