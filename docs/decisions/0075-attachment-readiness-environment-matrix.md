# ADR 0075: Attachment readiness environment matrix

- Status: Accepted
- Date: 2026-10-27
- Deciders: Owner via Phase 75 selection; Cursor agent implementation

## Context

Phase 75 must not conflate MemoryStorageProvider / mocked fetch transport / PolicyMalwareScanner with live Supabase object storage or production malware engines. Hosted core preview continues to disable uploads and audio (DEF-V2-002). Local engineering still needs an honest way to exercise finalize/scan without inventing production readiness.

## Decision

1. **Capability layers stay distinct** in reports and the function register:
   - Mock/in-memory integration (Vitest MemoryStorageProvider, PolicyMalwareScanner)
   - Optional local memory store via `DAYNORI_LOCAL_MEMORY_STORAGE=true` (non-production only)
   - Hosted/staging Supabase private bucket + ClamAV/`MALWARE_SCANNER_URL` when authorized
   - Browser MediaRecorder vs emulator mock adapter vs physical Android microphone
2. **`DAYNORI_ALLOW_POLICY_SCANNER=true`** may enable `PolicyMalwareScanner` only when `NODE_ENV !== 'production'`. Production without ClamAV/external scanner remains fail-closed (`UnavailableMalwareScanner`).
3. **Hosted preview upload/audio stays disabled** unless a separate authorized capability decision changes DEF-V2-002.
4. **`tests/integration/live-storage-capabilities.test.ts`** remains mocked-transport contract evidence, not live Supabase proof.

## Consequences

- Local file/audio journeys can be verified without paid provisioning.
- Phase 75 completion still requires the phase’s own provider/device evidence for any enabled claim; physical Android capture/playback remains a Phase 75 gate when claimed.
- Passing PolicyMalwareScanner EICAR checks must never be described as production malware protection.
