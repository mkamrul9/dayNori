# Phase 03 — Platform and integration feasibility spikes

Group: Foundation and sync. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [01 — Toolchain and executable workspace](01-toolchain-and-executable-workspace.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- tests/spikes
- docs/decisions
- docs/phase-reports

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Use disposable prototypes to validate mobile SQLite, browser IndexedDB, auth session storage, and local-first navigation.
2. Measure Expo development-build support for notifications, secure storage, biometric prompts, recording, and selected crypto libraries.
3. Record constraints for Android exact alarms, browser notification support, Drive scopes, Play billing, and eventual iOS releases; replace assumptions with ADRs.

## Acceptance

- Each high-risk capability has observed evidence or an explicitly recorded external prerequisite.
- The team has a supported native build strategy rather than depending on Expo Go for all features.
- Unavailable capabilities have honest UI fallback requirements and no guaranteed timing claim.

## Verification and evidence

- Run device/browser experiments and record versions, permissions, and failure behavior.
- Check current primary documentation and link it with the checked date.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/research/sources.md](../../research/sources.md)
- [docs/architecture/integrations-and-reminders.md](../../architecture/integrations-and-reminders.md)
- [docs/engineering/risks-and-decisions.md](../../engineering/risks-and-decisions.md)

## Commit target

`docs(feasibility): validate platform constraints and implementation choices`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
