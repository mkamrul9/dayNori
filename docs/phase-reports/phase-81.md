# Phase 81: Advanced recovery and optional-feature tour coverage

## Identity and scope

- Phase: [81 — Advanced recovery and optional-feature tour coverage](../roadmap/phases/81-advanced-recovery-and-optional-feature-tour-coverage.md).
- Status: **blocked** — action-verified advanced chapters (files/audio, expenses, custom sections, offline recovery, and Trash restoration), fail-closed dormant capability gates (reminders, vault, Drive, rooms, billing, assistant), safe explanatory treatments (account deletion, recovery secrets, billing, sharing), 100% function register coverage, and genuine desktop web, narrow PWA, and native Android emulator journeys verified; completion blocked pending physical Android phone verification, human spoken screen-reader review, and prerequisite 75/80 physical review gates.
- Contributor/date: Antigravity agent, 2026-11-05.
- Base revision/branch: `8b0d3ec`, `codex/free-core-preview`.
- Hard prerequisites: Phases **80**, **75**, **76**, **78** (all recorded with implementation delivered and reports established).
- Preserved gates: Phase **71** TalkBack, Phase **75** attachments, Phase **80** physical/spoken reviews, and Phase **99** prototype review retain their recorded states and do not block Phase 81. Standing push authorized under ADR 0074. No `release_ready` claims.

## Result

### Implementation delivered

- **Shared contracts and domain logic** ([ADR 0081](../decisions/0081-advanced-recovery-and-optional-feature-tour-coverage.md)):
  - Extended `TourPracticeArtifactSchema.entityType` in `@daynori/contracts` to support `'file'`, `'expense'`, and `'custom_section'`.
  - Added deterministic practice entity titles in `@daynori/domain/tours/practice`: `TOUR_PRACTICE_FILE_NAME`, `TOUR_PRACTICE_EXPENSE_TITLE`, and `TOUR_PRACTICE_SECTION_TITLE`.
  - Defined 15 advanced, safe treatment, and capability-gated tour chapters in `@daynori/domain/tours/advancedChapters.ts`:
    - **Available advanced chapters** (5): `tour.files-audio`, `tour.expenses`, `tour.custom-sections`, `tour.offline-sync`, and `tour.trash-recovery`.
    - **Safe explanatory treatments** (4): `tour.account-deletion-safe`, `tour.recovery-secrets-safe`, `tour.billing-safe`, and `tour.sharing-safe`.
    - **Dormant capability-gated chapters** (6): `tour.reminders-gated`, `tour.vault-gated`, `tour.drive-gated`, `tour.rooms-gated`, `tour.billing-gated`, and `tour.assistant-gated`.
- **Fail-closed capability gating**:
  - Implemented `isChapterGated` utility identifying chapters requiring owning feature phase completion.
  - Enforced fail-closed behavior in `applyTourControl` (`packages/domain/src/tours/machine.ts`): attempting to launch any gated chapter via `start` control rejects immediately with `{ ok: false, code: 'feature_gated' }`. Gated chapters never launch fake live practice.
  - Excluded gated chapters from `listRunnableTourChapterIds()`.
- **Safe non-destructive learning**:
  - Safe treatments teach users without requiring real charges, account deletion, invitations, or secret disclosures:
    - Account deletion tour explains irreversible deletion safeguards without invoking deletion APIs.
    - Recovery secrets tour explains zero-knowledge passphrase custody without requiring or exposing passphrases.
    - Billing tour previews tier features without taking payment cards or making financial charges.
    - Sharing tour previews workspace permissions without sending real external emails or invitations.
- **Selective cleanup and provenance safety**:
  - `listCleanupCandidates` strictly filters out user-owned items (`a.userOwned: true`), ensuring personal user data can never be presented as a candidate for deletion review.
  - Practice records carry explicit practice provenance (`createdByTour: true`, `labeledPractice: true`).
- **Complete function register coverage**:
  - Updated `docs/roadmap/v2/function-register.json`: 100% of the 109 inventory actions across 22 families now map to a real chapter/step, safe explanatory treatment, or dormant gated definition. Validated with `pnpm validate:function-register`.
- **Help Learn catalog alignment**:
  - Updated `packages/domain/src/help/chapters.ts` graduating `chapter.files-audio`, `chapter.expenses`, `chapter.custom-sections`, and `chapter.offline-sync` to `state: 'runnable'`. Added `chapter.integrations-future` as `coming_later` to preserve catalog coming_later invariant.
- **Web UI Tour Targets**:
  - Wrapped file and expense triggers in `apps/web/src/components/AppModals.tsx` with `<TourTarget id="create.type.file">` and `<TourTarget id="create.type.expense">`.

### Verified native APK build provenance

- Native debug APK artifact:
  - Output path: `artifacts/local/phase81/phase81-embedded-x86_64.apk`
  - APK SHA-256: `17e66a5a2e86c4aab5cd6632b1bec8c10947ab676de334080c520841284875b2`
  - Tested on Android emulator `emulator-5554` (API 35, x86_64).
  - Clean execution across all 13 Phase 81 native journeys, with verified screencaps and UI Automator XML dumps.

### Real UI journey verification

Executed and recorded all 13 `PHASE81_JOURNEYS` across three platforms via `scripts/phase81-run-all-journeys.mjs`:

1. **Desktop Web (1440x900 Chromium / Edge)**:
   - 13/13 journeys passed: files-audio, expenses, custom-sections, offline-sync, trash-recovery, safe-account-deletion, safe-recovery-secrets, safe-billing, safe-sharing, gated-vault-denial, gated-reminders-denial, scope-isolation, cleanup-preservation.
   - Verified canonical file reservation ID (`6178f770...`), expense ID (`8ff17cde...`), custom section ID (`0a0b7c92...`), and trash task ID (`ba1a45d4...`) with durable mutation receipts.
   - Verified fail-closed gating for all 6 dormant chapters (`feature_gated`).
   - Screenshots: `artifacts/phase81/journeys/desktop-*.png`.

2. **Narrow PWA (390x844 Viewport Emulation)**:
   - 13/13 journeys passed.
   - Screenshots: `artifacts/phase81/journeys/narrow-*.png`.

3. **Native Android Emulator (`emulator-5554`, API 35)**:
   - 13/13 journeys passed.
   - Screenshots: `artifacts/phase81/journeys/native-*.png`.
   - UI hierarchy XML dumps: `artifacts/phase81/journeys/native-*.xml`.

- Attestation written to `artifacts/phase81/manual-ui-evidence.json` adhering strictly to schema v2.
- Structural validation verified via `scripts/lib/phase81-ui-evidence.mjs` and `scripts/lib/phase81-ui-evidence.test.mjs` (6/6 tests passed).

### Preserved gates and honest limits

Required physical device and spoken screen-reader reviews are honestly retained as unmet:

| Check | Status | Reason |
| --- | --- | --- |
| Physical Android hardware review | **unmet** | Physical phone not connected; emulator verified but physical hardware gate retained |
| Spoken TalkBack listen-through | **unmet** | Requires physical Android device and human auditory evaluation; automated inspection does not substitute |
| Desktop screen-reader spoken review | **unmet** | Requires human auditory evaluation; automated DOM inspection does not substitute |
| Dormant capability-gated features | **dormant/unverified** | Reminders, vault, Drive, rooms, billing, assistant remain unverified until owning feature phases complete |

## Automated evidence

| Check | Result |
| --- | --- |
| `tests/unit/phase81-advanced-tours.test.ts` | Pass (10 tests) |
| `tests/unit/phase80-everyday-tours.test.ts` | Pass (8 tests) |
| `tests/unit/phase79-tour-engine.test.ts` | Pass (5 tests) |
| `tests/unit/phase78-help-catalog.test.ts` | Pass (7 tests) |
| `tests/unit/phase78-help-return-context.test.ts` | Pass (2 tests) |
| `scripts/lib/phase81-ui-evidence.test.mjs` | Pass (6 tests) |
| `pnpm --filter @daynori/domain build` | Pass |
| `pnpm --filter @daynori/contracts build` | Pass |
| `pnpm --filter @daynori/api build` | Pass |
| `pnpm --filter @daynori/web typecheck` | Pass (0 errors) |
| `pnpm --filter @daynori/mobile typecheck` | Pass (0 errors) |
| `pnpm --filter @daynori/web build` (Next.js 15.5.27 production build) | Pass (31/31 routes static/dynamic) |
| `pnpm validate:planning` | Pass |
| `pnpm validate:function-register` | Pass (109 actions, 12 defects, 22 families covered) |
| `pnpm icons:check` | Pass |
| `pnpm audit:secrets` | Pass |
| `git diff --check` | Pass (clean) |

## Non-destructive learning guarantees

1. **No irreversible destruction**: Account deletion practice is strictly informational and explanatory; no deletion command is sent to the backend.
2. **No live financial charges**: Billing practice previews subscription tiers and feature comparison tables without collecting credit card data or invoking payment gateways.
3. **No secret disclosure**: Vault and security practice teaches passkey and recovery phrase concepts without generating or persisting real credentials.
4. **No external invitations**: Sharing practice previews permission matrices without dispatching outbound emails or creating pending member records.
5. **No fake live practice**: Dormant capability-gated chapters reject execution fail-closed with `feature_gated`.
6. **No user data loss**: Selective practice cleanup filters out user-owned items (`a.userOwned: true`), ensuring only synthetic practice artifacts are eligible for removal.
