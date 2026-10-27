# ADR-0074: Standing owner scheduling — Phase 71 must not block later phases; commit and push completed work

- Status: accepted.
- Date: 2026-10-27.
- Owner/reviewer: repository owner (standing instruction); agent recorder.
- Related phase and specifications: [Phase 71](../roadmap/phases/71-native-android-interface-and-navigation-parity.md), [Phase 74](../roadmap/phases/74-library-writing-journal-and-search-completion.md), [ADR 0072](0072-phase-72-before-phase-71-acceptance.md), [ADR 0073](0073-phase-73-before-phase-71-acceptance.md), [progress](../roadmap/progress.json), [handoff](../engineering/handoff.md).
- Supersedes/superseded by: supersedes progress/handoff text that later V2 everyday/capability phases must wait solely for Phase 71 completion; does not supersede Phase 71 acceptance criteria, TalkBack evidence, security contracts, vault/release gates, or production activation.

## Context

Phase 71 remains blocked on spoken TalkBack listen-through and related verification. ADRs 0072 and 0073 already authorized Phases 72 and 73 ahead of Phase 71. On 2026-10-27 the owner issued standing instructions that Phase 71’s unfinished verification must not repeatedly block later development phases, while Phase 71 itself stays incomplete without fabricated completion or waived checks. Each selected phase must still meet its own functional, security, and acceptance requirements. After completing a phase, contributors must review, commit, and push to the configured working branch (`origin/codex/free-core-preview`) without re-asking for push permission. This authorizes development scheduling and Git publication only — not production feature activation, store submission, paid services, or separate deployment actions.

## Options

1. Keep every later phase hard-blocked on Phase 71 completion (rejected for scheduling momentum).
2. Standing amendment: remove Phase 71 as a mere completion-flag prerequisite from selected later phases; keep Phase 71 blocked with real remaining checks; require each phase’s own acceptance; commit and push completed work (chosen).
3. Mark Phase 71 complete without TalkBack/evidence (rejected — waives acceptance).

## Decision

### Scheduling

- Phase 71 stays **blocked/incomplete** with its outstanding TalkBack and verification gaps. Do not mark it complete or waive those checks.
- Later selected phases must not stop solely because Phase 71 remains blocked.
- Where a plan `dependsOn` entry listed Phase 71 only as a completion flag for “native exists,” replace it with completed functional prerequisites and **referenced** Phase 71 implementation/report input. Preserve genuine runtime prerequisites (providers, independent security review, physical hardware, staffed moderation, billing sandbox, release gates).
- Each selected phase must still satisfy its own acceptance, including any Phase 74–owned native content journeys using the existing Dev Client path. A real failure affecting the selected phase still requires repair.

### Dependency edges changed (2026-10-27)

| Phase | Prior `dependsOn` | New `dependsOn` | Why |
| --- | --- | --- | --- |
| 74 | 69, 70, **71**, 72 | 69, 70, 72 | Content/library/search; native Plan/Library chrome is referenced via Phase 71 report, not a hard completion gate. |
| 85 | **71**, 73, 81 | 73, 81 | Native reminders require their own physical/device evidence in acceptance; Phase 71 report remains referenced input. |
| 86 | **71**, 75, 77, 81 | 75, 77, 81 | Vault gate is independent review + physical crypto evidence, not Phase 71 TalkBack. |
| 88 | **71**, 75, 77, 81, 83 | 75, 77, 81, 83 | Rooms/moderation gates are infrastructure/staff + prior capability phases. |
| 89 | **71**, 75, 81, 83 | 75, 81, 83 | Billing gates are merchant/sandbox/policy, not Phase 71 completion. |
| 92 | 91, 70, **71**, 78 | 91, 70, 78 | Assistant UI acceptance includes desktop/PWA/native journeys; Phase 71 report referenced. |
| 96 | 68, 70, **71**, 92, 93 | 68, 70, 92, 93 | Companion placement/a11y is phase-owned; Phase 71 report referenced. |

Unchanged: Phase 71’s own `dependsOn`, release gates, vault threat model, ADR 0015 auth contracts, and Phase 99 participant obligations.

### Git publication

- After a phase’s acceptance passes: one conventional local completion commit, then **push** to the configured remote branch without force, without rewriting history, and without inventing remotes/branches.
- Do not ask again for permission to push completed phase commits to that branch.
- If the remote advanced: fetch, inspect, and use the documented non-destructive integration workflow. Never force-push or overwrite others’ work as an automatic recovery.
- Keep raw auth traces, credentials, private journals, and large binaries out of Git.

## Consequences

- Roadmap/progress may show Phase 74 (and later selected phases) `in_progress` while Phase 71 remains `blocked`.
- Planning validation continues to enforce real `dependsOn` completion; this ADR changes plan edges, not the validator.
- Contributors update handoff/CONTRIBUTING to match commit-and-push standing rules.
- Future phases still blocked on missing providers, audits, or hardware record those as their own blockers.

## Verification and revisit

- `node scripts/build-phase-plans.mjs`, `build-blueprint.mjs`, and `validate-planning.mjs` must pass after plan/progress updates.
- Reopen if the owner retracts the standing amendment, if Phase 71 is marked complete without remaining evidence, or if a phase is marked complete while its own acceptance fails.
