# Cursor continuation prompt — finish Phase 80

Continue the existing Phase 80 repair work in this checkout. Finish implementation and genuine verification; do not restart from the original implementation commit or discard the current working tree.

## Checkout and boundaries

- Workspace: `D:\SWE\UNIQUE WORK\dailyLIfe`.
- Expected branch: `codex/free-core-preview`.
- Expected HEAD: `591031ed87d10763349a0ab6d868967e22caf729`. Verify the actual state first.
- There are substantial **uncommitted** repairs, including new untracked source files. No follow-up commit or push has been made.
- Work only on Phase 80. Keep Phases 71, 75, and 99 gates unchanged. Do not start Phase 81, waive checks, or amend dependencies. Phase 81 still depends on both 80 and blocked 75.
- Read `AGENTS.md`, `README.md`, `docs/roadmap/README.md`, `CONTRIBUTING.md`, `docs/engineering/handoff.md`, the Phase 80 specification/report, ADR 0080, `docs/roadmap/v2/guided-tours.md`, and `docs/engineering/tour-authoring.md` before editing. Existing reports predate much of this WIP and need reconciliation.
- Use `.tools\node-v24.21.0-win-x64\node.exe` and pinned pnpm tooling.
- Preserve unrelated Phase 71/77 artifacts and existing Android fingerprints. In particular, do not stage or overwrite the unrelated tracked modifications in `artifacts/android-e2e/phase71/journeys/phase71-journeys.json`, `artifacts/android-e2e/phase71/phase71-device-evidence.json`, or `artifacts/release/android-working-tree-sync.json`. Many unrelated PNG/XML files are untracked.
- Do not reset, clean, stash away, or rewrite history to simplify the handoff. Review formatting churn separately from functional changes.

## WIP already present: inspect and finish it

The following describes implementation intent, not completed acceptance:

1. Domain/contracts: explicit creation receipts and opt-in practice provenance; actor/workspace progress snapshots; stricter result predicates; no cleanup ownership inferred from opening a record or its title; restart retains artifacts. Merge logic now separates different runs so an old completed run cannot complete a replay. Inspect migration, version changes, caps, concurrent writes, and cleanup acknowledgment carefully.
2. Sync: command-start/commit metadata bridge, occurrence date/action/parent IDs, duplicate-create protection, scoped cleanup adapter using ordinary trash/delete commands and acknowledgment checks.
3. Web: serialized tour transitions; correlated reporters captured before async work; preference conflict retries that reapply the specific personalization choice; partial preference patches; shared loaded-record navigation tickets for Search/calendar; contextual Help overlay; note Save now button; missing target registrations; explicit practice opt-in; coachmark collapse/manual reveal replacing repeated automatic scrolling.
4. Native: new `useNativeTourController.ts`, durable scoped progress and real SyncEngine receipt bridge; removed fabricated Save operation IDs; generic Create type selection; selective cleanup; explicit practice opt-in/reuse; native Pin control; persisted preference evidence; canonical record-open callbacks; hidden Journal redirect correction.
5. Evidence: strict v2 validator with revision/fingerprint/build/artifact checks, case results, canonical receipts, and distinct manual/physical/spoken requirements. Boolean `ok=true` attestations must fail. Required mode must exit nonzero for unmet evidence.

Important new files:

- `apps/mobile/src/views/useNativeTourController.ts`
- `apps/web/src/tours/recordNavigation.ts`
- `packages/domain/src/tours/mutationEvidence.ts`
- `packages/domain/src/tours/scope.ts`
- `packages/sync/src/tourCleanup.ts`
- `scripts/lib/phase80-ui-evidence.mjs`
- `scripts/lib/phase80-ui-evidence.test.mjs`
- `scripts/phase80-local-ui-server.mjs`
- `scripts/phase80-build-native.mjs`
- `tests/unit/phase80-recovery-safety.test.ts`

## First priorities

1. Review the current diff and finish regression tests before making more broad edits. Both platform typechecks and the touched-file lint passed at intermediate snapshots, but later changes require another focused run.
2. Fix **native build provenance** before testing the new native UI. The last Gradle command returned success, but its output APK has SHA-256 `d898e4a5a7d523a72da2d742fde000e8f8a80b7091c6c8963b2fb3064fbdbfbf`, exactly matching the older Phase 77 APK. The build log did not establish fresh JS bundle generation. Therefore `artifacts/local/phase80/native-build.json` is explicitly marked `unverified`; it is not passing evidence.
3. Inspect the prepared short checkout `D:\d\daynori`, its embedded-debug Gradle configuration, React bundling tasks, package entrypoints, Metro inputs/cache, and APK `assets/index.android.bundle`. Force the appropriate bundle-producing tasks or repair configuration, then verify the APK contains the current bundle before attesting. A successful `assembleDebug` or a source-copy fingerprint alone is insufficient.
4. The short checkout retains prepared `.npmrc`, mobile package/app configuration, and lockfile modifications from the earlier embedded build. Current WIP source was copied there without a reset. The new helper deliberately refuses an already dirty source checkout on a subsequent invocation; recognize and compare the previous copied sources safely rather than using a force checkout. Do not use the older helper's force-checkout/recursive-clean workflow blindly.
5. Audit still-incomplete native chapter surfaces, especially contextual Help/dirty-draft return, filters/search-loaded results, calendar, and replay/resume. Native IME/rotation/font/Back behavior after the new controller has not been verified. Review the callback capture boundaries on every async path.

## Actual verification so far

- An earlier focused run passed 29 tests across Phase 79/80 domain tests and mobile Create/Plan/Account tests. This was before the final edits.
- A later tour/Help run had 26 passing tests and one failure in the old Phase 79 merge fixture: it unioned progress from different run IDs. That fixture has since been corrected to use the same run ID for its within-run merge scenario; a separate new test covers replay isolation. **Rerun both; do not report the corrected test as passed without running it.**
- Evidence-validator unit tests passed 5/5 at an intermediate snapshot. More build/revision checks and a sixth test were added afterward; rerun them.
- Web production build passed at an intermediate snapshot. The current production server/build predates later source repairs and must be rebuilt for final UI evidence.
- One genuine desktop `tour.navigation` journey completed through actual Help, Next, Today, Plan, Library, Journal, Create, Search, and All features controls, without Skip. Screenshot: `artifacts/local/phase80/ui/desktop-navigation.png`. It is supplementary evidence from an earlier source snapshot, not final full-matrix acceptance.
- Personalization UI testing exposed a real revision conflict and moving-target scrolling bug. Their repairs are in the working tree but need fresh UI proof.
- No latest-source native journey or narrow-PWA matrix is complete. No physical-phone or spoken screen-reader review has occurred.

## Local test environment

- `scripts/phase80-local-ui-server.mjs --production` can run a local synthetic identity fixture on 54321, the real API on 3001, and production-built Next on the selected web port. Set `DAYNORI_PHASE80_WEB_PORT=3118` and `DAYNORI_WEB_ORIGIN=http://127.0.0.1:3118` when using that port.
- It uses the configured local test PostgreSQL database. This is real application/database behavior with synthetic identity, not live-provider auth evidence. Do not point it at real users or hosted production.
- Synthetic account credentials are written only to ignored `artifacts/local/phase80/accounts.json`. Never paste/log/commit them. Sign in through the normal UI.
- Temporary services from this session may have stopped after handoff. Inspect known ports/process ownership and reuse healthy services; do not kill unrelated processes or assume tool session IDs remain available.
- Configured AVD: `daynori_vault_api35`; expected serial `emulator-5554`; Android SDK adb at `C:\Users\Lenovo\AppData\Local\Android\Sdk\platform-tools\adb.exe`. Start the existing AVD if needed. Emulator API/auth URLs use `10.0.2.2`.
- In the previous sandbox, some local sockets and build writes required broader execution permission. Vitest temporary files worked with TEMP/TMP directed to ignored `artifacts/local/phase80/tmp`. Do not weaken application security to work around tooling restrictions.

## Complete the actual product flows

For every chapter trace definition → route → mounted target → real control → normal command → durable result → correlated evidence → persisted progress. A target click proves activation only. Local Save and cloud acknowledgment remain distinct.

Run desktop, narrow web/PWA, and source-matched native journeys for starter, navigation, personalization, tasks, routines, calendar, notes, journal, folders/search, Help return, resume/replay, cleanup, negative results, and scope isolation.

Specifically prove:

- Pin/hide/restore persist; hidden Journal opens from All features without unhiding; three/four primary tabs behave correctly.
- Create/edit/save/reopen/complete/Undo use the same canonical task ID and actual operation receipts.
- Routine occurrence actions include the routine, occurrence date, action, and operation ID; another occurrence remains independent.
- Calendar projections load their actual source records. API-only saves must not be mislabeled as local persistence.
- Notes/journal preserve English/Bangla content and drafts. No body content enters tour progress/logs.
- Filters remain view-only; Search completion waits for actual canonical record loading, not a result click.
- Contextual Help returns to the same dirty editor. Check Back/Escape, nested menus/date pickers, IME, focus, and large text. Coachmarks must leave required controls operable.
- Pause, exit, close/restart, resume, and replay retain progress and edited practice data without duplicates or overwrites.
- Cleanup loads and validates provenance/scope, preserves edited/linked/user-owned records, uses normal reversible commands, verifies durable results, and forgets tracking only after success. Failure/partial success/account replacement retain recovery metadata; retries must not delete twice.
- Reject wrong/missing IDs or receipts, stale/duplicate callbacks, unrelated records, failed saves, wrong account/workspace, revision conflicts, and missing targets. Do not use Skip or injected progress as successful action proof.

## Evidence and required human checks

Record actual source revision, working-tree fingerprint, verified build ID/APK hash, platform/device classification, chapter/case IDs, actions, observed assertions, synthetic entity/operation IDs, supporting artifact hashes, and pass/fail/unmet results.

Keep viewport emulation, installed PWA, emulator, and physical-device evidence separate. XML/labels/service enablement do not prove spoken screen-reader review. Structural validator fixtures are unit tests, not real journey evidence. Inspect the strict schema instead of creating a file of success flags.

Finish all independent repairs, automated checks, and available emulator/browser work. If the required physical-phone or human spoken review is unavailable, state that exact unmet check and keep Phase 80 blocked; do not manufacture attestation or waive it. Also report any remaining implementation failures separately.

## Final checks, documentation, and Git

Run focused Phase 80 recovery/everyday tests, Phase 79 engine tests, Phase 78 Help tests, repaired native component tests, relevant SyncEngine/preferences/API integration tests, both platform typechecks/builds, touched-file lint/format, and actual UI runners. Use the existing local test database safely.

Then run `pnpm validate:planning`, `pnpm validate:function-register`, `pnpm icons:check`, `pnpm audit:secrets`, `git diff --check`, and `node scripts/phase80-tour-evidence.mjs --required`. Required mode must fail while any acceptance evidence is unmet. Do not rerun unchanged broad suites repeatedly without a new failure/change to justify it.

Update the Phase 80 report, CHANGELOG, progress, function-register evidence/readiness, Help platform readiness, authoring/cleanup guidance, and ADR 0080 for material contract changes. Record exact commands, results, limits, build identity, and remaining work.

Only when Phase 80 acceptance actually passes: review full/staged diffs, stage only relevant files, create one scoped follow-up commit such as `fix(tours): complete everyday chapter wiring and UI verification`, retain `591031e`, push to `origin/codex/free-core-preview` without force, and verify the remote commit. This push is already authorized. If blocked, preserve the work and report its exact state without a completion claim.

Return actual repairs, platform/chapter results, replay/isolation/cleanup results, manual-review status, unmet checks, report/evidence paths, and commit/push result. Phase 81 remains ineligible while either required dependency is incomplete. Stop after Phase 80.
