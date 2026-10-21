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

| Condition                                                            | Result                                                               |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Approved public Android + matching web live at intended destinations | **FAIL / unmet** — phase incomplete                                  |
| Core + enabled-module smoke on disposable local                      | **Pass** (API production gates + web public pages)                   |
| Rollback path documented                                             | **Pass** (forward-fix preferred; no destructive rollback assumption) |
| Operator / store approval                                            | **Not granted**                                                      |

### Commands

Environment: Windows, Node `v24.11.1` (**BLOCKED** vs engines `^24.21.0`), pnpm `9.15.5`, DB `daynori_test` (isolated test name).

| Command                                                                                                              | Exit | Status                                                              |
| -------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------- |
| `npx vitest run tests/unit/release-preflight.test.ts apps/mobile/plugins/withReleaseSigningGuard.test.ts`            | 0    | PASS                                                                |
| `npx vitest run tests/integration/phase60-release-boundaries.test.ts tests/integration/phase59-launch-gates.test.ts` | 0    | PASS                                                                |
| `node scripts/mobile-android-release-path.mjs prebuild-disposable`                                                   | 0    | PASS (SDK 36 + guard)                                               |
| `exercise-gradle` on disposable android                                                                              | 0    | PASS (fail-closed assembleRelease)                                  |
| `pnpm --filter @daynori/web build`                                                                                   | 0    | PASS (engine warn)                                                  |
| `node scripts/phase60-web-production-smoke.mjs`                                                                      | 0    | PASS; proxy deletion **UNEXECUTED** (no DAYNORI_API_URL)            |
| `node scripts/release-preflight.mjs --allow-partial-local`                                                           | 0    | PASS engineering partial; `releaseEligible=false`; many **BLOCKED** |
| `DAYNORI_REHEARSAL_TARGET=disposable-local node scripts/phase60-local-rehearsal.mjs`                                 | 0    | PASS (OA BLOCKED; node engines BLOCKED)                             |
| `pnpm typecheck`                                                                                                     | 0    | PASS (engine warn)                                                  |
| `pnpm lint`                                                                                                          | 0    | PASS                                                                |
| `pnpm validate:planning`                                                                                             | 0    | PASS (64 phases)                                                    |
| `pnpm audit:secrets`                                                                                                 | 0    | PASS (2176 files)                                                   |
| `git diff --check`                                                                                                   | 0    | PASS                                                                |
| Store upload / live URLs / signed RC                                                                                 | —    | **UNEXECUTED**                                                      |

### Phase 58 reuse

- Baseline `tests/performance/results/phase58-baseline.json`: label `engineering-synthetic-baseline-short-local`; **not** sustained 100-user capacity / long-duration memory / cloud recovery.
- `getNote` errors with `no note id for getNote` (20): intentional negative when no id available — not unexpected server faults.

## Defects and limits

1. Phase 60 **incomplete** until approved Android + matching web are live.
2. External blockers listed in manifest + runbook (Phase 37/38, owner legal/support/domains, signing credentials, AAB/16KB, Play testers, OA).
3. Workspace `android/` stale FAIL until prebuild; disposable evidence is engineering-only.
4. Node engines mismatch recorded — do not claim supported-runtime verification.
5. Preserve: Phase 50 deferred, Phase 49 live Google pending, vault off, rooms/chat off for real users, live AI off, production billing off, expenses excluded.

## Consolidation follow-up (2026-10-21, same phase)

See [core-consolidation-status.md](../engineering/core-consolidation-status.md). Local Node 24.21.0, regenerated Android, production web-proxy deletion, core + sync-push validation **PASS**. Installable **debug** APK built from `D:\d\daynori` (SHA-256 in `artifacts/release/android-debug-apk-evidence.json`) — **not** release-eligible. No adb device; Phase 37–38 and owner OA remain.

## Scheduling reconciliation (2026-10-21)

Owner confirmed prior **local** release/consolidation work finished for scheduling and **explicitly selected Phase 61**. This does **not** mark Phase 60 complete: approved public Android + matching web at intended destinations remain **unmet**. Live publication, signed AAB, and operator OA stay blocked.

## Handoff

Phase 60 remains incomplete for public release. Owner-authorized next engineering track: **Phase 61** (iOS). Do not create a public release tag without separate explicit publication authorization.

## Owner-requested logo follow-up (2026-10-21)

Bounded local identity work, requested separately by the owner. Base revision: `c98b8e9` (the concurrent iOS work committed the Expo icon/config references while the logo assets were being prepared). Intended commit: `feat(brand): add Daynori identity across web and mobile`. This follow-up leaves the active scheduling decision and release statuses unchanged.

### Delivered

- Original folded D symbol and custom vector lettering, in the existing teal/ink/paper palette. Editable geometry, primary/inverse/monochrome SVG and transparent PNG wordmarks, 1024 px app master and visual preview under [the logo kit](../../assets/brand/README.md).
- Desktop logo and compact narrow-screen symbol in the web header; cached logo on the offline fallback; favicon/Apple touch/PWA any and maskable icons, theme metadata and public-cache v3.
- Bundled native header symbol tinted for light/dark themes; native launcher/adaptive/themed/notification and light/dark splash artwork matching the Expo references. Platform assets are generated from the same source.
- [ADR 0059](../decisions/0059-daynori-vector-identity-and-platform-assets.md), asset generation/verification scripts and a pinned Metro patch. The first native PNG exposed Metro 0.81.5's incompatibility with the existing image-size 2.0.4 override; the patch uses the named function and byte input without changing that version.

### Commands and results

Environment: Windows, portable Node `v24.21.0` prepended to PATH, pnpm `9.15.5`. Vitest used `TEMP` and `TMP` set to `artifacts/local/brand-tmp`; Expo exports used `CI=1` and the same temporary directory.

- `node scripts/build-brand-assets.mjs` — exit 0; 29 generated assets.
- `node scripts/check-brand-assets.mjs` — exit 0; file references/dimensions, Android/PWA safe-circle pixel bounds, opaque maskable background, white alpha foreground, public-cache admission and private/query/cross-origin rejection, plus real Metro PNG metadata extraction.
- `pnpm --filter @daynori/ui-mobile build`, `pnpm --filter @daynori/mobile typecheck`, `pnpm --filter @daynori/web typecheck` — exit 0.
- `pnpm --filter @daynori/web build` — exit 0; production Next build. Initial sandbox mkdir error was cleared by creating `apps/web/.next/server/app/plan/calendar` and rerunning. Existing Next ESLint plugin warning remains.
- `pnpm exec vitest run apps/web/src/web.test.ts apps/mobile/src/mobile.test.ts` — exit 0; 2 files / 32 tests, rerun after dependency repair. Initial sandbox temporary-cache rename failures were resolved with the workspace TEMP/TMP settings.
- `pnpm --filter @daynori/mobile exec expo config --type public --json` — exit 0; resolves icon, splash, adaptive and notification paths.
- `pnpm --filter @daynori/mobile exec expo export -p android --max-workers 2 --output-dir ../../artifacts/local/brand-android-export-verified` — exit 0; 885 modules, bundled `daynori-symbol.png` (4.38 kB), Hermes bundle. Initial failure `getImageSize is not a function` was fixed by the pinned patch.
- `pnpm --filter @daynori/mobile exec expo export -p ios --max-workers 2 --output-dir ../../artifacts/local/brand-ios-export-verified` — exit 0; 884 modules, same native PNG bundled. This is a JavaScript export, not an Xcode build.
- `pnpm install --no-frozen-lockfile --ignore-scripts` — exit 0 under normal host access; restored all 988 dependencies from cache and applied the version-pinned patch. No dependency versions changed. The preceding sandbox offline attempt lacked its isolated metadata cache and could not finish; the normal host installation restored the workspace.
- `node scripts/check-brand-assets.mjs http://127.0.0.1:3117` — exit 0 against a temporary production `next start --hostname 127.0.0.1 --port 3117` child in the same host execution: all 10 public asset URLs return 200; production HTML contains the logo, Apple icon and teal theme metadata. Separate sandbox/host loopback attempts failed before this successful same-host check.
- `pnpm exec eslint apps/web/src/components/AppHeader.tsx apps/web/src/app/layout.tsx packages/ui-mobile/src/MobileHeader.tsx packages/ui-mobile/src/assets.d.ts packages/test-utils/src/mock-react-native.ts` — exit 0.
- Targeted `pnpm exec prettier --check` on changed source/config/docs — exit 0; all matched files formatted.
- `node scripts/validate-planning.mjs` — exit 0; 64 phases, 22 mapped requirements and 280 Markdown files with local links and dependency/status checks passing.
- `node scripts/scan-secrets.mjs` — exit 0; 4041 files checked without unapproved secrets.
- `git diff --check` — exit 0; complete diff and staged paths reviewed before commit.

### Visual evidence and limits

Inspected `assets/brand/preview.png` in light and reversed presentation, and `artifacts/local/daynori-small-icon-check.png` at 16/24/32/48/64 px. Corrected inherited fill in the preview's custom lettering, then regenerated all copies. The masters have transparent backgrounds except the intentional opaque app/PWA icon backgrounds. Both native exports include the same bundled symbol.

The in-app browser could not reach the local development host, so live browser screenshot review is unverified; production HTTP checks passed separately. Physical launcher masks, native splash behavior, notification appearance, VoiceOver/TalkBack and installed native binaries have not been verified here. Existing APKs retain their old icon until rebuilt. Public uniqueness/trademark clearance remains the existing naming gate. No store upload, public deployment or release authorization occurred.

## Verification and closure attempt (2026-10-21)

Owner resumed Phase 60 for Android/web release verification. Base revision: `63057ff` (Phase 62 local iOS package). Intended commit subject: `fix(launch): repair web unused-icon imports and re-verify Android/web preflight` — **not** “record the verified Android and web release”. Phases 61–62 native/TestFlight/store status preserved as blocked. No deploy, store upload, tester contact, paid services, or production activation.

### Engineering defect repaired

Unused `IconText` imports left from the semantic-icon migration broke `pnpm --filter @daynori/web build` (`noUnusedLocals`). Removed from seven web files that still use `<Icon />`. Shared icon system and no-emoji chrome rule preserved; user-authored content untouched.

### Blocker classification (enabled Android/web core only)

| Category | Items | Status |
|---|---|---|
| Code defects fixable now | Unused `IconText` imports breaking web production build | **Fixed this session** |
| Physical-device / beta evidence | Phase 37 TalkBack/KeyStore/push/offline on hardware; Phase 38 private beta | **BLOCKED** — `adb devices` empty; no beta cohort |
| Owner credentials / infra / support / publication | Domains, monitored support, legal entity, Play account, release keystore, signed AAB + 16 KB evidence, public URLs, operator OA | **BLOCKED** — owner-controlled; not invented |

iOS is **not** required to finish Android/web launch. Optional modules (vault, rooms/chat, live AI, production billing, Drive, expenses) stay disabled.

### Candidate identity (local, not release-eligible)

| Field | Value |
|---|---|
| Git HEAD at verification | `63057ff` (+ pending IconText repair commit) |
| Manifest | `docs/release/manifest-0.1.0-provisional.json` — `releaseEligible=false` |
| Web | Production Next build after IconText repair |
| Android installable candidate | Debug APK `artifacts/release/app-debug-arm64.apk` SHA-256 `0379F71CB48C953C5020CB393BA49084507D1F37AFA06066622EB351C800A5B7` (debug-signed; **not** Play-eligible) |
| Signed AAB | **Absent** |
| Destinations | Provisional only — no purchased/verified public web host or Play listing |
| Support ownership | **Unassigned** |
| Costs | Not measured for production (no live infra) |
| Recovery | Forward-fix preferred per publication runbook |

### Commands and results

Environment: Windows, portable Node `v24.21.0`, pnpm `9.15.5`. No `adb` device.

| Command | Exit | Status |
|---|---|---|
| `pnpm icons:check` | 0 | PASS — 83 names; no UI emoji chrome |
| `pnpm release:android-path inspect` | 0 | PASS — target/compile SDK 36; signing guard present |
| `npx vitest run` phase59/60 + signing-guard unit tests | 0 | PASS — 4 files / 17 tests |
| `pnpm --filter @daynori/web build` (before repair) | 1 | FAIL — unused `IconText` |
| `pnpm --filter @daynori/web build` (after repair) | 0 | PASS |
| `pnpm validate:core` | 0 | PASS — notes/tasks/routines/journal/files/sync/export-gate/web-proxy deletion; optional modules 403 |
| `node scripts/phase60-web-production-smoke.mjs` | 0 | PASS; proxy deletion **UNEXECUTED** without `DAYNORI_API_URL` (covered by `validate:core`) |
| `node scripts/release-preflight.mjs --allow-partial-local` | 0 | PASS engineering; `releaseEligible=false`; **12 BLOCKED** + human OA |
| `DAYNORI_REHEARSAL_TARGET=disposable-local node scripts/phase60-local-rehearsal.mjs` | 0 | PASS; human authorization **BLOCKED** |
| `pnpm typecheck` / `pnpm lint` | 0 | PASS |
| `pnpm validate:planning` / `pnpm audit:secrets` | 0 | PASS |
| Physical device install / TalkBack / notifications / offline UI | — | **UNEXECUTED** (no device) |
| Store upload / live URLs / signed RC | — | **UNEXECUTED** |

### Publication decision — **NO-GO**

Local engineering and disposable rehearsal remain at runbook state **prepared** only. Do **not** submit to Play, publish web, or mark Phase 60 complete until:

1. Physical-device evidence (Phase 37) and private beta (Phase 38) for the enabled core.
2. Owner identity/domains/monitored support + release signing credentials.
3. Signed AAB with API 36 + 16 KB native evidence matching the candidate revision.
4. Explicit operator launch authorization for exact revision + artifact hashes.
5. Verified live smoke at intended Android + matching web destinations.

### Phase 63 readiness (observations needed — none fabricated)

After a real live release (Phase 60 acceptance), Phase 63 needs a dated operating window with privacy-safe: usage/support themes, crash/ANR and API error signals, reliability incidents, and measured operating cost — without inventing usage, incidents, feedback, or costs. **Not started**; prerequisite unmet.

### Handoff

Phase 60 remains **blocked**. Exact owner/device actions: attach Android → install debug APK for hardware QA; complete Phase 38; supply signing/domains/support; authorize publication when gates pass. Phases 61–62 remain pending native/TestFlight/store evidence. Stop before Phase 63.
