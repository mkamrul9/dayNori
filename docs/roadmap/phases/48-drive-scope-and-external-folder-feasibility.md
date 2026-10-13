# Phase 48 — Drive scope and external folder feasibility

Group: Vault and Drive. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [38 — Controlled private beta](38-controlled-private-beta.md)
- [03 — Platform and integration feasibility spikes](03-platform-and-integration-feasibility-spikes.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- tests/spikes drive
- docs/decisions
- docs/architecture/integrations-and-reminders.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Prove the exact read/write behavior of drive.file with Picker selections and files created by the app.
2. Test existing and externally-added children of a selected folder; do not assume parent selection grants full child access.
3. Choose selected-file mode or a justified broader-scope folder mirror, estimate verification/security assessment/cost, and document revocation/deletion semantics.

## Acceptance

- The scope decision states exactly what the application can enumerate and upload.
- Owner-controlled verification prerequisites are known before a full-folder promise is made.
- The chosen mode has a truthful UX and external-source ownership policy.

## Verification and evidence

- Run experiments against a test Drive account and inspect granted scopes.
- Review current Google API scope/verification documentation and retain dated evidence.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/integrations-and-reminders.md](../../architecture/integrations-and-reminders.md)
- [docs/engineering/risks-and-decisions.md](../../engineering/risks-and-decisions.md)

## Commit target

`docs(drive): validate scopes and external folder access constraints`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
