# Phase 47: Web vault and security release gate

## Identity and scope

- **Phase ID/specification:** [Phase 47 — Web vault and security release gate](../roadmap/phases/47-web-vault-and-security-release-gate.md).
- **Status:** `blocked` / provisional local harness (owner-selected; prerequisites remain blocked).
- **Contributor and report date:** Cursor agent, 2026-10-19 (Asia/Dhaka); local verification repair same day.
- **Base revision:** provisional `04d26da`; local repairs on top.
- **Prerequisites:** Phases 05/44–46 remain blocked (TalkBack hardware, physical Android, Phase 45 sync, independent review).

## Result

Provisional web vault unlock lifecycle for local development, plus local verification repairs:

### Local repairs (this pass)

| Item | Result |
|---|---|
| Normal web build with lint | **PASS** — fixed 5 ESLint issues in `expenses/page.tsx` (`no-explicit-any` ×4, empty catch ×1) |
| Production script CSP | **PASS (effective)** — middleware nonce + `strict-dynamic`; production `script-src` has **no** `unsafe-inline` / `unsafe-eval` |
| Permissions-Policy vs audio | **PASS** — `microphone=(self)` app-wide; `microphone=()` on `/vault` and `/dev/vault-harness` |
| connect-src | Includes `'self'`, configured API/Supabase/storage origins, local defaults `3001`/`54321`; dev adds `ws:`/`wss:` |
| Playwright browser checks | **PASS 18/18** via harness Playwright (`run-web-vault-lifecycle.mjs`) |
| Unlock sheet stays open after failure | **Fixed** in `VaultHarnessClient` |
| Search consumer boundary | Unit test against `searchDownloadedRecords` vault exclusion |

**Still unresolved for release acceptance:** independent security review, Phase 45 production providers/sync, CSP `style-src 'unsafe-inline'` residual, physical/review gates on 44–46.

**Production vault remains disabled for real users.**

## Acceptance evidence

| Condition | Method | Result |
|---|---|---|
| Normal `pnpm --filter @daynori/web build` (lint on) | Command | PASS exit 0 |
| Production CSP nonce, no script unsafe-inline/eval | Playwright + `curl`-equivalent headers | PASS |
| Inline event-handler script blocked | Playwright probe | PASS |
| Production harness 404 | Playwright | PASS |
| Settings renders under nonce CSP | Playwright | PASS |
| Unlock / fail / cancel path / lock / storage / cross-tab | Playwright | PASS |
| Keyboard focus to passphrase | Playwright | PASS |
| Search excludes vault scope | Vitest consumer boundary | PASS |
| Independent security review | External | **MISSING** |
| Phase 45 enrollment/sync | Production | **PENDING** |

### Commands run

Environment: Windows 11, Node `v24.11.1`, pnpm `9.15.5`.

| Command | Exit | Result |
|---|---|---|
| `pnpm --filter @daynori/web typecheck` | 0 | OK |
| `pnpm --filter @daynori/web build` | 0 | Lint + types + production build OK |
| `pnpm vitest run tests/security/phase47-web-vault.test.ts` | 0 | 13 passed |
| `node tests/security/vault/harnesses/run-web-vault-lifecycle.mjs` (after build; `PROD_PORT=3137` `DEV_PORT=3138`) | 0 | 18/18 PASS; evidence `tests/security/vault/harnesses/evidence/web-vault-lifecycle-latest.md` |

### How to run the harness

1. `pnpm --filter @daynori/web dev` → Settings → Open synthetic vault harness, or `/dev/vault-harness`.
2. Browser automation: `pnpm --filter @daynori/web build` then `node tests/security/vault/harnesses/run-web-vault-lifecycle.mjs`.

## Defects, limitations and recovery

- Phase 45 integration absent.
- Independent review unmet → Phase 47 incomplete.
- `style-src 'unsafe-inline'` retained for React inline styles (documented residual).
- Real-user vault activation stays disabled.

## Documentation and Git review

- ADR 0045; this report; CHANGELOG; progress.json (`47` blocked).
- Repair commit subject: `fix(web): restore linted build and nonce CSP for vault`

## Handoff

Local Phase 47 verification gaps closed; release gates still open. Owner selected Phase 48 Drive feasibility next — vault activation remains disabled. **Stop before treating Phase 47 as complete.**
