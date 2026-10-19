# Phase 48 — Google Drive scope / folder feasibility spike

Isolated experiment harness. **Not** production Drive integration.
Does not authorize vault activation, broader OAuth permissions, or Phase 49.

## What this proves

1. Documentation-supported expectations for `drive.file` + Google Picker.
2. Mock/fixture matrix for operations × authorization states (always runnable).
3. Optional live Google account experiments when owner-provided OAuth config exists.

## Setup (live experiments)

1. Create a Google Cloud project **test** OAuth client (Desktop or Web) with Drive API enabled.
2. Copy `config.example.env` → `config.local.env` (gitignored).
3. Fill `DAYNORI_DRIVE_CLIENT_ID`, and for installed-app flows `DAYNORI_DRIVE_CLIENT_SECRET` only if the client type requires it (never commit).
4. Use a **dedicated test Google account**. Prefer a clean grant (revoke prior Daynori/test app access first).
5. Synthetic files only under a Drive folder you create for this spike — no real user content, no vault material.

```bash
# From repo root
pnpm vitest run tests/spikes/drive/drive-scope.synthetic.test.ts
node tests/spikes/drive/run-spike.mjs --mode=mock
node tests/spikes/drive/run-spike.mjs --mode=live   # requires config.local.env + interactive consent
```

## Modes

| Mode | Needs credentials | Purpose |
|---|---|---|
| `mock` | No | Records expected matrix from fixtures; CI-safe |
| `live` | Yes | Real `drive.file` grant + Picker/API calls; writes redacted results |

## Safety

- Never log tokens, codes, client secrets, or file contents.
- Results store redacted status codes and boolean capability flags only.
- Vault ciphertext/plaintext is out of scope for every experiment.
- Production app Drive connection remains unavailable.
