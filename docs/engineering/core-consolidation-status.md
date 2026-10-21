# Android/web core consolidation status

Date: 2026-10-21 (verification resume). **Not** launch authorization. Vault, AI, Drive, chat, and production billing remain disabled.

## Goal

Finish and test the existing Android/web core organizer. Leave owner/device/beta/publication blockers explicit. iOS Phases 61–62 stay blocked on native/TestFlight evidence and are **not** required for Android/web launch.

## Closed this session (verification resume)

| Gap | Result |
|---|---|
| Web production build after icon migration | **PASS** — removed unused `IconText` imports (7 web files) |
| Node `^24.21.0` | **PASS** — portable `.tools/node-v24.21.0-win-x64` |
| Shared icon system | **PASS** — `pnpm icons:check` (83 names; no UI emoji chrome) |
| Android tree inspect | **PASS** — SDK 36 + signing guard |
| Core modules + sync push + export gate + web-proxy deletion | **PASS** — `pnpm validate:core` |
| Phase 59/60 gates + web smoke + preflight + rehearsal | **PASS** engineering; `releaseEligible=false` |
| Installable Android debug APK (prior) | **PASS** — SHA-256 unchanged; **not** release-eligible |

### APK evidence (debug-signed — not release-eligible)

- Path: `artifacts/release/app-debug-arm64.apk` (gitignored binary; rebuild via `node scripts/build-android-debug-apk.mjs`)
- SHA-256: `0379F71CB48C953C5020CB393BA49084507D1F37AFA06066622EB351C800A5B7`
- Signer: Android Debug (`CN=Android Debug`)
- Target/compile SDK: 36

## Blockers by category

### Code defects (engineering)

None open after unused-`IconText` repair. Remaining work is evidence and owner decisions, not inventable product scope.

### Physical-device and beta evidence

| Item | Status | Action |
|---|---|---|
| Physical device install / TalkBack / KeyStore / push / offline UI (Phase 37) | **BLOCKED** | No `adb` device attached |
| Private beta (Phase 38) | **BLOCKED** | Owner staging + testers |

### Owner-controlled credentials, infrastructure, support, publication

| Item | Status | Action |
|---|---|---|
| Identity / domains / monitored support / legal | **BLOCKED** | Owner decisions |
| Release keystore + signed AAB + 16 KB evidence | **BLOCKED** | Credentials + Mac/CI signing path |
| Play Console + public web destinations | **BLOCKED** | Owner accounts + OA |
| Operator launch authorization | **BLOCKED** | Explicit OA for exact candidate |
| Phases 59–60 complete | **Incomplete** | Live verified release unmet |

## Publication decision

**NO-GO.** Local state is **prepared** only (`pnpm release:preflight` → `releaseEligible=false`). See [phase-60 report](../phase-reports/phase-60.md) and [publication runbook](runbooks/public-release-publication.md).

## Commands

```bash
set PATH=.tools\node-v24.21.0-win-x64;%PATH%
pnpm icons:check
pnpm --filter @daynori/web build
pnpm validate:core
node scripts/phase60-web-production-smoke.mjs
node scripts/release-preflight.mjs --allow-partial-local
DAYNORI_REHEARSAL_TARGET=disposable-local pnpm release:rehearsal
# Optional when device attached:
# adb install -r artifacts/release/app-debug-arm64.apk
```

Primary workspace path with spaces remains hostile to NDK; use `D:\d\daynori` (or `DAYNORI_SHORT_BUILD_ROOT`) for native APK builds.

## Next

1. Attach Android device → install debug APK → Phase 37 hardware evidence.  
2. Private beta cohort (Phase 38).  
3. Owner launch requirements + release keystore → signed AAB.  
4. Explicit publication authorization → verify live Android + matching web.  
5. Only after live Phase 60 acceptance: Phase 63 operating-period observations (do not fabricate).  

Phases 61–62 remain pending Mac/device/TestFlight/store evidence. Stop before Phase 63.
