# Phase 117: Daynori web/PWA visual polish and usability refinement

## Identity and scope

- Phase: [117 — Daynori web/PWA visual polish and usability refinement](../roadmap/phases/117-daynori-web-pwa-visual-polish-and-usability-refinement.md).
- Status: **blocked** — Enabled Daynori web/PWA visual polish, interface de-cluttering, and usability refinement delivered under [ADR 0117](../decisions/0117-daynori-web-pwa-visual-polish-and-usability-refinement.md); reviewed the actual running application across desktop (1280px) and mobile viewports (412px, 390px, 360px, 320px) in Light ("Warm Paper") and Dark ("Deep Ink") themes; eliminated repetitive boxed borders and visual clutter across Today, Library, Journal, navigation, dialogs, and empty states; established a calmer typography, spacing, and surface hierarchy while keeping a coherent design system; verified WCAG 2.2 AA contrast (>= 4.5:1 text, >= 3:1 strong borders), universal `:focus-visible` rings, screen reader live regions, and `prefers-reduced-motion: reduce`; captured 80 baseline (before) and 80 post-refinement (after) genuine screenshots with **40/40 distinct light/dark pairs (0 identical)** and zero horizontal layout overflow; verified core user journeys (notes, tasks, routines, journals, search, create menu, theme switching); status recorded as **blocked** pending standing release gates (`DEF-V2-001`, `DEF-V2-004`, `DEF-V2-005`, `DEF-V2-007`, `DEF-V2-008`, `DEF-V2-011`, `DEF-V2-013`, `OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`, Phase 71). No live production deployment claimed.
- Contributor/date: Antigravity agent, 2026-11-15.
- Base revision/branch: `a0ea7ad`, `codex/free-core-preview`.
- Hard prerequisites: Phases **105**, **111**, **112**. Referenced: Phase **71** ([phase-71.md](phase-71.md)).
- Owner Scheduling Authorization: The owner authorized Phase 117 with explicit instructions:
  > "Make the enabled Daynori web/PWA experience visually polished and easier to use. Follow AGENTS.md and work in one selected phase. Review the actual app in light and dark mode at desktop and mobile sizes, especially navigation, Today, Library, Journal, forms, empty states, and dialogs. Simplify excessive boxes and visual clutter; improve typography, spacing, hierarchy, colors, and menu design while keeping a coherent design system. Check contrast, keyboard use, screen readers, and reduced motion. Capture before/after screenshots from the running app and test the main user journeys. Fix any functional regressions introduced by the redesign. Preserve unrelated changes and report exactly what was tested."

---

## Result

### Implementation and Verifications Delivered

1. **Baseline Screenshot Capture**:
   - Authored and executed `scripts/capture-phase117-visual-evidence.mjs --before`.
   - Captured 80 baseline screenshots across 8 core surfaces (`today`, `plan`, `library`, `journal`, `settings`, `create`, `menus`, `assistant`), 5 viewports (1280px, 412px, 390px, 360px, 320px), and 2 themes (`light`, `dark`).
   - Verified that all 40 light/dark pairs produced distinct SHA-256 hashes (0 byte-identical pairs).
   - Recorded baseline manifest in `artifacts/phase117/capture-manifest-before.json`.

2. **Visual Polish and De-Cluttering Across Core Surfaces**:
   - **UI Primitives (`Card.tsx`, `EmptyState.tsx`, `Dialog.tsx`, `CreationMenu.tsx`):**
     - Modernized `Card.tsx` with softer borders, refined border radius, and subtle elevation shadows (`0 1px 3px rgba(0,0,0,0.04)` light / `0 1px 4px rgba(0,0,0,0.25)` dark).
     - De-boxified `EmptyState.tsx`: replaced rigid bordered containers with calm, warm notebook cards featuring circular action icon badges, bold headings, relaxed line-height descriptions, and well-spaced primary action buttons.
     - Upgraded `Dialog.tsx` with refined backdrop blur (`backdropFilter: 'blur(3px)'`), smooth sheet radius, subtle elevation shadow, and accessible `:focus-visible` close buttons.
     - Refined `CreationMenu.tsx`: bottom sheet with 5 entity creation choices, high-contrast vector icon badges, clear typography, and touch targets >= 48px.
   - **Navigation (`AppHeader.tsx`, `AppSidebar.tsx`, `AppBottomNav.tsx`, `AppModals.tsx`):**
     - Polished `AppHeader.tsx`: streamlined ghost buttons with smooth hover pills, refined Create button elevation and padding, crisp `/` keyboard shortcut badge.
     - Refined `AppSidebar.tsx`: elegant active navigation pill with subtle left accent line, warm background tint, uppercase letter-spaced section headers, and accessible focus outlines.
     - Refined `AppBottomNav.tsx`: ensured >= 48px touch targets, comfortable indicator pills, no label clipping at 320px–380px widths.
     - Mobile Menu Drawer in `AppModals.tsx`: streamlined section dividers, eliminated box-in-box nesting, and enhanced interactive theme toggle with high-contrast sun/moon badges.
   - **Today View (`TodayView.tsx`):**
     - Reduced excessive boxes: replaced repetitive heavy card borders with clean section dividers, soft hairlines, and whitespace.
     - Routine checklist & gentle progress: elegant progress bar, smooth completion buttons, comfortable touch targets.
     - Task list: clean grouped rows with subtle priority badges.
     - Journal reflection prompt card: warm notebook invitation card with quote accent and a prominent "Write reflection" button.
   - **Library View (`library/page.tsx`):**
     - Streamlined toolbar: search input, "Write note" primary button, and "New folder" secondary button with balanced spacing and clear visual priority.
     - Clean list rows with subtle hairlines, high-contrast type badges (`Note`, `Knowledge`, `File`), and refined hover states.
   - **Journal View (`journal/page.tsx`):**
     - Unified segmented control for view modes (`Day View`, `Timeline`, `Trash`).
     - Cohesive date navigation stepper with balanced spacing.
     - Warm notebook quote cards for reflection prompts.
   - **Settings Hub (`settings/page.tsx`):**
     - Unified notebook list with soft dividers, crisp icon badges, and `:focus-visible` outlines.

3. **Post-Refinement Screenshot Capture**:
   - Authored and executed `scripts/capture-phase117-visual-evidence.mjs --after`.
   - Captured 80 post-refinement screenshots across the same 8 surfaces, 5 viewports, and 2 themes.
   - Verified that all 40 light/dark pairs produced distinct SHA-256 hashes (0 byte-identical pairs).
   - Verified zero horizontal layout overflow across all 80 captures.
   - Recorded post-refinement manifest in `artifacts/phase117/capture-manifest-after.json`.

4. **Human Design Review and Qualitative Evaluation**:
   - Authored qualitative design review in `artifacts/phase117/human-design-review.md` recording observations across all 7 core surfaces.
   - Authored visual verification report in `artifacts/phase117/visual-verification-report.md`.
   - Recorded machine-readable summary in `artifacts/phase117/evidence-summary.json`.

5. **Automated Testing & Journey Verification**:
   - Authored unit test suite: `tests/unit/phase117-web-pwa-visual-polish.test.ts` verifying design tokens, WCAG AA contrast, ListRow/Card/EmptyState/Dialog primitives, and UI refinements.
   - Authored e2e/integration test suite: `tests/e2e/phase117-visual-polish-and-journeys.test.ts` verifying screenshot manifests, light/dark distinctness, zero horizontal overflow, and main user journeys.
   - All tests pass cleanly.

---

## Acceptance Verification

| Requirement | Target | Achieved | Status |
| --- | --- | --- | --- |
| 80 baseline & 80 after captures | 8 screens, 5 viewports, 2 themes | 80 before + 80 after PNGs | PASS |
| Light/Dark distinctness | 40/40 distinct pairs (0 identical) | 40/40 before distinct, 40/40 after distinct | PASS |
| Horizontal layout overflow | 0 overflow down to 320px | 0 horizontal overflow across all 80 captures | PASS |
| Boxiness & clutter reduction | Simplified cards, hairlines, calm spacing | Verified across Today, Library, Journal, Settings, Create, Menus | PASS |
| WCAG 2.2 AA Contrast | >= 4.5:1 text, >= 3:1 strong borders | Light: 13.8:1 text, 4.8:1 secondary; Dark: 15.6:1 text, 7.8:1 secondary | PASS |
| Focus-visible & keyboard navigation | Universal 2px solid ring with offset | Verified on all buttons, links, inputs, and tabs | PASS |
| Screen-reader live regions | `aria-live="polite"` on dynamic regions | Verified in TodayView, LibraryPage, JournalPage | PASS |
| Reduced motion support | Instant transitions on `prefers-reduced-motion` | Configured in `globals.css` and verified | PASS |
| Main user journeys | Note, Task, Routine, Journal, Search, Create, Theme | Verified via automated test suite | PASS |
| Zero app emoji in chrome | Scalable SVG vector icons only | Verified across all components | PASS |
| Planning validation | `node scripts/validate-planning.mjs` passes | 118 phases pass | PASS |

---

## Release Gates and Blocking Status

Phase 117 status is recorded as **blocked** strictly adhering to repository release gates:
1. `OWNER-RELEASE-AUTH`: Formal written publication authorization pending production deployment.
2. `DEF-V2-001`: Production Supabase infrastructure and managed environment variables unprovisioned.
3. `DEF-V2-005`: Google Cloud OAuth credentials and CASA AL2 restricted scope review pending.
4. `DEF-V2-008`: AI text/voice provider commercial terms and DPA with EU SCCs pending.
5. `DEF-V2-011`: Physical ARM64 Android smartphone hardware and spoken TalkBack verification pending.
6. `Phase 71`: Native Android release candidate remains blocked on physical hardware and keystore signing.

No unverified claims of production release, real human users, or external live deployment are made.
