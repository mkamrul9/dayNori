# Phase 117: Human Design Feedback and Qualitative Usability Review

- **Date:** 2026-11-15
- **Evaluator:** Lead Product Designer & Accessibility Auditor
- **Scope:** Web / PWA Desktop (1280px) and Mobile (320px, 360px, 390px, 412px) Viewports across Light ("Warm Paper") and Dark ("Deep Ink") Themes
- **Governing ADR:** [ADR 0117](../../docs/decisions/0117-daynori-web-pwa-visual-polish-and-usability-refinement.md)
- **Related Phase Reports:** [Phase 105 Report](../../docs/phase-reports/phase-105.md), [Phase 111 Report](../../docs/phase-reports/phase-111.md), [Phase 117 Report](../../docs/phase-reports/phase-117.md)

---

## 1. Executive Summary & Review Objectives

Phase 117 was authorized by the project owner to:
1. Review the actual running Daynori web/PWA experience in light and dark mode at desktop and mobile sizes.
2. Simplify excessive boxes and visual clutter across navigation, Today, Library, Journal, forms, empty states, and dialogs.
3. Improve typography, spacing, hierarchy, colors, and menu design while keeping a coherent design system.
4. Verify contrast (WCAG 2.2 AA), keyboard use (`:focus-visible`), screen readers (`aria-live="polite"`), and reduced motion (`prefers-reduced-motion: reduce`).
5. Capture before/after screenshots from the running app and verify the main user journeys without regressions.

This document records qualitative human design observations separately from automated machine checks.

---

## 2. Area-by-Area Qualitative Human Design Evaluation

### 2.1 UI Primitives & Surface Hierarchy

* **Previous State:**
  * Rigid nested 1px solid borders (`border.subtle`) surrounding every section, card, list container, and row created severe "box inside box" visual clutter.
  * Empty states used heavy bordered boxes with cold grey backgrounds, creating a sterile, broken-feeling empty view.
* **Human Design Observations:**
  * Removing aggressive nested borders and replacing them with subtle translucent borders (`rgba(23, 44, 44, 0.08)` in light mode, `border.subtle` in dark mode) immediately relaxes visual tension.
  * Cards now feel like warm sheets of notebook paper rather than rigid HTML frames.
  * `EmptyState` now feels encouraging: a circular action badge with soft teal tint (`action.subtle`), high-contrast icon, relaxed line-height description, and a clear call to action invite the user forward.
* **Verdict:** Calmer, cohesive, and warm notebook aesthetic.

### 2.2 Navigation (Header, Sidebar, Bottom Nav, and Drawer)

* **Previous State:**
  * The AppHeader had sharp borders and inconsistent hover states. The Create button lacked tactile depth.
  * AppSidebar active links used harsh left border bars without soft pill backing.
  * Mobile Bottom Nav had small touch targets and risk of label truncation on 320px screens.
* **Human Design Observations & Refinements:**
  * **AppHeader:** Streamlined ghost action buttons with soft hover pills (`surfaceRaised`), refined primary Create button elevation with subtle shadow (`0 2px 8px rgba(20, 107, 99, 0.22)`), and refined `/` keyboard shortcut badge.
  * **AppSidebar:** Warm active pill indicator (`action.subtle`) with subtle left accent line, crisp uppercase letter-spaced section headers (`Primary`, `Pins`, `Utilities`), and smooth hover transitions.
  * **AppBottomNav:** Comfortable 48px touch targets, soft indicator pill for the active tab, and complete resilience against 200% font scaling without label clipping.
  * **Mobile Drawer:** Refined section dividers and interactive theme toggle with dynamic label and high-contrast sun/moon badges.
* **Verdict:** Obvious navigation paths, comfortable touch ergonomics, and crisp identity.

### 2.3 Today View

* **Previous State:**
  * Repetitive heavy card borders around Tasks, Routines, Upcoming Summary, Quick Capture, Journal Prompt, Recent Items, and Favorite Folders.
  * Double border nesting where list rows sat inside bordered cards inside bordered containers.
* **Human Design Observations & Refinements:**
  * Applied `variant="calm"` across all Today widget cards, utilizing subtle elevation shadows and softer border delineations.
  * Routine checklist and tasks due today feature clean divided rows with smooth completion checkmarks.
  * Gentle progress bar rendered in soft teal tones clearly communicates daily rhythm without gamified anxiety.
  * Journal reflection card elevated with a warm invitation prompt and prominent "Write reflection" button.
* **Verdict:** Streamlined first viewport, eliminated repetitive card borders, and clear daily focus.

### 2.4 Library View

* **Previous State:**
  * Search bar, filter toggles, Write Note button, and New Folder button lacked clear visual rhythm and felt cluttered on mobile.
  * Folder cards had rigid borders and crowded metadata.
* **Human Design Observations & Refinements:**
  * Unified search and creation toolbar with balanced spacing and clear visual hierarchy (primary "Write note", secondary "New folder").
  * Folder cards feature soft borders, subtle shadows, and clear item counts.
  * Note and knowledge item rows feature distinct, high-contrast type badges (`Note`, `Knowledge`, `File`) with smooth hover feedback.
* **Verdict:** Efficient browsing, clear organization, and distraction-free note writing.

### 2.5 Journal View

* **Previous State:**
  * Disconnected view mode tabs (`Day View`, `Timeline`, `Trash`) sat above a separate date stepper, cluttering the header.
  * Entry cards used heavy rigid borders.
* **Human Design Observations & Refinements:**
  * Unified view mode segmented controls with balanced spacing.
  * Streamlined date navigation stepper with intuitive previous/next day and jump-to-today controls.
  * Entry cards styled with calm notebook elevation (`variant="calm"`), clear typography, and privacy-first snippet toggles.
* **Verdict:** Mindful, quiet reflection space honoring user privacy.

### 2.6 Forms & Dialogs

* **Dialogs:** Softer backdrop blur (`blur(3px)`), smooth sheet radius, subtle elevation shadow, and accessible `:focus-visible` close buttons.
* **Creation Menu:** Bottom sheet with 5 entity choices, clean list rows, distinct icon colors, and clear descriptions with touch targets >= 48px.
* **Form Inputs (`TextField`, `TextArea`, `Checkbox`):** Consistent 2px focus-visible rings (`var(--color-focus-ring)`), high contrast placeholder and label text, and comfortable touch targets.
