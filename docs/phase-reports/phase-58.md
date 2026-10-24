# Phase 58: Reliability, scale, and operating cost gate

## Identity and scope

- **Phase ID/specification:** [Phase 58 — Reliability scale and operating cost gate](../roadmap/phases/58-reliability-scale-and-operating-cost-gate.md).
- **Status:** `blocked` (engineering synthetic short local baseline + local fault/restore; hardware, real beta, cloud PITR, commercial, staffed ops unmet).
- **Contributor and report date:** Cursor agent, 2026-10-21 (repair same day).
- **Base revision:** Phase 57 authority repair `efd379e` (prior: Phase 58 `d1ea28a`, Phase 57 repair `e6fba22`).
- **Prerequisites:** Phases 37 and 57 — not marked complete.
- **Excluded:** Deploy, paid infra, real charges, production billing, live AI/vault/rooms/Drive, real-user contact.
- **Stop before:** Phase 59.

### Distinguishing lanes

| Lane | Delivered? |
|---|---|
| Documented synthetic workload + full 90s soak | **Yes** (short local baseline; not 100-user capacity) |
| Fault/kill-switch checks without global job mutation | **Yes** (scoped taskTypes + sentinel) |
| Isolated DR drill | **Yes** (local logical only) |
| Cost model | **Yes** (provisional) |
| Sustained 100-user / long-duration memory proof | **No** |
| Cloud PITR / staffed ops | **No** / **Unassigned** |

## Workload definition (short local engineering baseline)

| Parameter | Value |
|---|---|
| Label | `engineering-synthetic-baseline-short-local` |
| Actors | 40 concurrent (not sustained 100-user production) |
| Heavy workspace | 10_000 **complete** note records + folder depth **5** (`MAX_FOLDER_DEPTH`) |
| Mix | 50% list, 15% getNote, 20% create, 15% search (`HeavySearchMarker`) |
| Warm-up | 20 requests **outside** measured interval |
| Soak | 90_000 ms (`stopReason: soak_elapsed`) |
| Seed | 58 (reproducible RNG) |
| Auth / DB | Local HTTP + JWT; traffic via `daynori_runtime`; admin seed unmeasured |

## Repair notes (2026-10-21)

| Defect | Fix |
|---|---|
| Global dead-letter of pending/running jobs | Removed; sentinel + `taskTypes` poll filter |
| Incomplete note headers / folder depth 8 | Complete `app.notes` rows; depth 5 |
| “Crash” was only caught handler throw | Retained as handler-failure; added child-process claim + lease-expiry reclaim with durable audit effect |
| Stale sample/soak claims | JSON + this report updated; quality.md targets evaluated separately |

## Measured soak (post-repair)

Host: Windows 10.0.26200, 12 CPUs, ~14 GB RAM, Node `v24.11.1` (engines declare `^24.21.0` — compatibility gap recorded, not suppressed).

| Metric | Value |
|---|---|
| stopReason | `soak_elapsed` |
| durationMs | 90163 |
| sampleCount | 26588 |
| errorRate | ~0.0011 (getNote without personal notes) |
| See | `tests/performance/results/phase58-baseline.json` |

## Acceptance evidence

| Condition | Result |
|---|---|
| Measured workload with tails/errors | **Pass** (local short baseline) |
| Fault/kill without corrupting unrelated jobs | **Pass** (sentinel intact) |
| RPO/RTO | **Local logical restore only** |
| Cost model | **Provisional** |

### Commands

| Command | Exit |
|---|---|
| `npx vitest run tests/performance/phase58-fault-injection.test.ts` | 0 |
| `npx vitest run tests/performance/phase58-reliability-baseline.test.ts` | 0 |
| `pnpm lint` | 0 (after maintenance fixes) |
| `pnpm typecheck` / `validate:planning` / `audit:secrets` | (Phase 59 batch) |

## Defects and limits

1. Status **blocked** on Phase 37 hardware, beta, cloud PITR, commercial, ops ownership.
2. Not production capacity or long-duration memory stability.
3. DR does not cover application/provider/cloud recovery beyond disposable DB+object drill.
4. Node engines `^24.21.0` vs runtime `v24.11.1` — gap recorded.

## Handoff

Next eligible when owner selects: **Phase 59**. Preserve Phase 50 deferred, Phase 49 live Google pending, vault/rooms/AI live/production billing off.
