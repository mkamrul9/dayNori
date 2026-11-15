# Phase 121 — Daynori production-scale load testing, performance profiling, and capacity envelope verification for 1,000 to 10,000 users

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [102 — Authorized Version 2 publication and live verification](102-authorized-version-2-publication-and-live-verification.md)
- [112 — Daynori core web/PWA browser release verification and staging isolation audit](112-daynori-core-web-pwa-browser-release-verification-and-staging-isolation-audit.md)
- [118 — Daynori deployable web-core release preparation and production infrastructure capacity plan](118-daynori-deployable-web-core-release-preparation-and-production-infrastructure-capacity-plan.md)
- [119 — Daynori authorized HTTPS staging deployment verification and browser journey audit](119-daynori-authorized-https-staging-deployment-verification-and-browser-journey-audit.md)
- [120 — Daynori production-focused security and privacy review and vulnerability remediation of the enabled web core](120-daynori-production-focused-security-and-privacy-review-and-vulnerability-remediation-of-the-enabled-web-core.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- scripts
- tests
- apps/api
- packages/domain
- artifacts/phase121
- docs/decisions
- docs/engineering
- docs/operations
- docs/phase-reports
- docs/roadmap
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Model realistic user concurrency and traffic scenarios for 1,000, 5,000, and 10,000 registered users with explicit Peak Concurrent User (PCU) ratios (1k users = 30 PCU, 5k users = 150 PCU, 10k users = 300 PCU) and a representative 75/25 read/write productivity mix.
2. Author and execute automated load-testing suite scripts/run-phase121-load-testing.mjs against production-like hosted staging (https://daynori-api-preview.onrender.com and https://daynori-web-preview.onrender.com) executing ramp, spike, and soak test runs.
3. Incorporate realistic Bangladesh mobile and broadband network profiles (80ms-180ms roundtrip to Singapore region / Cloudflare DAC edge, 1-3% packet loss, ±30ms jitter) into synthetic load actors.
4. Measure end-user latency, p50/p95/p99 API latencies, HTTP 4xx/5xx error rates, database connection pool utilization, CPU/memory consumption, Fastify request queuing, storage growth, bandwidth consumption, and projected monthly infrastructure costs.
5. Identify production scale bottlenecks under load (e.g. process-local rate limit false positives under mobile carrier NATs, connection pooling timeouts, payload sizes), implement targeted code and configuration remediations, and rerun load tests to verify resolution.
6. Establish empirical safe operating envelope boundaries, warning and critical alert thresholds, horizontal/vertical scaling triggers, and automated rollback criteria.
7. Author ADR 0121, phase report docs/phase-reports/phase-121.md, update CHANGELOG.md, update docs/roadmap/progress.json, and validate planning.

## Acceptance

- Realistic traffic models defined for 1,000, 5,000, and 10,000 registered users with documented CCU and read/write assumptions.
- Ramp, spike, and soak load tests executed against hosted staging environment with Bangladesh network conditions modeled.
- P95 and P99 latencies, error rates, connection pool metrics, memory/CPU, and monthly cost projections measured and recorded.
- Identified bottlenecks remediated with verified before-and-after performance metrics.
- Safe operating envelope, alert thresholds, scaling triggers, and rollback conditions established in machine-readable and runbook formats.
- No extrapolation of 100-user local tests into thousands-user claims; all findings grounded in hosted staging measurements and empirical modeling.
- docs/roadmap/plan.json, progress.json, and blueprint.html pass all planning validators.

## Verification and evidence

- node scripts/validate-planning.mjs
- node scripts/build-phase-plans.mjs --check
- node scripts/build-blueprint.mjs --check
- pnpm validate:function-register
- pnpm vitest run tests/performance/phase121-capacity-and-load.test.ts
- pnpm lint

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/decisions/0063-free-core-testing-preview.md](../../decisions/0063-free-core-testing-preview.md)
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/decisions/0098-measured-performance-and-resource-optimization.md](../../decisions/0098-measured-performance-and-resource-optimization.md)
- [docs/decisions/0118-daynori-deployable-web-core-release-and-production-infrastructure-capacity-plan.md](../../decisions/0118-daynori-deployable-web-core-release-and-production-infrastructure-capacity-plan.md)
- [docs/decisions/0119-authorized-https-staging-deployment-and-browser-journey-audit.md](../../decisions/0119-authorized-https-staging-deployment-and-browser-journey-audit.md)
- [docs/decisions/0120-production-security-privacy-review-and-remediation.md](../../decisions/0120-production-security-privacy-review-and-remediation.md)
- [docs/decisions/0121-production-scale-load-testing-and-capacity-envelope.md](../../decisions/0121-production-scale-load-testing-and-capacity-envelope.md)
- [docs/phase-reports/phase-98.md](../../phase-reports/phase-98.md)
- [docs/phase-reports/phase-118.md](../../phase-reports/phase-118.md)
- [docs/phase-reports/phase-119.md](../../phase-reports/phase-119.md)
- [docs/phase-reports/phase-120.md](../../phase-reports/phase-120.md)
- [docs/phase-reports/phase-121.md](../../phase-reports/phase-121.md)
- [docs/engineering/backup-and-recovery.md](../../engineering/backup-and-recovery.md)

## Commit target

`perf(staging): load test hosted staging and verify capacity envelope for 10k users`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
