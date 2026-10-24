# ADR 0046 — Drive scope and external folder access

## Status

Accepted for product direction based on documentation + synthetic matrix. **Live Google-account experiments remain unverified** until owner-provided OAuth configuration and interactive consent are executed (`tests/spikes/drive`).

## Context

Phase 48 must choose between narrow `drive.file` / Picker selected-file mode and a broader folder-mirroring scope. Phase 03 already flagged restricted Drive scopes. Vault activation and production Drive connection are out of scope.

Official scope guidance (reviewed 2026-10-19):

- [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) — `drive.file` is non-sensitive per-file access via app-created files or Picker; `drive` / `drive.readonly` are restricted and may require security assessment when storing data.
- [Search for files and folders](https://developers.google.com/workspace/drive/api/guides/search-files) — parent queries list direct children only; recursive traversal is client-side and still subject to authorization.

## Decision

**Ship product promises on selected/app-created-file mode within `https://www.googleapis.com/auth/drive.file`.**

1. Authorize only app-created files and files/folders the user explicitly selects (Google Picker / supported file picker).
2. Do **not** claim that selecting a folder authorizes all existing or future children. Treat that as unsupported until live experiments prove otherwise; if proven insufficient, either require per-child selection or a separately justified broader-scope proposal.
3. Do **not** silently broaden consent to make a failed narrow experiment pass.
4. Broader folder-mirroring (`drive` / `drive.readonly` / metadata-wide scopes) stays deferred pending:
   - Live experiment evidence that narrow mode cannot meet a documented product need
   - Current OAuth verification / sensitive-or-restricted scope requirements
   - Security assessment and cost quote when restricted-scope server storage applies (do not invent fees)
5. Vault material is excluded from Drive connectors.
6. UX must distinguish: app-managed copy vs provider reference; disconnect vs grant revocation; unavailable source after external deletion/permission loss.

## Consequences

- Truthful UX: “files you create here or pick” — not “entire Drive folder sync.”
- Offline: retained imported copies are app storage; provider references can become unavailable.
- Quota/retry: Drive failures remain Drive failures; do not silently switch providers.
- Phase 49+ implementation must keep production connection feature-gated until connector phases pass.

## Alternatives considered

| Option | Why not now |
|---|---|
| Restricted full-Drive mirror | Verification/assessment/cost unknown; violates least privilege without proven need |
| Assume folder pick = recursive children | Contradicts per-file model; not accepted without live proof |

## Validation

- Synthetic matrix + runner: `tests/spikes/drive`
- Live cases: pending owner OAuth + clean test grant

## Related

- ADR 0011 (Google Drive scope and OAuth architecture)
- `docs/architecture/integrations-and-reminders.md`
- Phase 48 report
