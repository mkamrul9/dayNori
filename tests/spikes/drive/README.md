# Phase 48 — Google Drive scope / folder feasibility spike

Isolated experiment harness. **Not** production Drive integration.
Does not authorize vault activation, broader OAuth permissions, or Phase 49 real-user enablement.

## Commands (accurate)

| Command | What it actually does |
|---|---|
| `pnpm vitest run tests/spikes/drive/drive-scope.synthetic.test.ts` | Unit tests: scope tokenization + documentation/synthetic matrix |
| `node tests/spikes/drive/run-spike.mjs --mode=inventory` | Writes inventory JSON only — **no** OAuth, Picker, or Drive API |
| `node tests/spikes/drive/run-spike.mjs --mode=mock` | Alias for `inventory` |
| `node tests/spikes/drive/run-spike.mjs --mode=live` | **Interactive** PKCE OAuth, callback listener, optional Picker page, Drive API probes; writes redacted `results/live-*.json` |

Missing configuration or unfinished consent → outcome `blocked` / `blocked_unexecuted`, **not** successful live verification.

## Live setup

1. Google Cloud **test** project with **Drive API** and **Picker API** enabled.
2. OAuth client:
   - `DAYNORI_DRIVE_CLIENT_TYPE=web` → Web application client; secret required; redirect `http://127.0.0.1:8765/oauth2callback` allowlisted.
   - `DAYNORI_DRIVE_CLIENT_TYPE=installed` → Desktop client; PKCE; secret optional depending on client.
3. Copy `config.example.env` → `config.local.env` (gitignored) and fill values.
4. Dedicated test account; revoke prior app access for a **clean** narrow grant.
5. Optional: set `DAYNORI_DRIVE_NEVER_SELECTED_FILE_ID` and/or use Picker (`DAYNORI_DRIVE_API_KEY`).

```bash
pnpm vitest run tests/spikes/drive/drive-scope.synthetic.test.ts
node tests/spikes/drive/run-spike.mjs --mode=inventory
node tests/spikes/drive/run-spike.mjs --mode=live
```

## Evidence lanes

- **documentation_expectation** / **synthetic_assumption** — not Google observations
- **live_observation** — measured HTTP/capability results from `--mode=live`
- OAuth file authorization ≠ proof of edit/move/trash on a read-only shared file

## Safety

Never log tokens, codes, client secrets, or file contents. Vault material is out of scope.
