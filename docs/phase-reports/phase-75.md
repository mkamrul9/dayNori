# Phase 75: Files and audio attachment readiness

## Identity and scope

- Phase: [75 — Files and audio attachment readiness](../roadmap/phases/75-files-and-audio-attachment-readiness.md).
- Status: **blocked** (local stack repaired and verified; Phase 75 acceptance still unmet for physical-Android capture/playback and live provider/scanner evidence). Standing [ADR 0074](../decisions/0074-standing-phase71-scheduling-and-push.md) applies; Phase 71 remains separately blocked.
- Contributor/date: Cursor agent, 2026-10-27, Asia/Dhaka.
- Base revision/branch: `b5cc40b448217b7386aa5fdd9c84477dcb937199`, `codex/free-core-preview`.
- Prerequisites: Phase 74 complete. Depends only on 74.
- Intended completion subject (when acceptance passes): `feat(attachments): complete private file and audio workflows`

## Result

### Environment matrix ([ADR 0075](../decisions/0075-attachment-readiness-environment-matrix.md))

| Layer | Readiness | Notes |
| --- | --- | --- |
| Mock/in-memory integration | **Ready** | `MemoryStorageProvider` + `PolicyMalwareScanner` in phase 24/25/41 suites |
| Local memory API opt-in | **Configured** | `DAYNORI_LOCAL_MEMORY_STORAGE=true` (non-production only) |
| Hosted/staging Supabase bucket | **Not verified** | No live service-role/storage exercise this cycle; `live-storage-capabilities.test.ts` uses **mocked fetch** + synthetic credentials |
| Production/external scanner | **Not configured** | ClamAV/`MALWARE_SCANNER_URL` unset; policy scanner opt-in is non-prod only |
| Browser MediaRecorder | **Not timed this cycle** | Components + domain/integration covered; nominated browser capture/playback/cancel/background not recorded |
| Emulator Android | **Present** | `emulator-5554` attached; synthetic/mock adapter paths only — not physical mic |
| Physical Android mic | **Missing** | Required Phase 75 verification gate; `adb devices` showed no physical device |

Hosted core preview remains upload/audio-disabled (**DEF-V2-002**). Not enabled to make tests pass.

### Code repairs (reuse existing stack)

- Web Library passes `accountId={user?.id}` into `AudioRecorderDialog`; durable drafts account-scoped.
- Web `signOut` clears durable audio draft for the current workspace/account (with offline file cache).
- Close-with-blob persists a final durable draft before teardown.
- Expo recorder no longer deletes a prior stopped review file on `startRecordingAsync`; supersede only after a successful new stop; `peekLastRecording` restores after sheet close.
- Mobile sheet refuses Start while an unsaved review URI exists; recovers peek on reopen.
- API: non-prod `DAYNORI_ALLOW_POLICY_SCANNER` and `DAYNORI_LOCAL_MEMORY_STORAGE` opt-ins; production remains fail-closed without ClamAV/external scanner/Supabase.
- Help how-tos for Upload a file / Record audio; `.env.example` storage/scanner placeholders.
- Function-register: `files.cancel-retry-quota` / `files.delete` → `verified_local`; `audio.record-attach` local verified with hosted still unavailable.

### Limits (authoritative)

- Recorder: `MAX_AUDIO_RECORDING_SECONDS=600`, `MAX_AUDIO_RECORDING_BYTES=25 MiB`.
- File upload: general 25 MiB; audio MIME upload ceiling 50 MiB (distinct from recorder).
- Upload capability 7200s; download 300s; max concurrent reservations 5.
- PolicyMalwareScanner ≠ production malware protection.

## Acceptance evidence

Environment: Node v24.21.0 (`.tools`), Windows, local `daynori_test`, synthetic JWT, MemoryStorageProvider where noted.

| Check | Result |
| --- | --- |
| `vitest run tests/unit/phase75-attachments-readiness.test.ts` + phase24/25/41 + scanner-synthetic + ui-web/ui-mobile | **114 passed** (combined file/audio run) |
| `vitest run tests/integration/live-storage-capabilities.test.ts` + clamav unit | **8 passed** — live-storage labeled **mocked transport** |
| Physical Android capture/playback/cancel/background | **Not run** — blocks completion |
| Nominated browser capture/playback/cancel/background | **Not recorded this cycle** — blocks completion |
| Live Supabase private bucket + configured scanner | **Not available/authorized** — blocks enabled live claims |

## Defects, limitations and recovery

1. **Phase 75 gate:** physical Android microphone capture/playback/cancel/background evidence.
2. **Phase 75 gate:** nominated browser MediaRecorder journey evidence with synthetic audio.
3. **Live storage/scanner:** authorize Supabase private bucket + ClamAV/external scanner; do not treat mocked live-storage test as live proof.
4. **DEF-V2-002:** hosted preview uploads/audio remain off by design.
5. Phase 71 TalkBack remains blocked (not waived). Phase 77 still owns cold-offline organizer reconstruction. Vault attachments remain behind separate threat model.

### Exact remaining procedure

1. Attach a physical Android device with microphone permission; run Library record → pause/resume/stop → review → save/upload → reopen/playback → discard/delete; capture background interruption once.
2. On a nominated desktop browser (non-preview local build), repeat capture/playback/cancel and a supported image/PDF upload with checksum compare.
3. Optionally exercise authorized staging storage+scanner; record engine/version and fail-closed outage behavior.
4. Re-run suites above; mark Phase 75 complete only when those checks pass; commit `feat(attachments): complete private file and audio workflows` and push.

## Documentation and Git review

- ADR 0075; phase report; Help; `.env.example`; function-register; CHANGELOG; progress.json.
- Unrelated Phase 71 android-e2e artifacts left untouched in the working tree.

## Handoff

Phase 75 remains **blocked** on its own acceptance (physical Android + browser capture evidence; live provider claims not asserted). Next eligible after Phase 75 completes: **Phase 76 — Expenses and safe custom sections completion** (`dependsOn: ["73","74","75"]`). Do not reintroduce a global Phase 71 scheduling block. Do not start Phase 76 until 75 is complete.
