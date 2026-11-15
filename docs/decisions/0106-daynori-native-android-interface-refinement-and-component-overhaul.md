# ADR-0106: Daynori Native Android Interface Refinement and Component Overhaul

- Status: accepted
- Date: 2026-11-14
- Owner/reviewer: Antigravity agent (owner-authorized Phase 106).
- Related: [Phase 106](../roadmap/phases/106-daynori-native-android-interface-refinement-and-component-overhaul.md), [Phase 105](../roadmap/phases/105-daynori-web-pwa-visual-refinement-and-modern-interface-overhaul.md), [Phase 71](../roadmap/phases/71-native-android-interface-and-navigation-parity.md), [ADR 0059](0059-daynori-vector-identity-and-platform-assets.md), [ADR 0068](0068-feature-registry-personalization-and-operator-boundaries.md), [ADR 0069](0069-version-two-visual-direction-prototypes.md), [ADR 0072](0072-phase-72-before-phase-71-acceptance.md), [ADR 0073](0073-phase-73-before-phase-71-acceptance.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0105](0105-daynori-web-pwa-visual-refinement-and-modern-interface-overhaul.md), [design-system.md](../design/design-system.md), [accessibility.md](../design/accessibility.md).
- Supersedes/superseded by: none. Preserves all outstanding security, hardware, and release gates. Phase 71 remains blocked on physical hardware and spoken TalkBack listen-through.

---

## Context & Owner Authorization

Following the successful completion of Phase 105 (Web/PWA visual refinement, card border reduction, first viewport simplification, modern navigation, and 80 before/after screenshot comparisons), the project owner authorized Phase 106 with the following instructions:

> "Select one bounded native Android interface phase after the web visual direction is verified. Read Phase 71 and its remaining blockers. Adapt the new hierarchy, navigation, menus, forms, and dark theme to native Android components rather than copying the desktop layout. Preserve shared domain behavior, local drafts, Back navigation, and accessibility.
>
> Test Today, Plan, Library, Journal, Settings, Create, and the assistant entry point in light/dark, large text, landscape, and keyboard-open states. Recheck account switching and workspace isolation. Record emulator evidence separately from physical phone and spoken TalkBack evidence; leave Phase 71 blocked if those checks remain unavailable. Update the phase report, CHANGELOG, and progress; make one reviewed phase commit and push."

This decision governs Phase 106 scope, native Android architectural adaptations, component evolution, evidence recording boundaries, and standing push workflow under ADR 0074.

---

## Decisions

### 1. Native Android Adaptation (No Desktop Copying)
- **Native Platform Idioms**:
  - Desktop two-column and sidebar layouts are explicitly not copied to Android.
  - Native Android navigation relies on the top app bar (`MobileHeader`), bottom navigation bar (`MobileNavigationBar`), and draggable bottom sheets (`MobileModalSheet`) with backdrop dismissal and hardware Back button interception.
- **Card Border Reduction & Subtle Elevation**:
  - `MobileCard` supports `variant?: 'subtle' | 'outlined' | 'elevated' | 'flat'`.
  - Removes repetitive harsh 1px borders across lists, stat boxes, and settings in favor of calm surface distinction (`surfaceRaised`), quiet hairline dividers, and native Android elevation (1–2dp).
- **Grouped List Rows & Settings Hub**:
  - `MobileListRow` supports `variant?: 'card' | 'flat' | 'divided'`, `leading?: React.ReactNode` for vector icon container badges, and minimum 48dp touch targets.
  - `SettingsHubView` consolidates 6 standalone cards into a unified grouped container with soft row dividers, vector icon badges, and smooth touch ripples.

### 2. Creation Sheet & Form Refinements
- `CreateSheet` modernizes entity type selector chips into clean, rounded pills with vector icons (`task`, `routine`, `note`, `file`, `journal`).
- Maintains full keyboard-avoidance behavior (`KeyboardAvoidingView` / `subscribeAndroidKeyboardInsets`) keeping Save and Cancel controls reachable with IME active.
- Preserves local drafts on cancel or dismiss, preventing accidental data loss.

### 3. Truthful Gated Assistant Presentation (`DEF-V2-008`)
- In alignment with Phase 104/105, `AssistantSheet` and `MobileHeader` truthfully present the gating status of Ask Nori under `DEF-V2-008`.
- When live AI assistant capability is gated:
  - Renders an informative alert banner explaining that live queries and voice transcription are gated pending provider authorization.
  - Disables the question input (`editable={false}`) and "Ask" button (`disabled={true}`).
  - Disables voice recording (`disabled={true}`).
- Adds `onOpenAssistant` to `MobileHeader` with `testID="header-assistant-btn"` and accessible label `aria-label="Ask Nori assistant (Gated under DEF-V2-008)"`.

### 4. Back Navigation, Touch Targets, and Accessibility
- **Back Navigation**: Hardware Android Back button (`BackHandler`) is integrated across all sheets and nested views, cleanly closing active sheets without terminating the app.
- **Touch Targets**: All interactive elements strictly meet or exceed $\ge 48\text{dp}$ (`touchTargets.mobileMin`).
- **Responsive Adaptations**: Verifies Today, Plan, Library, Journal, Settings, Create, and Assistant entry point across:
  - Light theme (Warm paper `#F7F5EF`, ink `#172C2C`) & Dark theme (Deep ink `#0D1919`, pale paper `#E9F0ED`).
  - Large text scale (up to 200% font scaling).
  - Landscape orientation.
  - Keyboard-open (IME visible) state with bottom nav suppression.

### 5. Multi-Tenant Workspace Isolation & Account Switching
- Re-verifies tenant isolation: switching accounts or signing out completely clears local cached workspace state.
- Cross-tenant resource queries fail closed (404/403).

### 6. Phase 71 Blocker Preservation & Evidence Separation
- Emulator evidence is recorded and documented in `artifacts/phase106/` separately from physical device evidence.
- Physical ARM64 phone verification and human spoken TalkBack listen-through remain unavailable locally.
- In strict adherence to ADR 0074 and owner instructions, **Phase 71 remains blocked** and is not marked complete.

---

## Consequences

- Android app interface achieves calm, modern visual parity with the V2 design direction while honoring native mobile patterns.
- Hardware Back button, local drafts, and accessibility are preserved without regressions.
- Development advances under standing commit-and-push workflow (ADR 0074) without waiving unverified physical hardware gates.
