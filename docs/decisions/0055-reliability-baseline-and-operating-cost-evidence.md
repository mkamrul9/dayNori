# ADR-0055: Reliability baseline and operating cost evidence (provisional)

- Status: accepted (provisional local).
- Date: 2026-10-21.
- Related: Phase 58; Phase 37 (blocked on hardware); [operations-and-scaling](../architecture/operations-and-scaling.md); [quality.md](../engineering/quality.md).

## Context

Phase 58 requires measured load/soak, fault drills, restore evidence, and a cost model. Beta usage, store sandbox, and cloud PITR purchases remain unavailable. Manufacturing beta-derived capacity would be dishonest.

## Decision

1. Publish an **engineering synthetic short local baseline**: 40 concurrent actors, 10k **complete** notes, folder depth ≤ `MAX_FOLDER_DEPTH` (5), full 90s soak, seeded RNG, memory storage substitute. Label explicitly **not** sustained 100-user capacity or long-duration memory proof. Evaluate quality.md p95 targets separately from harness guardrails.
2. Record machine-readable results under `tests/performance/results/` without secrets or private fixtures.
3. Treat Phase 37 physical/device and live push evidence as **still unmet**; do not mark prerequisites complete.
4. Cost model separates measured / quote / estimate / unknown; unknown ≠ 0.
5. Kill switches return explicit denial (403); they must not report unsuccessful optional work as completed.
6. Isolated DR drill remains `scripts/disaster-recovery-drill.mjs` on disposable DB names only.
7. Fault suites must not globally dead-letter unrelated jobs; use scoped `taskTypes` polling and sentinel assertions. Handler-failure tests are distinct from worker-process interruption + lease reclaim with durable domain effects.

## Consequences

- Status **blocked/provisional** until hardware, real beta, cloud restore, commercial, and operational ownership evidence land.
- Stop before Phase 59.
