# ADR-0071: Native Android Settings hub, Back stack, and inset adapter

- Status: accepted (implementation advanced; device acceptance incomplete — spoken TalkBack and persistence journeys open)
- Date: 2026-10-26
- Related: [ADR 0068](0068-feature-registry-personalization-and-operator-boundaries.md), [ADR 0070](0070-mobile-web-pwa-layout-and-settings.md), Phase 71

## Context

Phase 70 grouped web Settings into hub + focused routes. Native Android needed the same
information architecture without wrapping the web app, while honoring hardware Back,
keyboard avoidance, and TalkBack. `react-native-safe-area-context` is not installed on the
Expo 52 / RN 0.76 mobile app; an additional dependency must stay compatible if introduced.

On API 35 edge-to-edge AVDs, accessibility can report header controls as clickable while the
system StatusBar window still intercepts taps in the statusBars inset (~128px).

## Options

1. Keep a single scrolling Settings surface — fails mobile readability parity with Phase 70.
2. Adopt React Navigation stacks — out of scope for a focused Phase 71 shell adaptation.
3. Hub + focused group screens on the existing App modal stack with BackHandler priority.
4. Rely on `StatusBar.currentHeight` alone for top inset — under-reports vs real intercept.

## Decision

1. **Settings hub** (`SettingsHubView`) lists Account, Appearance, Notifications, Workspace,
   Privacy, and Help. Focused content stays in `SettingsView` filtered by `group`.
2. **Back priority (Android):** topmost non-settings modal → Settings nested overlay returns
   to Settings → Settings group → Settings hub → Plan/Library detail → Today → system exit.
   Nested Settings-originated overlays are listed in `SETTINGS_NESTED_MODALS`.
3. **Insets / keyboard:** `packages/ui-mobile` `androidInsets` subscribes to
   `Keyboard` show/hide, hides the bottom nav while the IME is open, and uses
   `KeyboardAvoidingView` with `padding` on Android for sheets and note editors. Top chrome
   clearance uses `androidStatusBarTopPad()` / App inline pad:
   `min(160, max(StatusBar.currentHeight, scaled 48dp, 128))` so under-reported heights cannot
   leave header taps trapped under the StatusBar window.
4. **Orientation:** `app.json` `orientation: default` and MainActivity `unspecified` so
   landscape evidence is possible on the nominated AVD (portrait lock blocked rotation).
5. **Operator boundaries:** gallery, vault harness, provisional Drive/rooms/assistant/billing
   remain operator-gated; ordinary Settings account copy states developer tools stay restricted.
6. **Build provenance:** short-path APK builds sync dirty `apps/mobile` / `packages/ui-mobile`
   sources via `scripts/sync-short-build-working-tree.mjs` and record working-tree fingerprints
   so HEAD-only checkouts cannot silently omit Phase 71 edits. ABI is selectable via
   `DAYNORI_ANDROID_ABI` (x86_64 for the nominated AVD). Dev Client APK hash ≠ Metro JS fingerprint.

## Consequences

- Web and native Settings group ids stay aligned for documentation and Help mappings.
- Device evidence scripts must use distinct postconditions and restore a11y/font/rotation.
- Spoken TalkBack listen-through remains a separate acceptance gate; service enablement alone
  does not satisfy Phase 71.
- Landscape requires an APK rebuilt after orientation unlock; Metro-only JS changes cannot
  change native `screenOrientation`.
