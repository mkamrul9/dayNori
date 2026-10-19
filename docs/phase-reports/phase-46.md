# Phase 46: Android vault unlock and secure lifecycle

## Identity and scope

- **Phase ID/specification:** [Phase 46 — Android vault unlock and secure lifecycle](../roadmap/phases/46-android-vault-unlock-and-secure-lifecycle.md).
- **Status:** `blocked` (provisional local harness + lifecycle repairs; Phases 44–45 remain blocked).
- **Contributor and report date:** Cursor agent, 2026-10-19 (Asia/Dhaka); lifecycle repair same day.
- **Base revision:** provisional delivery `6f0d0c0`; repairs on top of that working tree.
- **Prerequisites:**
  - Phase 45: blocked (preparation only; no production vault records/sync).
  - Phase 06: blocked (provisional navigation; TalkBack hardware still open).
  - Phase 44: blocked (physical Android + independent review unmet).

### Implementation plan (distinguished)

| Lane | Delivered now? |
|---|---|
| Phase 46 local Android unlock/lifecycle architecture + synthetic harness UI | **Yes** |
| Lifecycle admission + lock-ordering repairs (cooldown, async cleanup, host races) | **Yes** (repair pass) |
| Phase 45 ciphertext sync / production vault repositories | **No** — harness fixtures only |
| Independent review / physical biometric hardware acceptance | **No** — still required |

Phases 44–45 statuses were **not** advanced.

## Result

Delivered provisional Android vault unlock lifecycle for **local development only**, then repaired confirmed defects:

### Lifecycle repairs (confirmed defects)

**A. Cooldown / admission**

- `admitUnlockAttempt` + `canAcceptUnlockCompletion` in `packages/domain/src/vaultLifecycle.ts`.
- `VaultLifecycleController` (framework-neutral in `@daynori/domain`) rejects disallowed attempts **before** invoking the key provider.
- Completion requires exact pending operation id, generation, and account/workspace binding.
- Passphrase, recovery, and biometric paths share the same admission gate.
- Overlapping unlocks cannot overwrite the active key handle; discarded handles are released.

**B. Lock immediately, cleanup asynchronously**

- `lock()` invalidates pending ops, detaches the key handle, and applies locked state **before** awaiting `releaseKeyHandle` / cache cleanup.
- Individual cleanup failures leave the session locked and expose a redacted diagnostic (`lock_cleanup_partial:…`).

**C. Host integration**

- Late list/detail results gated by epoch + mount + unlocked state.
- Unlock form secrets clear on completion, cancellation, lock, and dismissal.
- Idle lock ticks scheduled while unlocked; AppState background/resume wired.
- Account/workspace identity changes call `onAccountOrWorkspaceChanged`.
- Clipboard clearing uses `tryLoadClipboardClearAdapter()`; calling the helper without an adapter does not claim clearing.
- Capability invalidation / revocation refresh can force lock.
- Synthetic harness entry is `__DEV__`-only (unavailable in release configuration).

Shared domain surfaces for Phase 47 reuse: `vaultProviders.ts`, `vaultSessionController.ts` (web must not import `apps/mobile`).

**Production vault remains disabled for real users.**

### Memory cleanup limits (accurate)

On lock: key handles released (best-effort), plaintext caches cleared via repository hook, protected selection cleared, clipboard cleared only when an adapter is available. JS/Hermes engines do **not** guarantee secure zeroization of prior plaintext buffers.

## Acceptance evidence

| Condition | Method | Result |
|---|---|---|
| Locked screens reveal no sensitive preview | Harness locked landing + a11y labels; navigation gate | PASS (synthetic) |
| Deep links cannot open vault plaintext | App.tsx rejects destinations containing `vault` | PASS (code) |
| Unlock success / wrong creds / cancel / biometric invalidation | `tests/security/phase46-vault-lifecycle.test.ts` | PASS 23/23 |
| Cooldown blocks provider + correct passphrase during cooldown | Controller call-count tests | PASS |
| Overlapping / stale unlock / cancel | Controller tests | PASS |
| Lock before cleanup; cleanup failure stays locked | Controller tests | PASS |
| Background during unlock / stale completion | Controller generation bump tests | PASS |
| Process restart begins locked | `createLockedVaultSession` cold start | PASS |
| PIN sole-secret forbidden | `assertNotSolePinSecret` + provider `pin_scheme_unavailable` | PASS |
| Production provider unavailable | `createProductionUnavailableVaultProviders` | PASS |
| Clipboard without adapter | `clearClipboardIfControllable(undefined)` | PASS (cleared=false) |
| Physical biometric available/changed | Device | **PENDING** |
| Independent security review | External | **MISSING** |
| Phase 45 integration | Production repos/routes | **PENDING** |

### Commands run

Environment: Windows 11, Node `v24.11.1`, pnpm `9.15.5`.

| Command | Exit | Result |
|---|---|---|
| `pnpm vitest run tests/security/phase46-vault-lifecycle.test.ts` | 0 | 23 tests passed |
| `pnpm --filter @daynori/domain build` | 0 | OK |
| `pnpm --filter @daynori/domain typecheck` | 0 | OK |
| `pnpm --filter @daynori/ui-mobile typecheck` | 0 | OK |
| `pnpm --filter @daynori/mobile typecheck` | 0 | OK |
| `pnpm --filter @daynori/mobile exec npx expo export --platform android --output-dir %TEMP%\daynori-expo-export` | 0 | Android Bundled 857 modules → `.hbc` (optional native: `expo-clipboard` present; `expo-screen-capture` not linked → protection reports unsupported) |
| `node scripts/validate-planning.mjs` | (commit verification) | |
| `git diff --check` | (commit verification) | |

### How to run the harness

1. Development build only: `pnpm --filter @daynori/mobile start` (or Expo Android).
2. Settings → **Vault (development harness)** → **Open synthetic vault harness** (`__DEV__` only).
3. Unlock with synthetic passphrase `correct-horse-battery-staple-synthetic` (fixture only).

Emulator crypto evidence remains under Phase 44 (`android-candidate`). Physical-device biometric drills remain pending.

## Defects, limitations and recovery

- Phase 45 integration absent — create/edit/sync not durable.
- Reviewed PIN/device-key scheme unavailable by design.
- `expo-screen-capture` / `expo-clipboard` optional; if unlinked, protection/clearing report unsupported.
- Pre-existing monorepo `pnpm lint` failures outside Phase 46 paths remain (expenses/portability/sync/web).
- Vault must stay feature-gated off for real users until Phase 44/45 gates clear.

## Documentation and Git review

- ADR 0044 (offline unlock limits); phase report; CHANGELOG; progress.json (Phase 46 `blocked` with provisional + repair note; 44/45 unchanged).
- Repair commit subject: `fix(vault): enforce unlock admission and immediate lock cleanup`

## Handoff

Phase 46 provisional work + lifecycle repairs delivered; acceptance incomplete. **Next unblocking actions:** (1) Phase 44 physical Android + independent review, (2) Phase 45 implementation when authorized, (3) wire production Keystore-bound providers and enable real vault entry only after gates. Owner may start Phase 47 as provisional local web harness while these remain blocked.
