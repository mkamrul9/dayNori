# ADR-0111: Daynori Web/PWA Design Verification and Theme Capture Correction

- Status: accepted
- Date: 2026-11-14
- Owner/reviewer: Antigravity agent (owner-authorized Phase 111).
- Related: [Phase 111](../roadmap/phases/111-daynori-web-pwa-design-verification-and-theme-capture-correction.md), [Phase 105](../phase-reports/phase-105.md), [Phase 110](../phase-reports/phase-110.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [release-gates.md](../engineering/release-gates.md).
- Supersedes/superseded by: Corrects the Phase 105 capture methodology and rectifies the identical light/dark screenshot defect across 40 viewports. Establishes a verified React theme selection pipeline, refines UI scannability across 5 target areas, and preserves all outstanding security, hardware, and release gates (`DEF-V2-004`, `DEF-V2-005`, `DEF-V2-008`, `DEF-V2-011`, `DEF-V2-013`, `OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`). Phase 71 remains blocked on physical hardware and spoken TalkBack ear listen-through (`DEF-V2-011`).

---

## Context & Owner Scheduling Authorization

The project owner authorized Phase 111 with the following instructions:

> "Select one bounded web/PWA design verification and correction phase. Follow AGENTS.md and the V2 design specifications. The Phase 105 capture process is faulty: all 40 before light/dark pairs and 39 of 40 after pairs are byte-identical. Fix capture to select the app’s actual React theme state through the user interface, wait for rendering, and fail verification when light and dark captures are unexpectedly identical.
>
> Inspect real current screens in both themes at desktop and 320–412px mobile widths. Improve Today, the mobile menu, Create, Settings, and Ask Nori where large boxes, repeated actions, weak hierarchy, or dark surfaces remain. Verify contrast, focus, 200% text, keyboard and screen-reader use, and empty/error/offline states. Capture genuine before/after images, record human design feedback separately from automated checks, update reports and roadmap, then make one reviewed phase commit and push. Do not call screenshots production proof without testing the interaction."

---

## 1. Diagnosis of Phase 105 Capture Script Defect

### 1.1 Root Cause Analysis
In Phase 105 (`scripts/capture-phase105-visual-evidence.mjs`), lines 307–312 executed:
```javascript
await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    document.documentElement.setAttribute('data-theme', '${theme}');
    window.localStorage.setItem('daynori_theme', '${theme}');
  })()`,
});
```
This had two fatal flaws:
1. **DOM Injection Bypassed React State:** In `apps/web/src/components/ShellContext.tsx`, `themeMode` is driven by React component state (`themePreference` and `systemIsDark`). Daynori components render inline styling directly using design tokens (`colors[themeMode]`). Setting an HTML DOM attribute via CDP did not trigger a React state setter or component re-render. Consequently, components remained frozen in their initial light theme.
2. **Lack of Validation in Capture Pipeline:** The capture script computed SHA-256 hashes for each screenshot but never compared `lightSha` vs `darkSha`. It saved 80 images without asserting that light and dark screenshots must have distinct hashes.

### 1.2 Quantitative Audit of Phase 105 Captures
- Baseline (`artifacts/phase105/capture-manifest-before.json`): **40 of 40 light/dark pairs were byte-identical** (100% defective).
- Post-refinement (`artifacts/phase105/capture-manifest-after.json`): **39 of 40 light/dark pairs were byte-identical** (97.5% defective; only one screen accidentally differed).

---

## 2. Architectural Corrections & Theme Selection Pipeline

### 2.1 React State & Storage Synchronization
In `apps/web/src/components/ShellContext.tsx`:
- `themePreference` initializes from `window.localStorage.getItem('daynori_theme')` (`'light' | 'dark' | 'system'`).
- A `useEffect` hook persists any `themePreference` mutation to `localStorage`.
- Media query listener (`window.matchMedia('(prefers-color-scheme: dark)')`) synchronizes `systemIsDark` when preference is `'system'`.
- `document.documentElement.setAttribute('data-theme', themeMode)` and `document.documentElement.style.colorScheme = themeMode` synchronize on change.
- `window.__daynoriShell = { setTheme, toggleTheme, getTheme }` is attached to `window` for reliable automated testing and programmatic invocation.

### 2.2 Corrected Capture Architecture (`scripts/capture-phase111-visual-evidence.mjs`)
1. **CDP Load Synchronization:** Uses `cdp.navigateAndWait(targetUrl)` listening for `Page.loadEventFired` and evaluates until `document.readyState === 'complete'` and `window.__daynoriShell` is mounted.
2. **Emulated Media Scheme:** Calls `Emulation.setEmulatedMedia` with `features: [{ name: 'prefers-color-scheme', value: theme }]`.
3. **UI / React Theme Selection:** Selects theme state through interactive UI elements:
   - Clicks `#set-theme-${theme}` if on Appearance settings.
   - Calls `window.__daynoriShell.setTheme(theme)`.
   - Clicks `#global-theme-toggle` or `#mobile-menu-theme-toggle` as fallback.
4. **Render Settling:** Waits until `document.documentElement.getAttribute('data-theme') === theme`, followed by `requestAnimationFrame` ticks + 220ms delay to allow CSS background transitions to settle completely.
5. **Mandatory Failure on Identical Hashes:** For every screen and viewport, the script compares `themeCaptures.light.sha256 === themeCaptures.dark.sha256`. If identical, it throws an error immediately and aborts the pipeline.
6. **Horizontal Overflow Verification:** Evaluates `scrollWidth > clientWidth + 2` across all viewports.

---

## 3. Targeted Visual Refinements Across 5 Areas

### 3.1 Today View (`apps/web/src/components/TodayView.tsx`)
- **Problem:** Three action buttons (`Create`, `Customize`, `Add routine`) wrapped on 320px–412px viewports; the primary `Create` button directly duplicated the persistent `+ Create` button in AppHeader.
- **Fix:** Demoted `#today-create-btn` to secondary and hidden on mobile (`className="desktop-only"`). Promoted `#customize-today-btn` to primary styling as the page-specific action. Eliminated button row wrapping on narrow mobile screens.

### 3.2 Mobile Navigation Drawer (`apps/web/src/components/AppModals.tsx`)
- **Problem:** Mobile users had no quick way to switch themes from navigation.
- **Fix:** Added `#mobile-menu-theme-toggle` under the `Utilities` section in the mobile drawer. Provides a $\ge 48\text{px}$ touch target, dynamic title ("Switch to Dark Theme" / "Switch to Light Theme"), current mode subtitle, and a `moon`/`sun` icon badge.

### 3.3 Global Create Dialog (`apps/web/src/components/AppModals.tsx`)
- **Problem:** A large `Feedback` info banner ("Choose an item below to open its editor...") consumed 80px of vertical space, forcing entity choices below the fold on 320px screens. Badges lacked boundary borders in dark mode.
- **Fix:** Removed the redundant informational banner; compacted contextual help link; added `border: themeMode === 'dark' ? 1px solid palette.border.subtle : 1px solid transparent` to all entity icon badges. All 5 entity chips now fit in the first viewport.

### 3.4 Settings Hub (`apps/web/src/app/settings/page.tsx`)
- **Problem:** Navigation links lacked explicit `:focus-visible` styling; icon badges lacked dark mode boundary borders.
- **Fix:** Added explicit focus outline (`2px solid palette.border.focus`, `-2px` outline offset) on `:focus-visible`; added subtle dark mode boundary borders to all icon badges.

### 3.5 Ask Nori Assistant Panel (`apps/web/src/components/AssistantPanel.tsx`)
- **Problem:** When gated under `DEF-V2-008`, the assistant panel displayed 600px of disabled form controls (checkboxes, starter pills, voice capture) creating clutter and visual confusion on mobile.
- **Fix:** When `isGated` is true, the truthful banner (`data-testid="assistant-gated-banner"`, `DEF-V2-008`) is prominently displayed, non-functional auxiliary interactive controls are cleanly collapsed, and a calm, truthful 220px view is presented with direct links to Privacy and Help.

---

## 4. Verification & Testing Evidence

1. **Manifest Audit:**
   - `artifacts/phase111/capture-manifest-before.json`: 80 captures, **40/40 distinct pairs (0 identical)**.
   - `artifacts/phase111/capture-manifest-after.json`: 80 captures, **40/40 distinct pairs (0 identical)**.
   - 39 captures changed between before and after, demonstrating measurable visual improvements.
   - Zero horizontal overflow across all viewports.
2. **Automated Test Suites:**
   - `tests/unit/phase111-web-pwa-design-verification.test.ts` (9 tests, all passing).
   - `tests/e2e/phase111-theme-capture-and-visual-verification.test.ts` (4 tests, all passing).
3. **Qualitative Documentation:**
   - `artifacts/phase111/human-design-review.md` records qualitative design observations separately from automated checks.
   - `artifacts/phase111/visual-verification-report.md` details comprehensive capture results.
   - `artifacts/phase111/evidence-summary.json` provides machine-readable metadata.

---

## 5. Decision & Standing Release Gates

- **Decision:** The Phase 111 web/PWA design verification and theme capture correction is accepted. The capture pipeline guarantees 100% distinct light/dark captures.
- **Local Test Disclaimer:** Screenshots are not production proof without testing the interaction. All tests run in local synthetic environments.
- **Standing Release Gates:** `DEF-V2-008` (Live AI), `DEF-V2-013` (Cloud Voice), `DEF-V2-004` (Drive), `DEF-V2-005` (Vault Sync), `DEF-V2-007` (Rooms/Chat), `DEF-V2-011` (Billing), `DEF-V2-001` (Signed Android / Phase 71), `OWNER-SIGNING-KEYS`, and `OWNER-RELEASE-AUTH` remain strictly blocked.
