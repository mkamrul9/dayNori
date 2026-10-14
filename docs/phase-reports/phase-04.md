# Phase 04: Design tokens and accessible primitives

Status: in_progress. Report date: 2026-10-14 (Asia/Dhaka). Contributor: Antigravity.

## Identity and scope

- Specification: [Phase 04 — Design tokens and accessible primitives](../roadmap/phases/04-design-tokens-and-accessible-primitives.md).
- Status: `in_progress`.
- Prerequisites: [Phase 01 report](phase-01.md), [Phase 02 report](phase-02.md), and [Phase 03 report](phase-03.md) verified and repaired.
- Audit Remediation (Findings F03–F10 from [Phase 01–04 Audit](../reviews/phase-01-04-audit-2026-10-14.md)):
  - **F03 (P1) — Danger-Button Contrast**: Added semantic danger action tokens (`danger`, `dangerHover`, `dangerLabel`) to light and dark theme palettes. Light theme pairs `#B3261E` with `#FFFFFF` label (6.54:1 contrast); dark theme pairs `#F2B8B5` with `#381615` dark ink label (9.51:1 contrast). Consumed in web `Button` and `MobileButton`.
  - **F04 (P2) — Selected-Row Metadata Contrast**: Updated `ListRow` and `MobileListRow` metadata foreground to `palette.text.secondary`, yielding 5.37:1 contrast on light subtle background (`#E4EFEA`) and 7.24:1 on dark subtle background (`#1C312E`), exceeding the 4.5:1 normal-text requirement.
  - **F05 (P2) — Row Selection Role & State**: Removed invalid `aria-selected` attribute from interactive `ListRow` button roles; implemented APG toggle button semantics with `aria-pressed={selected}`. Verified keyboard Enter/Space activation in browser.
  - **F06 (P2) — TextField Description References**: Constructed `aria-describedby` only from rendered description elements (referencing error element when error is present and helper element when valid). Preserved caller-provided `aria-describedby` IDs and validated error recovery.
  - **F07 (P2) — Typography Scaling & Reflow**: Allowed `ListRow` and `MobileListRow` content to wrap naturally (`overflowWrap: 'anywhere'`) without ellipsis truncation. Wrapped the review contrast matrix table in an accessible horizontally scrollable region (`role="region"` with `aria-label`). Verified 320px viewport reflow with zero document horizontal overflow and in-gallery font scaling up to 200%.
  - **F08 (P2) — Native Sheet Touch Target**: Updated `MobileModalSheet` close button touch target to 48dp minimum (`touchTargets.mobileMin: 48`). Added `ScrollView` for enlarged content and `KeyboardAvoidingView`.
  - **F09 (P2) — Native Sheet Reduced Motion**: Subscribed to OS reduced-motion preferences via `AccessibilityInfo.isReduceMotionEnabled()` and `reduceMotionChanged` listener; dynamically selects non-animated modal presentation when requested.
  - **F10 (P2) — Real React Browser Verification**: Hardened `tests/spikes/browser/run-primitives.mjs` using Edge CDP to mount and test the actual compiled React primitives on `http://127.0.0.1:3000/review`. Labeled `primitives-real.html` as a disposable synthetic prototype model harness.

## Result

Delivered and remediated shared semantic design tokens and accessible component primitives across web and mobile platforms. Resolved all contrast, semantic ARIA state, description reference, native touch target, reduced motion, and text scaling defects identified during the audit. Automated browser CDP interaction verification confirms all Level AA contracts pass against the real mounted React components.

Status remains `in_progress` because physical Android device testing with TalkBack and OS dynamic font scaling is an explicit hardware gate that cannot be waived without an attached device.

## Acceptance evidence

1. **WCAG 2.2 Level AA Contrast Calculations (`packages/design-tokens/src/tokens.test.ts`)**:
   - Exit code: 0 (8 test suites passed).
   - Validated ratios:
     - Ink text on Warm Paper (Light): `13.44:1` (Target &ge; 4.5:1) — **PASS**
     - Secondary Slate on Paper (Light): `5.80:1` (Target &ge; 4.5:1) — **PASS**
     - White label on Primary Teal (Light): `6.34:1` (Target &ge; 4.5:1) — **PASS**
     - White label on Danger Action (Light): `6.54:1` (Target &ge; 4.5:1) — **PASS**
     - Selected Row Metadata (Light): `5.37:1` (Target &ge; 4.5:1) — **PASS**
     - Dark primary text on Dark Surface (Dark): `14.05:1` (Target &ge; 4.5:1) — **PASS**
     - Dark secondary text on Dark Surface (Dark): `8.56:1` (Target &ge; 4.5:1) — **PASS**
     - Dark label on Soft Teal action (Dark): `8.10:1` (Target &ge; 4.5:1) — **PASS**
     - Dark ink label on Danger Action (Dark): `9.51:1` (Target &ge; 4.5:1) — **PASS**
     - Selected Row Metadata (Dark): `7.24:1` (Target &ge; 4.5:1) — **PASS**
     - Essential Input Border on Light Paper: `3.03:1` (Target &ge; 3.0:1) — **PASS**
     - Essential Input Border on Dark Surface (`#5C7670` on `#132323`): `3.31:1` (Target &ge; 3.0:1) — **PASS**

2. **Real Browser React Primitives Verification (`tests/spikes/browser/run-primitives.mjs`)**:
   - Browser: Microsoft Edge (`Edg/155.0.4283.45`) in headless mode via CDP.
   - Target URL: `http://127.0.0.1:3000/review` (mounted React components from `@daynori/ui-web`).
   - Exit code: 0 (all 11 checks passed):
     - `✓ PASS: Button touch target meets 44px min (Primary: 44px, Compact: 44px)`
     - `✓ PASS: F03: Light theme danger button contrast >= 4.5:1 (6.54:1 - bg: rgb(179, 38, 30), fg: rgb(255, 255, 255))`
     - `✓ PASS: F04: Light theme selected row metadata contrast >= 4.5:1 (5.37:1 - bg: rgb(228, 239, 234), fg: rgb(82, 99, 99))`
     - `✓ PASS: F03: Dark theme danger button contrast >= 4.5:1 (9.51:1 - bg: rgb(242, 184, 181), fg: rgb(56, 22, 21))`
     - `✓ PASS: F05: Selected row has role="button" and aria-pressed="true"`
     - `✓ PASS: F05: Selected row does NOT have invalid aria-selected`
     - `✓ PASS: F04: Dark theme selected row metadata contrast >= 4.5:1 (7.24:1 - bg: rgb(28, 49, 46), fg: rgb(174, 192, 187))`
     - `✓ PASS: F05: Keyboard Enter updates row aria-pressed to true`
     - `✓ PASS: F06: Valid TextField references existing helper element (input-title-helper)`
     - `✓ PASS: F06: Error state references error ID and NOT hidden helper ID (input-error-error)`
     - `✓ PASS: F06: Rendered error element exists in DOM`
     - `✓ PASS: F06: Recovered TextField restores helper description reference (input-error-helper)`
     - `✓ PASS: Dialog opens with role="dialog" and aria-modal="true"`
     - `✓ PASS: Dialog closes cleanly on Escape`
     - `✓ PASS: F07: Primitives scale with review scale factor (150% - Button: 21px, Input: 24px)`
     - `✓ PASS: F07: Contrast summary table wrapped in accessible scrollable region`
     - `✓ PASS: F07: 320px narrow screen reflow without document horizontal overflow (docWidth: 320px)`

3. **Automated Unit & Contract Test Suite**:
   - Command: `pnpm test` (`vitest run` under Node 24.21.0)
   - Exit code: 0
   - Result: 20 test files passed, 93 tests passed (0 failures).

4. **Typechecking Across All Workspaces**:
   - Command: `pnpm typecheck`
   - Exit code: 0 (13 of 13 workspace projects passed strict TypeScript compilation).

5. **Code Quality, Formatting & Planning**:
   - Command: `pnpm lint`: exit 0 (ESLint flat config passed with 0 errors).
   - Command: `pnpm format:check`: exit 0 (Prettier verified across all files).
   - Command: `pnpm validate:planning`: exit 0 (64 phases, 22 mapped requirements, 144 Markdown files validated).
   - Command: `pnpm audit:secrets`: exit 0 (1045 files checked without unapproved secrets).

## Defects, limitations and recovery

- **Physical Device & TalkBack Hardware Gate (Outstanding)**:
  - `adb devices` returns no attached physical Android device in the execution environment.
  - While browser accessibility APIs, keyboard tab journeys, Metro compilation, and native APK builds were verified, manual verification on a physical Android device using TalkBack and OS dynamic font scaling (150%–200%) remains an explicit prerequisite before Phase 04 can be marked complete.
  - The status of Phase 04 remains `in_progress`.
- **Dependency Audit Exception Pending**:
  - Upstream advisories for `node-forge@1.4.0` and `braces@3.0.3` have no non-breaking upstream releases; `pnpm audit:deps` correctly fails closed pending formal human repository owner exception approval.

## Documentation and Git review

- Updated `packages/design-tokens`: added semantic danger action tokens (`danger`, `dangerHover`, `dangerLabel`) and contrast tests.
- Updated `packages/ui-web`: fixed `Button` danger colors and scaling, `TextField` description references, `ListRow` button `aria-pressed` states, metadata contrast, and text wrapping.
- Updated `packages/ui-mobile`: fixed `MobileButton` danger colors, `MobileListRow` metadata contrast and wrapping, and `MobileModalSheet` 48dp touch target, ScrollView, and `AccessibilityInfo` reduced motion listener.
- Updated `apps/web/src/app/review/page.tsx`: added scrollable contrast matrix table and dynamic `--daynori-text-scale` support up to 200%.
- Hardened `tests/spikes/browser/run-primitives.mjs`: real browser automated interaction verification against mounted React components via Edge CDP.
- Updated `CHANGELOG.md` and this report.
- Conventional commit subject: `fix(design): resolve contrast, aria states, text scaling, and native sheet controls`.

## Handoff

All identified software defects F03–F10 have been resolved, re-implemented, and verified in an actual browser.
Status remains `in_progress` pending the mandatory physical Android device TalkBack and hardware gate.
Once physical hardware is connected, launch the Expo Android build, enable TalkBack, verify swipe navigation through all gallery controls, and confirm no text clipping at 150%–200% font scale to mark Phase 04 complete.
Provisional web navigation shell work for Phase 05 has been separately authorized and implemented.
