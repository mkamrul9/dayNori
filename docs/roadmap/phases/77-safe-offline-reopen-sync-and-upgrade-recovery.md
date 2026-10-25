# Phase 77 — Safe offline reopen sync and upgrade recovery

Group: V2 everyday experience. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [72 — Welcome startup onboarding and authentication polish](72-welcome-startup-onboarding-and-authentication-polish.md)
- [73 — Tasks routines and calendar workflow completion](73-tasks-routines-and-calendar-workflow-completion.md)
- [74 — Library writing journal and search completion](74-library-writing-journal-and-search-completion.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web/public
- apps/web/src/data
- apps/mobile/src/data
- packages/sync
- apps/api
- docs/decisions

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Record an ADR for trusted-device local boot/session boundaries and implement safe private-organizer cold offline reopen without shared private HTML/API caches.
2. Verify local save indicators, draft recovery, sync queues/receipts, revision conflicts and account-switch quarantine across redesigned core flows.
3. Exercise existing export/import/Trash/account-deletion behavior and V1 schema/preferences/service-worker upgrades; repair bounded recovery gaps and document rollback limits.

## Acceptance

- A previously authorized trusted device reopens the supported organizer offline; fresh/missing local prerequisites show truthful fallback.
- Dirty editors, queued mutations and receipts survive restart/update; account changes never mix private data.
- Conflicts retain both recoverable edits; exports/imports and deletion/restore suppression preserve their contracts.

## Verification and evidence

- Run offline/restart/upgrade/conflict and two-account repository/sync integration cases against V1 fixtures.
- Perform cold installed-PWA and native reopen/update drills; inspect Cache Storage for forbidden private responses.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/roadmap/v2/feature-coverage.md](../v2/feature-coverage.md)
- [docs/engineering/handoff.md](../../engineering/handoff.md)
- [docs/roadmap/v2/quality-and-release.md](../v2/quality-and-release.md)
- [docs/decisions/0066-offline-shell-and-safe-pwa-updates.md](../../decisions/0066-offline-shell-and-safe-pwa-updates.md)
- [docs/architecture/sync-and-offline.md](../../architecture/sync-and-offline.md)

## Commit target

`feat(offline): preserve organizer access and upgrade recovery`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
