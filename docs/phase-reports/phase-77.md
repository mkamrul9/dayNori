# Phase 77: Safe offline reopen, sync, and upgrade recovery

## Identity and scope

- Phase ID/specification: [77](../roadmap/phases/77-safe-offline-reopen-sync-and-upgrade-recovery.md)
- Status: **complete**
- Contributor and report date: Cursor agent; 2026-10-27
- Base Git revision and branch: retained `a4fb4cc` + `6aa2204` on `codex/free-core-preview`; acceptance follow-up commit from this report
- Prerequisites: Phases [72](phase-72.md), [73](phase-73.md), [74](phase-74.md) complete. Phase 71 remains blocked (TalkBack). Phase 75 remains blocked (attachment evidence). Phase 76/78 complete (ADR 0076 / 0078). Scheduling decisions preserved.
- Included scope: trusted-device offline boot ADR; public executable offline shell + SW v9; durable web/native draft quarantine; offline boot context; sync/conflict/portability reconfirmation; **installed production PWA** and **self-contained native emulator** cold-launch acceptance.
- Excluded/deferred: Phase 75 uploads/audio enablement; Phase 71 TalkBack; physical-device native cold launch as a separate release observation; hosted-provider claims; `release_ready`.

## Result

Trusted-device cold offline reopen is proven on:

1. **Fixture** (supplementary): static `apps/web/public` + seeded IndexedDB.
2. **Installed-PWA** (acceptance): production Next (`BUILD_ID` present), isolated Edge profile, process kill, connectivity disabled before reopen, SW navigate fallback to public offline shell with Bangla/English records, drafts, and pending ops surviving; Cache Storage private-ban; Help essential asset preserved; Update/Later deferred while dirty.
3. **Native emulator** (acceptance): Metro-free embedded x86_64 APK (`artifacts/release/app-embedded-x86_64.apk`), cold launch without DevLauncher, airplane-mode offline relaunch with usable organizer chrome, in-place `-r` install without wiping app data. Account A fail-closed DB preserved (not wiped/rekeyed).

Product repairs enabling acceptance: SW navigation uses no-store + abort + **inlined** offline-shell script on fallback; durable `offline_boot.trustedDeviceConsent` rehydrates consent after hard browser process kill; evidence helpers gain required-mode nonzero exits (attestation env alone cannot pass).

## Acceptance evidence

| Condition | Method | Result |
| --- | --- | --- |
| Fixture cold shell | `DAYNORI_PHASE77_MODE=fixture node scripts/phase77-cold-offline-evidence.mjs` | Pass — classified `fixture-static-public-assets` only |
| Installed-PWA cold reopen | `DAYNORI_PHASE77_MODE=installed-pwa DAYNORI_PHASE77_REQUIRED=1 node scripts/phase77-cold-offline-evidence.mjs` | Pass — `artifacts/phase77/cold-offline-pwa-installed.json` |
| Native self-contained cold launch | `DAYNORI_PHASE77_REQUIRED=1 DAYNORI_ANDROID_APK=artifacts/release/app-embedded-x86_64.apk node scripts/phase77-native-cold-offline-evidence.mjs` | Pass — emulator `emulator-5554` / AVD `daynori_vault_api35`; `artifacts/phase77/cold-offline-native.json` |
| Fresh/missing prerequisites | Shell fallback + unit tests | Pass |
| Dirty drafts / queues / identities | Installed-PWA IDB survival assertions | Pass |
| Account isolation | Existing two-account quarantine + Account A preserved | Pass (A not wiped) |
| Sync/conflicts/portability/deletion | Prior Phase 77 suites + this follow-up IDB/SW tests | Pass (prior evidence retained) |
| SW private-cache ban | Cache inspection in installed-PWA drill | Pass — 0 forbidden; help-essential cached |
| Physical device native | — | **Unmet / separate** — emulator only this run |

### Commands run (working directory: repository root; Node v24.21.0)

| Command | Exit | Notes |
| --- | --- | --- |
| `DAYNORI_PHASE77_MODE=installed-pwa DAYNORI_PHASE77_REQUIRED=1 node scripts/phase77-cold-offline-evidence.mjs` | 0 | Edge CDP; production Next on `:3000`; local GoTrue `:54321`; API `:3001` |
| `DAYNORI_PHASE77_REQUIRED=1 node scripts/phase77-native-cold-offline-evidence.mjs` | 0 | Embedded APK SHA-256 `d898e4a5…bfbf` |
| `pnpm exec vitest run apps/web/src/data/indexedDbRepository.test.ts tests/unit/phase77-offline-shell.test.ts tests/unit/pwa-session-and-banners.test.ts` | 0 | after shell/consent repairs |
| `pnpm validate:planning` / `pnpm validate:function-register` / `pnpm audit:secrets` / `git diff --check` | 0 | recorded at completion |

## Defects, limitations and recovery

- **DEF-V2-003**: closed for local installed-PWA + native-emulator acceptance; not `release_ready`; physical-device native cold launch remains a release observation.
- `DAYNORI_NATIVE_OFFLINE_OK=1` is **ignored** (cannot produce a pass).
- Fixture success alone cannot satisfy Phase 77 completion.
- Hosted attachment/audio readiness remains Phase 75 blocked.
- UI lock still does not encrypt browser IndexedDB; native SQLCipher remains fail-closed.
- Debug embedded APK may attempt a debugger websocket to `:8081`; organizer UI still runs without Metro.
- Physical Android hardware cold launch not claimed in this report.

## Documentation and Git review

- ADR 0077 retained; Phase 78 / ADR 0078 scheduling preserved; no Phase 79 start.
- Evidence: `artifacts/phase77/cold-offline-pwa-fixture.json`, `cold-offline-pwa-installed.json`, `cold-offline-native.json`, screenshots under `artifacts/phase77/`.
- Intended commit subject: `test(offline): prove installed PWA and native cold recovery`

## Handoff

Phase 77 is **complete**. Next ready dependency check for Phase 79: prerequisites 66, 68, 77, 78 are all complete → Phase 79 is **eligible** to start when the owner selects it. Do not start Phase 79 in this turn. Phase 71 TalkBack and Phase 75 attachment evidence remain separate open gates.
