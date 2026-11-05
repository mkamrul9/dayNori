# ADR-0076: Owner scheduling — Phase 76 may start before Phase 75 acceptance

- Status: accepted.
- Date: 2026-10-27.
- Owner/reviewer: repository owner (explicit instruction); agent recorder.
- Related phase and specifications: [Phase 75](../roadmap/phases/75-files-and-audio-attachment-readiness.md), [Phase 76](../roadmap/phases/76-expenses-and-safe-custom-sections-completion.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0075](0075-attachment-readiness-environment-matrix.md), [progress](../roadmap/progress.json).
- Supersedes/superseded by: supersedes progress/plan text that Phase 76 must wait for Phase 75 completion; does not supersede Phase 75 acceptance criteria, attachment/provider/device evidence, ADR 0075 capability matrix, Phase 71 TalkBack checks, or release gates.

## Context

Phase 75 remains **blocked** with local file/audio implementation and integration evidence, but without physical-Android microphone capture/playback evidence, nominated-browser MediaRecorder journeys, or live Supabase/scanner claims ([phase-75 report](../phase-reports/phase-75.md), ADR 0075). Phase 76’s canonical plan previously listed Phase 75 as a hard `dependsOn` alongside completed Phases 73 and 74.

On 2026-10-27 the owner selected Phase 76 and authorized proceeding despite Phase 75’s remaining microphone/browser/provider verification, while keeping Phase 75 blocked with its real outstanding checks. Receipt uploads and attachment-dependent controls must retain their actual capability gates. No file/audio/provider/device acceptance is waived. Phase 71 remains blocked and is not a global scheduling blocker ([ADR 0074](0074-standing-phase71-scheduling-and-push.md)).

## Options

1. Keep Phase 76 hard-blocked on Phase 75 completion (prior schedule).
2. Start Phase 76 now under an explicit owner amendment; leave Phase 75 blocked with its remaining evidence gates; gate receipt/attachment UI on actual capability (chosen).
3. Mark Phase 75 complete without remaining evidence, or enable hosted preview uploads solely to unblock expenses (rejected — waives acceptance / contradicts DEF-V2-002).

## Decision

- Phase 76 may start before final Phase 75 acceptance.
- Canonical plan hard `dependsOn` for Phase 76 becomes completed prerequisites **73** and **74** only. Phase 75 remains **referenced** implementation/report and attachment-capability input, not a hard completion prerequisite.
- Phase 75 stays **blocked/incomplete** with physical Android capture/playback, nominated browser MediaRecorder evidence, and any live-provider claims still required for Phase 75 completion. Do not mark Phase 75 complete or waive those checks.
- Phase 71 stays **blocked** (spoken TalkBack). It is not a global scheduling blocker.
- Phase 76 must satisfy its own acceptance (expense create/edit/report/export; section create/fill/reorder/remove/recover; money invariants; authorization; optional navigation via All features). Receipt-free expense capture must work independently of Phase 75 recording evidence.
- When upload/provider capability is unavailable: keep expense/section workflows usable without new binary uploads; explain unavailable attachment actions; preserve existing field values/references; never fabricate successful upload/link status. Negative attachment-authorization tests remain required.
- Do not enable hosted preview uploads/audio or treat mocked storage as live-provider proof ([ADR 0075](0075-attachment-readiness-environment-matrix.md), DEF-V2-002).
- After Phase 76 acceptance passes: one conventional completion commit and push to `origin/codex/free-core-preview` without force ([ADR 0074](0074-standing-phase71-scheduling-and-push.md)).

### Dependency edge changed (2026-10-27)

| Phase | Prior `dependsOn` | New `dependsOn` | Why |
| --- | --- | --- | --- |
| 76 | 73, 74, **75** | 73, 74 | Expenses/custom sections use Phase 75 as referenced attachment capability input; receipt/upload actions stay capability-gated. |

Unchanged: Phase 75’s own acceptance, Phase 71’s TalkBack gate, vault/release gates, and Phase 99 participant obligations.

## Consequences

- Roadmap/progress may show Phase 76 `in_progress` while Phases 71 and 75 remain `blocked`.
- Planning validation continues to enforce real `dependsOn` completion; this ADR changes the plan edge, not the validator.
- Phase 77’s current `dependsOn` (72, 73, 74) is unaffected by this amendment.

## Verification and revisit

- `node scripts/build-phase-plans.mjs`, `build-blueprint.mjs`, and `validate-planning.mjs` must pass after the plan/progress update.
- Reopen if the owner retracts the amendment, if Phase 76 is marked complete while its own expense/section acceptance fails, or if Phase 75 is marked complete without its remaining evidence.
