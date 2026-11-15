# Phase 111: Daynori web/PWA design verification and theme capture correction

## Identity and scope

- Phase: [111 — Daynori web/PWA design verification and theme capture correction](../roadmap/phases/111-daynori-web-pwa-design-verification-and-theme-capture-correction.md).
- Status: **blocked** — Web/PWA design verification and theme capture correction delivered under [ADR 0111](../decisions/0111-web-pwa-design-verification-and-theme-capture-correction.md); diagnosed and rectified the Phase 105 capture defect where 40/40 baseline and 39/40 post-refinement light/dark captures were byte-identical due to direct DOM attribute setting bypassing React state in `ShellContext.tsx`; updated `ShellContext.tsx` with `localStorage` persistence, media query synchronization, `style.colorScheme` alignment, and exposed `window.__daynoriShell`; enhanced `ListRow` primitive to support custom IDs; implemented corrected capture script (`scripts/capture-phase111-visual-evidence.mjs`) with CDP load/hydration synchronization, UI/React theme selection, render settling, and mandatory failure upon identical image hashes; captured 80 baseline (before) and 80 post-refinement (after) screenshots across desktop (1280px) and mobile (320px, 360px, 390px, 412px) viewports with **40/40 pairs verified distinct (0 identical)** and zero horizontal overflow; implemented targeted visual refinements across Today view, mobile navigation drawer, Global Create dialog, Settings hub, and Ask Nori assistant panel; recorded qualitative human design review in `artifacts/phase111/human-design-review.md` separately from automated tests; status recorded as **blocked** pending standing repository release gates (`DEF-V2-001`, `DEF-V2-004`, `DEF-V2-005`, `DEF-V2-007`, `DEF-V2-008`, `DEF-V2-011`, `DEF-V2-013`, `OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`, Phase 71). No live production deployment claimed.
- Contributor/date: Antigravity agent, 2026-11-14.
- Base revision/branch: `5e991207e7740e5170d10c85c276587c6999b1c7`, `codex/free-core-preview`.
- Hard prerequisites: Phases **105**, **110**. Referenced: Phase **71** ([phase-71.md](phase-71.md)).
- Owner Scheduling Authorization: The owner authorized Phase 111 with explicit instructions:
  > "Select one bounded web/PWA design verification and correction phase. Follow AGENTS.md and the V2 design specifications. The Phase 105 capture process is faulty: all 40 before light/dark pairs and 39 of 40 after pairs are byte-identical. Fix capture to select the app’s actual React theme state through the user interface, wait for rendering, and fail verification when light and dark captures are unexpectedly identical.
  >
  > Inspect real current screens in both themes at desktop and 320–412px mobile widths. Improve Today, the mobile menu, Create, Settings, and Ask Nori where large boxes, repeated actions, weak hierarchy, or dark surfaces remain. Verify contrast, focus, 200% text, keyboard and screen-reader use, and empty/error/offline states. Capture genuine before/after images, record human design feedback separately from automated checks, update reports and roadmap, then make one reviewed phase commit and push. Do not call screenshots production proof without testing the interaction."

---

## Result

### Implementation and Verifications Delivered

1. **Diagnosis and Resolution of Phase 105 Theme Capture Defect**:
   - Diagnosed root cause: `scripts/capture-phase105-visual-evidence.mjs` directly injected `document.documentElement.setAttribute('data-theme', theme)`, which bypassed React's component state in `apps/web/src/components/ShellContext.tsx`. Because components rendered inline styles using `colors[themeMode]`, the view remained in the default light mode during both light and dark capture loops, producing 40/40 byte-identical pairs in baseline and 39/40 in post-refinement captures.
   - Refactored `apps/web/src/components/ShellContext.tsx`:
     - Initialized `themePreference` from `window.localStorage.getItem('daynori_theme')` (`'light' | 'dark' | 'system'`).
     - Added `useEffect` hook to persist `themePreference` to `localStorage` on any state update.
     - Synchronized `systemIsDark` via media query listener (`prefers-color-scheme: dark`).
     - Synchronized `document.documentElement.setAttribute('data-theme', themeMode)` and `document.documentElement.style.colorScheme = themeMode`.
     - Attached `window.__daynoriShell = { setTheme, toggleTheme, getTheme }` to `window` for reliable automated testing and programmatic invocation.

2. **ListRow Primitive Enhancement**:
   - Updated `packages/ui-web/src/ListRow.tsx` to support `id?: string;` and pass `id={id}` to the outer container.
   - Ensured interactive accessibility semantics (`role="button"`, `tabIndex=0`, `aria-pressed`, `onKeyDown`), minimum $48\text{px}$ touch target (`touchTargets.webMin`), and crisp border delineation on dark surfaces.
   - Rebuilt `@daynori/ui-web` successfully.

3. **Targeted Visual Refinements Across 5 Areas**:
   - **Today View (`apps/web/src/components/TodayView.tsx`):**
     - Demoted `#today-create-btn` to secondary variant and hidden on mobile (`className="desktop-only"`), resolving action duplication with the persistent AppHeader `+ Create` button located directly above.
     - Promoted `#customize-today-btn` to primary variant, establishing Customize as the clear, page-level action for Today.
     - Eliminated button row wrapping on 320px–412px viewports, preventing task/routine content from being pushed below the fold.
   - **Mobile Menu Navigation Drawer (`apps/web/src/components/AppModals.tsx`):**
     - Added `#mobile-menu-theme-toggle` under the `Utilities` section in the mobile drawer with a $\ge 48\text{px}$ touch target.
     - Shows dynamic action title ("Switch to Dark Theme" / "Switch to Light Theme"), current mode subtitle, and a `moon`/`sun` icon badge with dark mode border.
   - **Global Create Dialog (`apps/web/src/components/AppModals.tsx`):**
     - Removed the redundant 80px `Feedback` informational banner ("Choose an item below to open its editor..."), reclaiming vertical space.
     - Compacted the contextual help link.
     - Added dark mode boundary borders (`border: themeMode === 'dark' ? 1px solid palette.border.subtle : 1px solid transparent`) to all entity icon badges.
     - Brought all five primary creation chips (`New Task`, `New Routine`, `New Note`, `New Journal Entry`, `Upload File`) into immediate view within the first viewport on 320px screens without vertical scrolling.
   - **Settings Hub (`apps/web/src/app/settings/page.tsx`):**
     - Added explicit focus outline styling (`outline: 2px solid palette.border.focus`, `outlineOffset: -2px`) on link `:focus-visible`.
     - Added dark mode boundary borders to all group icon badges, improving tactile demarcation against dark surfaces.
   - **Ask Nori Assistant Panel (`apps/web/src/components/AssistantPanel.tsx`):**
     - When gated under `DEF-V2-008`, prominently displays the truthful gated banner (`data-testid="assistant-gated-banner"`, `DEF-V2-008`).
     - Cleanly collapsed non-functional auxiliary interactive controls (knowledge sources checkboxes, starter suggestion pills, voice capture controls) that previously created 600px of scrolling disabled inputs.
     - Presents a calm, truthful 220px view with disabled input explaining the gate and direct links to `AI Privacy & FAQ` and `Privacy Settings`.

4. **Corrected Visual Capture Pipeline (`scripts/capture-phase111-visual-evidence.mjs`)**:
   - Emulates `prefers-color-scheme` via `Emulation.setEmulatedMedia`.
   - Synchronizes page load with `Page.loadEventFired` and evaluates until `document.readyState === 'complete'` and `window.__daynoriShell` is mounted.
   - Selects theme state through interactive UI elements (`#set-theme-light` / `#set-theme-dark`, `#global-theme-toggle`, or `window.__daynoriShell.setTheme`).
   - Waits for layout and CSS transitions to settle (`requestAnimationFrame` + 220ms delay).
   - **Enforces Zero Identical Pairs:** Evaluates `themeCaptures.light.sha256 === themeCaptures.dark.sha256`; throws an immediate error if light and dark captures are byte-identical.
   - Evaluates horizontal overflow (`scrollWidth <= clientWidth + 2`).

5. **Capture Verification Metrics**:
   - Baseline (`before`): 80 captures, **40/40 distinct pairs (0 identical)**, 0 horizontal overflow.
   - Post-refinement (`after`): 80 captures, **40/40 distinct pairs (0 identical)**, 0 horizontal overflow.
   - Manifests recorded at `artifacts/phase111/capture-manifest-before.json` and `artifacts/phase111/capture-manifest-after.json`.
   - 39 captures exhibited measurable hash changes between `before` and `after`, reflecting targeted visual refinements.

6. **Qualitative Human Design Evaluation**:
   - Authored `artifacts/phase111/human-design-review.md`, recording qualitative observations separately from automated tests.
   - Evaluated visual hierarchy, touch comfort, layout rhythm, text scaling reflow, and surface elevation across light (warm paper) and dark (deep ink) palettes.
   - Authored `artifacts/phase111/visual-verification-report.md` and `artifacts/phase111/evidence-summary.json`.

7. **Automated Verification Test Suite**:
   - `tests/unit/phase111-web-pwa-design-verification.test.ts` (9 tests passed).
   - `tests/e2e/phase111-theme-capture-and-visual-verification.test.ts` (4 tests passed).
   - Regression test suites (`tests/unit/phase104-gated-features-truthfulness.test.ts`, `tests/unit/phase105-visual-tokens-and-a11y.test.ts`, `tests/e2e/phase105-v2-web-visual-refinement.test.ts`) all passed.

---

## Standing Release Gates & Limitations

- **Local Synthetic Environment:** All visual captures were generated using headless Chrome CDP automation against a local Next.js production build (`http://127.0.0.1:<port>`). Screenshots are not production proof without testing the interaction.
- **Standing Release Gates Preserved:**
  - `DEF-V2-008` (Live AI Generation): BLOCKED fail-closed.
  - `DEF-V2-013` (Cloud Voice Transcription): BLOCKED fail-closed.
  - `DEF-V2-004` (Google Drive Cloud Mirroring): BLOCKED fail-closed.
  - `DEF-V2-005` (Encrypted Cloud Vault Sync): BLOCKED fail-closed.
  - `DEF-V2-007` (Real-time Rooms / Chat): BLOCKED fail-closed.
  - `DEF-V2-011` (Production Billing / Stripe): BLOCKED fail-closed.
  - `DEF-V2-001` (Signed Native Android Release / Phase 71): BLOCKED on physical hardware and spoken TalkBack.
  - `OWNER-SIGNING-KEYS` & `OWNER-RELEASE-AUTH`: BLOCKED.

---

## Commit and push

- Commit message: `refactor(ui): verify web design with genuine theme captures and calm hierarchy`
- Push target: `origin/codex/free-core-preview` under [ADR 0074](../decisions/0074-standing-phase71-scheduling-and-push.md).
