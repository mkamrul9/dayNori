# Phase 16 — Typed note domain and persistence

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [15 — Folder browsing and organization interfaces](15-folder-browsing-and-organization-interfaces.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain notes
- apps/api notes module
- packages/contracts

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement titled typed notes with plain text and safe constrained formatting, stable IDs, drafts, and revisions.
2. Support folder placement, tags, pin, archive, trash, and server/local validation.
3. Choose a portable versioned document format; sanitize rendered text and preserve line breaks and Unicode.

## Acceptance

- Notes persist and participate in folder organization and offline sync.
- Formatting contains no executable HTML and exported text remains portable.
- Revision conflicts preserve both draft and server content.

## Verification and evidence

- Test note invariants, Unicode/long content, malicious markup, permissions, and retry behavior.
- Round-trip portable note documents through local/server persistence.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/product/requirements.md](../../product/requirements.md)
- [docs/architecture/data-model.md](../../architecture/data-model.md)

## Commit target

`feat(notes): add portable typed notes and draft persistence`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
