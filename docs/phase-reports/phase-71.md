# Phase 71: Native Android interface and navigation parity

## Identity and scope

- Phase: [71 — Native Android interface and navigation parity](../roadmap/phases/71-native-android-interface-and-navigation-parity.md).
- Status: **in_progress** (native CSPRNG + short-root APK + storage init races repaired; persistence proven on a clean synthetic account; spoken TalkBack + IME-open Save + pin/hide + two-account isolation + full device-evidence chrome still open — **no completion commit**).
- Contributor/date: Cursor agent continuation, 2026-10-26, Asia/Dhaka.
- Base revision/branch: `1ff0d82` (Phase 70), `codex/free-core-preview`. WIP includes `c277fe8`, `d03e684`, `178fb24`. **No Phase 71 completion commit.**
- Prerequisites: Phases 66, 68, 70 complete; Warm notebook; feature registry; operator gates; Phase 99 still owns deferred Phase 67 participant review.
- Phase 72 is **blocked** until this phase’s acceptance gates pass.

## Short plan (executed)

1. Diagnose Gradle/native build failure; repair short-root hoisted linker + VFS watch.
2. Link/verify `expo-crypto` in x86_64 Dev Client; keep SQLCipher fail-closed.
3. Separate key-manager error classes; serialize storage init vs Strict Mode races.
4. Wire Settings `workspaceId` / `onProvisionWorkspace`; harden journeys.
5. Re-run persistence journeys; document remaining human/device gates.

## Native RNG / build root cause and repair

| Finding | Detail |
| --- | --- |
| Prior symptom | `NO_SECURE_RANDOM` on device; create/save impossible |
| Gradle “daemon disappeared” | First meaningful error: `NativeException: bad allocation` in Gradle file watcher (`Error while receiving file changes`) |
| Repair | `assembleDebug --no-watch-fs -Dorg.gradle.vfs.watch=false --max-workers=2 -Dorg.gradle.parallel=false` (no blind heap increase) |
| Second failure | `ninja: manifest 'build.ninja' still dirty` under long pnpm `.pnpm` paths + `CMAKE_OBJECT_PATH_MAX` |
| Cause | Short-root `.npmrc` was overwritten back to `node-linker=isolated` by working-tree sync |
| Repair | Force `node-linker=hoisted` **after** sync; drop stale workspace `node_modules`; `pnpm exec expo prebuild` |
| APK | `artifacts/release/app-debug-x86_64.apk` SHA-256 `e1f3edab678107eb0e5069f1a892d9acc6297de55de2577c6e7d06c96a7b2ce9`; git `178fb24` + dirty WT fingerprint `15f9e203…`; build root `D:\d\daynori`; ABI x86_64; package `com.daynori.app` |
| Runtime | Metro from `D:\d\daynori` :8081; Dev Client connects via `10.0.2.2:8081` / adb reverse; APK identity ≠ Metro JS fingerprint |

`expo-crypto` ~14.0.2 is declared, locked, Expo-module autolinked (`CryptoModule`), and used via **`getRandomBytesAsync`** only (not sync `getRandomBytes`).

## Key / database safety

- `fillSecureRandomBytes`: injected test provider; async expo-crypto; WebCrypto; native base64 fallbacks; fail closed; reject short output.
- `MobileKeyManager`: separate `SECURE_STORE_*`, `INVALID_KEY_FORMAT`, `WORKSPACE_INDEX_FAILED`, `NO_SECURE_RANDOM`; **never delete a valid key** because index write failed; never silent-regenerate invalid keys.
- Existing DB + missing key → `KEY_NOT_FOUND` (no overwrite). Account A device DB left intact after `KEY_INVALIDATED_OR_MISMATCH` from earlier key/DB divergence (fail-closed evidence).
- Persistence acceptance used **new synthetic account C** (gitignored accounts file) without wiping A’s files.
- App storage lifecycle: exclusive open/close queue to avoid Strict Mode close racing Expo’s shared DB handle.
- Settings now receives `workspaceId` + `onProvisionWorkspace` (was missing — provision button never rendered).

## Persistence / device results (account C)

| Check | Result |
| --- | --- |
| Auth + `Active (ID: …)` workspace | PASS (ordinary Account / Workspace group; not marketing copy) |
| Note / task / journal create → reopen | PASS on successful runs after storage-queue fix |
| Search canonical note title | PASS when note save succeeded |
| Routine save | Sheet closes; Plan Routines list often still shows core-preview fixtures — reopen identity **incomplete** |
| Gallery deep-link denial | PASS |
| `NO_SECURE_RANDOM` banner | **Gone** on rebuilt APK + linked crypto |
| Device-evidence chrome (latest) | 8/13 — Plan/Library/landscape/large-text/TalkBack dump failed when chrome covered; restore still PASS |
| Spoken TalkBack listen-through | **Not executed** — human checklist below |
| IME-open Save reachability | Not proven (IME still dismissed before submit in journeys) |
| Pin/hide Journal; prefs persistence; two-account isolation | Not re-proven this continuation |

### Human TalkBack listen-through checklist

1. Enable TalkBack; confirm spoken feedback is audible.
2. Header: Search, Create, All features, Settings — name + activation.
3. Primary tabs: role, name, selected state when changing tabs.
4. Settings hub → group → Back to hub — announcements and focus return.
5. Create sheet / Account form: field labels, validation errors, Submit/Cancel.
6. Modal/sheet: enter, dismiss, focus restore.
7. Save success vs error feedback announcements.
8. Large text: essential actions still reachable and announced.
9. Record method, utterances, defects; restore TalkBack off afterward.

Automation: service enable + labeled hierarchy only. Phase 67 participant deferral does **not** waive this gate.

## Checks (exact)

| Command | Exit | Observed |
| --- | --- | --- |
| `pnpm exec vitest run apps/mobile/src/data/keyManager.test.ts apps/mobile/src/data/sqliteRepository.test.ts` | 0 | 36 passed |
| `pnpm exec vitest run … keyManager + sqlite + phase71 + CreateSheet + ui-mobile` | 0 | 60 passed |
| `DAYNORI_ANDROID_ABI=x86_64 node scripts/build-android-debug-apk.mjs` | 0 | APK + evidence JSON |
| `DAYNORI_ANDROID_SERIAL=emulator-5554 DAYNORI_PHASE71_ACCOUNT_LABEL=C node scripts/phase71-android-journeys.mjs` | 1 | Auth/workspace PASS; note/task/journal often PASS; routine reopen / flaky note destination / search skip remain |
| `DAYNORI_ANDROID_SERIAL=emulator-5554 node scripts/phase71-android-device-evidence.mjs` | 1 | 8/13 (chrome coverage regressions this run) |

## Missing cases (block completion + block Phase 72)

1. Spoken TalkBack listen-through (human).
2. Stable note + routine **canonical reopen** against non-fixture Plan/Library surfaces.
3. Keyboard-open Save/Cancel screenshots (Create, note, journal, Settings).
4. Pin/unpin + Hide/restore Journal (3/4 tabs) with preference persistence.
5. Draft + two-account isolation without clearing SQLite/secure storage.
6. Device-evidence 13/13 on a clean chrome session after journeys.
7. Completion commit subject only when the above pass: `feat(mobile): adapt the Version 2 experience to native Android`

## Handoff

Phase 71 remains **incomplete**. Preserve APK evidence, journey JSON under `artifacts/android-e2e/phase71/journeys/`, and gitignored synth accounts. Do **not** start Phase 72 until acceptance passes. Next: human TalkBack checklist, finish prefs/isolation/IME proofs on account C/B, green device-evidence, then one local completion commit.
