# ADR 0077: Trusted-device offline boot and session boundaries

- Status: Accepted
- Date: 2026-10-27
- Deciders: Owner via Phase 77 selection; Cursor agent implementation
- Related: [ADR 0066](0066-offline-shell-and-safe-pwa-updates.md), [ADR 0015](0015-authentication-across-web-and-android.md), [sync-and-offline](../architecture/sync-and-offline.md), Phase 77

## Context

ADR 0066 kept private HTML/API out of shared Cache Storage and used public `offline.html` for cold offline navigation. That explanatory fallback does not reopen the private organizer. Phase 77 requires a previously authorized trusted device to reopen supported local organizer screens after process close without network, while preserving quarantine, sync receipts, and safe updates.

## Decision

### Public executable shell

1. Cold navigation offline serves a **public** executable shell (`/offline-shell.html` + `/offline-shell.js`) from Cache Storage. The shell embeds **no** user-specific state.
2. Private organizer data is restored only by opening the account-scoped IndexedDB repository after **trusted-device consent** and a durable **offline boot context** written while the user was authorized online.
3. Authenticated HTML, RSC payloads, API/auth responses, signed URLs, and private content remain **forbidden** in shared Cache Storage (ADR 0066 retained).
4. If consent, storage, keys, boot context, or namespace data are missing/corrupt, the shell shows a **truthful fallback** (improved `offline.html` / in-shell explanation). Never fetch a private route and cache it as the shell.

### Authorization boundaries

5. An editable `localStorage` account ID alone is **not** authorization. Boot context lives in IndexedDB (`offline_boot` store) and is validated against existing namespaced local records.
6. Local unlock of previously retained data ≠ permission to call authenticated APIs or replay mutations. On reconnect, revalidate live session/membership before sync push/pull.
7. A disconnected client cannot instantly discover server-side revocation. When revocation is observed, preserve existing wipe/quarantine behavior.
8. UI locks do not encrypt browser IndexedDB. Native SQLCipher/key handling remains fail-closed without plaintext fallbacks.

### Account transitions

9. Logout/account switch quarantines uncommitted drafts into durable, user-scoped storage (IndexedDB drafts quarantine on web; OS-backed secure store on native). Account B cannot read/search/export/restore/replay account A’s drafts.
10. Returning to the original authorized account may restore retained quarantined drafts per policy.

### Relationship to ADR 0066

11. This ADR **supersedes** ADR 0066’s product claim that cold reopen cannot reconstruct private organizer screens. It **retains** ADR 0066’s private-cache ban, safe Update/Later unsaved guards, banner stack, and session resilience rules.
12. `offline.html` remains the honest fallback when shell prerequisites are absent.

## Consequences

- Service worker navigation fallback prefers `offline-shell.html`, then `offline.html`.
- Function-register `offline.cold-reopen` / DEF-V2-003 update only to the extent cold-launch evidence proves.
- Warm already-open sessions continue to use IndexedDB + mutation queue as today.
