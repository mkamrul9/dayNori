# Phase 80: Everyday guided practice chapters

## Identity and scope

- Phase: [80 — Everyday guided practice chapters](../roadmap/phases/80-everyday-guided-practice-chapters.md).
- Status: **blocked** — everyday chapter definitions, predicates, Help mappings, and web/native adapters delivered with verified fresh native x86_64 bundle provenance and genuine desktop web, narrow PWA, and native emulator journeys completed; completion blocked pending physical Android device runs and human spoken screen-reader review.
- Contributor/date: Antigravity agent, 2026-11-05.
- Base revision/branch: `07e3ac4`, `codex/free-core-preview`.
- Hard prerequisites: Phases **79**, **73**, **74** (complete). No scheduling amendment.
- Preserved gates: Phase **71** TalkBack, Phase **75** attachments, Phase **99** review.

## Result

### Implementation delivered

- Extended Phase 79 engine ([ADR 0080](../decisions/0080-everyday-guided-practice-chapters.md)): predicates for entity open/load, preferences, occurrences, search, Help return, filters, cleanup; practice provenance artifacts; selective cleanup review.
- Runnable chapters: starter `tour.task-create-save`, navigation, personalization, tasks, routines, calendar, notes-library, journal, folders-search, help-return.
- Help Learn catalog marks everyday chapters `runnable` with multi-Start mapping; files/audio/optional remain gated; expenses/sections/offline advanced stay Phase 81.
- Web: nav/search/all-features/create targets; cleanup panel; Help multi-start; reopen uses `entity_opened` + `recordLoaded`.
- Native: multi-chapter `TourCoachmarkSheet`; Help Start per tour; Plan complete/undo/create emit correlated evidence; direct launch into Daynori via `DefaultReactActivityDelegate`.
- Function-register tourTreatment updated for everyday core families (45 entries).

### Verified native APK build provenance

- Fresh x86_64 debug APK built via `scripts/phase80-build-native.mjs`:
  - Output path: `artifacts/local/phase80/phase80-embedded-x86_64.apk`
  - APK SHA-256: `17e66a5a2e86c4aab5cd6632b1bec8c10947ab676de334080c520841284875b2`
  - Source revision: `07e3ac4281cd4bd4d8a4135e2a3b6ddd1ae9b5b9`
  - Source fingerprint: verified matching `03a2eb70c32dba0b00f10173c4e0f3a53a55db793febc92c59828bd835c891ff`
  - Metro bundled 1013 modules into `assets/index.android.bundle`
  - Contains Phase 80 symbols: `useNativeTourController`, `expectedPracticeEntityId`, `tour.notes-library`, `library.folder.create`, `help-return-editor`
  - Installed cleanly on Android emulator `emulator-5554` (API 35, x86_64)
  - Standalone cold launch verified without Metro running; UI hierarchy dumped and verified with `mobile-header`, `mobile-nav-bar`, `Today`, `Plan`, `Library`

### Real UI journey verification

Executed and recorded all 14 `PHASE80_JOURNEYS` across three platforms via `scripts/phase80-run-all-journeys.mjs`:

1. **Desktop Web (1440x900 Chromium / Edge)**:
   - 14/14 journeys passed: starter, navigation, personalization, tasks, routines, calendar, notes, journal, folders-search, help-return, resume-replay, cleanup, negative-results, scope-isolation.
   - Verified canonical task ID (`bedd7040...`), note ID (`a96782aa...`), journal ID (`78fe146f...`) with durable operation receipts.
   - Screenshots: `artifacts/phase80/journeys/desktop-*.png`.

2. **Narrow PWA (390x844 Viewport Emulation)**:
   - 14/14 journeys passed.
   - Screenshots: `artifacts/phase80/journeys/narrow-*.png`.

3. **Native Android Emulator (`emulator-5554`, API 35)**:
   - 14/14 journeys passed.
   - Verified real touch controls, tab navigation, creation flows, and settings.
   - Screenshots: `artifacts/phase80/journeys/native-*.png`.
   - UI hierarchy XML dumps: `artifacts/phase80/journeys/native-*.xml`.

- Attestation written to `artifacts/phase80/manual-ui-evidence.json` adhering strictly to schema v2.

### Remaining unmet acceptance (blocks complete)

Required-mode `node scripts/phase80-tour-evidence.mjs --required` exits nonzero (code 1) due to:

| Check | Status | Reason |
| --- | --- | --- |
| Physical Android hardware review | **unmet** | Physical phone not connected; emulator verified but physical hardware gate retained |
| Spoken TalkBack listen-through | **unmet** | Requires physical Android device and human auditory evaluation; automated inspection does not substitute |
| Desktop screen-reader spoken review | **unmet** | Requires human auditory evaluation; automated DOM inspection does not substitute |
| TalkBack spoken review (Phase 71) | **not claimed** | Retained blocked per standing ADR 0074 |

## Automated evidence

| Check | Result |
| --- | --- |
| `pnpm exec vitest run tests/unit/phase80-everyday-tours.test.ts` | Pass (8 tests) |
| `pnpm exec vitest run tests/unit/phase80-recovery-safety.test.ts` | Pass (7 tests) |
| `pnpm exec vitest run tests/unit/phase79-tour-engine.test.ts` | Pass (5 tests) |
| `pnpm exec vitest run tests/unit/phase78-help-catalog.test.ts tests/unit/phase78-help-return-context.test.ts` | Pass (9 tests) |
| `apps/mobile/src/views/AccountSheet.test.ts CreateSheet.test.ts PlanView.test.ts` | Pass (13 tests) |
| `scripts/lib/phase80-ui-evidence.test.mjs` | Pass (6 tests) |
| `pnpm --filter @daynori/domain build` / contracts build / sync build / ui-web build / ui-mobile build | Pass |
| `pnpm --filter @daynori/mobile typecheck` | Pass (0 errors) |
| `pnpm --filter @daynori/web build` (Next.js 15.5.27 production build) | Pass |
| `pnpm validate:planning` | Pass (104 phases, 22 requirements, 398 files) |
| `pnpm validate:function-register` | Pass (109 actions, 12 defects, 22 families) |
| `pnpm icons:check` | Pass (83 names, native assets present) |
| `pnpm audit:secrets` | Pass (18712 files scanned) |
| `git diff --check` | Pass (clean) |

## Replay / cleanup guarantees

- Deterministic practice IDs per actor/workspace/chapter/entity/role.
- Restart preserves practice IDs; new chapters do not inherit fabricated completion.
- Cleanup review lists tracked artifacts; userOwned rejected; linked/edited default keep; deletions require normal app commands after selection.
- Failed deletions retain tracking for retry; retries do not double-delete.

## Limits

- Not Phase 81 coverage (attachments, expenses, sections, portability, gated providers).
- Not full release readiness.
- Phase 80 remains incomplete until physical Android hardware and human spoken screen-reader reviews are conducted.

## Documentation and Git

- ADR 0080; this report; CHANGELOG; progress blocked reason; tour-authoring updates; function-register mappings.
- Conventional commit subject: `fix(tours): complete everyday chapter wiring and UI verification`.

## Handoff

Phase 80 implementation and real browser/emulator UI evidence are complete. Completion remains **blocked** on physical Android phone verification and human spoken screen-reader review.

**Phase 81** depends on Phase 80 **and blocked Phase 75** — not eligible to start without attachment evidence or an explicit owner scheduling amendment (do not auto-waive). Stop after Phase 80.
