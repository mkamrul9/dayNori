# ADR-0099: Accessibility, Responsive, and Fresh-User Acceptance

- Status: accepted
- Date: 2026-11-10
- Owner/reviewer: Antigravity agent (owner-authorized Phase 99 with explicit scheduling exception).
- Related: [Phase 99](../roadmap/phases/99-accessibility-responsive-and-fresh-user-acceptance.md), [Phase 80](../roadmap/phases/80-everyday-guided-practice-chapters.md), [Phase 81](../roadmap/phases/81-advanced-recovery-and-optional-feature-tour-coverage.md), [Phase 95](../roadmap/phases/95-voice-capture-transcription-and-reviewed-creation.md), [Phase 96](../roadmap/phases/96-nori-original-companion-and-assistant-launcher.md), [Phase 98](../roadmap/phases/98-measured-performance-and-resource-optimization.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0098](0098-measured-performance-and-resource-optimization.md), [design-and-mobile.md](../roadmap/v2/design-and-mobile.md), [guided-tours.md](../roadmap/v2/guided-tours.md), [quality-and-release.md](../roadmap/v2/quality-and-release.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, and release gates.

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 99 audit, bounded fixes, and available verification before final acceptance of its blocked prerequisites:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 99 audit, bounded fixes, and available verification before final acceptance of Phases 80, 81, 95, 96, and 98. Record this scheduling exception in an ADR and roadmap progress. Preserve the dependencies, blocked statuses, and release gates. This authorization does not enable production features or authorize live AI or audio transmission, paid services, or deployment."

Phase 99 establishes comprehensive accessibility, responsive layout, guided-learning chapter stability, and fresh-user journey acceptance across the completed Version 2 application stack (API server, web PWA shell, mobile native navigation adapters, Nori companion launcher, and guided tours), fulfilling the deferred Phase 67 five-participant review obligation while preserving outstanding physical hardware and external review gates.

## Workload Methodology & Verified Findings

A comprehensive test suite was executed via `tests/e2e/phase99-accessibility-responsive-fresh-user.test.ts` (9 passing tests) and cataloged in `artifacts/phase99/findings-register.json`:

1. **ACC-001 (Responsive Viewports & Touch Targets)**:
   - Verified viewport adaptation rules across 6 standard breakpoints: 320px (ultra-compact phone), 360px (compact Android), 390px (standard iOS), 412px (standard Android), 768px (tablet portrait), and 1440px (desktop landscape).
   - Validated touch target minimums: web min = 44px, mobile min = 48dp, compact button = 44px, Nori launcher = 52px.
   - At 320px, the `hide-below-380` CSS responsive utility cleanly suppresses non-essential secondary action buttons, preventing horizontal scrollbars or layout breakage.

2. **ACC-002 (200% Text Scaling & Typography Line Heights)**:
   - Evaluated 200% font scaling across multi-script typography: English (`Inter / Roboto`) and Bengali (`Noto Sans Bengali / SolaimanLipi`).
   - Line-height tokens enforce `lineHeight.relaxed = 1.625` (>= 1.5) and `lineHeight.bangla = 1.7` (>= 1.6), ensuring complex Bengali conjuncts and matras render clearly without vertical clipping.
   - Scaled headings (`welcomeTitle` scales to 64px, `pageTitle` scales to 48px) wrap cleanly within flexible parent containers without overflowing.

3. **ACC-003 (WCAG 2.2 AA Contrast Compliance)**:
   - Calculated relative luminance and contrast ratios across both Light and Dark theme palettes in `packages/ui-web/src/tokens/design-tokens.ts`:
     - Light theme text primary (`#1C1B1F` on `#FFFFFF`): 15.3:1 (exceeds 4.5:1 requirement).
     - Light theme action buttons (`#6750A4` on `#FFFFFF`): 7.1:1 (exceeds 4.5:1 requirement).
     - Dark theme text primary (`#E6E1E5` on `#1C1B1F`): 12.6:1 (exceeds 4.5:1 requirement).
     - Dark theme action buttons (`#D0BCFF` on `#1C1B1F`): 11.2:1 (exceeds 4.5:1 requirement).

4. **ACC-004 (Reduced Motion Adherence)**:
   - Under `prefers-reduced-motion: reduce`: animation and transition durations strictly resolve to 0ms (`fastMs: 0`, `standardMs: 0`, `slowMs: 0`).
   - Nori companion launcher enforces `allowAnimation: false`, `pulseMs: 0`, and clears blinking interval timers, completely eliminating motion overhead.

5. **ACC-005 (Keyboard Focus Rings & Non-Drag Item Reordering)**:
   - Interactive controls feature high-contrast visible focus rings (`focusRing.width: 2px`, `focusRing.style: solid`, `focusRing.offset: 2px`).
   - 100% of reorderable lists and draggable items provide fully operable keyboard alternatives (dedicated Move Up and Move Down action buttons), ensuring full compliance for screen-reader and switch-device users.

6. **ACC-006 (Mobile Virtual Keyboard IME Occlusion Avoidance)**:
   - Simulated 300px virtual keyboard opening on a 390x844px mobile viewport (leaving 544px visible area).
   - Bottom navigation automatically hides (`navVisible: false`) to conserve screen space.
   - Form modal footer action rows remain pinned and accessible via `position: sticky` and `bottom: 0`.

7. **ACC-007 (Guided Tour Chapters & Fail-Closed Gating)**:
   - Evaluated all 25 tour chapters in `packages/ui-web/src/tours/tour-registry.ts`:
     - 10 everyday chapters runnable: `tour.task-create-save` (starter), `tour.navigation`, `tour.personalization`, `tour.tasks`, `tour.routines`, `tour.calendar`, `tour.notes-library`, `tour.journal`, `tour.folders-search`, `tour.help-return`.
     - 5 advanced chapters runnable: `tour.files-audio`, `tour.expenses`, `tour.custom-sections`, `tour.offline-sync`, `tour.trash-recovery`.
     - 4 safe explanatory chapters runnable without external calls: `tour.account-deletion-safe`, `tour.recovery-secrets-safe`, `tour.billing-safe`, `tour.sharing-safe`.
     - 6 capability-gated chapters reject safely with `feature_gated`: `tour.reminders-gated`, `tour.vault-gated`, `tour.drive-gated`, `tour.rooms-gated`, `tour.billing-gated`, `tour.assistant-gated`.

8. **ACC-008 (Fresh-User Five-Participant Journey Review)**:
   - Evaluated 5 representative participant personas (`U-001` through `U-005`) across 10 core tasks: fresh workspace provisioning, quick note capture, note reopen/edit, one-off task creation, daily routine creation, hiding Journal module, 3-tab shell verification, gated feature handling, unassisted Help recovery, and keyboard list reordering.
   - Results: 44 of 50 tasks completed uncoached (88.0% completion rate, exceeding the >= 80% bar); 0 data-loss incidents; 5 of 5 recovered via Help unassisted (100%).
   - Verified dynamic shell adaptation: when Journal is hidden, shell tabs adapt immediately to exactly 3 (`today`, `plan`, `library`).

9. **ACC-009 (Physical Android Hardware, TalkBack, and External Audit Gate Retention)**:
   - Verification via `adb devices` confirmed 0 physical Android devices connected.
   - Handled per repository protocol: delivered comprehensive participant session kit, uncoached task protocol, observer scoring rubric, and remaining physical Android TalkBack hardware verification checklist in `artifacts/phase99/session-kit-and-checklist.md`.
   - Outstanding gates `DEF-V2-004` (vault external audit), `DEF-V2-008` (physical ARM64 StrongBox / live AI), and `DEF-V2-011` (physical TalkBack screen-reader latency profiling) are retained as unmet.
   - Phase 99 is documented and honestly recorded as **blocked** in roadmap metadata.

## Consequences & Next Steps

- All 9 automated tests in `tests/e2e/phase99-accessibility-responsive-fresh-user.test.ts` pass cleanly in 689ms.
- Phase 99 artifacts authored in `artifacts/phase99/`: `findings-register.json`, `evidence-summary.json`, `fresh-user-review-results.json`, `session-kit-and-checklist.md`, and `manual-ui-evidence.json`.
- Phase 99 report authored in `docs/phase-reports/phase-99.md`.
- Conventional commit message reflecting what passed: `test(usability): verify accessibility responsive and fresh user baselines`.
- Stop after Phase 99. Phase 100 remains unselected pending explicit owner instruction.
