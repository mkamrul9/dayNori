# Phase 96: Nori original companion and assistant launcher

## Identity and scope

- Phase: [96 — Nori original companion and assistant launcher](../roadmap/phases/96-nori-original-companion-and-assistant-launcher.md).
- Status: **blocked** — Foundational implementation, original Daynori origami vector artwork, character asset pipeline generating SVGs and PNG rasters across 5 scales (24, 32, 48, 96, 192), design token line icon, truthful 8-state expression engine (`resolveNoriState`), strict microphone hardware recording invariant (`isListening === true`), safe 4-corner positioning avoiding bottom navigation and system bars (`calculateNoriSafeCoordinates`), accessibility and reduced-motion enforcement (0ms durations, static vector rendering), background tab loop suppression, keyboard focus restoration, dual-entry single-session binding across web and mobile, and preference persistence (`noriCompanion`) complete: 21 integration tests in `phase96-nori-companion-launcher.test.ts` and 107 domain tests pass; underlying live AI model execution and external intelligence capabilities remain fail-closed pending explicit owner approval of synthetic test package (`DEF-V2-008` retained).
- Contributor/date: Antigravity agent, 2026-11-10.
- Base revision/branch: `a4308e209b0a87e32809424db09504642287ded0`, `codex/free-core-preview`.
- Hard prerequisites: Phase **92**, **93**.
- Owner Scheduling Authorization: The owner explicitly authorized Phase 96 implementation and local verification before final acceptance of Phases 92 and 93 ([ADR 0096](../decisions/0096-nori-companion-launcher-and-artwork.md)). Phase 96 is recorded as `blocked` due to unmet owner live synthetic test approval and enterprise provider contract gates (`DEF-V2-008` retained). Outstanding checks for earlier phases remain preserved. Standing push authorized under ADR 0074. No unverified production capability, live calls, or paid infrastructure claimed.

---

## Result

### Implementation and Verifications Delivered

1. **Original Daynori Artwork & Provenance (NOR-001 & NOR-002 Remediation):**
   - Authored geometric vector specifications in `assets/brand/nori/nori-geometry.json` defining Nori as an origami folded-paper notebook companion (teal body, shaded facets, warm amber crest, ink accents).
   - Provenance documented in `assets/brand/nori/README.md` and `NORI_NAME_METADATA` in `@daynori/domain`: 100% original drafting, zero AI image generation, zero third-party stock/clipart imports, MIT licensed.
   - Screened "Nori" diminutive across app store productivity and organizer categories; confirmed zero character collisions.

2. **Automated Multi-Scale Asset Pipeline:**
   - Implemented `scripts/build-nori-assets.mjs` compiling vector SVGs and PNG rasters across 5 standard dimensions (24, 32, 48, 96, 192) in light, dark, and static contrast modes.
   - Outputs deployed to `assets/brand/nori/`, `apps/web/public/brand/nori/`, and `apps/mobile/assets/brand/nori/`.
   - Added `nori` icon to `packages/design-tokens/src/icons.ts` and generated mobile raster icon `packages/ui-mobile/assets/icons/nori.png`, passing `pnpm icons:check`.

3. **Dual-Entry Single-Session Binding (NOR-003 Remediation):**
   - Connected both the floating companion launcher and the labeled "Ask Nori" button in `AppHeader.tsx` to the same assistant session controller.
   - Toggling the companion maintains complete session continuity, active streams, citation verification, and uncommitted draft questions/proposals.

4. **Truthful 8-State Presentation Engine (NOR-004 Remediation):**
   - Implemented `resolveNoriState()` in `@daynori/domain` deriving 8 mutually-exclusive states (`idle`, `greeting`, `listening`, `thinking`, `success`, `error`, `offline`, `sleeping`) strictly from actual application telemetry.
   - Enforced strict precedence: active mic recording (`listening`) and capability errors (`error`) immediately override decorative states, keeping Help and recovery actions reachable.

5. **Inviolable Microphone Hardware Invariant (NOR-005 Remediation):**
   - Verified that simply hovering, focusing, displaying, or clicking the launcher **NEVER** activates audio capture or records sound.
   - The `listening` state requires explicit, active microphone recording (`isListening === true`).

6. **Safe Corner Positioning & Collision Avoidance (NOR-006 Remediation):**
   - Implemented `calculateNoriSafeCoordinates()` in `@daynori/domain` supporting 4 corners (`bottom-right`, `bottom-left`, `top-right`, `top-left`).
   - Automatically offsets bottom positions by `bottomNavHeight` (64px) + margin (16px), preventing collisions with bottom navigation tabs, FABs, banners, and soft keyboards.

7. **Reduced Motion & Background Suppression (NOR-007 Remediation):**
   - Implemented `shouldReduceNoriMotion()` and `getNoriMotionDurations()` in `@daynori/domain`.
   - When system `prefers-reduced-motion` is active or user preference `noriCompanion.reducedMotion` is true, all animation durations are set to 0ms (`allowAnimation: false`) and Nori is presented as a clean static origami graphic.
   - Added `visibilitychange` listeners to halt animation render loops when tabs or windows are hidden.

8. **Keyboard Navigation, Touch Targets & Focus Restoration (NOR-008 Remediation):**
   - Enforced 52px (web) / 52dp (mobile) button sizes, exceeding the 48dp WCAG AA touch target requirement.
   - Accessible navigation via `Tab`, `Enter`, and `Space`. Right-click context menu provides instant corner switching, motion toggling, and hide option.
   - Closing the assistant panel restores focus directly back to the launcher trigger. Distinct screen-reader labels provided for all 8 states via `getNoriStateAccessibilityLabel()`.

9. **Preference Persistence (`noriCompanion`):**
   - Added `NoriCompanionPreferencesSchema` to contracts, display preferences, and API preferences mapping.
   - Stored and retrieved round-trip via `PATCH` and `GET /v1/users/me/preferences`.

10. **Phase 96 Integration Test Suite:**
    - Authored `tests/integration/phase96-nori-companion-launcher.test.ts` covering 21 comprehensive test scenarios (P96-01 through P96-12), all passing in 512ms.
    - Verified all 107 domain unit tests pass in 138ms.

---

## Artifacts and Evidence

- Findings register: `artifacts/phase96/findings-register.json` (NOR-001 through NOR-008).
- Manual UI evidence: `artifacts/phase96/manual-ui-evidence.json`.
- Evidence summary: `artifacts/phase96/evidence-summary.json`.
- Architecture Decision Record: `docs/decisions/0096-nori-companion-launcher-and-artwork.md`.
- Design & Engineering Guide: `docs/design/nori-companion-and-launcher-guide.md`.
