# ADR-0070: Mobile web/PWA layout and grouped Settings

- Status: accepted
- Date: 2026-10-26
- Related: [ADR 0065](0065-mobile-pwa-usability-preview.md), [ADR 0066](0066-offline-shell-and-safe-pwa-updates.md), [ADR 0068](0068-feature-registry-personalization-and-operator-boundaries.md), [ADR 0069](0069-version-two-visual-direction-prototypes.md), Phase 70

## Context

Phase 69 delivered desktop shell density. Narrow browser and installed-PWA widths still
needed compact chrome, grouped Settings (not a long wall), full-screen editors, agenda-first
calendar, and coordinated banners without covering primary actions. Physical Android IME
and installed-PWA proof remain separate from emulated overflow captures.

## Options

1. Keep a single Settings page with anchors — fails mobile readability and focus management.
2. Introduce a separate mobile app shell — out of Phase 70 scope (native is Phase 71).
3. Content-width responsive adapters on the existing web shell with routed Settings groups.

## Decision

1. **Compact mobile chrome:** one sticky header without essential horizontal scrolling;
   labeled bottom destinations from the feature registry; Create remains a labeled global
   action; All features stays a one-tap shell control so shell → All features → destination
   remains two actions.
2. **Settings routes:** hub `/settings` plus `/settings/account`, `/appearance`,
   `/notifications`, `/workspace`, `/privacy`, `/help`. Subpages share Back/focus chrome.
   Quiet hours and journal preview privacy persist through profile preferences with revision
   conflict handling; account-switch guards ignore late responses for another user.
3. **Editors:** task/routine dialogs use mobile full-screen panels with sticky Save/Cancel,
   Escape, body scroll lock, and `unsavedWork` so ADR 0066 Update protection still applies.
4. **Calendar:** agenda remains the default; month stays reachable; selected date is preserved
   across view switches; narrow hint documents timezone.
5. **Viewport adapter:** `visualViewport` feature-detect updates `--daynori-keyboard-inset`
   and `--daynori-vv-height`; banners sit above bottom nav + keyboard inset. Keyboard
   simulation is not physical Android IME evidence.
6. **Desktop composition** from Phase 69 is unchanged at ≥768px.

## Consequences

Native Android redesign remains Phase 71. Physical installed-PWA keyboard/Back/safe-area
review stays unverified until hardware evidence exists. Phase 99 still owns the deferred
five-participant journey review. No `release_ready` claim follows from local responsive
verification.
