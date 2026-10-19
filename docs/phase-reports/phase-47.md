# Phase 47: Web vault and security release gate

## Identity and scope

- **Phase ID/specification:** [Phase 47 — Web vault and security release gate](../roadmap/phases/47-web-vault-and-security-release-gate.md).
- **Status:** `blocked` / provisional local harness (owner selected Phase 47 while prerequisites remain blocked).
- **Contributor and report date:** Cursor agent, 2026-10-19 (Asia/Dhaka).
- **Base revision:** Phase 46 repair `28a227f` on `main`.
- **Prerequisites:**
  - Phase 45: blocked — no production vault sync/enrollment.
  - Phase 46: blocked — provisional Android lifecycle + repairs; physical/review gates open.
  - Phase 05: blocked — provisional web shell; TalkBack hardware still open.
  - Phase 44: blocked — physical Android + independent review unmet.

### Implementation plan (distinguished)

| Lane | Delivered now? |
|---|---|
| Browser vault architecture + labeled synthetic harness UI | **Yes** |
| Production browser key providers / Phase 45 sync | **No** |
| Independent vault security review + release enablement | **No** |

Phases 44–46 statuses were **not** falsely marked complete.

## Result

Provisional web vault unlock lifecycle for **local development only**:

- Reuses `@daynori/domain` `VaultLifecycleController`, provider contracts, and shared synthetic harness fixtures (no `apps/mobile` imports).
- Production providers: `createProductionUnavailableVaultProviders()` — never auto-substituted.
- Disabled production entry: `/vault` status page (no unlock UI, no plaintext).
- Development harness: `/dev/vault-harness` (`NODE_ENV === 'development'` only; **404 in production**).
- UI: `VaultUnlockPanel`, `VaultShellView` in `@daynori/ui-web`.
- Browser host: inactivity ticks, visibility/`pagehide` lock, account/workspace change, stale async guards, cross-tab lock signals via `BroadcastChannel` (lock/session_invalidated only — unlock does not propagate).
- CSP + security headers in `apps/web/next.config.mjs` (dev vs production policies separated).
- Service worker: `/vault` and `/dev/vault-harness` excluded from caching.
- ADR 0045 documents browser lifecycle limits and residual CSP `unsafe-inline` finding.

**Production vault remains disabled for real users.**

### Memory cleanup / compromised-client limits (accurate)

Lock detaches key handles, clears UI plaintext, and attempts clipboard wipe when the Clipboard API is available. JS engines do not guarantee secure zeroization. A compromised browser profile or extension can observe plaintext while unlocked. Ciphertext drafts may persist; they are not plaintext.

## Acceptance evidence

| Condition | Method | Result |
|---|---|---|
| Locked DOM / navigation restrictions | Domain controller + harness shell | PASS (synthetic) |
| Unlock / recovery / cancel / cooldown / unavailable | `phase47-web-vault.test.ts` | PASS |
| Lock during pending unlock; cleanup failure stays locked | Controller tests | PASS |
| Account change / stale responses | Controller + host epoch gates | PASS (unit + host code) |
| Cross-tab lock signals (no secrets) | Unit test of channel helpers | PASS |
| Production `/vault` HTML has no synthetic secrets | `curl` production server | PASS |
| `/dev/vault-harness` unavailable in production | HTTP 404 | PASS |
| CSP headers on production responses | `curl -sI` | PASS (see residual finding) |
| Keyboard / focus / a11y full browser automation | Playwright not installed | **NOT EXECUTED** (manual harness recommended) |
| Independent security review | External | **MISSING** |
| Phase 45 enrollment / sync interoperability | Production | **PENDING** |

### Residual / unresolved findings (remain visible)

1. Production CSP still allows `script-src 'unsafe-inline'` until a Next.js nonce pipeline is wired.
2. Successful CSP header checks do **not** substitute for independent security review.
3. Pre-existing `apps/web` ESLint failures in `expenses/page.tsx` (`no-explicit-any`, `no-empty`) block `next build` without `--no-lint`. Not introduced by Phase 47.
4. Full interactive browser XSS/storage/network inspection suite not automated here.

### Commands run

Environment: Windows 11, Node `v24.11.1`, pnpm `9.15.5`.

| Command | Exit | Result |
|---|---|---|
| `pnpm vitest run tests/security/phase46-vault-lifecycle.test.ts tests/security/phase47-web-vault.test.ts` | 0 | 35 passed |
| `pnpm --filter @daynori/domain build` | 0 | OK |
| `pnpm --filter @daynori/ui-web build` | 0 | OK |
| `pnpm --filter @daynori/ui-web typecheck` | 0 | OK |
| `pnpm --filter @daynori/web typecheck` | 0 | OK |
| `pnpm --filter @daynori/mobile typecheck` | 0 | OK |
| `pnpm --filter @daynori/web build` | 1 | Pre-existing ESLint errors in `expenses/page.tsx` |
| `pnpm --filter @daynori/web exec next build --no-lint` | 0 | Production build OK; `/vault` 161 B route; harness present but 404 at runtime |
| `next start -p 3017` + `curl -sI http://127.0.0.1:3017/vault` | 0 | CSP + nosniff + DENY frame + Permissions-Policy present; no synthetic secrets in body |
| `curl` `/dev/vault-harness` (production) | 0 | HTTP 404 |
| `node scripts/validate-planning.mjs` | (commit verification) | |
| `git diff --check` | (commit verification) | |

### How to run the harness

1. `pnpm --filter @daynori/web dev`
2. Settings → **Open synthetic vault harness**, or open `/dev/vault-harness`.
3. Unlock with `correct-horse-battery-staple-synthetic` (fixture only).
4. Confirm: locking one tab publishes a lock signal; unlocking one tab does **not** unlock another.

## Defects, limitations and recovery

- Phase 45 integration absent — durable create/edit/sync not available; harness states are local UI only.
- Passkey/device interaction kept unavailable pending reviewed key-release design.
- Independent review and release gates unmet → Phase 47 incomplete.
- Real-user vault activation must stay disabled.

## Documentation and Git review

- ADR 0045; phase report; CHANGELOG; progress.json (`47` blocked/in_progress provisional; 44–46 unchanged as blocked).
- Provisional commit subject: `feat(vault): add provisional web unlock lifecycle harness`

## Handoff

Phase 47 provisional web harness delivered; canonical acceptance incomplete. **Next unblocking actions:** (1) complete Phase 44/45 gates and independent review, (2) wire reviewed browser production providers, (3) resolve CSP nonce/`unsafe-inline` finding, (4) enable real vault only after release gates. **Stop before Phase 48.**
