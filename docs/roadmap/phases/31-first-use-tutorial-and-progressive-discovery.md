# Phase 31 — First-use tutorial and progressive discovery

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [30 — Today home and personal customization](30-today-home-and-personal-customization.md)
- [10 — Personal workspace and preferences](10-personal-workspace-and-preferences.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web onboarding
- apps/mobile onboarding
- apps/api onboarding preferences

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Add a short skippable first-sign-in tutorial with selected goals/modules and an initial folder/example action.
2. Teach capture, organization, daily versus upcoming work, and personalization at the moment of use.
3. Persist onboarding progress, allow replay in Settings, and defer microphone/notification/Drive prompts until their features are invoked.

## Acceptance

- New users can reach a useful home without completing every tutorial step.
- Skipping/replaying never duplicates folders or removes content.
- Advanced features appear through deliberate enablement and contextual guidance.

## Verification and evidence

- Run fresh account, interrupted onboarding, skip/replay, and multi-device journeys.
- Review screen-reader focus, copy comprehension, and completion friction with pilot users.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/design/journeys.md](../../design/journeys.md)
- [docs/product/requirements.md](../../product/requirements.md)

## Commit target

`feat(onboarding): guide first use with progressive feature discovery`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
