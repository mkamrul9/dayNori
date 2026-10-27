# Phase 77: Safe offline reopen, sync, and upgrade recovery

## Identity and scope

- Phase ID/specification: [77](../roadmap/phases/77-safe-offline-reopen-sync-and-upgrade-recovery.md)
- Status: **blocked** (implementation shipped in `a4fb4cc`; required installed-PWA and native cold-launch acceptance remain unmet — reconciled 2026-10-27 under [ADR 0078](../decisions/0078-phase-78-before-phase-75-and-77-acceptance.md))
- Contributor and report date: Cursor agent; 2026-10-27
- Base Git revision and branch: `b36f97c` on `codex/free-core-preview`; completion attempt commit retained: `a4fb4cc`
- Prerequisites: Phases [72](phase-72.md), [73](phase-73.md), [74](phase-74.md) complete. Phase 71 remains blocked (TalkBack). Phase 75 remains blocked (attachment evidence). Phase 76 complete (ADR 0076).
- Included scope: trusted-device offline boot ADR; public executable offline shell + SW v8; durable web/native draft quarantine; offline boot context in IndexedDB; sync/conflict/portability reconfirmation; cold browser-shell evidence drill.
- Excluded/deferred / remaining acceptance: full installed production PWA cold reopen (static fixture ≠ installed PWA); self-contained native installed-build cold launch; enabling Phase 75 uploads/audio; Phase 71 TalkBack; `release_ready` claims.

## Result

A previously authorized trusted browser can cold-reopen usable local organizer screens offline via a **public** `/offline-shell.html` + `/offline-shell.js` served from Cache Storage, restoring account-scoped IndexedDB after trusted-device consent and a durable `offline_boot` context. Private HTML/API/RSC remain forbidden in shared Cache Storage (ADR 0066 retained; cold-organizer claim superseded by ADR 0077).

Web auth quarantine drafts persist in IndexedDB `auth_quarantine`. Native `DraftQuarantineManager` persists via OS-backed secure storage and recovers after process restart. Sign-out quarantines repo drafts and flushes durable quarantine. Sync/conflict/portability/deletion suites reconfirmed against PostgreSQL. DEF-V2-003 resolved locally for the web/PWA fixture path.

## Acceptance evidence

| Condition | Method | Result |
| --- | --- | --- |
| Trusted-device offline reopen | `node scripts/phase77-cold-offline-evidence.mjs` (Edge CDP, static public fixture) | Pass — shell showed Bangla note; Cache Storage `daynori-static-v8` had 0 forbidden private entries. Artifact: `artifacts/phase77/cold-offline-pwa.json`, `cold-offline-shell.png` |
| Fresh/missing prerequisites | Shell fallback paths unit-tested + script fallback | Pass — missing consent/boot/records show truthful fallback; `offline.html` retained |
| Dirty drafts / queues survive restart | IndexedDB boot + auth quarantine tests; mobile SecureStore quarantine restart test | Pass |
| Account isolation | Two-account auth quarantine + existing mobile isolation tests | Pass — Account B does not see Account A drafts |
| Sync/idempotency/conflicts/portability/deletion | Vitest integration suites (PostgreSQL) | Pass — 109 tests across phase12/13/34/35/36 + sync package |
| Native installed cold launch | `node scripts/phase77-native-cold-offline-evidence.mjs` | **Unmet** — no online adb device; refused Dev Client+Metro as proof |
| SW private-cache ban | Cache inspection in cold drill + unit policy tests | Pass |

### Commands run (working directory: repository root; Node v24.21.0)

| Command | Exit | Notes |
| --- | --- | --- |
| `pnpm exec vitest run apps/web/src/data/indexedDbRepository.test.ts apps/mobile/src/auth.test.ts tests/unit/phase77-offline-shell.test.ts tests/unit/pwa-session-and-banners.test.ts` | 0 | 52 tests |
| `pnpm exec vitest run packages/sync/src/sync.test.ts tests/integration/phase12-sync-receipts-change-feed.test.ts tests/integration/phase13-client-sync-engine.test.ts tests/integration/phase34-conflict-recovery.test.ts tests/integration/phase35-portability-export-import.test.ts tests/integration/phase36-deletion-recovery.test.ts` | 0 | 109 tests |
| `pnpm exec vitest run apps/mobile/src/data/sqliteRepository.test.ts apps/mobile/src/data/keyManager.test.ts` | 0 | 36 tests |
| `node scripts/phase77-cold-offline-evidence.mjs` | 0 | Edge/156 CDP; revision recorded in artifact |
| `node scripts/phase77-native-cold-offline-evidence.mjs` | 0 | result `unmet` |
| `pnpm validate:planning` / `pnpm validate:function-register` / `pnpm audit:secrets` / `git diff --check` | recorded at completion | — |

Browser/device: Microsoft Edge headless CDP (Edg/156) on Windows; no physical Android/emulator online during native drill. Cold PWA evidence used a public static fixture origin (not a full Next.js production install) — limits recorded in the JSON artifact.

## Defects, limitations and recovery

- **DEF-V2-003**: resolved locally for trusted-device web/PWA shell path; not `release_ready`.
- Native self-contained installed-build cold reopen: **unmet** until an operator attests with `DAYNORI_NATIVE_OFFLINE_OK=1` after airplane-mode reopen of an installed build with offline JS.
- Hosted attachment/audio readiness remains Phase 75 blocked; this phase did not enable gated uploads.
- UI lock still does not encrypt browser IndexedDB; native SQLCipher remains fail-closed.
- Interrupted SW install fails activation of incomplete required shell assets (recoverable prior worker retained).
- V1→current IndexedDB upgrade is additive store creation (v9 `offline_boot` / `auth_quarantine`); never drops/recreates DB as automatic repair.

## Documentation and Git review

- ADR: [0077](../decisions/0077-trusted-device-offline-boot-and-session.md); ADR 0066 supersession note; sync-and-offline architecture update; Help offline copy; function-register `offline.cold-reopen` → `verified_local`.
- CHANGELOG.md and progress.json updated in the completion commit.
- Intended commit subject: `feat(offline): preserve organizer access and upgrade recovery`

## Handoff

Phase 77 remains **blocked** on installed-PWA and native cold-launch acceptance. Retain commit `a4fb4cc` and implemented shell/quarantine work; do not rewrite history or manufacture attestation. Owner scheduling [ADR 0078](../decisions/0078-phase-78-before-phase-75-and-77-acceptance.md) allows Phase 78 Help to proceed with 75/77 as referenced evidence inputs. Phase 71 remains blocked on TalkBack.
