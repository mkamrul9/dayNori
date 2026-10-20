# ADR-0047: Provisional Drive selected-file connector

Date: 2026-10-19. Status: accepted (provisional local).

## Context

Phase 48 chose narrow `drive.file` + selected/app-created mode (ADR 0046). Phase 49 implements a local connector while live Google verification, OAuth verification, and private-beta infrastructure remain unmet.

Official guidance reviewed 2026-10-19:

- [OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server) — authorization code, exact redirect URI, `state`, offline access for refresh tokens.
- [OAuth 2.0 for Mobile & Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app) — PKCE; Android uses system browser / Custom Tabs, not embedded WebViews; do not assume desktop custom-scheme redirects are valid on Android.
- [Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) — `drive.file` is per-file; not recursive folder grant.
- ADR 0011 — server-side AES-256-GCM refresh tokens; no client-held refresh secrets.

## Decision

1. **Provider selection fail-closed.** Production `GoogleDriveProvider` requires OAuth client env **and** `DAYNORI_DRIVE_PRODUCTION_ENABLED=true`. Missing config never simulates a successful real connection. `FakeGoogleDriveProvider` is tests / explicitly labeled harness only (`DAYNORI_DRIVE_PROVIDER=fake` or test injection).
2. **Authorization.** Server-brokered auth-code + PKCE; expiring single-use intents bound to account/workspace; allowlisted callbacks/return paths; validate requested and granted scopes via `@daynori/domain` exact-URI helpers.
3. **Token storage.** AES-256-GCM with external key (`DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY` / `DAYNORI_DRIVE_TOKEN_KEY_VERSION`), AAD bound to workspace/connection/account. No plaintext fallback or hardcoded key.
4. **Selected-file mode only.** Link / import / upload / offline-download for explicitly selected or app-created IDs; reject shortcuts and unsupported shared-drive cases; vault excluded; unlink does not trash remote.
5. **Disconnect fencing.** Fence and wipe locally **before** best-effort provider revoke; increment `generation`; cancel pending Drive jobs; record `provider_revoke_status` separately so local disconnect success does not require confirmed revoke.
6. **Picker access token.** Short-lived, account-bound, `Cache-Control: no-store`, memory-only; never refresh tokens to clients.
7. **Worker execution.** Background Drive jobs claim with lease tokens and run the shared executor: real download/upload bytes, Phase 24 ingest for imports, verified local bytes for uploads, `pending_offline` until client ack (never `offline_cached` from server alone).
8. **Upload identity.** Persist operation keys; Google adapter reconciles via `appProperties` before creating duplicates after uncertain responses.
9. **Status.** Phase remains **blocked / incomplete** until live scope proof and release prerequisites are met. Vault activation stays disabled. Fake provider is rejected in production runtimes.

## Consequences

- Local fake-provider journeys are evidence of architecture, not Google verification.
- Android production requires configured HTTPS redirect for Custom Tabs — not a copied desktop custom scheme.
- Broader Drive scopes and folder mirroring remain deferred (ADR 0046).
- Repair dated 2026-10-20 corrected status-only worker completion, placeholder bytes, tautological selection checks, and OAuth code leakage into settings URLs.
