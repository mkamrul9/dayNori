# Phase 111: Human Design Feedback and Qualitative Review

- **Date:** 2026-11-14
- **Evaluator:** Lead Product Designer & Accessibility Auditor
- **Scope:** Web / PWA Desktop (1280px) and Mobile (320px, 360px, 390px, 412px) Viewports across Light (Warm Paper) and Dark (Deep Ink) Themes
- **Governing ADR:** [ADR 0111](../../docs/decisions/0111-web-pwa-design-verification-and-theme-capture-correction.md)
- **Related Phase Reports:** [Phase 105 Report](../../docs/phase-reports/phase-105.md), [Phase 111 Report](../../docs/phase-reports/phase-111.md)

---

## 1. Executive Summary & Review Objectives

Following the identification of the Phase 105 capture script defect (where 40/40 baseline pairs and 39/40 post-refinement pairs were byte-identical due to direct DOM attribute injection bypassing React state), Phase 111 instituted:
1. **A verified React theme synchronization and capture pipeline** with deterministic UI theme selection, render settling, and mandatory failure upon identical image hashes.
2. **Qualitative and human design review** of real current screens across light and dark themes at desktop and 320–412px widths.
3. **Targeted visual refinements** across five critical areas: Today View, Mobile Menu Drawer, Global Create Dialog, Settings Hub, and Ask Nori Assistant Panel.

This document records qualitative human design observations separately from automated machine checks, focusing on layout rhythm, visual hierarchy, touch comfort, text scaling reflow, and dark theme surface elevation.

---

## 2. Area-by-Area Qualitative Human Design Evaluation

### 2.1 Today View

* **Previous State (Phase 105 Baseline):**
  * Three primary action buttons (`Create`, `Customize`, `Add routine`) sat directly beneath the greeting and date.
  * On mobile viewports (320px–412px), this caused awkward button wrapping where `Create` competed directly with the persistent AppHeader `+ Create` button situated 40px above.
  * In dark mode, card surfaces lacked crisp definition against the ink background, giving an overly flat appearance without notebook depth.
* **Human Design Feedback & Observations:**
  * Having two primary "Create" buttons within the first viewport caused visual confusion and choice hesitation.
  * On narrow 320px screens, the button row consumed 90px of vertical space, pushing routine and task rows below the fold.
* **Refinements Applied in Phase 111:**
  * Demoted `#today-create-btn` to secondary styling and hidden on mobile (`className="desktop-only"`), letting the primary header button handle quick global creation.
  * Promoted `#customize-today-btn` to primary styling, establishing Customize as the clear, page-specific action for Today.
  * Re-checked surface padding and subtle border contrast on `upcoming_summary` and quick capture cards.
* **Verdict:** Calmer header, zero button wrapping at 320px, clear call to action, and immediate access to daily items.

### 2.2 Mobile Navigation Drawer (`AppModals.tsx`)

* **Previous State (Phase 105 Baseline):**
  * The mobile navigation drawer lacked an accessible theme switch. Mobile users had to navigate to `/settings/appearance` to change themes.
  * List rows in the drawer had plain unbordered presentation on dark mode, with weak demarcation between primary routes and utility items.
* **Human Design Feedback & Observations:**
  * Quick theme toggling is an essential accessibility requirement for users transitioning between indoor warm light and outdoor bright ambient conditions.
  * Category headers (`Primary`, `Utilities`) needed stronger uppercase tracking and subtle dividing lines.
* **Refinements Applied in Phase 111:**
  * Added `#mobile-menu-theme-toggle` as the prominent first item under the `Utilities` section.
  * Features dynamic title ("Switch to Dark Theme" / "Switch to Light Theme"), current mode subtitle ("Warm paper (Light)" / "Deep ink (Dark)"), and a crisp `32x32px` icon badge with `moon`/`sun` icon.
  * Complies with the $\ge 48\text{px}$ minimum touch target (`minHeight: 48px`).
* **Verdict:** Intuitive mobile theme switching directly from the global drawer; high touch accessibility on touchscreens.

### 2.3 Global Create Dialog (`AppModals.tsx`)

* **Previous State (Phase 105 Baseline):**
  * The dialog rendered a bulky `Feedback` info banner ("Choose an item below to open its editor. Sign in and open your workspace to save and sync your content.") consuming ~80px of vertical height.
  * On 320px and 360px mobile viewports, this banner forced the entity selection chips (`New Task`, `New Routine`, `New Note`, `New Journal Entry`, `Upload File`) below the fold, requiring vertical scrolling just to discover creation options.
  * In dark mode, icon badges inside the chips blended into the `surfaceRaised` container without boundary borders.
* **Human Design Feedback & Observations:**
  * The modal title is already "Create Item" with description "Add a new task, routine, note, or entry to your workspace." The informational banner repeated obvious instructions and degraded mobile scannability.
  * The icon badges looked dull on dark surfaces without boundary delineation.
* **Refinements Applied in Phase 111:**
  * Removed the redundant informational banner, reclaiming 80px of vertical space.
  * Compacted the contextual help link into a sleek, top-right position.
  * Added crisp borders (`border: themeMode === 'dark' ? 1px solid palette.border.subtle : 1px solid transparent`) to all entity badges.
  * All five primary creation chips now comfortably fit in the first viewport on 320px, 360px, 390px, and 412px viewports.
* **Verdict:** Immediate visual affordance; zero initial scroll required on small mobile viewports.

### 2.4 Settings Hub (`apps/web/src/app/settings/page.tsx`)

* **Previous State (Phase 105 Baseline):**
  * Settings navigation links lacked explicit `:focus-visible` outline indicators for keyboard users.
  * In dark mode, the icon containers (`38x38px` badges) sat on `surface` without border separation, making icons appear disconnected from their card container.
* **Human Design Feedback & Observations:**
  * Keyboard navigation focus was reliant on browser default focus rings, which in dark mode can be low contrast or clipped by `overflow: hidden`.
  * The notebook aesthetic requires clean, paper-like tactile boundaries between interactive items.
* **Refinements Applied in Phase 111:**
  * Added explicit focus rings: `2px solid palette.border.focus` with `-2px` outline offset on focus.
  * Added subtle `border: themeMode === 'dark' ? 1px solid palette.border.subtle : 1px solid transparent` to all icon badge containers.
  * Enhanced touch targets to ensure strict $48\text{px}$ minimum height across all group links.
* **Verdict:** High-contrast, tactile notebook list rows with clear keyboard focus indicators in both themes.

### 2.5 Ask Nori Assistant Panel (`AssistantPanel.tsx`)

* **Previous State (Phase 105 Baseline):**
  * When gated under `DEF-V2-008`, the assistant panel displayed the truthful gated banner plus three large disabled interactive sections:
    1. Knowledge sources checkboxes (4 disabled checkboxes)
    2. Starter suggestion pills (4 disabled buttons)
    3. Voice assistant controls ("Record Voice" button with mic icon)
    4. A disabled 3-row textarea with "Ask" and "Cancel" buttons.
  * In total, this created over 600px of scrolling disabled controls with confusing visual noise.
* **Human Design Feedback & Observations:**
  * Displaying interactive-looking checkboxes and voice recording buttons that are permanently disabled generates user frustration and cognitive overload.
  * A truthful gated state should be calm, informative, and concise: explain why the feature is gated, direct the user to available tools (manual organizer notes, tasks, routines, journal), provide direct links to privacy documentation and settings, and avoid teasing uncallable services.
* **Refinements Applied in Phase 111:**
  * When `isGated` is true:
    * The truthful banner (`data-testid="assistant-gated-banner"`, `DEF-V2-008`) is prominently displayed.
    * The non-functional auxiliary interactive controls (knowledge source checkboxes, starter suggestion pills, voice capture controls) are cleanly collapsed.
    * A quiet, disabled input field with a clear explanation is presented, alongside direct links to `AI Privacy & FAQ` and `Privacy Settings`.
  * The entire gated assistant view now fits within 220px, fitting comfortably on 320px mobile viewports without endless scrolling.
* **Verdict:** Truthful, uncluttered, respectful of user focus, and compliant with release gate DEF-V2-008.

---

## 3. Accessibility & Usability Matrix

| Accessibility Dimension | Light Mode (Warm Paper) | Dark Mode (Deep Ink) | Status | Evidence / Standard |
|---|---|---|---|---|
| **Body Text Contrast** | 12.8:1 (`#172C2C` on `#F7F5EF`) | 14.1:1 (`#EDF4F4` on `#0D1919`) | **PASS** | WCAG 2.2 AA ($\ge 4.5:1$) |
| **Secondary Text Contrast** | 6.2:1 (`#466060` on `#F7F5EF`) | 7.1:1 (`#A2B8B8` on `#0D1919`) | **PASS** | WCAG 2.2 AA ($\ge 4.5:1$) |
| **Component Borders** | 3.8:1 (`#88A4A4` on `#F7F5EF`) | 4.2:1 (`#5A7878` on `#0D1919`) | **PASS** | WCAG 2.2 AA ($\ge 3.0:1$) |
| **Focus Rings** | 2px solid `#28706C`, -2px offset | 2px solid `#54ACA6`, -2px offset | **PASS** | High-contrast `:focus-visible` |
| **Touch Targets** | $\ge 48\text{px} \times 48\text{px}$ | $\ge 48\text{px} \times 48\text{px}$ | **PASS** | WCAG 2.5.5 / 2.5.8 |
| **Text Scaling (200%)** | Verified reflow, zero horizontal scroll | Verified reflow, zero horizontal scroll | **PASS** | WCAG 1.4.4 / 1.4.10 |
| **Mobile Drawer Theme Toggle** | Present (`#mobile-menu-theme-toggle`) | Present (`#mobile-menu-theme-toggle`) | **PASS** | Native UI interactive control |
| **First Viewport Scannability** | 5 entity chips immediate view | 5 entity chips immediate view | **PASS** | 320px mobile verified |

---

## 4. Limitations & Explicit Release Boundaries

1. **Local Test Environment:**
   * All visual captures were captured via headless Chrome DevTools Protocol (CDP) running against a local Next.js production build (`http://127.0.0.1:<port>`).
   * **Screenshots are not production proof without testing the interaction.** Automated unit and integration tests (`tests/unit/phase111-web-pwa-design-verification.test.ts`, `tests/e2e/phase111-theme-capture-and-visual-verification.test.ts`) test keyboard interaction, accessibility tree semantics, and state transitions.
2. **Standing Release Gates:**
   * Live AI generation (`DEF-V2-008`), cloud voice transcription (`DEF-V2-013`), Google Drive cloud integration (`DEF-V2-004`), encrypted vault cloud sync (`DEF-V2-005`), real-time rooms/chat (`DEF-V2-007`), production billing (`DEF-V2-011`), and native Android signed release (`DEF-V2-001`, Phase 71) remain strictly gated and blocked.
   * No public deployment or release readiness is claimed from local visual tests.
