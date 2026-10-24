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
3. **Cold offline launch** (app closed, then opened with no network) serves the improved
   public `offline.html` shell explaining that this device needs a prior signed-in session
   and that reconnecting restores cloud sync. While online, the client may post observed
   allowlisted `/_next/static` URLs to the service worker (`PRECACHE_PUBLIC_STATIC`) to warm
   Cache Storage. Authenticated HTML, RSC, and APIs remain uncached. Cold reopen still
   cannot reconstruct private organizer screens without a network.
4. **Safe updates:** document-level `data-daynori-unsaved` signals dirty editors. The Update
   action refuses to activate SKIP_WAITING while unsaved; Later dismisses; no unconditional
   timed reload while dirty; drafts/IndexedDB/receipts are never cleared as an update fix.
5. **Banner stack:** Install and Update share one stacked status region; Update takes
   priority so they cannot overlap.
6. **Session resilience:** temporary network / free-server cold-start failures must not clear
   an authenticated UI session; only explicit unauthenticated or auth-error responses do.
   Concurrent refresh uses per-instance single-flight keyed by refresh token.

## Consequences

Full offline reopen of every screen without a prior warm JS cache remains a tracked gap.
Rooms/chat stay production-disabled without a separate reviewed preview capability.
Physical Android verification and owner login remain required for account evidence.
