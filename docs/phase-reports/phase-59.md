# Phase 59: Google Play and web launch preparation

## Identity and scope

- **Phase ID/specification:** [Phase 59 — Google Play and web launch preparation](../roadmap/phases/59-google-play-and-web-launch-preparation.md).
- **Status:** `blocked` (local preparation + drafts only; not launch authorization).
- **Contributor and report date:** Cursor agent, 2026-10-21 (signing/build-path repair same day).
- **Base revision:** Phase 59 materials `bafe6d0` (prior: Phase 58 repair `b559c23`).
- **Prerequisites:** Phases 38, 57, 58 — remain blocked/provisional; not marked complete.
- **Owner selection:** Bounded provisional local preparation only — no deploy, store submission, domain purchases, merchant setup, real-user contact, real charges, live AI, or production feature activation.
- **Stop before:** Phase 60 (selected separately for rehearsal).

### Distinguishing lanes

| Lane | Delivered? |
|---|---|
| Versioned release manifest + disabled-module inventory | **Yes** (provisional) |
| Draft privacy/terms/support/deletion resources | **Yes** (unresolved fields marked) |
| Play policy review dated 2026-10-21 | **Yes** (config + drafts; artifact pending) |
| Target SDK 36 app config + signing fail-closed | **Yes** (authoritative prebuild path; built AAB **unexecuted**) |
| Signed RC / store upload / operator approval | **No** |
| Brand/domain/legal entity clearance | **No** (owner) |

## Result

- Provisional release materials under `docs/release/`.
- **Repair (this update):** `withReleaseSigningGuard` defers fail-closed checks to Gradle `taskGraph.whenReady` for distributable release tasks; ordinary `:app:tasks` / debug builds do not require credentials. Neutralizes silent `debug.keystore` fallback in generated `signingConfigs.release`. Env aliases: `DAYNORI_RELEASE_*` and `ANDROID_KEYSTORE_*`.
- Authoritative workflow: `scripts/mobile-android-release-path.mjs` (`inspect`, `prebuild-disposable`, `exercise-gradle`). Stale workspace `apps/mobile/android/` still fails inspect until regenerated — cannot bypass.
- Launch checklist demotes signing to plugin LV + credentials MC; artifact evidence UNEXEC.
- `tests/integration/phase59-launch-gates.test.ts` labeled as development NODE_ENV probes (not production web/native verification).

## Acceptance evidence

| Condition | Result |
|---|---|
| Claims match enabled tested functionality | **Pass** for drafts/manifest (marketing forbidden features listed) |
| Signed RC clean install/upgrade | **Unexecuted** (credentials/hardware) |
| Launch checklist with real approvals | **Checklist only** — operator approval **not** granted |
| Disposable prebuild guard + SDK 36 | **Pass** — `artifacts/release/android-prebuild-inspection.json` |
| Gradle `:app:tasks` without credentials | **Pass** |
| Gradle `:app:assembleRelease` without credentials | **Pass** (fail-closed) |

### Commands

Environment: Windows, Node `v24.11.1` (engines `^24.21.0` gap recorded), pnpm `9.15.5`.

| Command | Exit | Notes |
|---|---|---|
| `npx vitest run apps/mobile/plugins/withReleaseSigningGuard.test.ts` | 0 | Neutralization unit tests |
| `node scripts/mobile-android-release-path.mjs inspect` | 1 | Expected FAIL — stale workspace android/ |
| `node scripts/mobile-android-release-path.mjs prebuild-disposable` | 0 | Guard + target/compile 36 |
| `node scripts/mobile-android-release-path.mjs exercise-gradle --android-dir <disposable>` | 0 | tasks PASS; assembleRelease fail-closed |
| `npx vitest run tests/integration/phase59-launch-gates.test.ts` | 0 | Development API probes |
| Signed AAB / physical device / Play Console | **Unexecuted** | |

## Defects and limits

1. Status **blocked** until prerequisites, owner identity/legal/support, signing credentials, built API-36+16KB evidence, account-specific testers, and operator approval exist.
2. Workspace `android/` remains stale until local `pnpm --filter @daynori/mobile prebuild`; packaging must use regenerated trees.
3. `app.daynori.com` / brand domains remain provisional intent — not purchased/verified.
4. Local preparation does **not** authorize launch.

## Handoff

Next eligible when owner selects: **Phase 60**. Preserve Phase 50 deferred, Phase 49 live Google pending, vault off, rooms/chat off for real users, live AI off, production billing off.
