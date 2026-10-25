# ADR-0069: Version 2 visual direction prototypes (pending owner selection)

- Status: **proposed** — prototypes delivered; direction not owner-selected.
- Date: 2026-10-25, Asia/Dhaka.
- Related: [Phase 67](../roadmap/phases/67-original-visual-direction-and-responsive-journey-prototypes.md), [design-and-mobile](../roadmap/v2/design-and-mobile.md), ADR 0068, [phase67 package](../design/v2/phase67/README.md).

## Context

Phase 66 established navigation personalization and operator boundaries. Phase 67 must establish an original visual direction and responsive journey prototypes before Phase 68 token/component work. Acceptance requires owner review, participant testing (accessibility.md prototype gate), and a recorded selection between Warm notebook and Crisp utility.

## Decision (partial)

1. Deliver isolated prototypes under `docs/design/v2/phase67/` — not production routes.
2. Compare **Warm notebook** and **Crisp utility** using the same journeys and light/dark treatments.
3. Record a **provisional** agent recommendation for Warm notebook; **do not** treat it as selected.
4. Preserve Phase 66 behavior and ADR 0068 authorization boundaries in all proposed UI.
5. Leave Phase 67 incomplete until owner selection and applicable usability review are recorded.

## Alternatives considered

- Skip participant/owner gates and select Warm in-repo: rejected — violates phase acceptance and accessibility prototype gate.
- Redesign production app in Phase 67: rejected — out of scope.
- Copy competitor layouts/assets: rejected.

## Consequences

Phase 68 must not migrate tokens to a “selected” direction until this ADR is updated to **accepted** with the owner’s choice. Review package: `docs/design/v2/phase67/review-package.md`.

## Validation and revisit

Contrast helper, planning validation, manual viewport inspection, capture script when Playwright is available. Revisit when owner records a selection or amends the review requirement in writing.
