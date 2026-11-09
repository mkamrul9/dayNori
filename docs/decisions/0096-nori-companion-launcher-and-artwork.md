# ADR-0096: Nori original companion and assistant launcher

- Status: accepted
- Date: 2026-11-10
- Owner/reviewer: Antigravity agent (owner-authorized Phase 96 with explicit scheduling exception).
- Related: [Phase 96](../roadmap/phases/96-nori-original-companion-and-assistant-launcher.md), [ADR 0008](0008-opt-in-ai-and-later-rooms.md), [ADR 0053](0053-ai-assistant-confirmed-actions.md), [ADR 0059](0059-daynori-vector-identity-and-platform-assets.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0090](0090-ai-provider-consent-privacy-and-operating-decisions.md), [ADR 0091](0091-scoped-retrieval-indexing-and-grounding-quality.md), [ADR 0092](0092-text-assistant-chat-and-contextual-guidance.md), [ADR 0093](0093-reviewed-note-task-and-journal-creation.md), [ADR 0094](0094-structured-organizer-tools-and-multi-action-creation.md), [ADR 0095](0095-voice-capture-transcription-and-reviewed-creation.md), [DEF-V2-008](../roadmap/v2/function-register.json), [release-gates.md](../engineering/release-gates.md), [nori-companion-and-launcher-guide.md](../design/nori-companion-and-launcher-guide.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, infrastructure, and release gates.

---

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 96 implementation and local verification before final acceptance of Phases 92 and 93:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 96 implementation and local verification before final acceptance of Phases 92 and 93. Record the scheduling exception in an ADR and roadmap metadata. Preserve the dependency list and outstanding acceptance gates. Reconcile the roadmap summary that still points to Phase 95 with the current reports and Phase 96 selection. Keep Phase 95’s actual blocked acceptance status. Work only on Phase 96. Keep the existing provisional contracts, fail closed on live AI capabilities, and preserve unrelated working-tree changes intact."

Phase 96 delivers the original Nori companion artwork, character asset pipeline, truthful state presentation engine, accessible floating launcher, and seamless connection to the existing assistant session across web and mobile platforms.

---

## Key Architectural Decisions

### 1. Original Daynori Artwork, Provenance, and Licensing
To preserve brand trust, artistic integrity, and intellectual property independence:
- **Zero AI Generation:** The Nori character artwork was drafted entirely by hand through mathematical vector geometry coordinates in `assets/brand/nori/nori-geometry.json`. No generative AI models (e.g. Midjourney, DALL-E, Stable Diffusion) were used.
- **Zero Third-Party Clipart:** No third-party stock vectors, icon sets, or clip-art files were imported.
- **Origami Paper Direction:** Nori is designed as a folded-paper origami notebook companion featuring teal faceted planes, ink accents, and a warm amber crest fold.
- **Licensing:** Distributed under the project's MIT license.
- **Asset Pipeline:** Automated script `scripts/build-nori-assets.mjs` generates pristine SVGs, PNG rasters across 5 standard scales (24, 32, 48, 96, 192), preview contact sheets, and native mobile icon assets (`packages/ui-mobile/assets/icons/nori.png`).

### 2. Nori Naming Review & Product Category Screening
- **Etymology:** "Nori" is the natural diminutive and root of "Daynori" (Day + Nori), symbolizing lightness, beginnings, and origami paper folds.
- **Conflict Screen:** A preliminary search across productivity, note-taking, and personal organizer applications on the Google Play Store and Apple App Store revealed no conflicting companion characters or trademark collisions in the mobile organizer category.
- **Provisional Status:** Formal commercial trademark registration remains pending public commercial launch.

### 3. Dual-Entry Single-Session Binding
Users can interact with the assistant via either the floating Nori companion launcher or the labeled "Ask Nori" button in the application header/settings:
- Both entry points bind to the exact same assistant controller (`useAssistantChat` on web, `AssistantSheet` on mobile).
- Conversation history, active streams, citation verification, and pending unreviewed proposals remain completely synchronized.
- Toggling or closing the launcher preserves draft questions and proposals without data loss.

### 4. Truthful State Derivation Engine
The companion's visual expression is derived strictly from real application conditions via `resolveNoriState`:
- **8 Mutually-Exclusive States:** `idle`, `greeting`, `listening`, `thinking`, `success`, `error`, `offline`, `sleeping`.
- **Precedence Order:**
  1. `listening`: Active microphone capture.
  2. `error`: Truthful failure or capability error, keeping Help links accessible.
  3. `thinking`: In-flight request or streaming response.
  4. `success`: Acknowledged action confirmation.
  5. `offline`: Network or service disconnected.
  6. `sleeping`: Quiet hours or resting state.
  7. `greeting`: User hover, focus, or assistant drawer opening.
  8. `idle`: Default resting posture.
- **No Optimistic Claims:** Nori never pretends capabilities are functional when offline or unconfigured.

### 5. Inviolable Microphone Capture Invariant
- Simply hovering, focusing, displaying, or clicking the Nori companion launcher **NEVER** activates the device microphone or records audio.
- The `listening` state is entered if and only if `isListening === true` during an active, user-initiated voice capture session.

### 6. Safe Placement & UI Collision Avoidance
- **4 Configurable Corners:** `bottom-right` (default), `bottom-left`, `top-right`, `top-left`.
- **Collision Avoidance:** `calculateNoriSafeCoordinates` applies safe insets that account for bottom navigation bars (64px offset), system banners, editor formatting bars, Save/Help buttons, and virtual soft keyboards.
- **Preference Persistence:** Position and visibility preferences are stored under `noriCompanion` via `/v1/users/me/preferences`.

### 7. Accessibility, Reduced Motion & Resource Conservation
- **Reduced Motion:** When `prefers-reduced-motion` is active or user preference `noriCompanion.reducedMotion` is true, all animation durations are set to `0ms` (`allowAnimation: false`) and Nori is rendered as a clean static origami graphic.
- **Background Halting:** Visibility change listeners halt animation loops when browser tabs or mobile windows are hidden.
- **Touch Targets:** Minimum 52px / 52dp button diameter exceeds the 48dp WCAG AA touch target requirement.
- **Focus Restoration:** Closing the assistant dialog automatically restores focus to the Nori launcher button.
- **Screen Reader Announcements:** `getNoriStateAccessibilityLabel` generates contextual descriptions for all 8 states.

---

## Consequences & Verification

- **Positive:** Daynori gains a distinctive, original, and friendly folded-paper brand mascot and launcher without licensing liabilities or third-party dependencies.
- **Compliance:** Strict compliance with privacy, reduced-motion, and accessibility standards.
- **Verification:** Verified by 21 automated integration tests in `tests/integration/phase96-nori-companion-launcher.test.ts` and 107 domain tests in `packages/domain/src/domain.test.ts`.
- **Release Gate:** Phase 96 is locally operational. External provider execution remains fail-closed under `DEF-V2-008` pending separate owner authorization.
