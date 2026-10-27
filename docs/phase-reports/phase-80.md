# Phase 80: Everyday guided practice chapters

## Identity and scope

- Phase: [80 — Everyday guided practice chapters](../roadmap/phases/80-everyday-guided-practice-chapters.md).
- Status: **blocked** — independent implementation delivered; required real UI journey attestation unmet.
- Contributor/date: Cursor agent, 2026-10-27.
- Base revision/branch: `a8ba870`, `codex/free-core-preview`.
- Hard prerequisites: Phases **79**, **73**, **74** (complete). No scheduling amendment.
- Preserved gates: Phase **71** TalkBack, Phase **75** attachments, Phase **99** review.

## Result

### Implementation delivered

- Extended Phase 79 engine ([ADR 0080](../decisions/0080-everyday-guided-practice-chapters.md)): predicates for entity open/load, preferences, occurrences, search, Help return, filters, cleanup; practice provenance artifacts; selective cleanup review.
- Runnable chapters: starter `tour.task-create-save`, navigation, personalization, tasks, routines, calendar, notes-library, journal, folders-search, help-return.
- Help Learn catalog marks everyday chapters `runnable` with multi-Start mapping; files/audio/optional remain gated; expenses/sections/offline advanced stay Phase 81.
- Web: nav/search/all-features/create targets; cleanup panel; Help multi-start; reopen uses `entity_opened` + `recordLoaded`.
- Native: multi-chapter `TourCoachmarkSheet`; Help Start per tour; Plan complete/undo/create emit correlated evidence.
- Function-register tourTreatment updated for everyday core families (45 entries).

### Unmet acceptance (blocks complete)

Required-mode `node scripts/phase80-tour-evidence.mjs --required` fails without:

| Check | Status |
| --- | --- |
| Desktop web real-control journeys (canonical IDs/receipts) | **unmet** — no `artifacts/phase80/manual-ui-evidence.json` |
| Narrow PWA journeys | **unmet** |
| Native Android journeys (emulator/physical distinct) | **unmet** |
| Keyboard/SR + phone chapter/resume reviews | **unmet** as spoken/manual evidence |
| TalkBack spoken review | **not claimed** (Phase 71); XML alone is not Phase 80 spoken evidence |

Unit/build checks pass independently and are recorded below.

## Automated evidence (independent of UI attestation)

| Check | Result |
| --- | --- |
| `pnpm exec vitest run tests/unit/phase80-everyday-tours.test.ts` | Pass |
| Phase 79 engine regression | Pass |
| Phase 78 Help regressions | Pass |
| `pnpm --filter @daynori/domain build` / contracts build | Pass |
| `pnpm validate:planning` / `validate:function-register` / `icons:check` / `audit:secrets` | Run at commit |
| `git diff --check` | Run at commit |

## Replay / cleanup guarantees

- Deterministic practice IDs per actor/workspace/chapter/entity/role.
- Restart preserves practice IDs; new chapters do not inherit fabricated completion.
- Cleanup review lists tracked artifacts; userOwned rejected; linked/edited default keep; deletions require normal app commands after selection.

## Limits

- Not Phase 81 coverage (attachments, expenses, sections, portability, gated providers).
- Not full release readiness.
- Phase 80 remains incomplete until UI attestation file records desktopWeb, narrowPwa, and nativeAndroid with provenance.

## Documentation and Git

- ADR 0080; this report; CHANGELOG; progress blocked reason; tour-authoring updates; function-register mappings.
- Commit subject when accepting this implementation push: `feat(tours): teach everyday workflows through real actions` (acceptance still blocked on UI evidence).

## Handoff

Phase 80 **not complete**. Supply `artifacts/phase80/manual-ui-evidence.json` (or `DAYNORI_PHASE80_UI_ATTESTATION`) after real journeys, re-run required evidence helper, then mark complete.

**Phase 81** depends on Phase 80 **and blocked Phase 75** — not eligible to start without attachment evidence or an explicit owner scheduling amendment (do not auto-waive).
