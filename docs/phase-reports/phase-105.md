# Phase 105: Daynori web/PWA visual refinement and modern interface overhaul

## Identity and scope

- Phase: [105 — Daynori web/PWA visual refinement and modern interface overhaul](../roadmap/phases/105-daynori-web-pwa-visual-refinement-and-modern-interface-overhaul.md).
- Status: **blocked** — Local web/PWA visual refinement, calmer modern interface overhaul, fresh before/after screenshot comparisons, and accessible navigation updates delivered. Full public deployment, live production publication, paid infrastructure spending, and unverified provider activation remain strictly blocked pending explicit owner authorization and open release gates.
  - Core visual refinement: transitioned Daynori web/PWA from a border-heavy, boxed layout into a calm, modern, and spacious warm notebook experience.
  - Reduced repeated card borders: eliminated redundant 1px perimeter borders across list rows, stat boxes, header buttons, and dialog options. Replaced with subtle surface background distinctions (`surfaceRaised`), quiet hairline dividers, and generous whitespace.
  - Simplified first viewport: redesigned `TodayView.tsx` desktop header with a single-row flex layout (`flexDirection: 'row'`, `justifyContent: 'space-between'`), positioning date and title on the left and actions on the right, pulling the initial organizer widgets into immediate view on 800px viewports without scrolling.
  - Navigation & toolbar modernization: replaced 7 individual bordered box buttons in `AppHeader.tsx` with borderless ghost icon buttons, giving primary visual prominence to the `+ Create` button (`action.primary`, soft elevation shadow, crisp white label). Redesigned `AppBottomNav.tsx` with 58px container height, active indicator pill around icon, 11px label, and full support for 200% font scaling without text clipping. Modernized `AppSidebar.tsx` with soft active pill (`action.subtle` bg + `action.primary` text) and uppercase category headers (PRIMARY, PINS, UTILITIES) with `0.06em` letter spacing.
  - Creation & Settings unification: transformed multi-card `CreationMenu.tsx` and `AppModals.tsx` into a single grouped list card with vector icon badges and descriptive subtitles; collapsed 6 separate standalone card boxes in `/settings` into a single elegant notebook card with soft row dividers.
  - Strict no-emoji chrome invariant: verified 0 app-authored unicode emojis across application chrome; all icons rendered as SVG vector line paths via `<Icon name="..." />` from `@daynori/design-tokens`.
  - Comprehensive before/after visual capture evidence: captured 80 baseline screenshots and 80 post-refinement screenshots across 8 core screens (Today, Plan, Library, Journal, Settings, Create, Menus, Assistant), 5 simulated viewports (1280px desktop, 412px, 390px, 360px, 320px mobile), and 2 themes (light & dark) using automated headless Chrome CDP emulation (`scripts/capture-phase105-visual-evidence.mjs`) alongside programmatic WCAG AA token contrast verification. Zero horizontal layout overflows measured across all 160 captures. No physical monitor or human visual evaluation performed.
  - Automated verification test suites:
    - 10 visual tokens, WCAG AA contrast, touch target, and a11y tests verified in [`tests/unit/phase105-visual-tokens-and-a11y.test.ts`](../../tests/unit/phase105-visual-tokens-and-a11y.test.ts) (10/10 passed in 12ms).
    - 8 E2E visual evidence and responsive navigation tests verified in [`tests/e2e/phase105-v2-web-visual-refinement.test.ts`](../../tests/e2e/phase105-v2-web-visual-refinement.test.ts) (8/8 passed in 22ms).
- Contributor/date: Antigravity agent, 2026-11-14.
- Base revision/branch: `a86ce2d0f9836365f5a894675b31dfa3d5ea7220`, `codex/free-core-preview`.
- Hard prerequisites: Phase **104** ([phase-104.md](phase-104.md)).
- Owner Scheduling Authorization: The owner explicitly authorized selecting Phase 105 for a bounded Daynori web/PWA visual refinement phase, capturing fresh current-build screenshots of Today, Plan, Library, Journal, Create, menus, Settings, and Ask Nori at desktop and 320–412px mobile widths in light and dark themes, making the interface calmer and more modern, reducing repeated large card borders, simplifying the first viewport, establishing clearer type and spacing hierarchy, removing redundant actions, redesigning navigation and menus, keeping the Daynori identity, using professional icons without app-authored emoji, improving dark surfaces, selected states, contrast, focus rings, and 200% text scaling, showing before/after evidence, and pushing under the standing repository workflow ([ADR 0074](../decisions/0074-standing-phase71-scheduling-and-push.md), [ADR 0105](../decisions/0105-daynori-web-pwa-visual-refinement-and-modern-interface-overhaul.md)). No production deployment or release readiness claimed from local tests.

---

## Result

### Implementation and Verifications Delivered

1. **Card Border Reduction & Surface Hierarchy (`packages/ui-web/src/Card.tsx`, `ListRow.tsx`)**:
   - `Card.tsx`: Introduced `variant?: 'subtle' | 'outlined' | 'elevated' | 'flat'`. Softened default styling to use subtle notebook borders (`border.subtle`) and quiet ambient shadows (`0 1px 3px rgba(23, 44, 44, 0.03)` in light, `0 1px 3px rgba(0, 0, 0, 0.25)` in dark). Flat variant applies `palette.surfaceRaised` with transparent borders to remove visual clutter.
   - `ListRow.tsx`: Added `variant?: 'card' | 'flat' | 'divided'`, interactive hover background (`surfaceRaised`), high-contrast selected indicator (`action.subtle` container + `action.primary` 1px border), and responsive line-height support.
   - `EmptyState.tsx`: Replaced harsh dashed border with soft notebook border, `surfaceRaised` background, and circular vector icon badge.

2. **First Viewport Optimization (`apps/web/src/components/TodayView.tsx`)**:
   - Converted the top greeting header from a stacked vertical column to a single-row flex layout on desktop (`justifyContent: 'space-between'`, `alignItems: 'flex-start'`), cleanly separating date/title on the left and actions on the right.
   - Upcoming Summary stat counters now utilize `palette.surfaceRaised` fill with transparent borders, eliminating the boxed-grid look.
   - Quick capture buttons and module shortcuts redesigned into modern rounded pills (`radii.pill`, `surfaceRaised`).
   - Organizer widgets (Today's Tasks, Routines, and Notes) are immediately visible in the initial viewport on standard 800px desktop displays.

3. **Navigation & Toolbar Redesign (`AppHeader.tsx`, `AppSidebar.tsx`, `AppBottomNav.tsx`)**:
   - `AppHeader.tsx`: Replaced 7 individual rectangular bordered buttons with borderless ghost icon buttons with smooth hover feedback (`palette.surfaceRaised`). Prominently elevated the primary `+ Create` button (`action.primary` background, crisp white label, subtle shadow). Preserved all tour targets (`shell.create`, `shell.search`, `shell.theme-toggle`, `shell.account`) and keyboard shortcuts (`C`, `/`).
   - `AppSidebar.tsx`: Modernized active navigation indicator to a soft pill (`action.subtle` background + `action.primary` text). Added uppercase category headers (PRIMARY, PINS, UTILITIES) with `0.06em` letter spacing for scannable typographic hierarchy.
   - `AppBottomNav.tsx`: Increased height to 58px (`--daynori-bottom-nav-height: 58px`). Added active indicator pill around the vector icon, 11px label, and full support for 200% font scaling without text clipping.

4. **Creation Menu & Settings Unification (`CreationMenu.tsx`, `AppModals.tsx`, `settings/page.tsx`)**:
   - `CreationMenu.tsx` & `AppModals.tsx`: Replaced 7 fragmented card boxes with a unified grouped notebook sheet featuring 36×36px rounded vector icon containers, soft teal backgrounds (`action.subtle`), clear titles, supportive descriptions, and full keyboard navigation (Arrow keys, Enter/Space).
   - `settings/page.tsx`: Collapsed 6 separate heavy card boxes into a single consolidated, elegant notebook card with soft row dividers, vector icon badges, and smooth hover feedback.

5. **Visual Evidence Capture & Responsive Verification**:
   - Built automated visual evidence capture tooling (`scripts/capture-phase105-visual-evidence.mjs`) driving headless Chrome via Chrome DevTools Protocol (CDP).
   - Captured 80 baseline screenshots into `artifacts/phase105/screenshots/before/` and 80 post-refinement screenshots into `artifacts/phase105/screenshots/after/`.
   - Verified zero horizontal layout overflow across all viewports (1280px desktop, 412px, 390px, 360px, 320px mobile) in both light and dark themes using headless browser emulation and automated CSS layout tests. No physical display hardware or human visual sessions claimed.
   - Authored comprehensive comparative report in [`artifacts/phase105/visual-comparison-report.md`](../../artifacts/phase105/visual-comparison-report.md).
   - Consolidated machine-readable evidence in [`artifacts/phase105/evidence-summary.json`](../../artifacts/phase105/evidence-summary.json).

---

## Acceptance evidence

1. **Test Execution Evidence**:
   - `pnpm vitest run tests/unit/phase105-visual-tokens-and-a11y.test.ts tests/e2e/phase105-v2-web-visual-refinement.test.ts`:
     - Result: 18 tests passed (2 test files, 35ms).
   - `pnpm typecheck`:
     - Result: 13 projects passed with 0 errors across monorepo.
   - `pnpm lint`:
     - Result: 0 errors, 0 warnings across monorepo.
   - `pnpm validate:function-register`:
     - Result: 109 actions, 13 defects, 22 families covered.
   - `node scripts/validate-planning.mjs`:
     - Result: 106 phases, 22 requirements, 468 markdown files passed.

2. **Artifact Evidence**:
   - [`artifacts/phase105/visual-comparison-report.md`](../../artifacts/phase105/visual-comparison-report.md): Detailed screen-by-screen comparative before/after analysis covering all 8 screens and 5 viewports.
   - [`artifacts/phase105/evidence-summary.json`](../../artifacts/phase105/evidence-summary.json): Complete machine-readable evidence summary recording capture metrics, component refinements, contrast ratios, and standing gates.
   - [`artifacts/phase105/capture-manifest-before.json`](../../artifacts/phase105/capture-manifest-before.json): Baseline capture manifest with SHA-256 digests and overflow checks for 80 captures.
   - [`artifacts/phase105/capture-manifest-after.json`](../../artifacts/phase105/capture-manifest-after.json): Post-refinement capture manifest with SHA-256 digests and overflow checks for 80 captures.

---

## Gate-by-Gate Barrier Register (Grouped by Track)

### Track A: Bounded Web/PWA Beta Release Scope (Smallest Viable Release)

1. **`OWNER-RELEASE-AUTH`**:
   - Barrier: Requires explicit human owner sign-off on release candidate revision, hosting domain, test cohort size (20–50 users), and low-tier monthly budget ($5–$40/mo).
   - Status: **BLOCKED** (Awaiting owner authorization).
2. **`DEF-V2-001`**:
   - Barrier: Production Supabase / Google OAuth identity provider redirect URIs configured for public production web domain.
   - Status: **BLOCKED** (Awaiting production OAuth client credentials).
3. **`DEF-V2-008`**:
   - Barrier: Enterprise live AI provider contract and privacy compliance approval.
   - Remediation Status: **UI GATED & TRUTHFUL** (Live AI blocked fail-closed with HTTP 403; UI renders truthful banner and disables query input).
4. **`DEF-V2-013`**:
   - Barrier: Usability evaluation with $\ge 5$ consenting human participants ($\ge 4$ unassisted).
   - Status: **BLOCKED** (To be performed during initial invited beta cohort).

### Track B: Dedicated Android Release Track (Independent Hardware Track)

1. **`OWNER-SIGNING-KEYS`**:
   - Barrier: Production Android release keystore and credentials (`DAYNORI_RELEASE_STORE_*`).
   - Status: **BLOCKED** (Awaiting owner release keystore provision).
2. **`DEF-V2-011`**:
   - Barrier: Physical Android ARM64 hardware startup verification and physical TalkBack screen-reader latency profiling.
   - Status: **BLOCKED** (Requires physical test device).

---

## Remaining owner decisions

1. **Launch Authorization**: Review and approve candidate revision (with Phase 105 visual refinements) for Bounded Web/PWA Beta testing.
2. **Domain & Hosting Provider**: Confirm target web hosting environment (`preview.daynori.com` or `app.daynori.com`).
3. **Identity Provider**: Provision production Supabase OAuth redirect URLs for candidate domain.
4. **AI Assistant Decision**: Confirm that Ask Nori remains visibly gated under `DEF-V2-008` for the initial public web beta release.

---

## Stop condition

Phase 105 is complete and bounded. All 18 unit and E2E visual refinement tests pass with zero regressions. All 80 before and 80 after screenshots have been captured, verified, and documented. Working-tree changes from prior phases have been strictly preserved. Staged changes will be committed in a single conventional commit and pushed to `origin/codex/free-core-preview` under the standing repository workflow (ADR 0074). No production deployment or release readiness claimed from local tests.
