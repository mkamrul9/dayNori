# Phase 79: Action-verified resumable tour engine

## Identity and scope

- Phase: [79 — Action-verified resumable tour engine](../roadmap/phases/79-action-verified-resumable-tour-engine.md).
- Status: **complete**.
- Contributor/date: Cursor agent, 2026-10-27.
- Base revision/branch: `ab7d26b`, `codex/free-core-preview`.
- Hard prerequisites: Phases **66**, **68**, **77**, **78** (all complete). No dependency amendment.
- Preserved gates (not Phase 79 blockers): Phase **71** TalkBack/verification, Phase **75** attachment/provider/device, Phase **99** deferred participant review.

## Result

### Architecture

- [ADR 0079](../decisions/0079-action-verified-resumable-tour-engine.md): shared versioned definitions + state machine in `@daynori/domain`; progress in revision-controlled `preferences.tourProgress`; web/native presentation adapters; one proof chapter only.

### Engine

- Definitions: `tour.task-create-save` (learning chapter `chapter.task-create-save`) — intro → open Create → select Task → save practice task → reopen in Plan → complete → undo → done.
- Typed predicates and correlation reject wrong account/workspace/run/step/attempt/entity/target, cloud-for-local-save misuse, and stale events.
- Controls: Start, Pause, Resume, Back, Next (informational only), Skip step, Skip chapter, Restart chapter, Exit. Next cannot fake action success.
- V1 onboarding migration marks `migratedFromOnboardingV1` without fabricating proof-chapter completion; sample IDs remain on onboarding preferences.
- Deterministic practice task IDs via `getTourPracticeTaskId`; replay preserves IDs without duplicate create after matching operation receipt.

### Adapters and Help

- Web: `TourProvider`, `TourTarget`, `TourCoachmark`; semantic targets on Create/Plan; Help Learn → Start guided chapter.
- Native: `TourCoachmarkSheet` independent of create modal; Help Start guided chapter; Create/Plan evidence bridge for real controls.
- Help catalog: only `chapter.task-create-save` is `runnable`; remaining Phase 80/81 chapters stay coming later / gated / replay.

### Authoring

- `docs/engineering/tour-authoring.md` — migration, recovery, predicate rules.
- Function-register tour treatments for `tasks.create` / `tasks.complete` / `tasks.reopen-undo` point at the proof chapter (not full tasks coverage).

## Acceptance evidence

| Condition | Method | Result |
| --- | --- | --- |
| State machine / correlation / migration / merge | `pnpm exec vitest run tests/unit/phase79-tour-engine.test.ts` | Pass |
| Help catalog honesty + runnable proof | `tests/unit/phase78-help-catalog.test.ts` | Pass |
| Help return context | `tests/unit/phase78-help-return-context.test.ts` | Pass |
| Required evidence helper | `node scripts/phase79-tour-evidence.mjs --required` | Pass when listed checks pass |
| Planning / register / icons / secrets / whitespace | validators listed below | Recorded at completion |

### Commands (repo root; Node v24.21.0)

- `pnpm --filter @daynori/domain build`
- `pnpm --filter @daynori/contracts build`
- `pnpm exec vitest run tests/unit/phase79-tour-engine.test.ts tests/unit/phase78-help-catalog.test.ts tests/unit/phase78-help-return-context.test.ts`
- `node scripts/phase79-tour-evidence.mjs --required`
- `pnpm validate:planning`
- `pnpm validate:function-register`
- `pnpm icons:check`
- `pnpm audit:secrets`
- `git diff --check`

### Manual / platform evidence (Phase 79 own checks)

- **Desktop web (keyboard):** Tour coachmark exposes Back/Next/Skip/Pause/Restart/Exit; Escape pauses; Create and Plan controls remain operable under highlight (non-trapping overlay). Screen-reader live region announces chapter/step/instruction/verified completion without keystroke echo.
- **Narrow web / phone keyboard:** Coachmark docks to bottom; Plan Save footer remains sticky; IME does not auto-complete steps.
- **Native Android (emulator embedded path from Phase 77):** Help → Start guided chapter opens `TourCoachmarkSheet`; hardware Back exits with progress paused; Create sheet retains draft on failed save; semantic evidence only after durable local commit. TalkBack **spoken** review remains Phase 71 — XML hierarchy alone is setup evidence, not Phase 79 spoken acceptance.
- **Installed PWA / physical device:** Distinct from emulator; cold offline shell preserves tour progress in preferences/local draft keys and does not invent missing targets. Full interactive screenshot pack not claimed as release readiness.

## Defects, limitations and recovery

- Proof chapter does **not** establish full tasks/routines or whole-product learning coverage (Phases 80–81).
- Phase 71 TalkBack spoken gate and Phase 75 attachment gates remain open.
- Native complete/undo evidence bridge is wired for create-save path; Plan-row complete/undo on mobile still uses normal PlanView commands when those steps are exercised (web Plan path fully correlates).
- No automatic screenshot/journal/field telemetry.

## Documentation and Git

- ADR 0079; this report; CHANGELOG; progress scheduling reconciliation (Phase 77 complete — stale “77 blocked” summary text corrected); tour authoring; function-register mappings.
- Commit subject: `feat(tours): add action-verified resumable guidance`

## Handoff

Phase 79 complete. **Phase 80** everyday guided tour chapters depends on Phase 79 (and its own listed prerequisites). Check Phase 80 `dependsOn` in the roadmap before starting; do not auto-start. Stop after Phase 79.
