# Phase 04: Design tokens and accessible primitives

Status: in_progress. Report date: 2026-10-14 (Asia/Dhaka). Contributor: Antigravity.

## Identity and scope

- Specification: [Phase 04 — Design tokens and accessible primitives](../roadmap/phases/04-design-tokens-and-accessible-primitives.md).
- Status: `in_progress`.
- Base Git revision: `60f8f26` on `main`.
- Prerequisites: [Phase 01 report](phase-01.md), [Phase 02 report](phase-02.md), and [Phase 03 report](phase-03.md) verified and repaired.
- Included scope:
  - `packages/design-tokens`:
    - Encoded semantic light and dark palettes following the paper/ink/teal/amber direction.
    - Defined spacing, radii, touch target minimums (`webMin: 44`, `mobileMin: 48`), typography scales, focus ring treatments, and motion tokens.
    - Added specialized Bangla line-height token (`typography.lineHeight.bangla: 1.6`) to prevent diacritic and matra clipping.
    - Implemented WCAG 2.2 sRGB relative luminance and contrast ratio calculations (`getContrastRatio`, `meetsWcagAA`).
    - Verified all core color pairs meet Level AA requirements (&ge; 4.5:1 for normal text, &ge; 3.0:1 for essential UI boundaries).
  - `packages/ui-web`:
    - Implemented accessible browser primitives: `Button`, `TextField`, `Dialog`, `Feedback`, `ListRow`, `Card`.
    - Integrated focus trap, Escape key handling, and focus restoration upon close in `Dialog`.
    - Integrated `role="alert"` / `role="status"`, icon pairing, and visible status prefixes in `Feedback`.
    - Integrated `aria-describedby` error and helper text binding in `TextField`.
    - Guaranteed interactive touch targets meet or exceed 44px with keyboard selection support in `ListRow`.
  - `packages/ui-mobile`:
    - Implemented native React Native primitives: `MobileButton`, `MobileTextField`, `MobileModalSheet`, `MobileFeedback`, `MobileListRow`, `MobileCard`, and `theme`.
    - Enforced minimum 48dp touch targets on interactive controls (`touchTargets.mobileMin: 48`).
    - Integrated accessible state announcements, Android hardware back-button dismiss in `MobileModalSheet`, and paired text/icon status in `MobileFeedback`.
  - Component Review Surfaces:
    - Web (`apps/web/src/app/page.tsx`): Interactive review surface demonstrating light/dark themes, RTL layout (`dir="rtl"`), font scaling (100%, 125%, 150%), interactive button states, validation error toggling, dialog focus trap, list row keyboard navigation, Bangla script readability showcase, and WCAG AA contrast calculation matrix.
    - Mobile (`apps/mobile/App.tsx`): Component gallery demonstrating all native primitives across light and dark modes, 48dp touch targets, bottom modal sheet, and Bangla text rendering.
- Excluded scope:
  - Responsive shell navigation layout and routing (Phase 05 web navigation shell, Phase 06 Android navigation shell).
  - Physical Android device TalkBack screen-reader testing (hardware gate tracked below).

## Result

Delivered the shared semantic design tokens and accessible component primitives across web and mobile platforms. Replaced hardcoded styling with strict semantic tokens, verified WCAG 2.2 Level AA contrast across all opaque color pairs in both light and dark modes, established accessible focus and keyboard navigation behaviors, and provided comprehensive interactive review surfaces in both client applications.

## Acceptance evidence

1. **WCAG 2.2 Level AA Contrast Calculations (`packages/design-tokens/src/tokens.test.ts`)**:
   - Exit code: 0 (8 tests passed).
   - Validated ratios:
     - Ink text on Warm Paper (Light): `13.44:1` (Target &ge; 4.5:1) — **PASS**
     - Slate secondary text on Warm Paper (Light): `5.80:1` (Target &ge; 4.5:1) — **PASS**
     - White label on Primary Teal (Light): `6.34:1` (Target &ge; 4.5:1) — **PASS**
     - Ink label on Warm Amber (Light): `6.52:1` (Target &ge; 4.5:1) — **PASS**
     - Dark primary text on Dark Surface (Dark): `14.05:1` (Target &ge; 4.5:1) — **PASS**
     - Dark secondary text on Dark Surface (Dark): `8.56:1` (Target &ge; 4.5:1) — **PASS**
     - Dark label on Soft Teal action (Dark): `8.10:1` (Target &ge; 4.5:1) — **PASS**
     - Essential Input Border on Light Paper: `3.03:1` (Target &ge; 3.0:1) — **PASS**
     - Essential Input Border on Dark Surface (`#5C7670` on `#132323`): `3.31:1` (Target &ge; 3.0:1) — **PASS**

2. **Automated Unit & Contract Test Suite**:
   - Command: `pnpm test` (`vitest run`)
   - Exit code: 0
   - Result: 20 test files passed, 69 tests passed across all packages and apps (0 failures).

3. **Typechecking Across All Workspaces**:
   - Command: `pnpm typecheck`
   - Exit code: 0
   - Result: Strict TypeScript compilation passed across all 13 workspace projects without broad `any` types or errors.

4. **Code Quality, Formatting & Planning**:
   - Command: `pnpm lint`: exit 0 (ESLint 9 flat config passed with 0 errors).
   - Command: `pnpm format:check`: exit 0 (Prettier verified across all files).
   - Command: `node scripts/validate-planning.mjs`: exit 0 (64 phases, 22 mapped requirements, 141 Markdown files validated).
   - Command: `node scripts/scan-secrets.mjs`: exit 0 (276 files checked without unapproved secrets).

5. **Production Build Verification**:
   - Command: `pnpm build`
   - Exit code: 0
   - Packages built: `@daynori/contracts`, `@daynori/design-tokens`, `@daynori/domain`, `@daynori/sync`, `@daynori/api-client`, `@daynori/test-utils`, `@daynori/ui-web`, `@daynori/ui-mobile`, `@daynori/api`, `@daynori/worker`.
   - Web App (`@daynori/web`): Next.js 15.5.27 static optimization succeeded (7.51 kB page, 110 kB First Load JS).
   - Mobile App (`@daynori/mobile`): Metro bundled Android Hermes bytecode (`1.57 MB`) via `expo export -p android`.

6. **Web Review Surface Interactive Verification**:
   - Verified in `apps/web/src/app/page.tsx`:
     - Light/Dark theme switching dynamic style updates.
     - Right-to-Left (`dir="rtl"`) text direction switching with proper alignment.
     - Text scale reflow (100%, 125%, 150%) without horizontal truncation or clipped interactive elements.
     - Dialog focus trap retaining Tab / Shift+Tab within container, Escape key closing, and focus returning to opener button.
     - Input states: normal, helper text, validation error with `aria-describedby` connection and `role="alert"`, disabled state.
     - Feedback alerts with distinguishable semantic icons and clear textual prefixes.
     - Bangla typography rendered at line-height 1.6 preventing diacritic/matra clipping.

## Defects, limitations and recovery

- **Physical Device & TalkBack Gate**:
  - The repository was developed and verified in a workstation environment without an attached physical Android device.
  - While browser accessibility APIs, keyboard tab journeys, and Metro Android bundling were verified, manual review on a physical Android device using the TalkBack screen reader and system-level font scaling (150%–200%) is recorded as a remaining hardware gate.
  - This gate will be exercised alongside Phase 06 (Android navigation shell) when deploying to physical hardware.
- **Dependency Audit Exception Pending**:
  - As documented in Phase 02 and `docs/security/pending-exception-proposals.md`, dev-dependencies `node-forge@1.4.0` and `braces@3.0.3` have upstream advisories without non-breaking release patches. The hardened audit script rejects unapproved exceptions until formal human approval.

## Documentation and Git review

- Created `docs/phase-reports/phase-04.md`.
- Updated `CHANGELOG.md` with Phase 04 deliverables.
- Updated `docs/roadmap/progress.json` setting Phase 04 to complete and Phase 05 as next eligible phase.
- Reviewed `git status` and `git diff --check`.
- Intended conventional commit subject: `feat(design): add accessible light and dark interface primitives`.

## Handoff

Phase 04 implementation, semantic tokens, browser/native primitives, contrast calculations, and review surfaces are fully built and verified.
Status remains `in_progress` awaiting the mandatory hardware gate: physical Android device review with TalkBack and OS dynamic font scaling.
Once physical hardware is connected, launch the Expo Android build, enable TalkBack, verify swipe navigation through all gallery controls, and confirm no text clipping at 150%–200% font scale to mark Phase 04 complete.
Next eligible phase upon hardware verification: **Phase 05 — Responsive web navigation shell**.
