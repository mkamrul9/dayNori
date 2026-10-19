# Phase 48: Drive scope and external folder feasibility

## Identity and scope

- **Phase ID/specification:** [Phase 48 — Drive scope and external folder feasibility](../roadmap/phases/48-drive-scope-and-external-folder-feasibility.md).
- **Status:** `blocked` (harness + documentation decision delivered; live Google experiments unverified).
- **Contributor and report date:** Cursor agent, 2026-10-19 (Asia/Dhaka).
- **Base revision:** Phase 47 repair `32d0256`.
- **Prerequisites:**
  - Phase 03: complete (prior Drive scope warnings in spikes/ADRs).
  - Phase 38: blocked (private beta infra still owner-gated) — does not block local spike harness.

### Distinguishing lanes

| Lane | Delivered? |
|---|---|
| Runnable local spike + synthetic matrix + setup instructions | **Yes** |
| Live Google account experiments with clean `drive.file` grant | **No** — OAuth client unset |
| Production Drive connection / Phase 49 | **No** — not authorized |
| Vault activation | **No** — remains disabled |

## Result

- Spike at `tests/spikes/drive` (mock + live-ready config inspection; refuses restricted scopes).
- ADR 0046: **selected/app-created-file mode** under `drive.file`; folder-child recursion not promised.
- Architecture update in `docs/architecture/integrations-and-reminders.md` (dated 2026-10-19 links).
- Experiment inventory covers app-created, Picker file/folder, never-selected, existing/external children, moves, trash/restore, permission loss, revocation, reauth.

### Observed access limits (documentation + synthetic)

| Case class | Metadata | Enumerate | Download/export | Create/upload | Update/move/trash |
|---|---|---|---|---|---|
| App-created / Picker file | allowed | allowed | allowed | varies | allowed |
| Never selected / external child after folder pick | denied | denied | denied | denied | denied |
| Existing children of selected folder | denied (assumption) | denied | denied | denied | denied |
| Live confirmations | **unexecuted** | **unexecuted** | **unexecuted** | **unexecuted** | **unexecuted** |

Same-account ownership is **not** counted as OAuth application access proof.

### Scope / ownership decision

**Accepted direction:** selected/app-created-file mode (`drive.file` + Picker). Broader folder mirror deferred. UX must say the app can see files it creates or the user picks — not an entire folder tree. Ownership: prefer provider reference with explicit import-copy when offline retention is needed; disconnect ≠ grant revocation semantics documented in ADR 0046.

Verification/assessment: non-sensitive `drive.file` still needs current OAuth verification checks at implementation; restricted scopes would need assessment — **fees quote-required, not invented**.

## Acceptance evidence

| Condition | Method | Result |
|---|---|---|
| Runnable spike without credentials | `node tests/spikes/drive/run-spike.mjs --mode=mock` | PASS |
| Synthetic matrix tests | `pnpm vitest run tests/spikes/drive/drive-scope.synthetic.test.ts` | PASS |
| Live Drive experiments | Requires `config.local.env` | **UNEXECUTED** (`DAYNORI_DRIVE_CLIENT_ID` unset) |
| Official docs review | Dated links in ADR 0046 | PASS (docs) |

### Commands run

Environment: Windows 11, Node `v24.11.1`, pnpm `9.15.5`.

| Command | Exit | Result |
|---|---|---|
| `pnpm vitest run tests/spikes/drive/drive-scope.synthetic.test.ts` | 0 | 7 passed |
| `node tests/spikes/drive/run-spike.mjs --mode=mock` | 0 | 13 cases → `results/mock-inventory.json`; LIVE_UNVERIFIED |
| `node tests/spikes/drive/run-spike.mjs --mode=live` | 0 | inventory written; consent unexecuted (no client id) |
| `pnpm --filter @daynori/web typecheck` | 0 | OK (no Drive web wiring) |
| `node scripts/validate-planning.mjs` | 0 | passed |
| `git diff --check` | 0 | clean |

Config inspection: no Drive OAuth variables set in environment or `.env` (keys scanned without printing values).

### Owner handoff for live experiments

1. Create a Google Cloud **test** OAuth client; enable Drive API.
2. Copy `tests/spikes/drive/config.example.env` → `config.local.env`; set `DAYNORI_DRIVE_CLIENT_ID` (secret only if client type requires it).
3. Use a dedicated test account; revoke prior app grants for a clean narrow-scope consent screen.
4. Run `node tests/spikes/drive/run-spike.mjs --mode=live` and complete interactive Picker/API cases; fill redacted observed results.
5. Do not broaden scopes if a case fails — record denial and revisit ADR 0046 only with evidence.

## Defects, limitations and recovery

- Live matrix unverified → Phase 48 incomplete for full acceptance.
- Phase 38 blocked; production connection unavailable.
- Vault remains excluded and disabled.

## Documentation and Git review

- ADR 0046; architecture; phase report; CHANGELOG; progress.json (`48` blocked).
- Commit subject (preparation accurate): `docs(drive): add scope feasibility spike and narrow-mode decision`

## Handoff

Phase 48 local spike + narrow-mode decision delivered; live Google proof pending owner OAuth. **Next action:** supply test OAuth client + run live inventory, or proceed only when owner selects later phases. **Stop before Phase 49.** Production Drive connection and vault activation stay unavailable.
