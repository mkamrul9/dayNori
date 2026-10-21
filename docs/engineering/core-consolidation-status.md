# Android/web core consolidation status

Date: 2026-10-21. **Not** launch authorization. Vault, AI, Drive, chat, and production billing remain disabled.

## Goal

Finish and test the existing Android/web core organizer before any iOS work. Close local release gaps; leave owner/device/beta blockers explicit.

## Local gaps closed this session

| Gap | Result |
|---|---|
| Node `^24.21.0` | **PASS** via portable toolchain `.tools/node-v24.21.0-win-x64` (gitignored). System Node may still be older — use PATH prefix or install 24.21+. |
| Stale `apps/mobile/android/` | **PASS** — regenerated with Expo prebuild; inspect shows guard + SDK 36. |
| Signing guard whenReady omitted after neutralize | **Fixed** — plugin appends fail-closed block even when marker text appears in comments; Gradle resolve via `realpath(expo)`. |
| Account-deletion web proxy | **PASS** — `tests/integration/core-organizer-local-validation.test.ts` via production Next + API. |
| Core modules (notes/tasks/routines/journal/files quota/sync pull) | **PASS** under `NODE_ENV=production`. |
| Legal pages anonymously | **PASS** |

## Still blocked / unexecuted

| Item | Status | Owner / next action |
|---|---|---|
| Installable Android APK/AAB on this machine | **BLOCKED** | Native NDK/prefab fails because the repo path contains a space (`UNIQUE WORK`). Build from a path without spaces (clone/junction with real copy, not only junction). |
| Physical device + TalkBack + KeyStore (Phase 37) | **BLOCKED** | No `adb` device attached; hardware evidence required. |
| Private beta cohort (Phase 38) | **BLOCKED** | Owner staging + testers. |
| Owner identity/domains/support/signing/Play account | **BLOCKED** | Explicit owner decisions. |
| Full offline client UI walkthrough + export with reauth | **UNEXECUTED / partial** | API mutation + sync pull covered; browser signup/offline UI and export reauth need interactive session. |
| Operator publication approval | **BLOCKED** | Separate authorization after RC freeze. |

## Commands

```bash
# Supported Node (example)
set PATH=.tools\node-v24.21.0-win-x64;%PATH%
node -v   # expect v24.21.0+

pnpm --filter @daynori/mobile prebuild
node scripts/mobile-android-release-path.mjs inspect --android-dir apps/mobile/android
node scripts/mobile-android-release-path.mjs exercise-gradle --android-dir apps/mobile/android

pnpm --filter @daynori/web build
pnpm validate:core
# or: npx vitest run tests/integration/core-organizer-local-validation.test.ts
```

## Evidence artifacts

- `artifacts/release/core-organizer-local-validation.json`
- `artifacts/release/android-prebuild-inspection.json` (refresh after regenerate)
- Regenerated gitignored `apps/mobile/android/` (inspect PASS)

## Next work (do not start Phase 61 / iOS)

1. Relocate or rebuild Android from a **space-free** path; produce debug APK then owner-signed AAB.  
2. Attach physical Android; complete Phase 37–38 evidence.  
3. Owner supplies identity, domains, hosting, support, signing, backups, Play testing.  
4. Freeze RC → `pnpm release:preflight` → explicit publication authorization → verify live Android + web.
