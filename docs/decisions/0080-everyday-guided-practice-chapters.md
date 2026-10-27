# ADR-0080: Everyday guided practice chapters

- Status: accepted (implementation); acceptance evidence for real UI journeys tracked separately in the phase report.
- Date: 2026-10-27.
- Owner/reviewer: Cursor agent (owner-authorized Phase 80).
- Related: [Phase 80](../roadmap/phases/80-everyday-guided-practice-chapters.md), [ADR 0079](0079-action-verified-resumable-tour-engine.md), guided-tours.md.
- Supersedes/superseded by: none. Extends ADR 0079; does not waive Phase 71/75.

## Context

Phase 79 delivered a single proof chapter. Everyday workflows need independently selectable chapters with stronger predicates (opened ≠ visible, click ≠ save), multi-entity practice provenance, and selective cleanup — without a second tour engine.

## Options

1. **Separate product-tour SDK** — rejected (selectors/scripts/trust).
2. **Informational-only Learn chapters** — rejected (Next-only learning fails acceptance).
3. **Extend Phase 79 engine + everyday definitions (chosen)** — shared predicates/events, Help `runnable` mapping, web/native adapters, cleanup review.

## Decision

- Keep one engine; add typed predicates for entity open/load, preference changes, occurrence actions, search, Help return, filters, cleanup.
- Practice artifacts carry provenance (`createdByTour`, `userOwned`, `linkedOrEdited`); titles are never ownership proof.
- Progress schema raises practice ID/artifact caps; new chapters do not inherit fabricated completion from starter progress.
- Phase 81 advanced/gated topics stay out of the runnable catalog.
- Real UI journey attestation is required for Phase 80 acceptance (`scripts/phase80-tour-evidence.mjs --required`); unit success alone is insufficient.

## Consequences

- Help Learn shows multiple Start buttons per family when multiple tours map to one learning chapter.
- Native TourCoachmarkSheet accepts `chapterId` for catalog selection; Plan complete/undo emit correlated evidence.
- Attachment/audio/expenses/sections/portability remain Phase 81 / gated.
