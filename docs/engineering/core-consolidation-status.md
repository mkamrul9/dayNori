# Android/web core consolidation status

Date: 2026-10-21. **Not** launch authorization. Vault, AI, Drive, chat, and production billing remain disabled.

## Goal

Finish and test the existing Android/web core organizer before any iOS work. Close local release gaps; leave owner/device/beta blockers explicit.

## Closed this session

| Gap | Result |
|---|---|
| Node `^24.21.0` | **PASS** — portable `.tools/node-v24.21.0-win-x64` |
| Stale Android + signing guard | **PASS** — regenerate + whenReady/hoisted-resolve fixes |
| Account-deletion web proxy | **PASS** — production Next + API |
| Core modules + sync push + export gate | **PASS** — `pnpm validate:core` |
| Installable Android debug APK | **PASS** — built at `D:\d\daynori` (space-free, `node-linker=hoisted`, arm64-v8a); evidence `artifacts/release/android-debug-apk-evidence.json` |

### APK evidence (debug-signed — not release-eligible)

- Path: `artifacts/release/app-debug-arm64.apk` (gitignored binary; rebuild via `node scripts/build-android-debug-apk.mjs`)
- SHA-256: `0379F71CB48C953C5020CB393BA49084507D1F37AFA06066622EB351C800A5B7`
- Signer: Android Debug (`CN=Android Debug`)
- Target/compile SDK: 36

## Still blocked (cannot finish without owner/hardware)

| Item | Status | Action |
|---|---|---|
| Physical device install / TalkBack / KeyStore (Phase 37) | **BLOCKED** | No `adb` device attached |
| Private beta (Phase 38) | **BLOCKED** | Owner staging + testers |
| Owner identity/domains/support/signing/Play | **BLOCKED** | Owner decisions |
| Interactive browser signup + full offline UI | **PARTIAL** | API/sync covered; browser E2E signup not run this session |
| Signed release AAB + publication | **BLOCKED** | Credentials + OA |
| Phases 59–60 complete | **Incomplete** | Live verified release unmet |

## Commands

```bash
set PATH=.tools\node-v24.21.0-win-x64;%PATH%
pnpm validate:core
node scripts/build-android-debug-apk.mjs
# Optional when device attached:
# adb install -r artifacts/release/app-debug-arm64.apk
```

Primary workspace path with spaces remains hostile to NDK; always use `D:\d\daynori` (or `DAYNORI_SHORT_BUILD_ROOT`) for native APK builds.

## Next (do not start Phase 61 / iOS)

1. Attach Android device → install debug APK → manual TalkBack/offline/recovery evidence (Phase 37).  
2. Private beta cohort (Phase 38).  
3. Owner launch requirements + release keystore → signed AAB.  
4. Explicit publication authorization → verify live Android + web.
