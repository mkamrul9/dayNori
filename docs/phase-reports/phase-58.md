# Phase 58: Reliability, scale, and operating cost gate

## Identity and scope

- **Phase ID/specification:** [Phase 58 — Reliability scale and operating cost gate](../roadmap/phases/58-reliability-scale-and-operating-cost-gate.md).
- **Status:** `blocked` (engineering synthetic baseline + local fault/restore procedures; hardware, real beta, cloud PITR, commercial, and staffed ops unmet).
- **Contributor and report date:** Cursor agent, 2026-10-21.
- **Base revision:** Phase 57 repair `e6fba22` (prior: `58da7fa`, `8da6668`).
- **Prerequisites:** Phases 37 and 57 — Phase 37 remains blocked on physical TalkBack/KeyStore/live push; Phase 57 billing sandbox/commercial unmet. Owner selected bounded provisional local work; prerequisites are **not** marked complete.
- **Excluded:** Deploy, paid infra, real charges, production billing, live AI/vault/rooms/Drive, real-user contact.
- **Stop before:** Phase 59.

### Distinguishing lanes

| Lane | Delivered? |
|---|---|
| Documented synthetic workload + full soak measurement | **Yes** (local; 90s soak_elapsed) |
| Fault/kill-switch checks | **Yes** (local) |
| Isolated DR drill (disposable DBs + object bytes) | **Yes** (re-run via vitest) |
| Cost model with measured/quote/estimate/unknown | **Yes** (provisional) |
| Beta-derived / 100-user production capacity claim | **No** |
| Cloud PITR / purchased RPO-RTO | **No** |
| Staffed on-call ownership | **Unassigned** |

## Workload definition (engineering synthetic baseline)

| Parameter | Value |
|---|---|
| Label | `engineering-synthetic-baseline` (not beta-derived) |
| Concurrent actors | 40 (host-bounded proxy toward ~100-active quality.md target) |
| Heavy workspace | 10_000 notes + folder depth 8 |
| Mix | 70% list/read, 20% note create, 10% search |
| Warm-up | 20 requests (not measured) |
| Soak | **90_000 ms required**; stopReason must be `soak_elapsed` |
| Pacing | 25 ms yield between actor ops |
| Sample safety ceiling | 100_000 (not used as primary stop) |
| Auth / DB | Local HTTP + JWT; measured traffic via `daynori_runtime`; seed via admin pool |
| Substitutes | Memory object storage; vault always off; rooms/AI/billing fail-open only under `NODE_ENV=test` harness |
| Topology | Single API process + local PostgreSQL; worker exercised in fault suite |

## Result

- `tests/performance/phase58-reliability-baseline.test.ts` + `tests/performance/results/phase58-baseline.json`.
- `tests/performance/phase58-fault-injection.test.ts` — worker crash → reclaim (attempts≥2, one completion); development kill switches return 403 for rooms/AI/billing/vault while core notes remain usable.
- Billing scheduler status filter aligned to `running` (`ensureBillingMaintenanceJobs`).
- Docs: ADR 0055, `operating-cost-model.md`, `runbooks/phase58-incidents.md`, operations/backup links.

### Measured soak (2026-10-21T04:37:05Z)

Host: Windows 10.0.26200, 12 CPUs, 14173 MB RAM, Node `v24.11.1`, pnpm `9.15.5`.

| Metric | Value |
|---|---|
| stopReason | `soak_elapsed` |
| durationMs | 90230 |
| sampleCount | 33996 |
| errorCount / errorRate | 0 / 0 |
| throughputRps | ~376.8 |
| latency all p50 / p95 / p99 | 76.5 / 115.3 / 171.8 ms |
| read p95 / write p95 | 111.9 / 118.9 ms |
| heapGrowthMb | ~34.3 |

Machine-readable: `tests/performance/results/phase58-baseline.json`.

## Acceptance evidence

| Condition | Method | Result |
|---|---|---|
| Measured workload with tails/errors | 90s soak baseline | **Pass** (local synthetic; see JSON) |
| Failures degrade without corrupting core | fault + kill-switch tests | **Pass** (local) |
| RPO/RTO demonstrated | `disaster-recovery-drill.test.ts` | **Local logical restore only** — not cloud PITR |
| Cost model | operating-cost-model.md | **Provisional** (unknowns recorded) |

### Commands run (repo root)

Environment: Windows 11, Node `v24.11.1`, pnpm `9.15.5`. Date 2026-10-21.

| Command | Exit | Notes |
|---|---|---|
| `npx vitest run tests/performance/phase58-reliability-baseline.test.ts tests/performance/phase58-fault-injection.test.ts` | 0 | 5 passed; ~99.9s wall |
| `npx vitest run tests/integration/phase57-billing-repair.test.ts tests/integration/disaster-recovery-drill.test.ts` | 0 | 8 passed |
| `pnpm typecheck` | 0 | Engine warn: wanted `^24.21.0`, ran `v24.11.1` |
| `pnpm validate:planning` | 0 | 64 phases |
| `pnpm audit:secrets` | 0 | 2147 files |
| `npx eslint` (Phase 58 touched TS) | 0 | Touched paths clean |
| `pnpm lint` (repo-wide) | 1 | Pre-existing errors in vault/drive spike fixtures — unrelated |
| `git diff --check` | 0 | |

## Defects, limitations and recovery

1. Status **blocked**: Phase 37 hardware/push; real beta observations; cloud backup/PITR purchase; commercial pricing; staffed ops.
2. Baseline uses 40 concurrent actors and memory storage — **not** a 100-user production proof.
3. Cost unknowns must not be treated as zero.
4. Repo-wide `pnpm lint` still fails on pre-existing spike/security fixtures; Phase 58 paths lint clean.
5. Rollback: remove Phase 58 tests/docs/results; revert billing scheduler status string; no new schema migration.

## Documentation and Git review

- This report; CHANGELOG; progress.json; ADR 0055; operating-cost-model; runbooks; operations-and-scaling; backup-and-recovery note.
- Intended commit: `perf(platform): validate reliability capacity and operating costs`

## Handoff

Engineering synthetic reliability and cost evidence recorded under fail-closed optional modules. **Do not claim production capacity or purchased RPO/RTO.** Next eligible when owner selects: **Phase 59**. Preserve Phase 50 deferred, Phase 49 live Google pending, vault off, rooms/chat off for real users, live AI off, production billing off.
