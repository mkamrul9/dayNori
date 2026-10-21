# Phase 60: Public Android and web release (local preflight / rehearsal)

## Identity and scope

- **Phase ID/specification:** [Phase 60 — Public Android and web release](../roadmap/phases/60-public-android-and-web-release.md).
- **Status:** `blocked` / incomplete — local preparation and rehearsal only; **no** verified public release.
- **Contributor and report date:** Cursor agent, 2026-10-21.
- **Base revision:** Phase 59 signing repair `67b2e81` (prior materials `bafe6d0`).
- **Prerequisites:** Phase 59 remains blocked; not marked complete from docs/synthetic tests alone.
- **Owner selection:** Bounded local preflight/rehearsal only — no deploy, store upload/submission/publication, domain purchases, paid infra, real-user contact, real charges, or production feature activation.
- **Commit subject (adapted):** `chore(launch): prepare local Android and web release preflight and rehearsal` — not “record the verified Android and web release”.
- **Stop before:** Phase 61.

## Result

- Executable fail-closed preflight: `pnpm release:preflight` / `scripts/release-preflight.mjs` — never grants human OA; provisional manifest cannot become release-eligible from JSON validity alone.
- Production-mode gate tests: `tests/integration/phase60-release-boundaries.test.ts` (NODE_ENV=production; local flags ignored).
- Web production smoke: `scripts/phase60-web-production-smoke.mjs` (privacy/terms/support/deletion, CSP, no session cookies).
- Local rehearsal: `DAYNORI_REHEARSAL_TARGET=disposable-local pnpm release:rehearsal`.
- Publication runbook + ADR 0057: Play **percentage staged rollouts are for updates only**; first publication uses testing tracks / first production release.
- Evidence pointer: `docs/release/evidence/candidate-evidence.json` (pending fields explicit).

## Acceptance evidence

| Condition | Result |
|---|---|
| Approved public Android + matching web live at intended destinations | **FAIL / unmet** — phase incomplete |
| Core + enabled-module smoke on disposable local | **Pass** (API production gates + web public pages) |
| Rollback path documented | **Pass** (forward-fix preferred; no destructive rollback assumption) |
| Operator / store approval | **Not granted** |

### Commands

Environment: Windows, Node `v24.11.1` (**BLOCKED** vs engines `^24.21.0`), pnpm `9.15.5`, DB `daynori_test` (isolated test name).

| Command | Exit | Status |
|---|---|---|
| `npx vitest run tests/unit/release-preflight.test.ts apps/mobile/plugins/withReleaseSigningGuard.test.ts` | 0 | PASS |
| `npx vitest run tests/integration/phase60-release-boundaries.test.ts tests/integration/phase59-launch-gates.test.ts` | 0 | PASS |
| `node scripts/mobile-android-release-path.mjs prebuild-disposable` | 0 | PASS (SDK 36 + guard) |
| `exercise-gradle` on disposable android | 0 | PASS (fail-closed assembleRelease) |
| `pnpm --filter @daynori/web build` | 0 | PASS (engine warn) |
| `node scripts/phase60-web-production-smoke.mjs` | 0 | PASS; proxy deletion **UNEXECUTED** (no DAYNORI_API_URL) |
| `node scripts/release-preflight.mjs --allow-partial-local` | 0 | PASS engineering partial; `releaseEligible=false`; many **BLOCKED** |
| `DAYNORI_REHEARSAL_TARGET=disposable-local node scripts/phase60-local-rehearsal.mjs` | 0 | PASS (OA BLOCKED; node engines BLOCKED) |
| `pnpm typecheck` | 0 | PASS (engine warn) |
| `pnpm lint` | 0 | PASS |
| `pnpm validate:planning` | 0 | PASS (64 phases) |
| `pnpm audit:secrets` | 0 | PASS (2176 files) |
| `git diff --check` | 0 | PASS |
| Store upload / live URLs / signed RC | — | **UNEXECUTED** |

### Phase 58 reuse

- Baseline `tests/performance/results/phase58-baseline.json`: label `engineering-synthetic-baseline-short-local`; **not** sustained 100-user capacity / long-duration memory / cloud recovery.
- `getNote` errors with `no note id for getNote` (20): intentional negative when no id available — not unexpected server faults.

## Defects and limits

1. Phase 60 **incomplete** until approved Android + matching web are live.
2. External blockers listed in manifest + runbook (Phase 37/38, owner legal/support/domains, signing credentials, AAB/16KB, Play testers, OA).
3. Workspace `android/` stale FAIL until prebuild; disposable evidence is engineering-only.
4. Node engines mismatch recorded — do not claim supported-runtime verification.
5. Preserve: Phase 50 deferred, Phase 49 live Google pending, vault off, rooms/chat off for real users, live AI off, production billing off, expenses excluded.

## Handoff

Next eligible when owner authorizes further work: remain on Phase 60 external/store path, or select Phase 61 only after Phase 60 acceptance. Do not create a public release tag without separate explicit owner authorization.
