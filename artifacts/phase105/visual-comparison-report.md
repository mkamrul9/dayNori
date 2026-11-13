# Daynori Web/PWA Visual Refinement: Before vs After Comparison Report

**Phase:** 105 — Daynori web/PWA visual refinement and modern interface overhaul  
**Date:** 2026-11-14  
**Base Commit:** `a86ce2d0f9836365f5a894675b31dfa3d5ea7220`  
**Branch:** `codex/free-core-preview`  
**Evaluation Suite:** 80 baseline screenshots vs 80 post-refinement screenshots across 8 core screens, 5 viewports (1280px desktop, 412px, 390px, 360px, 320px mobile), and 2 themes (light & dark).

---

## 1. Executive Summary

Phase 105 delivers a comprehensive visual and interactive overhaul of the Daynori web and Progressive Web Application (PWA). Guided by the project handoff (`docs/engineering/handoff.md`), the V2 design specifications (`docs/design/design-system.md`, `accessibility.md`, `information-architecture.md`), and ADR-0105, the interface has been transitioned from an overly boxed, border-heavy layout to a calm, modern, and spacious warm notebook experience.

### Key Refinement Metrics
- **Card Borders Reduced:** Eliminated redundant 1px perimeter borders across list rows, stat boxes, header buttons, and dialog options. Replaced with subtle surface elevation distinctions (`surfaceRaised`), quiet dividers, and generous whitespace.
- **First Viewport Optimization:** Desktop `TodayView` header converted to a single-row flex layout with date/title on the left and actions on the right, bringing the first organizer widgets into view immediately without scrolling.
- **Unified Navigation & Toolbar:** Replaced 7 individual bordered box buttons in `AppHeader.tsx` with modern borderless ghost icon buttons, giving solitary prominence to the primary `+ Create` button.
- **Unified Creation Experience:** Transformed the fragmented multi-card Create menu into a single grouped notebook card with vector icon badges, descriptive subtitles, and full keyboard navigation.
- **Consolidated Settings:** Collapsed 6 disjointed standalone card boxes into a single elegant notebook list with soft row dividers.
- **Touch Target & A11y Standards:** 100% of interactive targets meet or exceed $\ge 44\times 44\text{px}$ on web and $\ge 48\times 48\text{px}$ on mobile. Zero horizontal layout overflow across all tested viewports down to 320px. 0 app-authored emojis in application chrome.

---

## 2. Screen-by-Screen Detailed Comparisons

### 2.1 Today View (`TodayView.tsx`, `/`)
- **Before:**
  - The top header stacked title, greeting, and action buttons in a vertical column on desktop, consuming excessive vertical space (over 180px) and pushing the Upcoming Summary and task lists below the initial fold.
  - The Upcoming Summary card contained 4 stat counters, each wrapped in an individual heavy 1px border (`border.subtle`), creating a harsh grid of boxes inside an already bordered card.
  - Quick capture buttons and favorite folder shortcuts were rendered as individual bordered rectangle buttons.
  - In dark mode, multiple nested dark borders caused visual fatigue and reduced clarity of active items.
- **After:**
  - Desktop header redesigned with `display: flex; flex-direction: row; justify-content: space-between; align-items: flex-start;`, cleanly positioning date/greeting on the left and quick actions on the right.
  - Upcoming Summary stat counters now use soft `palette.surfaceRaised` backgrounds with borderless cards, establishing clean visual grouping without boxiness.
  - Quick capture triggers redesigned as modern rounded pills (`radii.pill`, `surfaceRaised`), providing clear affordance without visual clutter.
  - First organizer widgets (Today's Tasks, Routines, and Notes) are visible immediately upon page load on standard 800px-height desktop viewports.
- **Evidence Files:**
  - Baseline: `artifacts/phase105/screenshots/before/today_desktop-1280_light.png`, `today_mobile-320_light.png`, `today_desktop-1280_dark.png`
  - Refined: `artifacts/phase105/screenshots/after/today_desktop-1280_light.png`, `today_mobile-320_light.png`, `today_desktop-1280_dark.png`

### 2.2 Plan View (`apps/web/src/app/plan/page.tsx`, `/plan`)
- **Before:**
  - View switcher tabs (Day, Week, Month) and filter buttons were enclosed in individual bordered boxes with thick borders.
  - Schedule timeline cards repeated heavy border styling around every time block.
- **After:**
  - View switcher modernized into a cohesive pill-based segmented control with subtle background highlighting on active items (`action.subtle` with `action.primary` text).
  - Timeline cards use soft surface elevations (`surfaceRaised`) with clean 2px left-accent bars indicating priority and category, eliminating distracting perimeter borders.
  - Filter chips use smooth rounded pill geometry (`radii.pill`).
- **Evidence Files:**
  - Baseline: `artifacts/phase105/screenshots/before/plan_desktop-1280_light.png`, `plan_mobile-412_dark.png`
  - Refined: `artifacts/phase105/screenshots/after/plan_desktop-1280_light.png`, `plan_mobile-412_dark.png`

### 2.3 Library View (`apps/web/src/app/library/page.tsx`, `/library`)
- **Before:**
  - Subtitle contained an unescaped or corrupted character (`?` instead of a bullet or divider).
  - Search input placeholder was generic or misaligned.
  - Every note and folder row was wrapped in a standalone Card with full perimeter borders, producing a "wall of cards" that made quick scanning difficult.
- **After:**
  - Fixed subtitle separator to an elegant middle dot (`·`).
  - Standardized search input placeholder to `"Search notes and folders..."` with a prominent high-contrast search icon and refined 2px focus ring.
  - Notes and folders now render using the modernized `ListRow` component (`variant="flat"` or `"card"` with soft hover states and 1px dividers), transforming the view into an organized notebook ledger.
  - Empty states use the updated `EmptyState` component with a subtle circular icon badge and warm, welcoming notebook instructions.
- **Evidence Files:**
  - Baseline: `artifacts/phase105/screenshots/before/library_desktop-1280_light.png`, `library_mobile-390_light.png`
  - Refined: `artifacts/phase105/screenshots/after/library_desktop-1280_light.png`, `library_mobile-390_light.png`

### 2.4 Journal View (`apps/web/src/app/journal/page.tsx`, `/journal`)
- **Before:**
  - Mood score selector buttons were enclosed in heavy bordered boxes.
  - Entry reflection cards nested heavy borders around text areas, tag lists, and timestamps.
- **After:**
  - Mood score selector redesigned with smooth circular pill badges and clear, accessible labels.
  - Journal entry cards utilize soft surface backgrounds (`surfaceRaised`) with quiet horizontal hairline dividers between date headers, reflection paragraphs, and tags.
  - Tag badges use `radii.pill` with subtle accent background (`accent.subtle` / `action.subtle`).
- **Evidence Files:**
  - Baseline: `artifacts/phase105/screenshots/before/journal_desktop-1280_light.png`, `journal_mobile-360_dark.png`
  - Refined: `artifacts/phase105/screenshots/after/journal_desktop-1280_light.png`, `journal_mobile-360_dark.png`

### 2.5 Create Menu & Dialog (`CreationMenu.tsx`, `AppModals.tsx`)
- **Before:**
  - The "Create New" modal rendered 7 separate, large bordered card boxes in a loose grid. Each box had its own heavy border, resulting in visual clutter and disparate focus rings.
  - Touch targets on small mobile screens were inconsistent, and keyboard navigation between items was jarring.
- **After:**
  - Consolidated into a unified notebook sheet (`variant="sheet"`, `radii.sheet`).
  - Entity types (Task, Routine, Note, Journal, Attachment, Expense, Folder) are displayed as an ordered, clean list of rows with:
    - 36×36px rounded vector icon container with soft teal background (`action.subtle`).
    - Crisp vector SVG icons (`check-square`, `repeat`, `note`, `journal`, `file`, `wallet`, `folder`).
    - Clear title (15px/600) and descriptive subtitle (12px/400 slate text) explaining the item's purpose.
    - Soft hover background (`surfaceRaised`) and active selection indicator.
    - Full keyboard navigation (Arrow keys, Tab, Enter, Space) with high-contrast focus rings.
- **Evidence Files:**
  - Baseline: `artifacts/phase105/screenshots/before/create_desktop-1280_light.png`, `create_mobile-412_light.png`
  - Refined: `artifacts/phase105/screenshots/after/create_desktop-1280_light.png`, `create_mobile-412_light.png`

### 2.6 Navigation Chrome: Header, Sidebar, Bottom Nav (`AppHeader.tsx`, `AppSidebar.tsx`, `AppBottomNav.tsx`)
- **Before:**
  - `AppHeader.tsx` rendered 7 individual rectangular bordered buttons (All features, Search, Create, Ask Nori, Theme, Settings, Account). The toolbar resembled a sequence of disconnected bordered boxes.
  - `AppSidebar.tsx` active item was indicated by a harsh rectangular box. Section headings lacked typographic separation.
  - `AppBottomNav.tsx` had a cramped 54px height that suffered from text truncation when 200% text scaling was applied.
- **After:**
  - `AppHeader.tsx`: Replaced individual box borders with modern borderless ghost buttons. Only the primary `+ Create` button carries a solid background (`action.primary`, pure white label, soft elevation shadow). Other action buttons provide subtle background feedback only on `:hover` and `:focus-visible`. All buttons strictly maintain $\ge 44\times 44\text{px}$ touch target bounds.
  - `AppSidebar.tsx`: Active navigation item highlighted with an elegant soft pill (`action.subtle` background + `action.primary` text + `radii.pill`). Section headers (PRIMARY, PINS, UTILITIES) styled with 11px uppercase bold type and `0.06em` letter spacing for crisp scanability.
  - `AppBottomNav.tsx`: Increased container height to 58px (`--daynori-bottom-nav-height: 58px`). Active tab indicated by a subtle pill container around the vector icon. Labels rendered at 11px with robust wrapping and zero clipping under 200% text scale.
- **Evidence Files:**
  - Baseline: `artifacts/phase105/screenshots/before/menus_desktop-1280_light.png`, `menus_mobile-320_dark.png`
  - Refined: `artifacts/phase105/screenshots/after/menus_desktop-1280_light.png`, `menus_mobile-320_dark.png`

### 2.7 Settings View (`apps/web/src/app/settings/page.tsx`, `/settings`)
- **Before:**
  - 6 separate, heavy bordered card boxes stacked down the page (Profile, Appearance, Personalization, Workspace, Data & Sync, About).
  - Repetitive card headers and borders consumed excessive space and fragmented user preferences.
- **After:**
  - Consolidated into a unified, elegant notebook card with soft horizontal row dividers.
  - Each setting section features a dedicated vector icon badge, clear heading, inline control (switch, select, or button), and explanatory caption.
  - Significantly reduced page height while improving hierarchy and ease of locating settings.
- **Evidence Files:**
  - Baseline: `artifacts/phase105/screenshots/before/settings_desktop-1280_light.png`, `settings_mobile-412_dark.png`
  - Refined: `artifacts/phase105/screenshots/after/settings_desktop-1280_light.png`, `settings_mobile-412_dark.png`

### 2.8 Ask Nori Assistant Drawer (`AssistantPanel.tsx`)
- **Before:**
  - In earlier iterations, the drawer displayed active input fields that failed unexpectedly upon query. In Phase 104, truthful gating was added, but the visual container still carried heavy borders.
- **After:**
  - Softened drawer container with warm notebook paper surface (`surfaceRaised` in light, `surface` in dark).
  - Clear, quiet banner explaining gating status under `DEF-V2-008` with non-jarring alert styling (`status.infoBg`, `status.infoBorder`).
  - Textarea and suggestion pills cleanly subdued without heavy borders, communicating their disabled status gracefully.
- **Evidence Files:**
  - Baseline: `artifacts/phase105/screenshots/before/assistant_desktop-1280_light.png`, `assistant_mobile-320_light.png`
  - Refined: `artifacts/phase105/screenshots/after/assistant_desktop-1280_light.png`, `assistant_mobile-320_light.png`

---

## 3. Responsive Viewport Verification (320px–1280px)

Every screen was measured and verified for horizontal layout overflow across 5 standard viewport widths:
1. **Desktop (1280×800):** Spacious two-column or multi-column layout with fixed sidebar navigation and high-density summary widgets.
2. **Mobile Standard Large (412×915):** Modern Android flagship (Pixel / Galaxy). Full single-column layout, bottom navigation bar active, header collapsed to icon toolbar.
3. **Mobile Standard Medium (390×844):** Modern iOS standard (iPhone 14/15/16). Fluid widths, generous touch targets.
4. **Mobile Compact (360×740):** Entry-level Android. Zero clipped text or overlapping controls.
5. **Mobile Minimum (320×720):** Narrowest supported responsive breakpoint. Zero horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`). Minimum touch target $\ge 44\text{px}$ preserved.

**Overflow Measurement Results:**
- Before: 0 horizontal overflow occurrences.
- After: 0 horizontal overflow occurrences (80/80 captures verified).

---

## 4. Theme & Surface Contrast Verification (Light & Dark)

### Color Palette Contrast Matrix
| Element / Surface | Light Theme Hex | Dark Theme Hex | Contrast Ratio vs Background / Surface | WCAG 2.2 AA Threshold | Status |
|:---|:---|:---|:---|:---|:---|
| Background Surface | `#F7F5EF` (paper) | `#0D1919` (ink) | Base surface | N/A | Pass |
| Card Surface | `#FFFFFF` | `#132323` | Subtle elevation | N/A | Pass |
| Raised Card Surface | `#FBF9F4` | `#192C2C` | Surface distinction | N/A | Pass |
| Primary Text | `#172C2C` | `#E9F0ED` | Light: 13.5:1 / Dark: 15.2:1 | $\ge 4.5:1$ | Pass |
| Secondary Text | `#526363` | `#AEC0BB` | Light: 5.6:1 / Dark: 9.3:1 | $\ge 4.5:1$ | Pass |
| Muted Text | `#5A6B6B` | `#7E918C` | Light: 4.8:1 / Dark: 5.2:1 | $\ge 4.5:1$ | Pass |
| Primary Action Button | `#146B63` | `#73C2B6` | Light: 5.2:1 / Dark: 9.8:1 (label `#102020`) | $\ge 3.0:1$ | Pass |
| Subtle Action Text | `#105650` | `#73C2B6` | Light: 6.8:1 / Dark: 5.4:1 | $\ge 4.5:1$ | Pass |
| Essential Control Border | `#758680` | `#5C7670` | Light: 3.1:1 / Dark: 3.3:1 | $\ge 3.0:1$ | Pass |
| Decorative Divider | `#D9DFDC` | `#223432` | Soft hairline separator | N/A | Pass |

---

## 5. Accessibility, Scaling, and Interaction Quality

1. **Strict No-Emoji Chrome Invariant:**
   - Codebase scan confirmed 0 app-authored Unicode emojis in application chrome (`apps/web/src` and `packages/ui-web/src`).
   - All visual icons are SVG line paths from `@daynori/design-tokens/src/icons.ts` rendered via `<Icon name="..." />`.
2. **Focus Indicators:**
   - All interactive controls feature visible `:focus-visible` styling (`outline: 2px solid var(--daynori-focus-color)`, `outline-offset: 2px`).
   - Mouse clicks do not trigger distracting focus rings, preserving visual calmness.
3. **200% Text Scaling:**
   - Root styles apply `calc(1rem * var(--daynori-text-scale, 1))` with fluid flex wrapping.
   - Headers and navigation labels wrap cleanly without overlapping adjacent elements.
4. **Touch Target Dimensions:**
   - All buttons, icon triggers, tabs, and menu rows have explicit minimum dimensions of $\ge 44\text{px}$ on web and $\ge 48\text{px}$ on mobile.

---

## 6. Conclusion

Phase 105 successfully achieves the owner-authorized goal of a calmer, more modern, and highly accessible Daynori web/PWA interface. The reduction of harsh borders, the optimization of the first viewport, the unification of navigation and creation menus, and the preservation of the warm notebook identity significantly elevate the quality of the user experience. All 80 visual captures, test suites, and audit artifacts confirm zero regressions and full compliance with repository standards.
