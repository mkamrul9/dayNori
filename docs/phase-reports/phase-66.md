# Phase 66: Simple navigation personalization and developer boundaries

## Identity and scope

- Phase: [66 — Simple navigation personalization and developer boundaries](../roadmap/phases/66-simple-navigation-personalization-and-developer-boundaries.md).
- Status: `complete` (local web/API/domain/native wiring verified; physical Android and production operator IdP unmet — not `release_ready`).
- Contributor/date: Cursor agent, 2026-10-25, Asia/Dhaka.
- Base revision/branch: `1537038`, `codex/free-core-preview`; working tree clean at start.
- Prerequisites: [Phase 65](phase-65.md) complete (inventory). Phase 60 remains blocked for public release; not altered.
- Included scope: shared feature registry; All features + pin/hide/restore; preference migration; operator allowlist and Settings separation; ADR 0068; tests/docs/register updates.
- Excluded: Phase 67+ visual redesign; tour engine; enabling vault/Drive/rooms/AI/billing in production; push; deploy; store upload; inventing physical-device results.

## Result

Users can reach enabled features via stable primary destinations or **shell → All features → destination** (two actions). Personal `featurePersonalization` (user profile) hides/pins without changing authorization or release. Hiding Journal leaves three primary tabs. Ordinary Settings no longer exposes galleries, vault harnesses, or provisional integration panels; those require `DAYNORI_OPERATOR_USER_IDS` and `/v1/operator/session`.

Changed contracts: `FeaturePersonalizationSchema` on display preferences; `GET /v1/operator/session`. ADR: [0068](../decisions/0068-feature-registry-personalization-and-operator-boundaries.md).

## Acceptance evidence

| Condition                                                                      | Result                                                                                                   |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Two-action reachability + All features search + hide/restore without data loss | **Pass** (domain + web/mobile UI)                                                                        |
| Settings/Help/account/Search/All features reachable; hide ≠ release/auth       | **Pass**                                                                                                 |
| Direct URL/API/deep-link developer denial for ordinary users                   | **Pass** (API 403; OperatorGate; mobile modal/deep-link gates). Physical Android operator fixture unmet. |

### Commands

Working directory: `D:\SWE\UNIQUE WORK\dailyLIfe`. Runtime: Node `v24.11.1` (engine wants `^24.21.0`; recorded as used). Date: 2026-10-25 Asia/Dhaka. Synthetic JWT / `daynori_test` DB for integration.

| Command                                                                                                                                                                             | Exit | Observed                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------- |
| `pnpm exec vitest run packages/domain/src/featureRegistry.test.ts`                                                                                                                  | 0    | 15 passed                                                                             |
| `node --env-file=.env ./node_modules/vitest/vitest.mjs run tests/integration/phase66-operator-and-personalization.test.ts tests/integration/phase10-workspaces-preferences.test.ts` | 0    | 21 passed (operator 401/403/200; personalization sanitize; 409 conflict)              |
| `pnpm typecheck` / `pnpm lint` / `pnpm test:contract` / `pnpm test:security`                                                                                                        | 0    | typecheck clean; lint clean; contract 4 passed; security 156 passed                   |
| `pnpm validate:function-register` / `pnpm validate:planning` / `pnpm icons:check` / `pnpm audit:secrets`                                                                            | 0    | Register OK; 104 phases; 83 icons; secrets scan clean                                  |
| `git diff --check`                                                                                                                                                                  | 0    | No whitespace errors                                                                  |

Manual: ordinary Settings inspected in source for absence of gallery/harness/provisional panels; All features page documents two-action path. Emulator/physical Android screenshots: **not claimed** (unmet hardware evidence).

### DEF-V2-010

Local web/API/domain/mobile wiring verified. Remaining: physical Android with operator allowlist fixture; production staff identity beyond env allowlist. Defect kept open for unmet platforms — not closed as `release_ready`.

## Defects, limitations and recovery

- Physical Android / TalkBack (DEF-V2-011) unchanged.
- Production operator IdP not implemented; local allowlist only.
- Visual redesign deferred to Phase 67+.
- Migration: deterministic sanitize of `featurePersonalization`; unrelated prefs preserved; stale revision → 409.

## Documentation and Git review

- Updated: IA, Help how-tos, ADR 0068, function-register builder + regenerate, readiness baseline, CHANGELOG, progress.json, this report.
- Intended commit subject: `feat(navigation): separate feature visibility and developer access`.
- Base revision: `1537038`. Commit hash assigned by Git after the phase commit.

## Handoff

Next eligible: **Phase 67 — Original visual direction and responsive journey prototypes**. Stop after this phase.
