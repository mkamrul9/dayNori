# ADR-0078: Owner scheduling — Phase 78 may start before Phase 75 and Phase 77 acceptance

- Status: accepted.
- Date: 2026-10-27.
- Owner/reviewer: repository owner (explicit instruction); agent recorder.
- Related: [Phase 75](../roadmap/phases/75-files-and-audio-attachment-readiness.md), [Phase 77](../roadmap/phases/77-safe-offline-reopen-sync-and-upgrade-recovery.md), [Phase 78](../roadmap/phases/78-complete-contextual-help-and-user-instructions.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0076](0076-phase-76-before-phase-75-acceptance.md), [ADR 0077](0077-trusted-device-offline-boot-and-session.md), [progress](../roadmap/progress.json).
- Supersedes/superseded by: supersedes plan text that Phase 78 must wait for Phase 75 and Phase 77 completion; does not supersede Phase 75 or Phase 77 acceptance criteria, attachment/provider/device evidence, installed-PWA/native cold-launch verification, Phase 71 TalkBack checks, or release gates. Does **not** automatically change later phases’ `dependsOn` (including Phase 79).

## Context

Phase 78’s canonical plan listed hard `dependsOn` of 73, 74, **75**, 76, and **77**. Phase 75 remains blocked on physical Android mic/browser and provider evidence. Phase 77 shipped ADR 0077, the public offline shell, durable quarantine, and a local Edge CDP static-fixture cold drill, but its report records **native installed cold launch as unmet** and the browser drill as a **static public fixture**, not a full installed production PWA.

On 2026-10-27 the owner selected Phase 78 and authorized Help implementation independently of unfinished attachment/provider and offline-device verification, while keeping those phases’ acceptance unwaived.

## Options

1. Keep Phase 78 hard-blocked on Phase 75 and Phase 77 completion (prior schedule).
2. Start Phase 78 now; hard prerequisites become completed **73**, **74**, and **76**; treat 75 and 77 as referenced capability/evidence inputs (chosen).
3. Mark Phase 75 or Phase 77 complete without remaining evidence (rejected).

## Decision

- Phase 78 hard `dependsOn` becomes completed prerequisites **73**, **74**, and **76** only.
- Phase **75** and Phase **77** remain **referenced** implementation/report and capability/evidence inputs for accurate Help copy (attachments, offline reopen, Update/Later). They are not hard completion prerequisites for Phase 78.
- Do not waive Phase 75 or Phase 77 acceptance. Do not enable unavailable uploads/audio or invent installed-PWA/native offline attestation.
- Phase 71 stays blocked (TalkBack) and is not a global scheduling blocker ([ADR 0074](0074-standing-phase71-scheduling-and-push.md)).
- Do not automatically change later phases’ dependencies (Phase 79 still lists its own `dependsOn`, including 77 and 78, until separately amended).
- Existing security, provider, hardware, release, and Phase 99 participant gates remain unchanged.
- Help must describe gated features and offline evidence honestly: distinguish already-open offline use, locally demonstrated browser shell behavior, and outstanding installed-PWA/native verification.

### Dependency edge changed (2026-10-27)

| Phase | Prior `dependsOn` | New `dependsOn` | Why |
| --- | --- | --- | --- |
| 78 | 73, 74, **75**, 76, **77** | 73, 74, 76 | Help documents attachment/offline capabilities from 75/77 reports without waiting for their remaining device/PWA acceptance. |

## Consequences

- Planning validation enforces the amended edge.
- Phase 77 progress/report must reflect remaining installed-PWA/native verification accurately (blocked/incomplete for unmet acceptance), while retaining the shipped commit and implemented shell work.
- Phase 78 articles must not generalize fixture evidence into a platform guarantee.

## Verification and revisit

- `node scripts/build-phase-plans.mjs`, `build-blueprint.mjs`, and `validate-planning.mjs` must pass after plan/progress updates.
- Reopen if the owner retracts the amendment, if Phase 78 is marked complete while its own Help acceptance fails, or if Phase 75/77 are marked complete without their remaining evidence.
