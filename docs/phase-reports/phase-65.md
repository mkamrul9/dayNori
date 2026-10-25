# Phase 65: Version 2 function inventory and readiness baseline

## Identity and scope

- Phase: [65 — Version 2 function inventory and readiness baseline](../roadmap/phases/65-version-2-function-inventory-and-readiness-baseline.md).
- Status: `complete` (inventory and measurement only; no product redesign or gated-module enablement).
- Contributor/date: Cursor agent, 2026-10-25, Asia/Dhaka.
- Base revision/branch: `a8d50fa`, `codex/free-core-preview`; working tree clean at start.
- Prerequisites: [Phase 64](phase-64.md) complete (planning). Phase 60 remains blocked for public release; not altered.
- Included scope: machine-readable function register, readiness baseline, defect mapping, local synthetic journey/perf evidence, fresh visual emulation captures + sanitized manifests, validator tooling, documentation/progress/changelog updates.
- Excluded: Phases 66+, UI redesign, navigation implementation, comprehensive feature repairs, enabling vault/Drive/rooms/AI/billing/notification delivery, purchases, deploy, store upload, push, external messages, inventing authenticated/device results.

## Result

Daynori now has an evidence-backed inventory answering: which actions exist, where users reach them, which platforms/release configs apply, what was tested (revision/environment), what passed/failed/unavailable/untested, which later phase owns each gap, and planned Help/tour treatment.

Deliverables:

- [`docs/roadmap/v2/function-register.json`](../roadmap/v2/function-register.json) — 109 actions, 12 defects, 22 families.
- [`docs/roadmap/v2/function-register.schema.md`](../roadmap/v2/function-register.schema.md) — field meanings and readiness enums.
- [`docs/roadmap/v2/readiness-baseline.md`](../roadmap/v2/readiness-baseline.md) — nominated environment and findings.
- [`docs/roadmap/v2/evidence/`](../roadmap/v2/evidence/) — visual manifest + perf summaries (PNGs/logs under gitignored `artifacts/local/phase65/`).
- Scripts: `scripts/build-function-register.mjs`, `scripts/validate-function-register.mjs`, `scripts/capture-phase65-baseline-shots.mjs`, discovery helpers, `pnpm validate:function-register`.

No action is marked `release_ready`. No `owner_deferred` without an owner decision. Historical `artifacts/web-e2e` screenshots remain labeled historical.

## Acceptance evidence

| Condition                                                                                                | Result                                                                         |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| All feature families and lower-level actions accounted for; untested/unavailable/failed distinguishable  | **Pass** — 22 families; observedResult + readiness enums enforced by validator |
| Fresh screenshots/timings identify revision, platform, viewport, synthetic data; historical labeled      | **Pass** — visual manifest + perf summary; historical siblings noted           |
| Known data-loss/authz/mobile/provider gaps have reproducible next steps; no invented auth/device results | **Pass** — DEF-V2-001…012 with owning phases; missing prereqs recorded         |

### Validation commands

Working directory: `D:\SWE\UNIQUE WORK\dailyLIfe`. Portable Node `v24.21.0` prepended to PATH. Database `daynori_test` via `.env`.

| Command                                                                                                                                                         | Exit           | Observed                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `node --env-file=.env ./node_modules/vitest/vitest.mjs run tests/e2e/core-organizer-journeys.test.ts tests/integration/core-organizer-local-validation.test.ts` | 0              | 2 files, 15 tests passed; log `artifacts/local/phase65/core-journeys.log`. Synthetic JWT. Production gates: rooms/AI/billing/vault 403. |
| `node --env-file=.env ./node_modules/vitest/vitest.mjs run tests/performance/phase58-reliability-baseline.test.ts`                                              | 0              | 2 tests passed; baseline JSON rewritten; summary `docs/roadmap/v2/evidence/phase65-perf-summary.json`. Not production capacity.         |
| `node scripts/capture-phase65-baseline-shots.mjs`                                                                                                               | 0              | 60 PNGs under `artifacts/local/phase65/screenshots/`; manifest committed. Emulation only.                                               |
| Manual image inspection of Today/Settings/Library 320px captures                                                                                                | —              | Preview banner, bottom nav, PWA install overlay, Signed out state; skip-link false-positive clips; no horizontal overflow.              |
| `node scripts/build-function-register.mjs`                                                                                                                      | 0              | 109 actions / 12 defects.                                                                                                               |
| `node scripts/validate-function-register.mjs` / `pnpm validate:function-register`                                                                               | 0              | Families covered; enums/ids/phases OK.                                                                                                  |
| `node scripts/validate-planning.mjs`                                                                                                                            | (run at close) | Planning consistency after progress update.                                                                                             |
| `pnpm exec prettier --check` on changed docs/scripts                                                                                                            | (run at close) | Formatting.                                                                                                                             |
| `pnpm audit:secrets`                                                                                                                                            | (run at close) | No unapproved secrets in staged paths.                                                                                                  |
| `git diff --check`                                                                                                                                              | (run at close) | Whitespace.                                                                                                                             |

Not executed / missing prerequisites:

- Real hosted-preview provider login (no test passwords; DEF-V2-001).
- `pnpm test:e2e:android` / physical device / TalkBack (DEF-V2-011).
- Live Google Drive, push delivery, live AI provider.
- Full `pnpm test:e2e:web` suite (visual capture + API journeys covered the Phase 65 evidence need; full e2e remains available for later phases).
- Screen-reader manual pass (automated overflow only).

### Evidence layers used

- `api_integration` — core journeys (pass).
- `browser_ui` — fresh headless captures (emulation).
- `domain_unit` / source inspection — developer surface findings.
- Not used: `provider_authenticated`, `physical_device` (explicitly unmet).

## Defects, limitations and recovery

Primary defects: DEF-V2-001…012 in the register (offline cold reopen, preview gates, vault/Drive/rooms/billing/AI, support contact, developer Settings clutter, tutorial depth, physical device).

Phase 65 inventories gaps; it does not implement repairs. PNG/browser-profile/raw logs stay out of Git. No ADR required beyond referencing existing ADR 0066/0067.

## Documentation and Git review

- Updated: V2 README, feature-coverage, readiness baseline, evidence README, docs/README, root README status line, CHANGELOG, progress.json.
- ADRs: none new.
- Intended commit subject: `docs(readiness): inventory functions and baseline Version 2 gaps`.
- Base revision recorded: `a8d50fa`. Commit hash is assigned by Git after the phase commit; not invented here.

## Handoff

Next eligible: **Phase 66 — Simple navigation, personalization, and developer boundaries**, using DEF-V2-010 and navigation/personalization actions in the register. Stop after Phase 65.
