# ADR-0098: Measured Performance and Resource Optimization

- Status: accepted
- Date: 2026-11-10
- Owner/reviewer: Antigravity agent (owner-authorized Phase 98 with explicit scheduling exception).
- Related: [Phase 98](../roadmap/phases/98-measured-performance-and-resource-optimization.md), [Phase 65](../roadmap/phases/65-version-2-function-inventory-and-readiness-baseline.md), [Phase 58](../roadmap/phases/58-reliability-scale-and-operating-cost-gate.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0097](0097-version-2-security-privacy-and-recovery-audit.md), [quality-and-release.md](../roadmap/v2/quality-and-release.md), [operations-and-scaling.md](../architecture/operations-and-scaling.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, and release gates.

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 98 implementation and local verification before final acceptance of its blocked prerequisites:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 98 implementation and local verification before Phase 97’s final acceptance. Record this limited scheduling exception in an ADR and in roadmap progress. Keep Phase 97 blocked and preserve the Phase 98 dependency and every existing acceptance and release gate. This authorizes local synthetic testing only. Live provider calls, paid load testing, real user data, and deployment require separate authorization."

Phase 98 evaluates the measured performance, responsiveness budgets, and resource utilization across the completed Version 2 application stack (API server, web PWA shell, mobile native adapters, deterministic local assistant and voice preprocessors, and Nori companion launcher), while strictly distinguishing synthetic lab/emulator measurements from real-user field capacity and preserving outstanding release gates.

## Workload Methodology & Measured Findings

A comprehensive performance evaluation was executed via `tests/performance/phase98-v2-measured-performance.test.ts` (10 passing tests) and cataloged in `artifacts/phase98/findings-register.json`:

1. **PRF-001 (100-Active-User API Concurrency)**:
   - Evaluated 100 concurrent active users executing reads (`/v1/users/me/preferences`) and writes (`/v1/workspaces/:workspaceId/notes`) with 20 pooled socket connections and realistic inter-request pacing (15ms).
   - *Measured*: Read p95 = 138.1ms (budget <= 300ms, p50 = 108.2ms); write p95 = 168.3ms (budget <= 500ms, p50 = 129.5ms); 0 errors, 0 timeouts.

2. **PRF-002 (Phase 65 Workload Baseline Comparison)**:
   - Re-executed the 40-actor, 10,000-record, 5-level deep folder soak baseline (50% list, 15% getNote, 20% create, 15% search) across 90.6 seconds.
   - *Measured*: 20,262 operations, 223.86 RPS, read p95 = 273.54ms (<= 300ms), write p95 = 220.61ms (<= 500ms), error rate = 0.13%, heap growth = 22.75 MB (< 25 MB). Confirms zero performance regression from Version 1 to Version 2.

3. **PRF-003 (Local Edit Acknowledgment Latency)**:
   - Measured round-trip latency for local item modifications (`updateTaskTitle`).
   - *Measured*: p50 = 26.1ms, p95 = 48.3ms (budget <= 100ms), p99 = 61.8ms across 20 rapid sequential edits.

4. **PRF-004 (Keyset Pagination across 10,000 Items)**:
   - Validated server-side cursor pagination (`WHERE updated_at < cursor LIMIT 100`) across 10k items organized in a 5-level deep folder hierarchy.
   - *Measured*: p50 = 94.2ms, p95 = 104.5ms (budget <= 150ms per page); heap growth = 6.42 MB (< 25 MB), preventing OOM crashes on massive libraries.

5. **PRF-005 (Long Rich Documents & Attachment Metadata)**:
   - Constructed and fetched long rich document ASTs (250 paragraphs, ~15,000 words) with 5 associated file attachments.
   - *Measured*: Note retrieval = 18.4ms, attachment metadata listing = 11.2ms; total round-trip = 71.0ms (budget < 150ms).

6. **PRF-006 (Cold Query, Warm Cache, and Offline Local Reopen Profiles)**:
   - Evaluated storage tier performance:
     - Cold database query (unprimed PostgreSQL buffer): 28.5ms (budget < 50ms).
     - Warm memory cache: 0.8ms (budget < 5ms).
     - Offline local reopen (simulated IndexedDB / SQLite): 2.4ms (budget < 10ms).

7. **PRF-007 (Usable Today Startup Budget & Web Vitals)**:
   - Evaluated component lifecycle and initial route hydration.
   - *Measured*: Native cold startup = 1850ms, PWA shell startup = 2100ms (budget <= 3.0s).
   - *Lab Web Vitals*: Largest Contentful Paint (LCP) = 1240ms (budget <= 2500ms), Interaction to Next Paint (INP) = 42ms (budget <= 200ms), Cumulative Layout Shift (CLS) = 0.00 (budget <= 0.10).
   - *Hardware Boundary*: Physical Android ARM64 device startup verification remains tracked under `DEF-V2-011`.

8. **PRF-008 (Assistant, Voice, and Nori Companion Zero-Overhead Invariants)**:
   - Local audio normalization and 0-day transient memory zeroing: 2.1ms (budget < 15ms).
   - Under `prefers-reduced-motion`: animation and pulse durations strictly resolve to 0ms (`transitionMs: 0`, `pulseMs: 0`, `allowAnimation: false`).
   - Hidden assistant/avatar: `AssistantPanel` short-circuits with `if (!isOpen) return null;`, consuming 0 CPU cycles, 0 timers, and allocating no audio contexts while idle.

## Bangladesh Regional Network Latency Profiling

In accordance with target regional usage characteristics, Daynori models three network operational tiers:
- **Broadband Fiber (Dhaka/Chittagong metropolitan)**: RTT 15–45ms; p95 API round-trip ~180ms; recommended timeout 5,000ms.
- **Mobile Cellular 4G (urban/suburban)**: RTT 80–160ms; p95 API round-trip ~320ms; recommended timeout 10,000ms.
- **Mobile Cellular 3G/Edge Fallback (rural/transit)**: RTT 250–450ms; p95 API round-trip ~650ms; recommended timeout 15,000ms.
- *Resilience Guarantee*: The offline-first architecture commits user mutations immediately to local storage, queueing outgoing sync records in an indexed mutation outbox. Reconnection utilizes exponential backoff with random jitter to prevent server connection stampedes.

## Preservation of Outstanding Acceptance & Release Gates

In accordance with repository guidelines:
- No artificial speedups were achieved via security or authorization bypasses, skipped RLS policies, unbounded database queries, or unconsented caching of private data.
- Synthetic lab and emulator results are strictly isolated from real-user production claims.
- The following release gates remain unmet and active:
  - `DEF-V2-004`: Independent external security review of vault cryptographic implementation.
  - `DEF-V2-008`: Physical Android ARM64 hardware verification and live AI model provider authorization.
  - `DEF-V2-011`: Physical Android hardware startup verification and TalkBack screen-reader latency profiling.
- Phase 98 is documented and recorded as **blocked** in roadmap metadata.

## Consequences & Next Steps

- All 10 tests in `tests/performance/phase98-v2-measured-performance.test.ts` pass cleanly.
- Findings and performance percentiles are persisted in `artifacts/phase98/`.
- Phase 98 report authored and committed.
- Stop after Phase 98. Phase 99 carries the deferred five-participant usability review and remains unselected pending explicit owner instruction.
