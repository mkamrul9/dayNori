# Phase 68 handoff checklist

Phase 68 — Design tokens, components, icons, and motion — should:

1. Adopt the **owner-selected** direction (Warm or Crisp) into semantic tokens in `packages/design-tokens` after selection is recorded.
2. Implement the component inventory in [token-inventory.md](token-inventory.md) with all states from [journey-state-matrix.md](journey-state-matrix.md).
3. Wire web/mobile Icon adapters only to the semantic registry — no emoji chrome.
4. Preserve Phase 66 registry, All features, pin/hide, operator boundaries (ADR 0068).
5. Not enable gated modules; not redesign the logo without a separate decision.
6. Validate contrast on **rendered** components (not palette-only).
7. Port responsive rules from [responsive-notes.md](responsive-notes.md); keep native Android adaptations native.
8. Use prototype journeys as acceptance fixtures with synthetic content.

Do not treat this Phase 67 package as production UI.
