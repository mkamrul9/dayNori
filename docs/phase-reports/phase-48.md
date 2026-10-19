# Phase 48: Drive scope and external folder feasibility

## Identity and scope

- **Phase ID/specification:** [Phase 48 — Drive scope and external folder feasibility](../roadmap/phases/48-drive-scope-and-external-folder-feasibility.md).
- **Status:** `blocked` (harness + documentation decision + repair delivered; live Google experiments still unverified without owner OAuth).
- **Contributor and report date:** Cursor agent, 2026-10-19 (Asia/Dhaka); repair same day.
- **Base revision:** Phase 47 repair `32d0256`; initial Phase 48 spike `25b0c8a`.
- **Prerequisites:**
  - Phase 03: complete (prior Drive scope warnings in spikes/ADRs).
  - Phase 38: blocked (private beta infra still owner-gated) — does not block local spike harness.

### Distinguishing lanes

| Lane | Delivered? |
|---|---|
| Runnable local spike + synthetic matrix + setup instructions | **Yes** |
| Centralized exact-URI scope validation (`@daynori/domain`) | **Yes** (repair) |
| Genuine interactive live runner (OAuth/PKCE/callback/Picker/Drive) | **Yes** (repair); exits `blocked` when config absent |
| Live Google account experiments with clean `drive.file` grant | **No** — OAuth client unset |
| Production Drive connection / Phase 49 | **No** — not authorized by this phase alone |
| Vault activation | **No** — remains disabled |

## Result

- Spike at `tests/spikes/drive`:
  - `--mode=inventory` (alias `--mode=mock`): documentation inventory only — **no** Google calls.
  - `--mode=live`: interactive PKCE OAuth, local callback listener, optional Picker page, Drive API probes; writes redacted `results/live-*.json`.
- Scope validation centralized in `packages/domain/src/driveScopes.ts` (tokenize + exact URI approve/forbid). Used by TypeScript spike helpers and the live runner.
- ADR 0046: **selected/app-created-file mode** under `drive.file`; folder-child recursion not promised.
- Evidence lanes kept separate: documentation/synthetic vs live observation; mock denial ≠ observed Google denial; OAuth selection ≠ mutating capability proof.

### Observed access limits

| Case class | Evidence | Metadata | Enumerate | Download/export | Create/upload | Update/move/trash |
|---|---|---|---|---|---|---|
| App-created / Picker file | documentation | allowed | allowed | unverified/allowed | varies | unverified |
| Never selected / external child after folder pick | documentation | denied | denied | denied | denied | denied |
| Existing children of selected folder | synthetic_assumption | unverified | unverified | unverified | unverified | unverified |
| Live confirmations | live | **unexecuted** (config blocked) | **unexecuted** | **unexecuted** | **unexecuted** | **unexecuted** |

### Scope / ownership decision

**Accepted direction:** selected/app-created-file mode (`drive.file` + Picker). Broader folder mirror deferred. UX must say the app can see files it creates or the user picks — not an entire folder tree.

### Repair (post-`25b0c8a`)

| Defect | Fix |
|---|---|
| `--mode=live` only wrote inventory / never ran OAuth | `src/liveRunner.ts` + CLI spawn; missing config → `live-blocked.json` outcome `blocked` |
| `assertNarrowScope` substring / ordering holes | `tokenizeScopes` + exact `APPROVED_DRIVE_SCOPES` / `FORBIDDEN_DRIVE_SCOPES` |
| Mock denial treated like Google denial | folder-child matrix uses `unverified` + synthetic_assumption notes |
| Selection = edit capability | capabilities split from `oauthAuthorization` |

## Acceptance evidence

| Condition | Method | Result |
|---|---|---|
| Inventory without credentials | `node tests/spikes/drive/run-spike.mjs --mode=inventory` | PASS |
| Synthetic matrix + scope tests | `pnpm vitest run tests/spikes/drive/drive-scope.synthetic.test.ts` | PASS (6) |
| Live runner without credentials | `node tests/spikes/drive/run-spike.mjs --mode=live` | PASS → `outcome=blocked`, `live-blocked.json` |
| Domain build | `pnpm --filter @daynori/domain build` | PASS |
| Live Drive experiments with Google account | Requires `config.local.env` | **UNEXECUTED** |

### Commands run (repair verification)

Environment: Windows 11, Node `v24.11.1`, pnpm `9.15.5`.

| Command | Exit | Result |
|---|---|---|
| `pnpm --filter @daynori/domain build` | 0 | OK |
| `pnpm vitest run tests/spikes/drive/drive-scope.synthetic.test.ts` | 0 | 6 passed |
| `node tests/spikes/drive/run-spike.mjs --mode=inventory` | 0 | inventory.json; no Google |
| `node tests/spikes/drive/run-spike.mjs --mode=live` | 0 | blocked; observed=0 |

### Owner handoff for live experiments

1. Google Cloud **test** project: enable **Google Drive API** and **Google Picker API**.
2. OAuth client matching platform:
   - `DAYNORI_DRIVE_CLIENT_TYPE=web` → Web client + secret; redirect `http://127.0.0.1:8765/oauth2callback` allowlisted.
   - `DAYNORI_DRIVE_CLIENT_TYPE=installed` → Desktop/installed; PKCE; secret per client type rules.
3. Copy `tests/spikes/drive/config.example.env` → `config.local.env`; set client id/type/secret/API key as required.
4. Dedicated test account; revoke prior app access for a **clean** narrow grant.
5. Run `node tests/spikes/drive/run-spike.mjs --mode=live`; complete consent/Picker; retain redacted `results/live-*.json`.
6. Do not broaden scopes on failure — record denial.

## Defects, limitations and recovery

- Live matrix unverified → Phase 48 incomplete for full acceptance.
- Phase 38 blocked; production connection unavailable.
- Vault remains excluded and disabled.

## Documentation and Git review

- ADR 0046; spike README; phase report; CHANGELOG; progress.json (`48` blocked).
- Repair commit subject target: `fix(drive): repair live spike path and exact scope validation`

## Handoff

Phase 48 local spike + narrow-mode decision + repairs delivered; live Google proof pending owner OAuth. Vault activation stays unavailable. Owner has separately authorized provisional Phase 49 local development without clearing live scope proof.
