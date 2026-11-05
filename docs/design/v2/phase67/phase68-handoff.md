# Phase 68 handoff checklist

**Selected direction: Warm notebook** (owner, 2026-10-25). ADR 0069 accepted.

Phase 68 — Design tokens, components, icons, and motion — should:

1. Adopt **Warm notebook** into semantic tokens in `packages/design-tokens` (align muted text and radii/spacing with the selected prototype; keep Crisp CSS only as archive reference).
2. Implement the component inventory in [token-inventory.md](token-inventory.md) with all states from [journey-state-matrix.md](journey-state-matrix.md).
3. Wire web/mobile Icon adapters only to the semantic registry — no emoji chrome.
4. Preserve Phase 66 registry, All features, pin/hide, operator boundaries (ADR 0068).
5. Not enable gated modules; not redesign the logo without a separate decision.
6. Validate contrast on **rendered** components (not palette-only).
7. Port responsive rules from [responsive-notes.md](responsive-notes.md); keep native Android adaptations native.
8. Use prototype journeys as acceptance fixtures with synthetic content.
9. Remember Phase 99 still owns the deferred five-participant prototype review — do not invent that evidence here.

Do not treat the Phase 67 HTML package as production UI.
