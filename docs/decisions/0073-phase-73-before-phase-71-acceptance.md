# ADR-0073: Owner scheduling — Phase 73 may start before Phase 71 acceptance

- Status: accepted.
- Date: 2026-10-27.
- Owner/reviewer: repository owner (explicit instruction); agent recorder.
- Related phase and specifications: [Phase 71](../roadmap/phases/71-native-android-interface-and-navigation-parity.md), [Phase 73](../roadmap/phases/73-tasks-routines-and-calendar-workflow-completion.md), [ADR 0072](0072-phase-72-before-phase-71-acceptance.md), [progress](../roadmap/progress.json).
- Supersedes/superseded by: supersedes progress text that Phase 73 must wait for Phase 71 completion; does not supersede Phase 71 acceptance criteria, ADR 0072’s Phase 71 remaining checks, or release gates.

## Context

Phase 72 completed under [ADR 0072](0072-phase-72-before-phase-71-acceptance.md). Phase 71 remains blocked: spoken TalkBack listen-through and any Phase 71–owned isolation/search attribution are unfinished. Phase 73’s canonical plan previously listed Phase 71 as a hard dependency alongside 69, 70, and 72.

On 2026-10-27 the owner authorized starting Phase 73 before Phase 71 is complete, while keeping Phase 71 blocked with its outstanding TalkBack review and verification gaps, and preserving all security and release requirements. This changes delivery order only.

## Options

1. Keep Phase 73 hard-blocked on Phase 71 completion (prior schedule).
2. Start Phase 73 now under an explicit owner amendment; leave Phase 71 blocked with its remaining checks; implement Phase 73 against its own acceptance (chosen).
3. Mark Phase 71 complete without remaining evidence (rejected — waives acceptance).

## Decision

- Phase 73 may start before final Phase 71 acceptance.
- Canonical plan dependency for Phase 73 becomes completed prerequisites **69**, **70**, and **72** only. Phase 71 remains referenced implementation/report input (native Plan chrome and journey runner), not a hard completion prerequisite.
- Phase 71 stays **blocked/incomplete** with spoken TalkBack listen-through and remaining Phase 71 verification gaps. Do not mark Phase 71 complete or waive its remaining checks.
- Phase 73 must satisfy its own acceptance (create/edit/reopen/complete/undo; no tomorrow copies on task completion; independent routine occurrences; same-record calendar edits; offline/retry/conflict and invalid schedule errors). Native Android evidence uses the existing Dev Client/AVD path where available; TalkBack listen-through remains a Phase 71 gate, not a Phase 73 completion substitute.
- Security contracts, vault/release gates, and ADR 0015 remain unchanged. No release_ready claim follows.

## Consequences

- Roadmap/progress shows only one `in_progress` phase (73); Phase 71 uses `blocked` with a reason linking this ADR.
- Later phases that still list Phase 71 as a hard dependency keep that edge until separately amended.
- Historical docs that said Phase 73 cannot start until Phase 71 completes remain as history and point here as the superseding decision.

## Verification and revisit

- `node scripts/build-phase-plans.mjs`, `build-blueprint.mjs`, and `validate-planning.mjs` must pass after the plan/progress update.
- Reopen if the owner retracts the amendment, or if Phase 73 completion is claimed while its own task/routine/calendar acceptance fails, or if Phase 71 is marked complete without TalkBack/remaining evidence.
