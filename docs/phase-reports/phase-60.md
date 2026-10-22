# Phase 60: Public Android and web release audit and testing preview

Current checkpoint (2026-10-22): the owner-authorized $0 web/API preview is live
and a verified standalone Android testing APK is published. Authenticated cloud
journeys, physical-phone verification and the full public/store release gates
remain incomplete. The historical local-only scope below was expanded by the
explicit free-preview authorization recorded in the later sections.

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

| Category                                          | Items                                                                                                                           | Status                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Code defects fixable now                          | Unused `IconText` imports breaking web production build                                                                         | **Fixed this session**                            |
| Physical-device / beta evidence                   | Phase 37 TalkBack/KeyStore/push/offline on hardware; Phase 38 private beta                                                      | **BLOCKED** — `adb devices` empty; no beta cohort |
| Owner credentials / infra / support / publication | Domains, monitored support, legal entity, Play account, release keystore, signed AAB + 16 KB evidence, public URLs, operator OA | **BLOCKED** — owner-controlled; not invented      |

iOS is **not** required to finish Android/web launch. Optional modules (vault, rooms/chat, live AI, production billing, Drive, expenses) stay disabled.

### Candidate identity (local, not release-eligible)

| Field                         | Value                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Git HEAD at verification      | `63057ff` (+ pending IconText repair commit)                                                                                                                       |
| Manifest                      | `docs/release/manifest-0.1.0-provisional.json` — `releaseEligible=false`                                                                                           |
| Web                           | Production Next build after IconText repair                                                                                                                        |
| Android installable candidate | Debug APK `artifacts/release/app-debug-arm64.apk` SHA-256 `0379F71CB48C953C5020CB393BA49084507D1F37AFA06066622EB351C800A5B7` (debug-signed; **not** Play-eligible) |
| Signed AAB                    | **Absent**                                                                                                                                                         |
| Destinations                  | Provisional only — no purchased/verified public web host or Play listing                                                                                           |
| Support ownership             | **Unassigned**                                                                                                                                                     |
| Costs                         | Not measured for production (no live infra)                                                                                                                        |
| Recovery                      | Forward-fix preferred per publication runbook                                                                                                                      |

### Commands and results

Environment: Windows, portable Node `v24.21.0`, pnpm `9.15.5`. No `adb` device.

| Command                                                                              | Exit | Status                                                                                              |
| ------------------------------------------------------------------------------------ | ---- | --------------------------------------------------------------------------------------------------- |
| `pnpm icons:check`                                                                   | 0    | PASS — 83 names; no UI emoji chrome                                                                 |
| `pnpm release:android-path inspect`                                                  | 0    | PASS — target/compile SDK 36; signing guard present                                                 |
| `npx vitest run` phase59/60 + signing-guard unit tests                               | 0    | PASS — 4 files / 17 tests                                                                           |
| `pnpm --filter @daynori/web build` (before repair)                                   | 1    | FAIL — unused `IconText`                                                                            |
| `pnpm --filter @daynori/web build` (after repair)                                    | 0    | PASS                                                                                                |
| `pnpm validate:core`                                                                 | 0    | PASS — notes/tasks/routines/journal/files/sync/export-gate/web-proxy deletion; optional modules 403 |
| `node scripts/phase60-web-production-smoke.mjs`                                      | 0    | PASS; proxy deletion **UNEXECUTED** without `DAYNORI_API_URL` (covered by `validate:core`)          |
| `node scripts/release-preflight.mjs --allow-partial-local`                           | 0    | PASS engineering; `releaseEligible=false`; **12 BLOCKED** + human OA                                |
| `DAYNORI_REHEARSAL_TARGET=disposable-local node scripts/phase60-local-rehearsal.mjs` | 0    | PASS; human authorization **BLOCKED**                                                               |
| `pnpm typecheck` / `pnpm lint`                                                       | 0    | PASS                                                                                                |
| `pnpm validate:planning` / `pnpm audit:secrets`                                      | 0    | PASS                                                                                                |
| Physical device install / TalkBack / notifications / offline UI                      | —    | **UNEXECUTED** (no device)                                                                          |
| Store upload / live URLs / signed RC                                                 | —    | **UNEXECUTED**                                                                                      |

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

Phase 60 remains **blocked**. Exact owner/device actions: attach Android → build a standalone test APK for hardware QA; complete Phase 38; supply signing/domains/support; authorize publication when gates pass. Phases 61–62 remain pending native/TestFlight/store evidence. Stop before Phase 63.

## Whole-project audit and Android testing preparation — 2026-10-21

Owner requested checking the entire project and hosting it for browser/Android
testing, then authorized choosing the best approach. This permits test-deployment
preparation; it is not a paid-service, store-submission or unrestricted public
launch approval. Phase 60 remains selected and **blocked**. Base revision:
`531e811`; iOS and Phase 63 status are preserved.

### Observed defects and repairs

- API `start`/`dev` ran library exports and did not listen. A separate process
  entry point now listens on `PORT`, handles shutdown, and retains authentication
  requirements. A real subprocess regression checks health and unauthenticated
  rejection.
- Mobile auth read server-only variables that Expo cannot inline; sync used
  `http://localhost:3000` without a bearer token. Public build configuration now
  validates service URLs and the native client resolves the secure adapter's
  token per request. Renewal/logout token changes are checked using synthetic
  requests.
- Mobile lacked a normal account entry point. Added provider-backed sign-in,
  account creation and recovery initiation. Workspace provisioning now causes
  the account-scoped repository/sync lifecycle to initialize. These are adapter
  and mounted-control checks, not live-provider or physical-device evidence.
- Global mobile quick-create invoked an empty callback and cleared its draft.
  It now commits typed notes/tasks/routines/journal entries and pending operations
  through the existing local sync transaction, waits for success, retains failed
  content and prevents duplicate concurrent submissions. File capture directs the
  user to Library rather than fabricating a saved binary. Pending records survive
  a repository close/reopen in the regression test.
- Native task/subtask quick-add now uses UUIDs accepted by server contracts;
  the Today header uses the current date. Account storage failures are visible.
- Account deletion rolled back with `permission denied for table ai_consents`.
  Append-only migration `00070` grants only DELETE under the existing forced
  own-user RLS policy. Own deletion and denied cross-account deletion pass.
- Missing-user item reads spent 5,828 ms evaluating membership against 307,250
  rejected synthetic rows. Restrictive read guards in migration `00071` retain
  existing membership policies and cache the row-independent identity check.
  Repeating the measured query returned zero records in 31.829 ms; workspace
  denial took 0.771 ms. This is a local query-plan comparison, not production
  capacity evidence.
- Historical tests used obsolete direct room/member creation, omitted current
  UGC acceptance, assumed an old PWA cache version, or exercised local-test
  feature flags while claiming production beta denial. Fixtures now follow the
  current contracts. Release barriers and negative authorization assertions
  remain enabled.
- Simulated restores processed suppression entries outside their own snapshot;
  a blob cleanup test erased the entire shared synthetic job queue; the lease
  benchmark could process unrelated queued provider work. Scope these fixtures
  to their own accounts, snapshot entries or task types. Preserve the original
  five-second timeouts and 75 ms lease budget.

### Commands, results and evidence

Host: Windows; portable Node `v24.21.0`, pnpm `9.15.5`. The default shell still
finds Node `v24.11.1`; commands below prepended
`.tools/node-v24.21.0-win-x64` to PATH. Sandbox runs initially failed on temporary
file renames, Next build directories and local service connections; meaningful
build/database/browser runs used the approved local execution path. No cloud
database or real-user fixtures were used.

- `node --env-file=.env node_modules/vitest/vitest.mjs run` (baseline): exit 1,
  86/99 files passed; 1,259 tests passed, 21 failed, 19 skipped. The failures
  included real deletion/wiring defects and stale fixtures.
- Same full command after the main repairs: exit 1, 105/107 files passed;
  1,315/1,317 tests passed. The two remaining failures were the unscoped restore
  and queue benchmark described above.
- `node --env-file=.env node_modules/vitest/vitest.mjs run
tests/security/tenant-isolation.test.ts
tests/integration/phase37-prerequisite-repairs.test.ts`: exit 0, 54/54 pass
  with unchanged timeouts after migration `00071` and restore isolation.
- `node --env-file=.env node_modules/vitest/vitest.mjs run
tests/integration/phase36-deletion-recovery.test.ts
tests/performance/performance.test.ts`: exit 0, 24/24 pass after the remaining
  fixture repairs; 75 ms lease gate retained.
- Final complete-suite command: exit 1, **106/107 files pass; 1,316/1,317 tests
  pass**, no skipped tests. The remaining failure is keyset-pagination **mean
  84.11 ms versus the unchanged <80 ms budget**. Its p95 <150 ms assertion passed.
  The worker lease benchmark passed in this final run. The performance suite
  passed on its preceding isolated run, so full-workload performance remains an
  unresolved gate rather than a claimed pass. Exact output:
  `artifacts/release/project-audit-complete-tests.log`.
- `pnpm build`: exit 0, all workspace packages, Next production app and Expo
  Android bundle built. `pnpm --filter @daynori/mobile build`: exit 0 after the
  final native storage-lifecycle edit. An Expo export is not an APK.
- `pnpm typecheck`: exit 0; `pnpm lint`: exit 0.
- After the final pending-save control lock, `pnpm --filter @daynori/mobile
typecheck` and `node node_modules/vitest/vitest.mjs run
apps/mobile/src/views/CreateSheet.test.ts apps/mobile/src/views/AccountSheet.test.ts`:
  exit 0, 3/3 mounted account/capture regressions pass.
- `pnpm validate:planning`, `pnpm audit:secrets` and `git diff --check`: exit 0.
- `pnpm test:e2e:web`: exit 0, 50/50 actual headless browser checks pass.
  Inspected the 320 px Today and desktop Library screenshots. This suite covers
  the documented responsive/interaction and synthetic API scenarios; it does not
  prove live email, cloud storage, notification delivery or phone behavior.
- `pnpm test:e2e:android`: exit 2, missing connected device/emulator and the
  runner's compiled native APK. No physical test evidence was fabricated.
- `pnpm audit:deps`: exit 1, two unapproved high advisories remain:
  [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv) and
  [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Their advisory
  pages list no patched version as checked 2026-10-21. Existing exception proposals
  remain unapproved; no suppression or approval was invented.
- `pnpm format:check`: exit 1, repository-wide pre-existing formatting debt
  (276 files before final fixture formatting). Changed source/docs were formatted
  separately; the whole repository was not reformatted.
- `node scripts/release-preflight.mjs --allow-partial-local`: exit 0 for partial
  engineering validation; **`releaseEligible=false`** and external gates remain.
- `docker info --format '{{.ServerVersion}}'`: exit 1, Linux daemon unavailable.
  Docker image builds are unexecuted and are not claimed as verified.

Local logs use `artifacts/release/project-audit-*.log` (Git-ignored). New browser
and performance snapshots are retained under `artifacts/local/project-audit/`
instead of replacing clean historical snapshots. Pre-existing mobile notification
and release-evidence edits remain outside this repair scope.

### Deployment and Android artifact findings

The provided `artifacts/release/app-debug-arm64.apk` is 56,991,982 bytes, SHA-256
`0379F71CB48C953C5020CB393BA49084507D1F37AFA06066622EB351C800A5B7`.
ZIP inspection found the Expo development launcher bundle and **no application
`assets/index.android.bundle`**. This is not a standalone phone-testing download
and predates the current repairs.

Added [container targets](../../infra/deployment/Dockerfile),
[deployment instructions](../../infra/deployment/README.md), and an internal
[Expo preview APK profile](../../apps/mobile/eas.json) with
`developmentClient: false`. Render plus Supabase is the proposed fit for the
existing Node services; no adapter migration, paid plan or service provisioning
has been performed. Available Render/Supabase integrations were offered; neither
account connection is confirmed.

**Still required:** connected test hosting/auth/database accounts; a live storage
adapter and malware scanner (production defaults fail closed); verified worker
storage cleanup/push providers; an APK built against the actual hosted URL and
installed with Metro stopped on a physical phone. The worker's
`createConfiguredStorageService()` also currently returns `undefined`, so bucket
credentials alone do not establish file cleanup functionality. Optional vault,
Drive, rooms/chat, AI and billing retain their independent release gates.

No web URL or new downloadable APK exists from this audit. Phase 60 is not
complete. No completion commit is made while its acceptance/release gates remain
unmet; changes remain reviewable locally. See [ADR 0061](../decisions/0061-preview-runtime-and-account-cleanup.md)
for the bounded runtime, cleanup and RLS decisions. Continue Phase 60 only; stop
before Phase 63.

## Remaining provider implementation continuation — 2026-10-21

Owner asked to implement the remaining prerequisites and request account actions
in tabs. Scope remains Phase 60 preview preparation; no store submission or
paid provisioning is inferred. Base revision remains `531e811` and the existing
unrelated notification, web-session and release-evidence edits are preserved.

### Implemented behavior

- Supabase private-object HTTP transport is shared by API and worker through
  an explicit server-only API export. It bounds bytes/time, disables redirects,
  enforces non-overwrite writes and suppresses provider details in errors.
- The production API wires durable HMAC transfer capabilities to current actor,
  path, operation, expiry, declared bytes, membership/workspace state, deletion
  suppression and the persisted reservation or verified file. Capabilities
  survive replica restart. A reservation lock fences provider writes against
  cancellation/finalization. Browser transfers use the exact configured CORS
  origin, raw byte parsing, and noncached private downloads.
- Migration `00073` denies direct authenticated `private_assets` operations so
  Storage cannot bypass API quota/quarantine checks. Service-role credentials
  remain server-only. Migration `00072` adds the matching live-item cursor index;
  existing latency budgets are unchanged.
- Private-network ClamAV INSTREAM transport rejects errors, truncation and
  unknown responses. API and worker bootstrap configure the scanner. Missing
  scanner/storage or object bytes cannot produce a clean result.
- Worker storage cleanup now performs real provider deletion and keeps failures
  retryable. Physical deletion does not subtract quota already released by the
  API transaction. Scan updates target current tables and cannot revive deleted
  file records or cancelled reservations.
- Diff review also removed precommit physical deletion from the API. The
  rollback regression proves file bytes remain readable after a failed delete
  transaction, then verifies cleanup retries leave already-released quota alone.
- Native FCM HTTP v1 delivery uses a signed short-lived OAuth assertion and a
  cached access token. Explicit Expo Push transport is also supported; statuses
  represent provider acceptance, never proven device display. Expired-token
  responses feed the existing durable invalidation/retry path.
- Migration `00074` creates a separate NOLOGIN application-worker role with
  explicit application DML/RLS policies and no database administration, schema
  creation or migration writes. API runtime cannot assume it. Production worker
  configuration requires separate service credentials; operator activation and
  cloud credential rotation remain pending.
- Container targets now package server production dependencies separately from
  mobile/build tooling. A local packaged API import succeeds. Docker's Linux
  daemon is still unavailable, so no image-build success is claimed.
- A manual GitHub Android-preview workflow checks hosted HTTPS/public-key
  inputs, builds an ARM64 APK with explicit test-only signing and embedded JS,
  checks its signature and uploads checksum/download artifacts for seven days.
  This workflow has not run remotely. Dynamic Expo config supports an ignored
  Firebase Android client file and an Expo project ID; it preserves existing
  app.json settings. Android client config and server service-account keys are
  distinct. No provider configuration has been committed.

See [ADR 0062](../decisions/0062-durable-preview-provider-boundaries.md) and the
[variable template](../../infra/deployment/preview.env.example).

### Executed validation

Commands used portable Node `v24.21.0` and pnpm `9.15.5`. Database data and
transport fixtures are synthetic. Logs are ignored under `artifacts/release/`.

- `node --env-file=.env node_modules/vitest/vitest.mjs run`: exit 0, **111/111
  files and 1,331/1,331 tests pass**, 240.53 seconds. This resolves the previous
  pagination failure. Budgets were not relaxed.
- `node --env-file=.env node_modules/vitest/vitest.mjs run
tests/integration/worker-service-role.test.ts
tests/integration/live-storage-capabilities.test.ts
tests/integration/phase25-repairs.test.ts
tests/unit/android-preview-config.test.ts apps/api/src/providers
apps/worker/src/providers`: exit 0, **32/32 tests**. Includes real PostgreSQL
  upload/inspection/scan/download state, size/overwrite rejection, deleted-file
  denial, upload/cancellation serialization, worker-role isolation, ClamAV socket
  framing/errors and signed FCM credential exchange. A CORS regression was added
  afterward and is included in the final full-suite run recorded below.
- Final `node --env-file=.env node_modules/vitest/vitest.mjs run`: **exit 0,
  113/113 files, 1,336/1,336 tests**, 242.31 seconds. This includes the worker
  service-role tests, Android configuration gate and the CORS regression.
- After the final diff review, `node --env-file=.env
node_modules/vitest/vitest.mjs run
tests/integration/live-storage-capabilities.test.ts
tests/integration/phase24-binary-upload.test.ts`: **exit 0, 14/14 tests**,
  6.61 seconds. This adds deletion rollback/retry evidence after removing
  precommit provider deletion. The complete suite above preceded this bounded
  final repair; the affected lifecycle suites were rerun afterward.
- `pnpm build`: exit 0, including Next.js production, API/worker compilation and
  Expo Android Hermes export. This export is not an APK.
- `pnpm typecheck` and `pnpm lint`: exit 0 across the workspace.
- `pnpm --filter @daynori/api deploy --prod artifacts/local/packaged-api`: exit 0;
  importing the packaged API and its production dependencies also succeeds.
  Offline dependency installation first lacked a cached tarball; normal install
  from the official npm registry restored the workspace. Lockfile dependency
  change is limited to the new worker-to-API workspace dependency.
- `pnpm --filter @daynori/worker deploy --prod artifacts/local/packaged-worker`:
  exit 0; the packaged worker imports its shared provider dependency successfully.
- `pnpm --filter @daynori/mobile exec expo config --type public`: exit 0. A Node
  assertion smoke also confirms optional native push config preserves the base
  package, plugins and app metadata.
- `node scripts/scan-secrets.mjs`: exit 0, 6,208 files. No real credentials added.
- `node scripts/validate-planning.mjs`: exit 0, 64 phases, 22 requirements and
  296 Markdown files at that check.
- `pnpm audit:deps`: **exit 1**. The same two HIGH toolchain advisories remain:
  `node-forge` GHSA-86w9-cpqp-85rv and `braces` GHSA-vfj7-8cjw-p6xm. The refreshed
  registry report lists no patched versions. No exceptions were fabricated.

### Real account actions and remaining boundary

The owner signed into the opened Render and Supabase tabs. The free Supabase
organization **Daynori Preview** was created. The `daynori-preview` project form
is prepared for Singapore with Data API disabled. Project creation has not been
submitted: new database password entry/submission is handed to the owner under
browser credential-entry rules. The owner was asked to keep the password private.

The existing GitHub repository is visible to Render. A separate
`daynori-web-preview` service form is prepared with the free plan, Singapore,
filtered workspace build and Next.js start commands. It has not been deployed.
No existing Render service was modified. Browser access is confirmed;
Render/Supabase plugins themselves remain unconnected.

The hosting budget question is pending. Free web services sleep and cannot
establish reliable background jobs or sufficiently provisioned ClamAV scanning.
Do not silently create paid worker/scanner services. The owner must finish the
Supabase project step before cloud migration/role activation and auth/storage
configuration can be verified.

Still required: actual cloud setup and provider smoke; native Firebase/Expo
configuration and signed internal APK build against those verified origins;
phone installation and cold-launch/sync/notification checks; dependency gate
resolution and the remaining public release evidence. Optional vault, rooms,
Drive, AI and billing gates remain unchanged. There is **no live web URL or new
APK download link** from this continuation. Phase 60 remains incomplete and
there is no completion commit or production/store publication.

### Free core preview selection and preparation — 2026-10-21

The owner selected **$0 only** and confirmed creation of `daynori-preview` in the
free `Daynori Preview` Supabase organization. Browser evidence shows Healthy,
Singapore, Nano Free, with the IPv4 session pooler available. Data API was left
disabled. This supersedes the project-creation and budget prerequisites above.
Render billing inspection shows no card on file, available service quota and
free hours; no existing service or payment setting was changed.

Implemented [ADR 0063](../decisions/0063-free-core-testing-preview.md): explicit
core-preview API barriers, visible web/mobile limitations, disabled upload/audio
controls, and 75-second API client deadlines for free-service wake-up. The
GitHub preview workflow embeds this profile. The worker and scanner are not
deployed; background physical erasure, file processing and reminder delivery
remain unavailable/unverified. Use sample content.

`scripts/provision-free-preview.ts` targets only the new project with verified
TLS. It reads the owner's replacement DB password from an ignored local file,
generates a separate runtime credential, and secures roles inside each immutable
migration transaction before commit. Unused billing/worker logins stay disabled.
No historical migration checksum was rewritten. Cloud execution is pending the
private input; the old password posted in chat was not used or stored.

Validation uses Node `v24.21.0`, pnpm `9.15.5`, and the local synthetic DB:

- `pnpm typecheck`: exit 0; `pnpm lint`: exit 0.
- `NEXT_PUBLIC_DAYNORI_CORE_PREVIEW=true EXPO_PUBLIC_DAYNORI_CORE_PREVIEW=true pnpm build`
  (PowerShell environment assignments): exit 0 across the workspace, including
  Next.js production and Android Hermes export. This preceded the final bounded
  API deadline adjustment, which requires affected builds to be rerun.
- `node --env-file=.env node_modules/vitest/vitest.mjs run tests/unit/core-preview.test.ts tests/integration/preview-migration-safety.test.ts tests/integration/api-startup.test.ts apps/mobile/src/views/CreateSheet.test.ts`:
  first sandbox run could not write Vitest's temporary cache. Outside the sandbox,
  5/6 tests passed and API startup timed out during simultaneous compiler work.
  `node --env-file=.env node_modules/vitest/vitest.mjs run tests/integration/api-startup.test.ts`
  rerun alone: exit 0, 1/1 passes in 1.89 seconds. Safeguard rollback, role limits,
  direct API feature denials and quick-capture tests pass. No timeout budget was
  relaxed in that test. Logs: `artifacts/release/free-preview-*.log` (ignored).

GitHub push access check found no authenticated credential. A device authorization
tab is handed to the owner; broad CLI repository/workflow permissions require
their confirmation. No branch was pushed and no workflow was dispatched. The
Render web form is still unsubmitted. There is no verified live web URL or APK
download link yet; public release, phone and dependency gates remain unchanged.

### Final free-preview checks and remaining blockers

The final diff review found that both deletion dialogs ignored a `processing`
response and announced full erasure. Web and mobile now distinguish pending
cleanup from completion, reject unsuccessful/unexpected statuses, and avoid
unverified immediate-erasure fallback copy. The core API disclosure explicitly
states that Auth-provider cleanup needs an operator. The private API env output
includes the public Auth URL/key and a separate generated reauthentication secret;
without the Auth URL, password verification would incorrectly target localhost.
The free API skips storage initialization even with the Auth origin configured.
The provision command also verifies an actual least-privilege runtime connection
before writing service configuration; cloud execution is still pending.

- Final complete run, `node --env-file=.env node_modules/vitest/vitest.mjs run`:
  **exit 1, 1,337 passed / 3 failed, 115 files, 252.66 seconds**. This supersedes
  any inference that the earlier 1,336-test pass verifies the current tree. One
  failure was the added property in mobile runtime configuration; that public
  return contract is restored, with the timeout exported separately. Two were
  performance budgets: pagination mean 81.21 ms versus <80 ms; concurrent-read
  p95 341.91 ms versus <300 ms. Budgets were not relaxed.
- `node --env-file=.env node_modules/vitest/vitest.mjs run tests/performance/performance.test.ts`
  with the local preview stopped: **exit 1, 3/4 pass**, 10.24 seconds. Concurrent
  reads now pass, but pagination mean remains **80.67 ms versus <80 ms**. This
  remains an open performance gate, not a successful full suite.
- `node --env-file=.env node_modules/vitest/vitest.mjs run apps/mobile/src/views/AccountDeletionResult.test.ts tests/unit/core-preview.test.ts apps/mobile/src/config/runtime.test.ts tests/integration/phase36-deletion-recovery.test.ts tests/integration/preview-migration-safety.test.ts`:
  **exit 0, 33/33 tests across 5 files**, 18.46 seconds. Includes pending,
  completed, unsuccessful and unexpected deletion statuses. Initial test import
  and literal-typing problems were corrected; tests consume the UI public export.
- Final free-profile `pnpm build`: **exit 0**, including API, Next.js production,
  shared UI packages and Android Hermes export. Log:
  `artifacts/release/free-preview-closure-build.log`. This is not an APK.
- `pnpm lint`: **exit 0**. Workspace typecheck passed all packages except the new
  regression test's inferred literal type; after correction,
  `pnpm --filter @daynori/mobile typecheck`: **exit 0**. The provision script also
  passes explicit strict TypeScript checking. No app type error remains known.
- Built local web browser check: preview notice visible; Upload File and Record
  Audio disabled; Create menu omits Upload. Screenshot:
  `artifacts/local/free-core-library-preview.png` (ignored). This is not hosted
  Supabase/Render QA. The local server and inspection tabs were closed afterward.

The owner's private password input is still empty. GitHub's first authorization
code expired without approval; authentication must be refreshed for the owner.
No schema command, source push, Render deployment or APK workflow was executed.
No paid resources were provisioned. The dependency findings, remaining timing
gate and physical-device/public-release evidence keep Phase 60 incomplete; no
phase completion commit is made. Phases 61–62 and Phase 63 are unchanged.

Final planning validation: exit 0, 64 phases / 22 mapped requirements / 297
Markdown files. Final secret scan: exit 0, 6,253 files and no unapproved secrets.
`git diff --check`: exit 0; index remains empty. The expired GitHub device flow
was refreshed into a new authorization tab for the owner; no permission was
granted by the agent. Render/Supabase/GitHub tabs are retained as handoffs.

### Owner-directed deployment continuation

The owner asked the agent to perform the remaining setup and confirmed GitHub
authorization. The original device code had expired; the renewed permission
flow reached GitHub's two-factor verification, which the owner completed.
`gh auth status` confirms `mkamrul9` with keyring storage and repository/workflow
scopes. Bringing the calling chat/Browser panel into view succeeded. The Supabase integration is available but unconnected, and the ignored
password input is still empty; the database password is not recoverable from
the project dashboard. No password from chat was used, and no password reset was
performed by the agent.

The repository is publicly visible. A dedicated `codex/android-preview-build`
push trigger is added because manual dispatch requires a workflow on the default
branch, which still predates this app. It can run the guarded APK build after
the real API URL is verified, without merging unfinished work into `main`.
The requested deployment requires a reviewed preview source checkpoint; that
checkpoint is not a phase completion or public-release approval. Unrelated
notification formatting and generated evidence edits remain outside that source
checkpoint. Hosting, schema application and APK output remain unexecuted.

A 24-hour project-only Supabase setup-token form is prepared for
`daynori-preview`. Automatic approval review rejected selecting database
read-write access without approval of the exact scope/recipient. The owner was
asked to authorize database and Auth-configuration setup access kept privately
on this PC. No token exists yet, no broader account access was selected, and no
database password was reset. This is an access prerequisite, not a code failure.

### Managed preview database continuation — 2026-10-22

The owner resumed the deployment work and created the equivalent replacement
24-hour project-only token. The generated credential was copied by the owner;
the agent saved that exact token from the tab clipboard to an ignored local file
without displaying it. No password was recovered/reset and the token was not
sent to GitHub/Render.

The Management API accepts bound values but rejects parameterized multi-statement
queries. The dedicated runner therefore commits immutable migrations and a
NOLOGIN safeguard together, and activates only runtime via a temporary restricted
SECURITY INVOKER function using a bound value, then removes that function.

Actual cloud execution initially stopped at 00007: managed Storage denies CREATE
in its schema. ADR 0064 records the core-only adapter: use existing managed tables,
preserve ownership and enabled RLS, apply identity helpers/policies/grants, create
no bucket. 00069's local fixture-login operation also requires an adaptation:
billing remains NOLOGIN/PASSWORD NULL. Both source and execution hashes are
recorded atomically in app.preview_migration_adaptations. The ordinary migrator
refuses this history pending explicit promotion.

The initial runtime connection correctly failed certificate validation with
SELF_SIGNED_CERT_IN_CHAIN. The public CA was downloaded from the link in this
project's Database Settings. With the CA explicitly trusted, the actual restricted
pooler login passed certificate/hostname checks and privilege checks (no superuser,
role/database creation, RLS bypass, app schema CREATE or worker membership).

`node --import tsx scripts/provision-free-preview-management.ts`: final exit 0,
74 migration receipts verified; restricted TLS login passed; ignored API env file
created. Failed attempts rolled back their migration transaction; no fixture
credential became a committed active cloud login. Logs:
`artifacts/release/managed-cloud-schema.log` (initial permission failure),
`artifacts/release/managed-cloud-schema-resume.log` (final success).

Initial local safeguard check:
`node --env-file=.env node_modules/vitest/vitest.mjs run tests/integration/management-preview-safety.test.ts tests/integration/preview-migration-safety.test.ts`:
exit 0, 5/5 tests, 2 files, 2.99s. Additional managed-policy/redaction tests are
included in the final checkpoint checks. Hosted web/API and APK remain pending;
physical-device, dependency/performance and public-release gates remain open.

Final checkpoint checks on 2026-10-22: the combined five-file focused run had
14 passing tests and one API-startup readiness timeout (14.22s overall). Its
isolated rerun passed (1/1, 2.09s); no application runtime code was changed to
relax the check. Strict provisioning TypeScript, changed-file ESLint (scripts are
excluded by repository lint configuration), planning
validation (64 phases, 22 requirements, 298 Markdown files), secret scanning
(6,274 files), formatting and diff checks passed. The final idempotent managed
runner rerun initially hit pooler authentication error 28P01 after redundantly
resetting an active SCRAM verifier. The runner now preserves active verifiers on
retries; the next verification result is recorded separately.

After that retry repair, the same managed setup command exited 0 and again
verified all 74 receipts, adaptation hashes and the restricted TLS login.

The preview source checkpoint is authorized to support deployment; it does not
complete Phase 60 or resolve the previously documented release blockers.

### Authorized free hosting — 2026-10-22

Owner approved both free previews and sending only the restricted app database
password and reauthentication signing secret to the API service's server env.
The setup token/administrator password were not sent. New API service:
`srv-dbcqb4psrm7s73bls8h0`, Singapore Free. The existing web service
`srv-dbcfm9ei0phs73a857ag` had failed on old main `9177502`; it was reused and
switched to reviewed source checkpoint `cbac95a` on codex/free-core-preview.
Other Render services were not changed. Build commands explicitly install dev
build tools with `--prod=false`; the API loads the public CA before Node starts.

Actual HTTPS checks returned 200 for API `/v1/health`, API `/v1/ready`, and web
`/api/health`. URLs:
https://daynori-api-preview.onrender.com and
https://daynori-web-preview.onrender.com. Browser verification confirms the final
web build's free-preview limitations notice. This is endpoint/UI evidence, not
yet an authenticated cross-device smoke pass.

Scoped Management API Auth reads succeeded but configuration PATCH returned 403.
The owner's existing dashboard session saved only the live Site URL and exact
web `/api/auth/callback` and `daynori://auth` return allowlist instead. Read-back
verified those values and `mailer_autoconfirm=false` (email verification retained).

GitHub received only public mobile connection inputs and the publishable client
key. Pushing reviewed source to codex/android-preview-build started standalone
APK workflow [39731382027](https://github.com/mkamrul9/dayNori/actions/runs/39731382027).
Its build is not yet a verified downloadable artifact at this checkpoint.

Live browser QA found the auth panel's uncompiled Tailwind class strings left
it unstyled at the bottom of the page. Replace that isolated panel with existing
themed Dialog, Button, TextField and Feedback primitives, preserving provider
actions and adopting the Dialog's focus containment/restore. Remove an unsupported
"zero credential leakage" guarantee. Validate the web update before redeployment.
Signed-in synthetic journeys and Android installation remain pending.

Auth panel repair validation: `pnpm --filter @daynori/web typecheck`,
`node node_modules/eslint/bin/eslint.js apps/web/src/components/AuthModal.tsx`,
and `NEXT_PUBLIC_DAYNORI_CORE_PREVIEW=true pnpm --filter @daynori/web build`
passed (exit 0). Build log: `artifacts/release/hosted-auth-dialog-build.log`.

The repaired web dialog was verified on the actual HTTPS site with a centered,
themed account form and visible preview notice. The owner was asked to create
and verify their own test account directly; no password is requested in chat.

Android workflow 39731382027 failed during Gradle configuration: the fresh Expo
template defines no signingConfigs.release, which the task-graph guard accessed.
No candidate APK was produced. Repair creates and attaches an empty release
configuration before Android variant setup; task-graph authorization still
refuses packaging without complete signing credentials or explicit test flag.
The workflow now actually exercises refusal with the flag false before test-only
assembly. Existing signing/config checks pass: 5/5 tests, 2 files, 804ms; log
`artifacts/release/android-signing-repair-tests.log`. Cloud rerun remains the
authoritative native-build check. API/web health and exact Auth callbacks remain
verified; physical Android and other release gates remain open.

The second cloud attempt (39732787451) passed the actual unauthorized-release
refusal check but test assembly failed because AGP finalizes signing properties
before task-graph readiness (`It is too late to set storeFilePath`). Resolve
signing values during project evaluation and retain only refusal at graph time;
ADR 0056 records the lifecycle correction. Upgrade existing guard blocks in place
without removing later native additions. Regression checks now pass 7/7 across
two files (486ms), including idempotent upgrades and malformed-guard refusal.

Independent cloud evidence while owner account verification is pending:
`node artifacts/local/hosted-core-smoke.mjs` passed seven page routes, API readiness
and unauthenticated preferences rejection (401). `node --import tsx
artifacts/local/cloud-tenant-smoke.ts` passed two synthetic workspace bootstraps,
own item-metadata read, foreign read/update denial, forged-workspace denial and
unscoped-read denial using the restricted TLS runtime login. The entire synthetic
transaction rolled back; no accounts or content were retained. These checks do
not substitute for provider-authenticated browser/mobile sync evidence. Outputs:
`artifacts/release/hosted-core-routing-smoke.json` and
`artifacts/release/cloud-tenant-smoke.json`.

Third Android attempt (39733914544) passed native signing setup but stopped at
`:app:createBundleReleaseJsAndAssets` because `expo-asset` was not a direct mobile
dependency. Add `expo-asset ~11.0.5`, the version specified by this installed
Expo SDK's bundledNativeModules.json. The native embedded-bundle command then
passed locally with the real public preview configuration: 975 modules bundled
in 29.417s, 84 asset files copied. An initial local probe used a relative entry
path against Metro's workspace root and failed; the corrected absolute application
entry passed. No server credential was embedded. Log:
`artifacts/release/android-embedded-bundle-check.log`. Native cloud assembly still
must complete before an APK download is published.

## Standalone Android download published (2026-10-22)

This continues the owner's explicit $0 web/Android testing authorization. It is
a preview checkpoint, not phase completion or Play/store publication. Built source:
`840f1477f50ecc14b1454fc24360578f2cb0878c`; default branch remains unchanged.

The fourth [native workflow run 39734872562](https://github.com/mkamrul9/dayNori/actions/runs/39734872562)
passed. It exercised unsigned-release refusal, assembled an ARM64 APK with
explicit test signing, checked its embedded bundle and signature, and uploaded
the APK plus SHA256SUMS. The artifact download completed despite a stalled client
status and a subsequent browser-download timeout; those client failures did not
indicate an APK build failure.

Published destinations:

- [Web app](https://daynori-web-preview.onrender.com).
- [Android APK](https://github.com/mkamrul9/dayNori/releases/download/preview-2026-10-22/daynori-preview-arm64.apk).
- [Testing prerelease and checksum](https://github.com/mkamrul9/dayNori/releases/tag/preview-2026-10-22).

Verification commands and results, Windows with portable Node 24.21.0:

- `gh run download 39734872562 --repo mkamrul9/dayNori --name daynori-standalone-preview-arm64 --dir artifacts/local/android-preview-39734872562` — exit 0, APK and checksum downloaded.
- `python artifacts/local/verify-preview-apk.py artifacts/local/android-preview-39734872562/daynori-preview-arm64.apk` — exit 0; ZIP integrity, SHA-256, embedded bundle (2,263,632 bytes), hosted API/Auth origins and known server/setup credential absence passed.
- Android SDK 35.0.0 `apksigner.bat verify --verbose --print-certs <downloaded-apk>` — exit 0; APK v2 signature, one explicit Android Debug test signer.
- Android SDK 35.0.0 `aapt.exe dump badging <downloaded-apk>` — exit 0; `com.daynori.app`, version 0.1.0 (1), minimum SDK 24, target SDK 36, `arm64-v8a`.
- `gh release create preview-2026-10-22 <apk> <SHA256SUMS> --repo mkamrul9/dayNori --target 840f1477f50ecc14b1454fc24360578f2cb0878c --prerelease --title 'Daynori Android testing preview' --notes-file artifacts/local/android-preview-release-notes.md` — exit 0; existing release list was empty before creation.
- Unauthenticated HTTPS fetch of the actual published APK URL with `Range: bytes=0-31` — HTTP 206, 32 bytes, total size 34,326,704 bytes; checksum URL HTTP 200 and matching digest. GitHub release asset digest independently matches the downloaded APK.
- `adb devices -l` — exit 0, no connected device. Installation/launch on hardware remains unexecuted.

APK SHA-256:
`b102674448337eb2b9ccde2f4d5653b022bc837ae9edd212ade52c5a47da1441`.
Evidence: [APK verification](../../artifacts/release/android-preview-apk-verification.json),
[publication/metadata](../../artifacts/release/android-preview-publication.json),
and [local embedded-config check](../../artifacts/release/android-embedded-config-check.json).

Account creation remains the owner's step: enter a new password directly in the
app/site and confirm the email. No account was created through admin bypass or
with invented personal credentials. Therefore provider-authenticated workspace
creation, cloud content saving, restart/reconnect and cross-device sync are
explicitly unverified. The synthetic database tenant probe is separate evidence.

Install/test steps are in the [deployment handoff](../../infra/deployment/README.md).
Uploads, audio attachments and reminder delivery remain disabled on the $0
profile; worker/scanner and optional modules are not activated. Free hosting can
sleep. Use sample data; full background account erasure remains unverified.
Two HIGH toolchain dependency advisories and the previously recorded keyset mean
latency finding remain open. Physical accessibility/KeyStore, beta, operator,
production signing/AAB and public/store release gates remain open.

Phase 60 stays `blocked` / incomplete, `releaseEligible=false`; phases 61–62 are
unchanged and Phase 63 is not started. Intended metadata checkpoint:
`docs(preview): record live web and Android test downloads`.

Final hosting recheck: the 45-second anonymous routing probe exited 1 because
web `/` and API readiness timed out while the Free services woke. Six later page
requests returned 200 and the anonymous preferences request returned 401. A
subsequent warm check with a 75-second deadline exited 0: web home, web health,
API health and API readiness all returned 200 in 128–297ms. This documents a
cold-start limitation, not a latency guarantee. Evidence:
[final health](../../artifacts/release/hosted-preview-final-health.json).

Metadata validation: `node scripts/validate-planning.mjs` — exit 0 (64 phases,
22 mapped requirements, 298 Markdown files); `node scripts/scan-secrets.mjs` —
exit 0 (6,399 files). Changed documentation/JSON were formatted with the pinned
Prettier CLI. No application source changed in this metadata checkpoint; prior
native build and focused tests remain the implementation evidence. Diff and
staged paths are reviewed before the checkpoint commit; unrelated local edits
are preserved.

## Mobile PWA usability and functional repair (2026-10-22)

Owner-selected preview work on `codex/free-core-preview`. Goal: installable Android
Chrome PWA that beginners can operate. Phase 31 onboarding reused (not replaced).
Phases 61–62 unchanged. Phase 60 remains **blocked** for full public/store release.

### Delivered

- Shared mobile layout tokens/CSS (`daynori-page`, bottom-nav safe-area padding,
  dialog `dvh` sheet on narrow screens, text wrapping utilities).
- Compact preview notice with accessible Details (ADR 0065).
- Beginner tutorial copy/layout: Today/Plan/Library/Journal, task vs routine,
  save-then-sync, opt-in samples, optional phone install tip; Skip/Back/Next;
  semantic interest icons (no emoji chrome).
- Optional practice **Write note** / **Add task** (deterministic practice ids;
  distinct from labeled Sample starters; skipped on replay).
- Help: searchable how-tos + replay entry; Settings replay label simplified.
- Service-worker Update/Later banner (SKIP_WAITING); cache version `v5`; private
  cache boundaries preserved. Manifest `start_url` `/today`.
- One-shot Chrome Install / Not now banner (`beforeinstallprompt`); no repeat after
  dismiss or standalone.
- Narrow-safe grids: Library/Settings/Review no longer use fixed `minmax(280px)` /
  `minWidth: 320` dialog traps; Today shortcut href `/today`.
- Today header actions shortened; duplicate bottom-nav shortcuts hidden on mobile.

### Commands

| Command | Exit | Notes |
|---|---|---|
| `pnpm exec vitest run tests/unit/mobile-pwa-usability.test.ts` | 0 | 7 tests |
| `pnpm exec vitest run tests/integration/phase31-onboarding.test.ts` | 0 | skip/resume/replay intact |
| `pnpm --filter @daynori/domain build` + `@daynori/ui-web` + `@daynori/web build` | 0 | |
| `pnpm icons:check` | 0 | |
| `pnpm validate:planning` / `pnpm audit:secrets` | 0 | |
| `node scripts/capture-pwa-usability-shots.mjs http://127.0.0.1:3010` | 0 | 30 PNGs at 320/360/390/412/768 (emulation) |

### Functionally verified (local / automated)

- Onboarding domain invariants, preferences skip/complete/replay (phase 31 suite).
- Web production build; public legal pages smoke.
- Preview feature gates unchanged (uploads/audio/reminders off).
- Headless Chromium layout shots for Today/Plan/Library/Journal/Help/Settings
  (unauthenticated shell; not physical phone).

### Not verified / remaining

- Physical Android Chrome installed-PWA session (owner device).
- Authenticated create→save→reopen on live preview (needs owner login/email confirm
  in a browser tab — do not send passwords in chat).
- After push: confirm Render serves `manifest.start_url=/today` and SW `v5`.
- Full Phase 60 live release gates.

Live preview: https://daynori-web-preview.onrender.com
Install: Chrome menu → **Install app** / **Add to Home screen** (or the in-app Install
banner when Chrome offers it). API: https://daynori-api-preview.onrender.com
Budget remains $0 Free only.

## Everyday PWA reliability follow-up (2026-10-22, HEAD after 6a9cff7)

Owner request: simpler Library, progressive disclosure, persistent login, safe updates,
honest offline reopen, Help/Support, and Rooms/chat feasibility — without inventing
paid infra or store release.

### Delivered

- Library default chrome: Search + Write note + New folder; filters/uploads/saved views /
  storage under **More tools**; Clear filters chip; Demo Journeys removed from ordinary UI.
- Menu: Everyday vs More; Help & tutorial + Support links; Component Gallery demoted.
- Stacked Install/Update banners (`AppStatusBanners`); Update refused while
  `data-daynori-unsaved`; no unconditional dirty reload (ADR 0066). SW cache `v6`.
- Session: network/cold-start failures no longer clear auth UI; refresh single-flight;
  httpOnly cookie refresh (30d) unchanged.
- Improved public `offline.html` (honest cold-offline limits; private SW cache unchanged).
- Settings: Rooms/chat/AI/billing shown as unavailable on core preview (not broken panels).
- Support page: self-serve + troubleshooting; no invented inbox.

### Commands (this follow-up)

Recorded in commit message / CI of this revision:

| Command | Expected |
|---|---|
| `pnpm exec vitest run tests/unit/pwa-session-and-banners.test.ts tests/unit/mobile-pwa-usability.test.ts` | PASS |
| `pnpm exec vitest run tests/integration/phase31-onboarding.test.ts` | PASS |
| `pnpm --filter @daynori/web build` | PASS |
| `pnpm validate:planning` / `pnpm audit:secrets` | PASS |

### Rooms / chat

**Blocked on free hosted preview.** Implementation exists (Phases 51–54) but
`isRoomsLocallyEnabled` is always false in production; `DAYNORI_ROOMS_LOCAL_ENABLED`
cannot unlock production. Enabling private chat for kamrul@/shahrin@ needs an explicit
owner-reviewed preview capability (not the local flag), moderation ownership, and
acceptance that free Render sleep breaks realtime reliability. Not enabled in this commit.

### Accounts

Identifiers `kamrul@daynori.com` and `shahrin@daynori.com` are dummy login emails —
not verified mailboxes; password recovery by email may fail. Agent cannot complete
human password entry. Owner must sign in in a browser tab for create→save→reopen and
cross-account isolation evidence.

### Remaining

- Physical Android installed-PWA session.
- Two-account authenticated durable save on live preview (owner login).
- Full offline cold-reopen organizer shell (ADR 0066 tracks gap).
- Phase 60 public/store gates.
