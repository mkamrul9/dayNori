# Phase 22 — Journal entries and privacy defaults

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [15 — Folder browsing and organization interfaces](15-folder-browsing-and-organization-interfaces.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain journal
- apps/api journal module
- packages/contracts

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement dated entries with title/body, optional mood/tags/prompts, multiple entries per day, and collection placement.
2. Keep journal private by default and separate its date semantics from server created timestamps.
3. Add draft/version handling, edit history policy, and non-clinical optional reflection templates.

## Acceptance

- Entries can be browsed by local date and organized in user folders.
- Mood and prompts remain optional with no forced scoring.
- Journal content is omitted from operational telemetry and sharing defaults.

## Verification and evidence

- Test backdating, multiple entries per day, privacy, offline drafts, and Unicode.
- Verify journal body does not enter API logs or analytics.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/product/requirements.md](../../product/requirements.md)
- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)

## Commit target

`feat(journal): add private dated entries and optional reflection metadata`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
