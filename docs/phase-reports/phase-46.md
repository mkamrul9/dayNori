# Phase 46: Android vault unlock and secure lifecycle

## Identity and scope

- **Phase ID/specification:** [Phase 46 — Android vault unlock and secure lifecycle](../roadmap/phases/46-android-vault-unlock-and-secure-lifecycle.md).
- **Status:** `blocked` (provisional local harness delivered under explicit owner selection while Phases 44–45 remain blocked).
- **Contributor and report date:** Cursor agent, 2026-10-19 (Asia/Dhaka).
- **Base revision:** `e1d3f40` on `main`.
- **Prerequisites:**
  - Phase 45: blocked (preparation only; no production vault records/sync).
  - Phase 06: blocked (provisional navigation; TalkBack hardware still open).
  - Phase 44: blocked (physical Android + independent review unmet).

### Implementation plan (distinguished)

| Lane | Delivered now? |
|---|---|
| Phase 46 local Android unlock/lifecycle architecture + synthetic harness UI | **Yes** |
| Phase 45 ciphertext sync / production vault repositories | **No** — harness fixtures only |
| Independent review / physical biometric hardware acceptance | **No** — still required |

Phases 44–45 statuses were **not** advanced.

## Result

Delivered provisional Android vault unlock lifecycle for **local development only**:

- Domain lifecycle reducer: `packages/domain/src/vaultLifecycle.ts` (lock states, retry policy, offline unlock policy, protected navigation, transfer UI status copy).
- Provider contracts: production **unavailable** bundle (no silent mock fallback) + labeled synthetic harness providers.
- Controller: `apps/mobile/src/vault/VaultLifecycleController.ts` — unlock/cancel/fail, background/idle lock, account change, session expiry, revocation check when online, stale unlock rejection.
- UI: `MobileVaultUnlockSheet`, `MobileVaultShellView` (locked landing, list/detail, trash, transfer preview states).
- Host: Settings → “Open synthetic vault harness” (`VaultHarnessView`). **Not** a bottom-nav production vault tab.
- Presentation helpers: screen-capture module probe, clipboard clear helper, locked a11y labels, log redaction.
- ADR 0044 documents offline unlock limits and non-claims.

**Production vault remains disabled for real users.**

### Memory cleanup limits (accurate)

On lock: key handles released, plaintext caches cleared via repository hook, protected selection cleared, clipboard cleared when API available. JS/Hermes engines do **not** guarantee secure zeroization of prior plaintext buffers.

## Acceptance evidence

| Condition | Method | Result |
|---|---|---|
| Locked screens reveal no sensitive preview | Harness locked landing + a11y labels; navigation gate | PASS (synthetic) |
| Deep links cannot open vault plaintext | App.tsx rejects destinations containing `vault` | PASS (code) |
| Unlock success / wrong creds / cancel / biometric invalidation | `tests/security/phase46-vault-lifecycle.test.ts` | PASS 15/15 |
| Background during unlock / stale completion | Controller generation bump tests | PASS |
| Process restart begins locked | `createLockedVaultSession` cold start | PASS |
| PIN sole-secret forbidden | `assertNotSolePinSecret` + provider `pin_scheme_unavailable` | PASS |
| Production provider unavailable | `createProductionUnavailableVaultProviders` | PASS |
| Physical biometric available/changed | Device | **PENDING** |
| Independent security review | External | **MISSING** |
| Phase 45 integration | Production repos/routes | **PENDING** |

### Commands run

Environment: Windows 11, Node `v24.11.1`, pnpm `9.15.5`.

| Command | Exit | Result |
|---|---|---|
| `pnpm vitest run tests/security/phase46-vault-lifecycle.test.ts` | 0 | 15 tests passed |
| `pnpm --filter @daynori/domain build` | 0 | OK |
| `pnpm --filter @daynori/ui-mobile build` | 0 | OK |
| `pnpm --filter @daynori/domain typecheck` | 0 | OK |
| `pnpm --filter @daynori/ui-mobile typecheck` | 0 | OK |
| `pnpm --filter @daynori/mobile typecheck` | 0 | OK |
| `node scripts/validate-planning.mjs` | (commit verification) | |
| `git diff --check` | (commit verification) | |

### How to run the harness

1. `pnpm --filter @daynori/mobile start` (or Expo Android).
2. Settings → **Vault (development harness)** → **Open synthetic vault harness**.
3. Unlock with synthetic passphrase `correct-horse-battery-staple-synthetic` (fixture only).

Emulator crypto evidence remains under Phase 44 (`android-candidate`). Phase 46 UI is exercised via the mobile app + Vitest; physical-device biometric drills remain pending.

## Defects, limitations and recovery

- Phase 45 integration absent — create/edit/sync not durable.
- Reviewed PIN/device-key scheme unavailable by design.
- `expo-screen-capture` optional; if unlinked, protection reports unsupported.
- Pre-existing monorepo `pnpm lint` failures outside Phase 46 paths remain (expenses/portability/sync/web).
- Vault must stay feature-gated off for real users until Phase 44/45 gates clear.

## Documentation and Git review

- ADR 0044; phase report; CHANGELOG; progress.json (Phase 46 `blocked` with provisional delivery note; 44/45 unchanged).
- Intended commit subject: `feat(vault): add provisional Android unlock lifecycle harness`

## Handoff

Phase 46 provisional work delivered; acceptance incomplete. **Next unblocking actions:** (1) Phase 44 physical Android + independent review, (2) Phase 45 implementation when authorized, (3) wire production Keystore-bound providers and enable real vault entry only after gates. Stop before Phase 47.
