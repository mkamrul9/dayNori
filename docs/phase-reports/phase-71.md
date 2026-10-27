# Phase 71: Native Android interface and navigation parity

## Identity and scope

- Phase: [71 — Native Android interface and navigation parity](../roadmap/phases/71-native-android-interface-and-navigation-parity.md).
- Status: **blocked** (incomplete — no completion commit). Routine data path + local-save refresh + device-evidence 13/13 + IME-open Create + Journal hide/restore + note/task/routine/journal reopen repaired; **account isolation + ordinary Account sign-in stability + spoken TalkBack still open**.
- Contributor/date: Cursor agent continuation, 2026-10-26, Asia/Dhaka.
- Base revision/branch: `058ae6a` (RNG/build repaired), `codex/free-core-preview`. Prior WIP preserved. **No Phase 71 completion commit.**
- Prerequisites: Phases 66, 68, 70 complete; Warm notebook; feature registry; operator gates; Phase 99 still owns deferred Phase 67 participant review.
- **Scheduling:** Owner amendment 2026-10-26 ([ADR 0072](../decisions/0072-phase-72-before-phase-71-acceptance.md)) authorizes Phase 72 to start before this phase’s acceptance. That does **not** mark Phase 71 complete or waive remaining checks. Auth/provision/switch repairs are owned by Phase 72 while this report’s isolation/TalkBack gaps remain open.

## Short plan (this continuation)

1. Repair PlanView to render authorized `routineRecords` (no sample invent); calendar projection empty when empty.
2. Emit `local_mutation_committed` from SyncEngine; refresh Plan/Library/Journal immediately after local save.
3. Stabilize device-evidence preconditions (dismiss onboarding; require shell chrome).
4. Verify IME-open Create Save/Cancel; persistence reopen; Journal hide/restore; isolation; TalkBack.
5. Close only when all gates pass.

## Routine data path (source fix)

| Finding | Detail |
| --- | --- |
| Confirmed bug | `PlanView` loaded `routineRecords` but Routines UI mapped a hardcoded sample array with no-op `onPress`; calendar fell back to samples when records empty |
| Fix | Render `visibleRoutines` from repository; empty → `MobileEmptyState`; detail sheet with canonical id + today complete/undo; calendar uses real records only |
| Demo fixtures | `SAMPLE_MOBILE_ROUTINES` only when `isDemo` / explicit `initialRoutines` / test without repository |
| Refresh | SyncEngine emits `local_mutation_committed` after successful `saveItem` / `saveRoutineOccurrence`; Plan/Library/Journal subscribe |
| Unit coverage | `apps/mobile/src/views/PlanView.test.ts` — empty workspace, appear after local event, workspace isolation, calendar no invent, namespace clear (5 passed) |

## Local-save refresh

- Plan: reload on `local_mutation_committed` (workspace-scoped) + sync events; generation token rejects stale loads; namespace boundary clears display state.
- Library: empty authorized workspace clears prior folders/items (no early-return invent); same local-mutation subscription.
- Journal: listens for `local_mutation_committed` in addition to sync/conflict events.

## Device evidence (clean shell)

Command: `DAYNORI_ANDROID_SERIAL=emulator-5554 node scripts/phase71-android-device-evidence.mjs`

Result: **13/13 PASS** (`artifacts/android-e2e/phase71/phase71-device-evidence.json`, 2026-10-26T15:33Z).

Root cause of prior Plan/Library/landscape failures: onboarding sheet covering chrome; `ensureDaynoriForeground` treated package presence as ready. Fixed by requiring `header-settings-btn` + `nav-tab-today`, dismissing onboarding via Close/Skip, and writing `*-unexpected-screen.xml` on failure.

Metro must run from `D:\d\daynori\apps\mobile` (not monorepo root) or Dev Client shows “Unable to resolve ../../App”.

## Journeys (best stable run)

Command: `DAYNORI_ANDROID_SERIAL=emulator-5554 DAYNORI_PHASE71_ACCOUNT_LABEL=C node scripts/phase71-android-journeys.mjs`

Best run (`journeys-run3.log` / `phase71-journeys.json`): **27 pass / 5 fail**.

| Gate | Result |
| --- | --- |
| Note/task/routine/journal create → reopen | PASS (routine canonical title on Plan Routines) |
| IME-open Create Save/Cancel | PASS (`imeShown=true`; submitY=2075; keyboardDismissedBeforeSubmit=false) |
| Hide Journal → 3 tabs; Restore → 4 tabs | PASS; journalContentPreserved=true |
| Search / gallery denial | Search FAIL after isolation damage; gallery denial PASS |
| Ordinary Account C sign-in + workspace provision | FAIL / flaky (`not-signed-in` or `provision-failed`) — local saves still often succeed |
| Two-account isolation (C ↔ B) | FAIL (`signedIn=false` for B; `account-group` / session switch) |
| Spoken TalkBack | Not executed (service+XML only in device-evidence) |

Account A’s `KEY_INVALIDATED_OR_MISMATCH` database was **not** wiped or re-keyed.

## TalkBack — remaining human listen-through

Automation: TalkBack service enable + labeled hierarchy dump PASS. Spoken quality is **not** proven.

Prepared checklist (app shell already green on device-evidence):

1. Enable TalkBack; confirm audible speech.
2. Header: Search, Create, All features, Settings — name + activation.
3. Primary tabs: role, name, selected state.
4. Settings hub → Appearance → Back — announcements + focus return.
5. Create sheet: field labels, validation, Save/Cancel with IME open.
6. Sheet enter/dismiss/focus restore.
7. Save success vs error announcements.
8. Large text reachability.
9. Record method/utterances; restore TalkBack off (scripts restore settings on exit).

## Checks (this continuation)

| Command | Exit | Observed |
| --- | --- | --- |
| `npx vitest run apps/mobile/src/views/PlanView.test.ts` | 0 | 5 passed |
| `npx vitest run apps/mobile/src/mobile.test.ts … JournalView … phase71-native-android` | 0 | 44 passed |
| `node scripts/phase71-android-device-evidence.mjs` | 0 | 13/13 |
| `DAYNORI_PHASE71_ACCOUNT_LABEL=C node scripts/phase71-android-journeys.mjs` | 1 | Best 27/5; later runs flaky on auth/create after isolation |

## Missing cases (block completion)

1. **Spoken TalkBack listen-through** (human) with recorded utterances.
2. **Phase 71–owned isolation/search attribution** if still required for this phase’s acceptance after Phase 72’s auth repairs ([phase-72 report](phase-72.md) run18 already proved C→B no-leak + return-to-C + search on the shared journey runner).
3. Completion commit subject only when remaining checks pass: `feat(mobile): adapt the Version 2 experience to native Android`

## Handoff

Phase 71 remains **incomplete**. [ADR 0072](../decisions/0072-phase-72-before-phase-71-acceptance.md) authorized Phase 72 ahead of this phase; Phase 72 is **complete**. [ADR 0073](../decisions/0073-phase-73-before-phase-71-acceptance.md) (owner 2026-10-27) authorizes Phase 73 ahead of this phase’s acceptance while this phase stays blocked — that does **not** mark Phase 71 complete or waive remaining checks. Preserve APK evidence, journey JSON under `artifacts/android-e2e/phase71/`, account A’s KEY_INVALIDATED database, and gitignored synth accounts. Remaining Phase 71 work: spoken TalkBack listen-through; remaining verification gaps; then one local completion commit only when remaining checks pass.
