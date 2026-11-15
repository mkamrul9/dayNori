# ADR-0117: Daynori Web/PWA Visual Polish and Usability Refinement

- Status: accepted
- Date: 2026-11-15
- Owner/reviewer: Antigravity agent (owner-authorized Phase 117).
- Related: [Phase 117](../roadmap/phases/117-daynori-web-pwa-visual-polish-and-usability-refinement.md), [Phase 105](../phase-reports/phase-105.md), [Phase 111](../phase-reports/phase-111.md), [Phase 112](../phase-reports/phase-112.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [release-gates.md](../engineering/release-gates.md).
- Supersedes/superseded by: Extends and refines the visual improvements from Phase 105 and 111. Eliminates repetitive card borders and box-in-box nesting across navigation, Today, Library, Journal, forms, dialogs, and empty states. Establishes calmer typography, spacing hierarchy, polished button and segmented controls, and verified WCAG 2.2 AA contrast and keyboard accessibility. Preserves all fail-closed release gates (`DEF-V2-001`, `DEF-V2-004`, `DEF-V2-005`, `DEF-V2-007`, `DEF-V2-008`, `DEF-V2-011`, `DEF-V2-013`, `OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`). Phase 71 remains blocked on physical hardware and spoken TalkBack listen-through.

---

## Context & Owner Scheduling Authorization

The project owner authorized Phase 117 with the following instructions:

> "Make the enabled Daynori web/PWA experience visually polished and easier to use. Follow AGENTS.md and work in one selected phase. Review the actual app in light and dark mode at desktop and mobile sizes, especially navigation, Today, Library, Journal, forms, empty states, and dialogs. Simplify excessive boxes and visual clutter; improve typography, spacing, hierarchy, colors, and menu design while keeping a coherent design system. Check contrast, keyboard use, screen readers, and reduced motion. Capture before/after screenshots from the running app and test the main user journeys. Fix any functional regressions introduced by the redesign. Preserve unrelated changes and report exactly what was tested."

---

## 1. Visual Polish Decisions

### 1.1 De-Boxifying and Calming Surface Hierarchy
- **The Problem:** The interface previously suffered from "box inside box" visual clutter, where every section, card, list container, and row had rigid 1px solid borders (`border.subtle`), creating visual noise and drawing attention away from user content.
- **The Decision:**
  - Modernize `Card` to support a `calm` or `subtle` presentation with soft 1px border or borderless surface, refined shadow (`0 1px 3px rgba(0,0,0,0.04)` light / `0 1px 4px rgba(0,0,0,0.25)` dark), and generous padding.
  - In `TodayView.tsx`, replace nested bordered containers with clean divided sections, subtle hairlines, and whitespace.
  - In `EmptyState.tsx`, remove harsh border boxes; use a soft, warm surface card with circular icon badge, clear heading, relaxed line-height text, and a well-spaced primary action button.

### 1.2 Navigation & Menu Refinements
- **`AppHeader.tsx`:**
  - Streamline quick action ghost buttons with subtle hover pills and clear `:focus-visible` outlines.
  - Polish the primary `Create` button with refined padding, border radius, and subtle elevation shadow.
  - Improve search kbd shortcut `/` badge for minimal visual footprint.
- **`AppSidebar.tsx`:**
  - Refine active navigation state with a soft pill background (`action.subtle`), subtle left accent indicator, and 600-weight typography.
  - Section headers (`Primary`, `Pins`, `Utilities`) styled with crisp uppercase letter-spacing.
- **`AppBottomNav.tsx`:**
  - Ensure >= 48px touch targets, comfortable indicator pills for the active tab, clear typography, and complete resilience against 200% font scaling and narrow 320px–380px viewports without label clipping.
- **Mobile Menu Drawer (`AppModals.tsx`):**
  - Streamline list rows with comfortable touch targets (>= 48px), clean dividers between Primary and Utilities, and interactive theme toggle with high-contrast sun/moon icons.

### 1.3 Today View Usability Refinement
- **Header & Progress:** Clean greeting and date display with gentle progress bar rendered in soft teal tones.
- **Routine Checklist:** Clean rows with smooth completion toggle, comfortable touch targets, and clear status feedback.
- **Task List:** Grouped tasks due today with subtle priority badges and clean hover states.
- **Journal Reflection Prompt Card:** Inviting notebook card styling with quote accent and a prominent "Write reflection" button.
- **Customize Controls:** Clean secondary customize button on desktop and mobile, with accessible modal controls.

### 1.4 Library View Streamlining
- **Toolbar:** Cohesive search input, "Write note" primary button, and "New folder" secondary button with balanced spacing and clear visual priority.
- **List Rows & Badges:** Distinct type badges (`Note`, `Knowledge`, `File`) with high contrast in both themes, subtle row dividers, and clean hover states.

### 1.5 Journal View Usability Refinement
- **Segmented Control:** Unified pill-style tab switcher for `Day View`, `Timeline`, and `Trash`.
- **Date Stepper:** Clean, cohesive date navigation controls with balanced icon and label buttons.
- **Reflection Prompts:** Warm notebook quote presentation encouraging daily mindful reflections.

### 1.6 Forms & Dialogs Polish
- **Dialogs (`Dialog.tsx`):** Softer backdrop blur, rounded corners (`radii.sheet`), refined title and close button with clear focus ring.
- **Creation Menu (`CreationMenu.tsx`):** Bottom sheet / dialog with 5 entity choices, clean list rows, distinct icon colors, and clear descriptions.
- **Form Inputs (`TextField.tsx`, `TextArea.tsx`, `Checkbox.tsx`):** Consistent 2px focus-visible rings (`var(--color-focus-ring)`), high contrast placeholder and label text, and comfortable touch targets.

---

## 2. Accessibility & Design System Conformance

1. **WCAG 2.2 AA Contrast:**
   - Normal text >= 4.5:1 against all surfaces in Light ("Warm Paper") and Dark ("Deep Ink").
   - Large text and headings >= 3:1.
   - Active UI components and focus boundaries >= 3:1.
2. **Keyboard Focus & Screen Readers:**
   - Universal `:focus-visible` outline: 2px solid `var(--color-focus-ring)` with 2px offset.
   - Screen reader announcements (`aria-live="polite"`) for navigation, sync, and status changes.
   - Skip links (`.daynori-skip-link`) for keyboard navigation.
3. **Reduced Motion:**
   - `prefers-reduced-motion: reduce` respected with instant animation and transition overrides.
4. **Zero Emoji In Chrome:**
   - All application chrome uses scalable SVG vector icons from `@daynori/design-tokens` / `@daynori/ui-web`. Zero emoji in application controls.

---

## 3. Evidence & Release Gate Invariant

1. **80 Before and 80 After Genuine Screenshots:**
   - Captured across desktop (1280px) and 4 mobile viewports (412px, 390px, 360px, 320px) in light and dark themes.
   - Zero byte-identical pairs: 40/40 distinct light/dark pairs verified in both before and after manifests.
   - Zero horizontal layout overflow across all captures down to 320px.
2. **Fail-Closed Release Gates:**
   - All unreleased modules remain gated: Drive (`DEF-V2-005`), AI (`DEF-V2-008`), Voice (`DEF-V2-008`/`DEF-V2-011`), Vault (`DEF-V2-001`/`DEF-V2-004`), Rooms (`DEF-V2-006`), Billing (`DEF-V2-007`), Push (`DEF-V2-002`), and Android (`OWNER-SIGNING-KEYS`/`DEF-V2-011`).
   - Phase 71 remains strictly blocked.
