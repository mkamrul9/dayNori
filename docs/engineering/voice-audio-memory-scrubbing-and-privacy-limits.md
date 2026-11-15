# Voice Assistant Audio Memory Scrubbing and Runtime Privacy Limits

**Phase:** Phase 115 — Daynori Voice-Assistant Audio Memory Cleanup Correction & Speech Capture Verification  
**Date:** 2026-11-14  
**Status:** **ACTIVE / VERIFIED IMPLEMENTATION; GATED FAIL-CLOSED UNDER DEF-V2-008 AND DEF-V2-011**

---

## 1. Executive Summary & Problem Statement

In previous voice assistant phases (Phase 95 and Phase 109), the server transcription pipeline implemented an audio cleanup pattern by assigning:
```typescript
audioBuffer = Buffer.alloc(0);
```
This was documented as "erasing the audio buffer from server memory."

### The Technical Vulnerability
In V8 and Node.js:
1. `Buffer.alloc(0)` creates a **new, independent 0-byte Buffer** object and re-assigns the local variable pointer `audioBuffer` to that new instance.
2. The **original decoded audio buffer** containing raw user voice samples remains untouched in heap memory, waiting indefinitely for the V8 garbage collector (GC) to sweep it.
3. If an early return occurred (e.g., audio envelope validation failure, idempotent replay cache hit, or budget check failure) or an unhandled exception was thrown, even the variable re-assignment could be skipped entirely.

Phase 115 corrects this vulnerability by implementing in-place zero-fill memory overwriting (`buffer.fill(0)` via `zeroAudioBuffer`) and wrapping the entire audio processing lifecycle in a strict `try ... finally` block. Furthermore, this document establishes a truthful, technically accurate specification of the runtime limits of memory scrubbing within the V8/Node.js environment.

---

## 2. In-Place Memory Zeroing Architecture

### 2.1 The `zeroAudioBuffer` Domain Utility
Exported from `@daynori/domain` (`packages/domain/src/audioTranscription.ts`):
```typescript
export function zeroAudioBuffer(buffer?: Buffer | Uint8Array | null): boolean {
  if (!buffer || buffer.length === 0) {
    return false;
  }
  try {
    buffer.fill(0);
    return true;
  } catch {
    return false;
  }
}
```
Unlike re-assigning a pointer, `buffer.fill(0)` invokes the underlying C++ `memset` / Node.js Buffer implementation to write `0x00` across every allocated byte in the memory chunk, rendering the captured audio unrecoverable from that memory region.

### 2.2 Server-Side `scrubAudioMemory` and Guaranteed `finally` Execution
Exported from `apps/api/src/modules/ai/transcriptionService.ts`:
```typescript
export function scrubAudioMemory(buffer: Buffer | Uint8Array | null | undefined): boolean {
  return zeroAudioBuffer(buffer);
}
```

In `transcribeAudio`, the buffer is decoded and enclosed in a `try ... finally` block:
```typescript
let audioBuffer: Buffer | null = null;
try {
  audioBuffer = Buffer.from(input.audioBase64, 'base64');
  // ... validation, quota, replay cache, transcription adapter execution ...
} finally {
  if (audioBuffer) {
    scrubAudioMemory(audioBuffer);
  }
}
```

---

## 3. The 7 Protected Exit Paths

The `try ... finally` architecture guarantees that `scrubAudioMemory(audioBuffer)` executes across all seven possible exit paths:

| Exit Path | Trigger Scenario | HTTP Status / Return | Memory Scrub Status |
|---|---|---|---|
| **Path 1: Validation Failure** | Audio duration < 0.5s or > 120s; invalid MIME type; payload > 10MB | 400 `VALIDATION_FAILED` | **Zeroed in `finally`** |
| **Path 2: Idempotent Replay Hit** | Client re-submits existing `transcription_id` with identical hash | 200 Cached Result | **Zeroed in `finally`** |
| **Path 3: Budget Exhaustion** | Workspace daily or monthly AI token/cost quota exhausted | 429 `BUDGET_EXCEEDED` | **Zeroed in `finally`** |
| **Path 4: Client Abort / Cancellation** | User taps Cancel or network connection drops (`AbortSignal`) | AbortError / 499 | **Zeroed in `finally`** |
| **Path 5: Provider / Adapter Error** | Upstream speech recognition provider times out or returns 500 | 500 Internal Error | **Zeroed in `finally`** |
| **Path 6: Normal Completion** | Speech recognition successfully returns transcript & metadata | 200 OK | **Zeroed in `finally`** |
| **Path 7: Runtime Exception** | Unexpected runtime failure or database query disconnection | 500 Internal Error | **Zeroed in `finally`** |

All seven paths are rigorously validated in `tests/integration/phase115-voice-assistant-correction.test.ts`.

---

## 4. Practical Runtime Limits in V8 and Node.js

To comply with AGENTS.md standards of truthfulness and avoid misleading security claims, Daynori documents the precise boundaries of user-space memory scrubbing:

### What Is Scrubbed
- **Mutable Binary Heap Buffers (`Buffer` / `Uint8Array`):** The decoded PCM/WebM/WAV binary audio buffer is mutated in place using `buffer.fill(0)`. Memory inspection confirms that all bytes are set to `0x00`.

### What Cannot Be Scrubbed from User-Space JavaScript
1. **Immutable V8 String Primitives (`input.audioBase64`):**
   - In JavaScript/V8, strings are immutable primitive values.
   - When the client POSTs a JSON payload `{"audioBase64": "..."}`, V8 allocates an internal string on the V8 heap.
   - JavaScript code cannot directly overwrite the memory backing a string. That memory remains allocated until the V8 Scavenge or Mark-Sweep garbage collector collects the unreferenced string.
2. **JSON Parser AST and Token Buffers:**
   - Fastify and V8 JSON parsers parse HTTP body streams through internal buffer slices.
   - These intermediate tokens cannot be accessed or zeroed from application logic.
3. **OS-Level Network Sockets & TLS Decryption Buffers:**
   - As audio packets arrive over HTTPS, the operating system kernel (TCP receive buffer) and OpenSSL (TLS session decrypt buffer) hold packet fragments.
   - These kernel and library buffers are managed by OS socket lifecycles outside Node.js.

### Engineering & Security Mitigation
- Audio requests are processed strictly transiently in memory without spooling to disk.
- Loggers are configured with strict redaction rules ensuring `audioBase64` and audio binary buffers are never serialized to stdout or log files.
- The `app.ai_transcriptions` database table stores only metadata (`words_count`, `duration_seconds`, `confidence`, `cost_micro_usd`) and contains zero audio byte columns.

---

## 5. Speech Recognition & Synthetic Fixture Fidelity

Phase 115 validates speech recognition accuracy, language detection, and uncertainty handling against real synthetic WAV audio fixtures:
- `synthetic-bangla-appointment.wav` (5.0s, native Bengali script preservation: `\u0980-\u09FF`).
- `synthetic-english-deadline.wav` (4.0s, English task creation).
- `synthetic-banglish-report.wav` (6.0s, code-switched multi-language speech).
- `synthetic-silence-5s.wav` (5.0s, 0.0 confidence silence detection).
- `synthetic-low-confidence-noise.wav` (3.0s, low confidence muffled speech prompting clarification).

All recognition evaluations utilizing mock adapters are explicitly labeled with `adapter: 'mock'` and recorded in `artifacts/phase115/`.

---

## 6. Standing Release Gates

Voice capabilities remain strictly gated fail-closed:
- `DEF-V2-008`: Commercial cloud provider Data Processing Agreement (DPA) with enterprise zero-retention / 30-day abuse cap pending owner signature.
- `DEF-V2-011`: Physical ARM64 Android phone microphone recording and spoken TalkBack screen-reader verification pending physical hardware availability.
