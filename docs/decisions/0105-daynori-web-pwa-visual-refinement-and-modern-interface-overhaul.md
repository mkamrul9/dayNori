# ADR-0105: Daynori Web/PWA Visual Refinement and Modern Interface Overhaul

- Status: accepted
- Date: 2026-11-13
- Owner/reviewer: Antigravity agent (owner-authorized Phase 105).
- Related: [Phase 105](../roadmap/phases/105-daynori-web-pwa-visual-refinement-and-modern-interface-overhaul.md), [Phase 104](../roadmap/phases/104-current-daynori-web-pwa-readiness-audit-and-critical-core-fixes.md), [Phase 102](../roadmap/phases/102-authorized-version-2-publication-and-live-verification.md), [ADR 0059](0059-daynori-vector-identity-and-platform-assets.md), [ADR 0068](0068-feature-registry-personalization-and-operator-boundaries.md), [ADR 0069](0069-version-two-visual-direction-prototypes.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0104](0104-current-web-pwa-readiness-audit-and-critical-core-fixes.md), [design-system.md](../design/design-system.md), [accessibility.md](../design/accessibility.md), [information-architecture.md](../design/information-architecture.md).
- Supersedes/superseded by: none. Preserves all outstanding security, hardware, and release gates.

---

## Context & Owner Authorization

Following the successful completion of Phase 104 (Web/PWA readiness audit, 8 verified user journeys, candidate comparison, and truthful gated UI presentation), the project owner authorized Phase 105 with the following instructions:

> "Select one bounded Daynori web/PWA visual refinement phase. Read the project handoff and the V2 design specifications before editing. Capture fresh current-build screenshots of Today, Plan, Library, Journal, Create, menus, Settings, and Ask Nori at desktop and 320–412px mobile widths in light and dark themes.
>
> Make the interface calmer and more modern: reduce repeated large card borders, simplify the first viewport, establish clearer type and spacing hierarchy, remove redundant actions, and redesign navigation and menus so common tasks are obvious. Keep the Daynori identity, use professional icons, and avoid app-authored emoji. Improve dark surfaces, selected states, contrast, focus, empty/error/offline states, and 200% text scaling. Show before/after evidence and test keyboard, screen-reader labels, touch targets, and mobile keyboard behavior. Keep this to web/PWA; update the phase evidence and make one reviewed phase commit and push."

This decision governs Phase 105 scope, architectural constraints, visual refinement principles, and evidence capture.

---

## Decisions

### 1. Calmer & More Modern Visual Direction (Warm Notebook Evolution)
- **Reduce Repeated Large Card Borders**:
  - The previous visual implementation applied individual 1px borders around nearly every container, list row, dialog item, and header control. This created unnecessary visual noise and boxed-in feeling.
  - Phase 105 softens or removes redundant outer borders in favor of subtle surface background distinctions (`surfaceRaised`), quiet dividers, and generous whitespace. Cards feel like sheets of fine notebook paper resting on quiet surfaces rather than nested bordered boxes.
- **Simplify the First Viewport**:
  - Today, Plan, Library, Journal, and Settings first viewports are decluttered. Redundant duplicate action buttons (e.g. "Add routine" immediately adjacent to "Create" which already contains routine creation) are removed.
  - Primary page headings, dates, and immediate organizer items are given focal prominence.
- **Clearer Type & Spacing Hierarchy**:
  - Proportional heading scale: Page Titles (24px/700), Section Headings (18–20px/600), Body (15–16px/400, line-height 1.5), Supporting/Labels (13–14px/500), Metadata (11–12px/500).
  - Consistent vertical rhythm adhering to the 4/8/12/16/24/32px spacing scale.

### 2. Navigation & Menus Overhaul
- **Header Toolbar (`AppHeader.tsx`)**:
  - Replaced individual rectangular border boxes around each icon button with modern, calm subtle ghost buttons that provide smooth hover/focus transitions.
  - Primary `Create` button is visually distinct and prominent.
  - Quick actions (All features, Search, Ask Nori, Theme toggle, Settings, Account) maintain accessible touch targets ($\ge 44 \times 44\text{px}$) and clear `aria-label`s without visual boxing.
- **Sidebar Navigation (`AppSidebar.tsx`)**:
  - Smooth active indicator pill with subtle teal accent (`surfaceRaised` background with soft teal text and pill radius). Clear visual separation between Primary navigation, Pinned modules, and Utilities.
- **Mobile Bottom Navigation (`AppBottomNav.tsx`)**:
  - Redesigned for mobile/PWA with modern subtle icon + label layout, minimum 56px height, comfortable touch targets ($\ge 48\text{px}$), soft active pill, and robust 200% text scaling without clipping.
- **Create Menu & Creation Dialog (`CreationMenu.tsx`, `AppModals.tsx`)**:
  - Redesigned as a unified grouped list with professional vector icons (`note`, `check-square`, `repeat`, `journal`, `file`, `wallet`, `folder`), descriptive subtitles, and soft row dividers instead of individual bordered card boxes.

### 3. Daynori Brand Identity & No-Emoji Invariant
- Preserves the Daynori identity: Warm paper (`#F7F5EF`) in light, deep ink (`#0D1919`) in dark, deep teal action (`#146B63` / `#73C2B6`), amber highlights, and the vector D wordmark.
- Strict no-emoji application chrome invariant: Application-authored chrome uses exclusively vector line icons from `packages/design-tokens/src/icons.ts` rendered via `<Icon name="..." />`.

### 4. Dark Surfaces, Contrast, Selected States, and Focus
- Dark theme surface contrast: `#0D1919` (background) $\to$ `#132323` (surface) $\to$ `#192C2C` (surfaceRaised) ensuring WCAG AA contrast ($\ge 4.5:1$ text, $\ge 3:1$ UI controls).
- High-contrast visible focus rings: `:focus-visible` with 2px solid teal ring and 2px offset.
- Calmer empty, error, and offline states with welcoming notebook copy and clear recovery actions.

### 5. Visual Evidence Matrix (Before & After)
- Captures fresh baseline (before) and post-refinement (after) screenshots across:
  - Screens: Today, Plan, Library, Journal, Create, Menus, Settings, Ask Nori.
  - Viewports: Desktop (1280px), Mobile 412px, Mobile 390px, Mobile 360px, Mobile 320px.
  - Themes: Light and Dark.
- Visual comparison documented in `artifacts/phase105/visual-comparison-report.md`.

---

## Consequences

- Web/PWA interface is significantly calmer, cleaner, more modern, and easier to scan.
- Common tasks (Create, Search, View switching) are immediately obvious with minimal visual friction.
- Mobile touch targets and 200% text scaling are verified against layout overflows.
- Zero breaking changes to underlying contracts, API endpoints, or database schemas.
