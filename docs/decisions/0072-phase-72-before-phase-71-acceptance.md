# ADR-0072: Owner scheduling — Phase 72 may start before Phase 71 acceptance

- Status: accepted.
- Date: 2026-10-26.
- Owner/reviewer: repository owner (explicit instruction); agent recorder.
- Related phase and specifications: [Phase 71](../roadmap/phases/71-native-android-interface-and-navigation-parity.md), [Phase 72](../roadmap/phases/72-welcome-startup-onboarding-and-authentication-polish.md), [ADR 0015](0015-authentication-across-web-and-android.md), [progress](../roadmap/progress.json).
- Supersedes/superseded by: supersedes earlier progress text that Phase 72 must wait for Phase 71 completion; does not supersede Phase 71 acceptance criteria or release gates.

## Context

Phase 71 (native Android interface parity) remains incomplete: account sign-in/provisioning/switching is unreliable, spoken TalkBack listen-through is unperformed, and two-account isolation evidence is unfinished. Device chrome evidence reached 13/13 and routine/local-save refresh source fixes exist, but Phase 71 has no completion commit.

On 2026-10-26 the owner authorized starting Phase 72 before Phase 71 acceptance. Authentication and workspace provisioning repairs are primary Phase 72 scope. This changes delivery order only.

## Options

1. Keep Phase 72 hard-blocked on Phase 71 completion (prior schedule).
2. Start Phase 72 now under an explicit owner amendment; leave Phase 71 blocked with its remaining checks; assign auth/provision/switch repairs to Phase 72 (chosen).
3. Mark Phase 71 complete without remaining evidence (rejected — waives acceptance).

## Decision

- Phase 72 may start before final Phase 71 acceptance.
- Canonical plan dependency for Phase 72 becomes completed prerequisites **68** and **70** only. Phase 71 remains referenced implementation/report input, not a hard completion prerequisite.
- Authentication, workspace provisioning, and account-switch repairs belong to Phase 72.
- Phase 71 stays **blocked/incomplete** with its precise remaining verification (isolation, spoken TalkBack, and any other open Phase 71 gates).
- Release gates, ADR 0015 security contracts, and Phase 72’s own acceptance requirements are unchanged. No release_ready claim follows.

## Consequences

- Parallel delivery: Phase 72 can close auth/provision gaps that also unblock later Phase 71 evidence.
- Roadmap/progress must show only one `in_progress` phase (72); Phase 71 uses `blocked` with a reason linking this ADR.
- Historical docs that said Phase 72 cannot start until Phase 71 completes remain as history and point here as the superseding decision.
- Later phases that still list Phase 71 as a hard dependency keep that edge until separately amended.

## Verification and revisit

- `node scripts/build-phase-plans.mjs`, `build-blueprint.mjs`, and `validate-planning.mjs` must pass after the plan/progress update.
- Reopen if the owner retracts the amendment, or if Phase 72 completion is claimed while its own auth/isolation acceptance fails.
