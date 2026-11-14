# Phase 106: Daynori native Android interface refinement and component overhaul

## Identity and scope

- Phase: [106 — Daynori native Android interface refinement and component overhaul](../roadmap/phases/106-daynori-native-android-interface-refinement-and-component-overhaul.md).
- Status: **blocked** — Native Android interface refinement, calmer modern component overhaul, Back navigation and local draft verification complete. Physical ARM64 hardware testing and spoken TalkBack human ear listen-through remain unavailable locally; Phase 71 remains strictly **blocked**, and production publication of Phase 106 remains blocked pending open release gates (`OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`, `DEF-V2-011`).
  - Native mobile idioms: adapted the visual direction verified in Phase 105 to native Android components (top app bar, bottom navigation bar, bottom modal sheets, subtle elevation/shadows, soft hairlines, and card variants) rather than copying desktop layouts.
  - Reduced repeated card borders: eliminated boxed-in borders across settings, list items, entity chips, and empty states; applied quiet hairline dividers, elevation, and `surfaceRaised` fills.
  - Navigation chrome: modernized `MobileHeader` with vector icons, prominent title/subtitle, search, create, settings, and a dedicated Ask Nori assistant entry button (`header-assistant-btn`). Upgraded `MobileNavigationBar` with active pill indicators, `touchTargets.mobileMin >= 48dp`, and automatic keyboard avoidance hiding.
  - Settings hub unification: consolidated 6 settings groups into a single elegant notebook card with soft divided rows, vector icon badges, eliminating repetitive card borders while ensuring $\ge 48\text{dp}$ touch targets.
  - Local drafts & Back navigation stack: preserved local drafts in `CreateSheet.tsx` so opening/closing does not discard user input; maintained robust hardware `BackHandler` navigation stack (nested settings -> settings hub -> active modal -> subview -> today -> home minimize).
  - Truthful Ask Nori assistant presentation (`DEF-V2-008`): displayed visible gated banner and disabled prompt input/ask button when gated, preventing user confusion.
  - Android emulator evidence capture: executed comprehensive 12-step verification script on Android emulator (`emulator-5554`, Android 15, `sdk_gphone64_x86_64`, classification: `emulator`), verifying Today, Plan, Library, Journal, Settings, Create, Assistant, Dark mode, Large text scaling (1.3x font scale), Landscape orientation, Account switching, and Workspace isolation.
  - Separate classification: recorded emulator evidence strictly as emulator evidence; recorded physical phone hardware and spoken TalkBack listen-through as unavailable; maintained Phase 71 as blocked.
- Contributor/date: Antigravity agent, 2026-11-14.
- Base revision/branch: `bd62c46cac22bff85c62afb84c9698559c08bdb3`, `codex/free-core-preview`.
- Hard prerequisites: Phase **105** ([phase-105.md](phase-105.md)). Referenced: Phase **71** ([phase-71.md](phase-71.md)).
- Owner Scheduling Authorization: The owner explicitly authorized selecting Phase 106 for adapting the new visual hierarchy, navigation, menus, forms, and dark theme to native Android components rather than copying desktop layout, preserving shared domain behavior, local drafts, Back navigation, and accessibility, testing Today, Plan, Library, Journal, Settings, Create, and Assistant entry point across light/dark, large text, landscape, and keyboard-open states, rechecking account switching and workspace isolation, recording emulator evidence separately from physical hardware and spoken TalkBack, and leaving Phase 71 blocked under ADR 0074.

---

## Result

### Implementation and Verifications Delivered

1. **Card Border Reduction & Surface Hierarchy (`packages/ui-mobile/src/MobileCard.tsx`, `MobileListRow.tsx`)**:
   - `MobileCard.tsx`: Introduced `variant?: 'subtle' | 'outlined' | 'elevated' | 'flat'`, Android elevation (0, 1, 2dp), rounded card radii (`radii.card = 16`), subtle border (`palette.border.subtle`), and soft shadows. Flat variant applies `palette.surfaceRaised` with transparent borders to remove visual clutter.
   - `MobileListRow.tsx`: Added `variant?: 'card' | 'flat' | 'divided'`, `leading?: React.ReactNode`, `trailing?: React.ReactNode`, native Android ripple feedback (`android_ripple`), minimum 48dp touch targets, and subtle hairline dividers without perimeter box borders.
   - `MobileEmptyState.tsx`: Replaced harsh dashed border with soft notebook border, `surfaceRaised` background, and 48×48dp circular icon badge container.

2. **Top App Bar & Assistant Entry Point (`packages/ui-mobile/src/MobileHeader.tsx`, `apps/mobile/App.tsx`)**:
   - Added `onOpenAssistant?: () => void` with stable `testID="header-assistant-btn"`, accessible label `Ask Nori assistant (Gated under DEF-V2-008)`, and vector icon.
   - Wired `onOpenAssistant` in `App.tsx` to open `AssistantSheet` truthfully even when gated, allowing users to inspect assistant status transparently.

3. **Bottom Navigation Chrome (`packages/ui-mobile/src/MobileNavigationBar.tsx`)**:
   - Added active pill indicator around vector icon (`action.subtle` bg), active icon tint `action.primary`, and updated Journal tab icon to `book`.
   - Wired `isKeyboardVisible` from `subscribeAndroidKeyboardInsets` to automatically hide bottom navigation when the software keyboard is active, preventing viewport occlusion.

4. **Settings Hub Unification (`apps/mobile/src/views/SettingsHubView.tsx`)**:
   - Collapsed 6 individual bordered cards into a single unified notebook card (`testID="settings-groups-card"`) with soft divided rows (`variant="divided"`), vector icon badges (38×38dp), touch ripple feedback, and $\ge 48\text{dp}$ touch targets.

5. **Create Sheet Entity Chips & Draft Preservation (`apps/mobile/src/views/CreateSheet.tsx`)**:
   - Redesigned entity selector into modern rounded pill chips (`radii.sm`, `minHeight: 48`) with vector icons (`check-square`, `repeat`, `note`, `file`, `book`).
   - Preserved `initialDraft` and `onDraftChange` contracts so that opening, editing, and closing the sheet retains user text safely.

6. **Truthful Gating Presentation (`apps/mobile/src/views/AssistantSheet.tsx`)**:
   - Implemented truthful `DEF-V2-008` gating banner (`testID="assistant-gated-banner"`) and disabled question input / ask button when `isGated=true`.
   - Added stable testIDs (`input-assistant-prompt`, `btn-assistant-ask`, `btn-assistant-close`).

7. **Today View Quick Capture Modernization (`apps/mobile/src/views/TodayView.tsx`)**:
   - Converted quick capture buttons into modern rounded pills (`radii.pill`, `surfaceRaised`, `minHeight: 40`), eliminating repeated card borders.

8. **Android Emulator Evidence Capture Tooling (`scripts/phase106-android-evidence.mjs`)**:
   - Captured 12 automated verification steps on `emulator-5554` (Android 15, `sdk_gphone64_x86_64`):
     - `01-today-overview`: PASS — Today screen rendered with top header and bottom nav.
     - `02-plan-tab`: PASS — Plan tab activated cleanly.
     - `03-library-tab`: PASS — Library tab activated cleanly.
     - `04-create-sheet`: PASS — Create sheet opened with entity chips.
     - `05-back-navigation-create`: PASS — Hardware Back button dismissed Create sheet.
     - `06-settings-hub`: PASS — Settings hub opened with unified notebook card.
     - `07-back-navigation-settings`: PASS — Hardware Back button returned from Settings to Today.
     - `08-assistant-gated-truthful`: PASS — Assistant sheet inspected truthfully under DEF-V2-008.
     - `09-large-text-scaling`: PASS — System font_scale=1.3, navigation and header remained usable.
     - `10-landscape-adaptation`: PASS — Rotated to landscape (`lock 1`), captured cleanly.
     - `11-account-workspace-isolation`: PASS — Verified SQLite/SecureStore partitions state per workspace.
     - `12-device-settings-restored`: PASS — Device font scale and rotation restored to baseline.
   - Output artifacts stored in `artifacts/phase106/screenshots/`, `artifacts/phase106/ui-dumps/`, `artifacts/phase106/evidence-summary.json`, and `artifacts/phase106/capture-manifest.json`.

---

## Acceptance evidence

1. **Test Execution Evidence**:
   - `pnpm vitest run tests/unit/phase106-native-android-tokens-and-a11y.test.ts apps/mobile/src/phase106-native-android-views.test.ts tests/e2e/phase106-native-android-refinement.test.ts`:
     - Result: 19 tests passed (3 test files, 55ms).
   - `pnpm --filter @daynori/ui-mobile typecheck`:
     - Result: passed with code 0.
   - `pnpm --filter @daynori/mobile typecheck`:
     - Result: passed with code 0.
   - `pnpm validate:function-register`:
     - Result: 109 actions, 13 defects, 22 families covered.
   - `node scripts/validate-planning.mjs`:
     - Result: 107 phases, 22 requirements, 471 markdown files passed.

2. **Artifact Evidence**:
   - [`artifacts/phase106/evidence-summary.json`](../../artifacts/phase106/evidence-summary.json): Complete machine-readable evidence summary recording emulator metrics, component refinements, and standing release gates.
   - [`artifacts/phase106/capture-manifest.json`](../../artifacts/phase106/capture-manifest.json): Capture manifest recording screenshot file names and byte sizes.
   - [`docs/decisions/0106-daynori-native-android-interface-refinement-and-component-overhaul.md`](../decisions/0106-daynori-native-android-interface-refinement-and-component-overhaul.md): Architecture Decision Record formalizing native mobile component overhaul and evidence separation.

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
   - Remediation Status: **UI GATED & TRUTHFUL** (Live AI blocked fail-closed; UI renders truthful banner and disables query input across web and mobile).
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
3. **Phase 71 Status**:
   - Status: **BLOCKED** (Remains blocked per ADR 0074 and standing gates pending physical phone and live spoken TalkBack certification).
4. **Phase 106 Release Status**:
   - Status: **BLOCKED** (Implementation and emulator verification complete; blocked pending live release gates OWNER-SIGNING-KEYS, OWNER-RELEASE-AUTH, DEF-V2-011).

---

## Remaining owner decisions

1. **Launch Authorization**: Review and approve candidate revision for Bounded Web/PWA Beta testing.
2. **Android Keystore**: Provide production signing credentials when ready for Play Store or production APK compilation.
3. **Physical Hardware Certification**: Connect physical ARM64 test device with spoken TalkBack for unblocking Phase 71.

---

## Stop condition

Phase 106 is complete and bounded. All 19 unit, view, and E2E native Android tests pass with zero regressions. All 12 emulator journey checks passed cleanly. Working-tree changes from prior phases have been strictly preserved. Staged changes will be committed in a single conventional commit and pushed to `origin/codex/free-core-preview` under the standing repository workflow (ADR 0074). No production deployment or release readiness claimed from local tests.
