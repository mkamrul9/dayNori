# ADR-0066: Offline organizer reopen and safe PWA updates

- Status: accepted
- Date: 2026-10-22
- Related: [ADR 0065](0065-mobile-pwa-usability-preview.md), [ADR 0063](0063-free-core-testing-preview.md), Phase 60

## Context

The free Android Chrome PWA must remain usable after network loss and across updates.
The service worker already forbids caching private HTML, APIs, auth responses, and signed
URLs. Navigation offline currently falls back to `offline.html`, which is not a full
organizer. Update previously forced reload without checking unsaved edits, and Install /
Update banners shared the same screen corner.

## Decision

1. **Private cache boundary unchanged.** Do not put authenticated HTML or API payloads in
   shared Cache Storage.
2. **Already-open sessions** continue offline through account-scoped IndexedDB repositories
   and the sync mutation queue. UI must show an honest offline/sync status.
3. **Cold offline launch** (historical): served the improved public `offline.html` shell.
   Authenticated HTML, RSC, and APIs remain uncached; while online the client may post
   allowlisted `/_next/static` URLs (`PRECACHE_PUBLIC_STATIC`). **Superseded for product
   cold-reopen by [ADR 0077](0077-trusted-device-offline-boot-and-session.md):** trusted
   devices may reopen a public executable shell that restores account-scoped IndexedDB.
   Private-cache bans and safe Update/Later rules in this ADR remain in force.
4. **Safe updates:** document-level `data-daynori-unsaved` signals dirty editors. The Update
   action refuses to activate SKIP_WAITING while unsaved; Later dismisses; no unconditional
   timed reload while dirty; drafts/IndexedDB/receipts are never cleared as an update fix.
5. **Banner stack:** Install and Update share one stacked status region; Update takes
   priority so they cannot overlap.
6. **Session resilience:** temporary network / free-server cold-start failures must not clear
   an authenticated UI session; only explicit unauthenticated or auth-error responses do.
   Concurrent refresh uses per-instance single-flight keyed by refresh token.

## Consequences

Trusted-device cold reopen of local organizer screens is specified in ADR 0077 / Phase 77.
Rooms/chat stay production-disabled without a separate reviewed preview capability.
Physical Android verification and owner login remain required for account evidence.
