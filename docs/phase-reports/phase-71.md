# Phase 71: Native Android interface and navigation parity

## Identity and scope

- Phase: [71 — Native Android interface and navigation parity](../roadmap/phases/71-native-android-interface-and-navigation-parity.md).
- Status: **in_progress** (selectors/insets/IME pad/auth probe advanced; local SQLite CSPRNG + persistence matrix + spoken TalkBack unmet — do not treat as complete).
- Contributor/date: Cursor agent continuation, 2026-10-26, Asia/Dhaka.
- Base revision/branch: `1ff0d82` (Phase 70), `codex/free-core-preview`. Intermediate WIP commits include `c277fe8`, `d03e684` (selectors/measured-inset landing). **No Phase 71 completion commit.**
- Prerequisites: Phases 66, 68, 70 complete; Warm notebook; feature registry; operator gates; Phase 99 still owns deferred Phase 67 participant review.
- Included: Settings hub/groups, BackHandler, density-portable insets, CreateSheet testIDs, journey runner repairs, modal IME bottom pad, ordinary GoTrue auth scaffolding.
- Excluded/deferred: Full create/save/reopen persistence proofs until device CSPRNG works; spoken TalkBack listen-through; account-switch isolation on device; native iOS; Phase 72; `release_ready`.

## Result (this continuation)

### Journey selectors (Priority 1) — repaired

- CreateSheet: `create-type-{kind}` (a11y “Item type …”), `create-title-input`, `create-details-input`, `create-submit-btn` (“Submit create {kind}”), `create-cancel-btn`.
- `scripts/phase71-android-journeys.mjs`: node-scoped `resource-id` parsing; asserts type selected, title value, exact submit tap; rejects weak “Plan exists somewhere” style checks.
- Device evidence: type/title/submit steps **PASS** for note/task/routine/journal. Save still fails until local repository opens.
- Prior create-task/routine/journal results without these IDs remain **provisional** and are superseded by this runner.
- Input method: `adb input text` ASCII-only; Bangla/non-ASCII **untested** (not stripped to claim coverage).

### Auth / workspace (Priority 2) — partial

| Layer | Result |
| --- | --- |
| Local synthetic / operator login button | **Not used** for ordinary acceptance |
| Real provider (local GoTrue on `:54321`) | Synthetic accounts in gitignored `artifacts/local/phase71-synth-accounts.json`; password grant OK from host |
| API JWT | Must use **JWKS ES256** (`SUPABASE_JWKS_URL`), not HS256 secret |
| Emulator networking | Prefer `EXPO_PUBLIC_*` hosts `http://10.0.2.2:3001` / `:54321` (adb reverse to `127.0.0.1` hung auth) |
| Account UI | `Sign out` / session-active copy observed after successful provider session |
| Local persistence / sync engine | **Blocked** — see CSPRNG |

### Insets (Priority 3) — policy updated

- Removed AVD-specific 128/160 floors and the unlinked `SafeAreaProvider` dependency (native module absent from current PackageList).
- `androidStatusBarTopPad(measured?)`: measured inset if provided; else `max(StatusBar.currentHeight, ceil(48×PixelRatio))`.
- Header Search/Create/Settings remain tappable after pad (prior evidence + current Today dumps).

### IME (Priority 5) — code landed, keyboard-open Save proof incomplete

- `MobileModalSheet` adds `keyboardHeight` from `subscribeAndroidKeyboardInsets` to bottom padding while visible.
- Journeys still dismiss IME before Account submit for reachability; **keyboard-open Save** is not claimed as proven.

### Persistence / prefs / isolation (Priorities 4/6/7) — blocked

- Create submit returns: “Could not save. Sign in and open your workspace… draft is kept.”
- Settings banner: `Could not open your saved data (NO_SECURE_RANDOM)`.
- Root cause: Dev Client lacks a linked CSPRNG for SQLCipher key generation (`expo-crypto` / `ExpoRandom` / `RNGetRandomValues` unavailable). `fillSecureRandomBytes` documents rebuild requirement.
- Rebuild with `expo-crypto` linked is in progress / required before persistence matrix, prefs, and account isolation can be accepted.

### Spoken TalkBack (Priority 8) — human checklist prepared (not executed)

Automation has **setup evidence only** (service enable + labeled hierarchy). Do **not** treat XML labels as spoken review.

**Human listen-through checklist (normal-touch vs TalkBack procedures separately):**

1. Enable TalkBack; confirm spoken feedback is audible.
2. Header: Search, Create, All features, Settings — name + activation.
3. Primary tabs: role, name, selected state when changing tabs.
4. Settings hub → group → Back to hub — announcements and focus return.
5. Create sheet / Account form: field labels, validation errors, Submit/Cancel.
6. Modal/sheet: enter, dismiss, focus restore.
7. Save success vs error feedback announcements.
8. Large text: essential actions still reachable and announced.
9. Record method (human listen), observed utterances, defects; restore TalkBack off afterward.

Phase 67 participant deferral does **not** waive this gate.

## Nominated environment / provenance

- Node **v24.21.0**; pnpm 9.15.5; serial `emulator-5554` (`daynori_vault_api35`, Android 15, x86_64).
- Metro: `D:\d\daynori` :8081 (short sync of dirty WT). JS fingerprint ≠ APK hash.
- Latest working-tree sync fingerprint (dirty): see `artifacts/release/android-working-tree-sync.json` after rebuild.
- APK: rebuild required when native deps change (`expo-crypto`); prior `fd874316…` candidate must not be claimed for newer native sources.

## Checks (exact)

| Command | Exit | Observed |
| --- | --- | --- |
| `pnpm --filter @daynori/ui-mobile build` | 0 | OK |
| `pnpm exec vitest run apps/mobile/src/phase71-native-android.test.ts packages/ui-mobile/src/ui-mobile.test.ts apps/mobile/src/mobile.test.ts apps/mobile/src/views/CreateSheet.test.ts` | 0 | 56 passed |
| `pnpm exec vitest run apps/mobile/src/data/sqliteRepository.test.ts` | 0 | 23 passed |
| `DAYNORI_ANDROID_SERIAL=emulator-5554 node scripts/phase71-android-device-evidence.mjs` | 0 | **13/13** (earlier clean portrait run; still valid for shell chrome) |
| `DAYNORI_ANDROID_SERIAL=emulator-5554 node scripts/phase71-android-journeys.mjs` | 1 | Selectors PASS; auth probe PASS when session active; create-*-save FAIL (`NO_SECURE_RANDOM` / no repo) |

## Missing cases (block completion)

1. Device CSPRNG / SQLCipher key init (`NO_SECURE_RANDOM`) — rebuild Dev Client with `expo-crypto`.
2. Note/task/routine/journal create → save → reopen identity; edit; complete/undo; search canonical open.
3. Keyboard-open Save reachability with screenshots (Create, note, journal, Settings form).
4. Pin/unpin + Hide/restore Journal; Settings preference persistence.
5. Draft + two-account isolation without clearing SQLite/secure storage.
6. Spoken TalkBack listen-through (checklist above).
7. Full regression suite + completion commit only after gates pass.

## Handoff

Phase 71 remains **incomplete**. Preserve implementation and evidence. Next: finish APK rebuild with `expo-crypto`, confirm storage opens without `NO_SECURE_RANDOM`, rerun persistence/IME/prefs/isolation journeys, complete TalkBack listen-through, then one local completion commit:

`feat(mobile): adapt the Version 2 experience to native Android`

Do **not** start Phase 72 until acceptance passes.
