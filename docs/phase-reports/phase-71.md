# Phase 71: Native Android interface and navigation parity

## Identity and scope

- Phase: [71 — Native Android interface and navigation parity](../roadmap/phases/71-native-android-interface-and-navigation-parity.md).
- Status: **in_progress** (shell/Settings/Back/insets + repaired device-evidence runner advanced; required create/save/reopen persistence matrix and **spoken** TalkBack listen-through remain unmet — do not treat as complete).
- Contributor/date: Cursor agent continuation, 2026-10-26, Asia/Dhaka.
- Base revision/branch: `1ff0d82` (Phase 70), `codex/free-core-preview`.
- Prerequisites: Phases 66, 68, 70 complete; Warm notebook; feature registry; operator gates; Phase 99 still owns deferred Phase 67 participant review.
- Included: Native Settings hub/groups, BackHandler priority, androidInsets + status-bar pad, operator gating, APK working-tree sync, focused Vitest, repaired AVD evidence script (distinct postconditions + settings restore).
- Excluded/deferred: Full create/save/reopen + complete/undo persistence proofs; spoken TalkBack listen-through; account-switch isolation on device; native iOS; Phase 72; `release_ready`.

## Continuation plan (this pass)

1. **Touch-delivery investigation** — measure StatusBar intercept vs header bounds; separate TalkBack focus from hit-testing.
2. **Test-runner repairs** — distinct postconditions; snapshot/restore a11y/font/rotation; no false XML-length landscape pass.
3. **Remaining journeys** — create/save/reopen, IME/Back/draft, pin/hide, ordinary-user denial.
4. **Build provenance** — WT sync fingerprint + x86_64 APK SHA-256 ≠ Metro JS fingerprint.
5. **Acceptance evidence** — only complete when device + spoken TalkBack gates pass.

## Result

### Header input root cause and fix

- **Cause:** Edge-to-edge Android leaves the system StatusBar window intercepting taps in the statusBars inset (~128px on `daynori_vault_api35`). Accessibility reported `clickable=true` for Search/Create/Settings while `adb input tap` at mid-bounds under ~128px did not reach React handlers.
- **Fix:** Android root uses `View` + `paddingTop` clearance (`Math.min(160, Math.max(StatusBar.currentHeight, scaled48dp, 128))` in `App.tsx`; shared `androidStatusBarTopPad()` in `packages/ui-mobile/src/androidInsets.ts`). Header control `y1` must clear ~128px.
- **Verified:** After pad, header Search / Create / All features / Settings open via actual header taps (not deep links). Deep links remain useful for isolation only.

### Native shell / Settings

- `SettingsHubView` + `SettingsView` group filter mirror Phase 70 groups.
- Back priority: overlay → Settings group → hub → Plan/Library detail → Today → exit.
- Operator gallery/harness stay gated; ordinary Account copy states developer tools restricted.

### Device-helper assertion/cleanup repairs

- `scripts/phase71-android-device-evidence.mjs` rewritten:
  - Snapshots/restores accessibility services, touch exploration, font scale, rotation (no permanent null service list; no forced font 1.0 if original differed).
  - Distinct postconditions (Dismiss sheet / settings-hub / selected tab + destination / hierarchy rotation / font_scale).
  - Avoids Broad `/search/` dismiss that previously matched header “Search organizer” and Back’d to launcher.
  - Dismisses permission dialogs; ensures Daynori foreground; separates TalkBack enable dump from spoken review.
- Companion: `scripts/phase71-android-journeys.mjs` for create/search/settings/deep-link probes.

### Landscape / APK

- Dev Client previously locked `screenOrientation=portrait`. Unlocked via `app.json` `orientation: default` + prebuild → `unspecified`; rebuilt x86_64 APK.
- Landscape evidence uses `adb emu rotate` + hierarchy `rotation="1"` (physical `wm size` may stay 1080x2400).

## Acceptance evidence

| Condition | Result |
| --- | --- |
| Core native routes / enabled features reachable with platform interactions | **Partial pass** — Today/Plan/Library tabs; header Search/Create/All features/Settings; Settings hub → Appearance → Back → hub on AVD |
| Large text, TalkBack, keyboard, safe areas, Back do not lose drafts / cover actions | **Incomplete** — large-text + landscape chrome usable; Back through Settings verified; TalkBack **service enable + labeled dump only**; IME Save reachability and draft/account-isolation matrix not fully proven |
| No web wrapper / duplicated domain | **Pass** — RN + shared packages only |

### Nominated test environment

- Runtime: Node **v24.21.0**; pnpm 9.15.5.
- Device: serial `emulator-5554` — AVD `daynori_vault_api35`, Android **15**, `sdk_gphone64_x86_64`, **emulator**, 1080×2400 @ 420dpi, ABI **x86_64**.
- TalkBack: `com.google.android.marvin.talkback` `versionName=15.0.0.639625893` (enablement + uiautomator labels ≠ spoken quality).
- Metro: project root `D:\d\daynori` (short sync of dirty WT); port **8081**. APK hash ≠ JS bundle fingerprint.
- APK: `artifacts/release/app-debug-x86_64.apk` SHA-256 `fd874316ef2df58bb3ecd7a2c91ab4765027b2730f6580879debf2915f05532e` (debug; orientation unlocked). WT sync fingerprint at last evidence pass: `11d340d26923dd2fb9bb0201d9fb1b3581b4d81a1863f64a4d3217434225f6a7` (dirty). Earlier APK evidence JSON may list fingerprint `5300d1af…` from the build moment — re-sync before claiming bit-identical sources.

### Commands (cwd: repo root unless noted)

| Command | Exit | Observed |
| --- | --- | --- |
| `pnpm --filter @daynori/ui-mobile build` | 0 | OK |
| `pnpm exec vitest run apps/mobile/src/phase71-native-android.test.ts packages/ui-mobile/src/ui-mobile.test.ts apps/mobile/src/mobile.test.ts apps/mobile/src/views/CreateSheet.test.ts` | 0 | 56 passed (focused subset) |
| `DAYNORI_ANDROID_ABI=x86_64 node scripts/build-android-debug-apk.mjs` | 0 | APK `fd874316…` |
| `DAYNORI_ANDROID_SERIAL=emulator-5554 node scripts/phase71-android-device-evidence.mjs` | 0 | **13 pass / 0 fail** (latest clean portrait run) |
| `DAYNORI_ANDROID_SERIAL=emulator-5554 node scripts/phase71-android-journeys.mjs` | 1 | Partial: create-task/routine/journal + search + denial; fails pin/IME/settings-pref flake; no reopen identity proof; synthetic login operator-gated |

Artifact directory: `artifacts/android-e2e/phase71/` (+ `journeys/`).

### TalkBack review method and results

- **Method attempted:** enable TalkBack service on the nominated AVD; capture labeled uiautomator hierarchy; attempt logcat filters for Speech/Announce (automation incomplete — do not treat as listen-through).
- **Results:** Setup + labeled dump only. **No spoken output quality review recorded.** Human listen-through checklist still required (header names/activation, tab roles/selected, Settings hub/group return, form errors, modal entry/exit, Save/error announcements, large text, essential action reachability).
- Phase 67 participant deferral does **not** waive this Phase 71 requirement.

### Missing cases (block completion)

1. Create note → save → leave → reopen with persisted record identity (create-note postcondition still unclear; signed-in/workspace path incomplete for ordinary user).
2. Edit/reopen same note; task complete/undo; routine occurrence complete/undo; journal write/edit/reopen.
3. Search → open canonical result by identity.
4. Settings preference change → reopen persistence proof (Appearance tap flaky in journeys runner).
5. Pin/unpin + Hide/restore Journal → three/four tabs on device.
6. Keyboard-open editor with reachable Save/Cancel (emulator IME probe incomplete; physical IME not run).
7. Background/resume draft + account/workspace isolation on device.
8. TalkBack **spoken** listen-through with method + observed utterances.
9. Confirm Metro-served pad matches capped source after cache-clear (transient `y1≈357` observed under stale bundle; treat as tooling note until re-measured).

## Defects, limitations and recovery

- Expo Dev Client debug APK needs Metro; embedded-bundle standalone APK not produced.
- Stale Metro `ui-mobile` export briefly crashed App (`androidStatusBarTopPad is not a function`); App now inlines pad math; package helper retained for tests.
- `Icon`/`MobileButton` Text-wrapping fixes remain required to avoid LogBox covering nav.
- Phase 99 participant obligation unchanged; no `release_ready`.

## Documentation and Git review

- Report: this file.
- ADR: [0071](../decisions/0071-native-android-settings-hub-and-insets.md).
- Scripts: `sync-short-build-working-tree.mjs`, `build-android-debug-apk.mjs`, `test-android-e2e.mjs`, `phase71-android-device-evidence.mjs`, `phase71-android-journeys.mjs`.
- progress.json: Phase 71 **incomplete** (no completion commit).
- Intended completion subject (when acceptance passes): `feat(mobile): adapt the Version 2 experience to native Android`.

## Handoff

Phase 71 remains **incomplete**. Preserve working-tree implementation, APK tooling, and evidence. Next action: finish missing journey persistence + spoken TalkBack on `emulator-5554`, then one local completion commit. Do **not** start Phase 72 until Phase 71 acceptance passes. Next eligible after completion: Phase 72 — Welcome startup onboarding and authentication polish (verify prerequisites first).
