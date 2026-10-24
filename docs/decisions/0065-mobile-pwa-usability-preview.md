# ADR-0065: Mobile PWA usability for free preview

- Status: accepted
- Date: 2026-10-22
- Related: [Phase 60](../roadmap/phases/60-public-android-and-web-release.md), [Phase 31](../roadmap/phases/31-first-use-tutorial-and-progressive-discovery.md), [ADR 0063](0063-free-core-testing-preview.md)

## Context

The owner primarily uses Daynori as an installed Android Chrome PWA on the $0
preview. Reported problems: overlapping text, dense explanatory copy, hard-to-use
mobile chrome, weak beginner guidance, and uncertainty that saves persist.

## Decision

1. Shared CSS layout tokens (`--daynori-bottom-nav-height`, main bottom padding with
   safe-area) and wrapping utilities replace page-by-page overflow hacks.
2. Dialogs use viewport-safe max height (`dvh`) and bottom-sheet alignment on narrow
   screens without hiding primary actions behind `overflow: hidden` alone.
3. Preview limitations use a one-line banner with accessible expandable details.
4. The existing three-step onboarding state machine remains; copy and layout teach
   Today/Plan/Library/Journal, task vs routine, save-then-sync, opt-in samples, and
   optional PWA install — without a second onboarding system.
5. Service-worker update shows an explicit Update/Later banner; SKIP_WAITING still
   requires user action. Private HTML/API caching boundaries stay unchanged.
6. Manifest `start_url` is `/today` for standalone launch.
7. Narrow grids use `minmax(min(100%, 11rem), 1fr)` (or shared `.daynori-responsive-grid`)
   so dialogs and Library cards do not force horizontal overflow under 320–412 CSS px.
8. Beginner guide offers optional real “Write note” / “Add task” practice creates
   (deterministic practice ids, distinct from labeled Sample starters). Replay does
   not re-run practice creates.
9. Chrome `beforeinstallprompt` surfaces a one-shot Install / Not now banner; dismiss
   and standalone display do not repeat. Manual install steps stay in Help/tutorial.

## Consequences

Physical-phone usability testing and full Phase 60 release gates remain separate.
Offline editing of already-open sessions is not claimed as a full offline shell.
Upload/audio/reminder limits remain enforced by ADR 0063.
