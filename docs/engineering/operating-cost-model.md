# Operating cost model (Phase 58 — provisional)

Status: engineering synthetic baseline. **Not** approved commercial prices. Unknown fees are not zero.

## Classification legend

| Tag | Meaning |
|---|---|
| measured | Observed in local Phase 58 baseline / prior drills |
| quote | Current official unit price from a provider page (date-stamped) |
| estimate | Derived from measured × assumed usage |
| unknown | No verified quote or measurement |

## Measured local quantities (2026-10-21)

Recorded by `tests/performance/phase58-reliability-baseline.test.ts` into `tests/performance/results/phase58-baseline.json` (host-specific).

Captured 2026-10-21 (`phase58-baseline.json`, `stopReason: soak_elapsed`):

| Quantity | Value | Tag |
|---|---|---|
| Concurrent actors | 40 | measured |
| Heavy items / folder depth | 10_000 / 8 | measured |
| Soak wall time | 90_230 ms | measured |
| Samples / errors | 33_996 / 0 | measured |
| Throughput | ~376.8 RPS | measured |
| Latency p50 / p95 / p99 | 76.5 / 115.3 / 171.8 ms | measured |
| Heap growth | ~34.3 MB | measured |
| Host | win32 12 CPU / ~14 GB / Node v24.11.1 | measured |

Object storage in this baseline uses an **in-memory adapter** — not durable object cost evidence. Database bytes grow with seeded items; measure with `pg_database_size` in staging before publishing.

## Cost drivers

| Driver | Classification | Notes |
|---|---|---|
| PostgreSQL compute/storage | estimate / unknown quote | Depends on managed plan; local size only. |
| Object storage + egress | unknown (local memory adapter) | Require durable fixture + provider quote. |
| Backups (DB + objects) | estimate / unknown | DR drill proves restore path; cloud PITR unpurchased. |
| API/worker CPU | measured locally | Not mapped to cloud instance prices here. |
| Scanning/rendering | unknown | Not exercised in Phase 58 baseline. |
| Push / realtime | unknown | Disabled; no live FCM/VAPID. |
| AI tokens | estimate | Reuses Phase 55/57 ceilings; live provider off. |
| Play billing fees | unknown | Production billing off. |

## Usage scenarios (assumptions — configurable)

| Scenario | Active users | Notes |
|---|---|---|
| Local engineering | 40 concurrent synthetic | Measured in Phase 58 |
| Proposed gate | ~100 concurrent synthetic | Target from quality.md; not fully sustained here |
| Public launch | unknown | Requires beta evidence + quotes |

## Alerts (local sink only)

Quota/cost anomalies should emit to a **local test sink** (structured log / file). Phase 58 does not send real email, SMS, Slack, or push.

## Unassigned ownership

Staffed on-call, finance approver for cloud spend, and merchant/billing ops remain **unassigned**. Do not invent accepted operational coverage.
