# Phase 98 — Measured performance and resource optimization

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [97 — Version 2 security privacy and recovery audit](97-version-2-security-privacy-and-recovery-audit.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps
- packages
- tests/performance
- docs/engineering

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Repeat Phase 65 workload baselines on final V2 desktop/PWA/native/provider paths and separate warm/cold/cache/network profiles.
2. Optimize measured bottlenecks through bounded queries/pagination/virtualization, incremental sync, lazy assets and stopped hidden motion.
3. Measure API, edit acknowledgment, usable startup, Web Vitals, memory, assistant/voice latency and cost under stated profiles.

## Acceptance

- Documented performance targets pass with sample counts/p50/p95 and timeout/completion rates; regressions have resolved causes.
- No eager all-file/index/developer-tour download, unbounded query, privacy-breaking cache or skipped authorization creates artificial speed.
- Lab/synthetic results and real-user field percentiles/capacity claims remain distinct.

## Verification and evidence

- Run the existing performance profile plus targeted measured benchmarks using the 10k-item and deep-folder fixtures.
- Record physical Android/PWA usable-start and long-session traces and authorized live provider timings/cost.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/roadmap/v2/feature-coverage.md](../v2/feature-coverage.md)
- [docs/engineering/handoff.md](../../engineering/handoff.md)
- [docs/roadmap/v2/quality-and-release.md](../v2/quality-and-release.md)
- [docs/architecture/operations-and-scaling.md](../../architecture/operations-and-scaling.md)

## Commit target

`perf(app): meet measured Version 2 responsiveness budgets`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
