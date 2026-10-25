# ADR-0069: Version 2 visual direction (Warm notebook)

- Status: **accepted** — Warm notebook selected; scoped participant deferral recorded.
- Date: 2026-10-25, Asia/Dhaka.
- Related: [Phase 67](../roadmap/phases/67-original-visual-direction-and-responsive-journey-prototypes.md), [design-and-mobile](../roadmap/v2/design-and-mobile.md), ADR 0068, [phase67 package](../design/v2/phase67/README.md), Phase 99 release readiness.

## Context

Phase 66 established navigation personalization and operator boundaries. Phase 67 delivered original Warm notebook vs Crisp utility prototypes. Acceptance required owner review and the accessibility.md five-participant prototype gate.

## Decision

1. **Warm notebook** is the Version 2 visual direction for production token and shell work (Phases 68+).
2. Prototypes remain under `docs/design/v2/phase67/` as the design reference; they are not production routes.
3. Preserve Phase 66 behavior and ADR 0068 authorization boundaries in all UI derived from this direction.
4. Capture evidence uses local Chrome/Edge CDP + iframe host; required mode fails without a browser; `--allow-skip` records `skipped` with unmet evidence.
5. **Scoped amendment (2026-10-25):** The owner explicitly deferred the Phase 67 ≥5-participant usability sessions to **Phase 99**, before Version 2 release. Sessions **did not occur**. This amendment applies only to that Phase 67 participant requirement; other accessibility, security, recovery, and verification requirements remain in force. Phase 99 retains the validation obligation.

Source of selection and amendment: owner chat message dated 2026-10-25.

## Alternatives considered

- Crisp utility as default: rejected by owner selection (remains archived prototype).
- Skip participant/owner gates without written amendment: rejected.
- Treat dual-phase work authorization as selection/waiver: rejected prior to this message; this message supplies explicit selection and scoped deferral.
- Unpinned `npx playwright` as sole capture path: rejected.

## Consequences

- Phase 68 migrates semantic tokens and primitives to Warm notebook (not Crisp, not provisional-only).
- Phase 99 must run (or further amend) the deferred five-participant journey review before V2 release claims that depend on that gate.
- Historical reports that recorded Phase 67 as blocked remain accurate for their dates; this ADR supersedes the pending-selection state.

## Validation

- Contrast, smoke, and capture scripts under Node v24.21.0; manual inspection of representative Warm screens.
- Participant sessions: deferred — not validated in Phase 67.
