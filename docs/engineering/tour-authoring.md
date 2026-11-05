# Action-verified tour authoring (Phase 79–80+)

Shared definitions live in `packages/domain/src/tours/`. Presentation adapters must not invent parallel Create/Save paths.

## Rules

1. Chapter and step IDs are stable. Bump `definitionVersion` / `contentVersion` when predicates or required targets change. New chapters must not inherit fabricated completion from older progress.
2. Completion predicates are typed enums implemented in trusted code (`correlation.ts`). Never execute user-supplied scripts, expressions, or SQL.
3. Persist semantic `targetId` values only — never CSS selectors, coordinates, or native view handles.
4. Progress (`preferences.tourProgress`) stores IDs, outcomes, operation refs, practice entity IDs, and `practiceArtifacts` provenance. Never store note bodies, journal text, financial values, credentials, or media bytes.
5. Action steps complete only via correlated evidence. Informational `Next` must not bypass unverified action steps. Target clicks prove activation only — never save/preference/completion success. Reopen requires `recordLoaded: true`.
6. Mark Help learning chapters `runnable` only after definitions, targets, predicates, and platform wiring are verified. Leave Phase 81 gated/advanced chapters `coming_later` / `gated_unavailable`.
7. V1 onboarding migration (`migration.ts`) must not fabricate action-verified chapter completion. Phase 31 samples stay separate from tour practice artifacts.
8. Practice entities use deterministic IDs (`getTourPracticeEntityId` / `getTourPracticeTaskId`) scoped to actor, workspace, chapter, type, and role. Title prefixes are not ownership proof.
9. Local-save steps require durable local commit evidence. Cloud-sync steps wait for server acknowledgment. Do not label local work synchronized merely because Save was clicked.
10. Missing targets yield retry / pause / skip / unavailable recovery — never timeout auto-complete.
11. Cleanup (`cleanup.ts` / Help cleanup panel) shows tracked records, selective keep/remove, preserves edited/linked and userOwned by default, and uses normal authorized delete commands only after explicit selection.

## Everyday catalog (Phase 80)

Definitions in `everydayChapters.ts` + starter `tour.task-create-save`. Map Help chapters via `listTourChaptersForLearningChapter`.

## Web / native adapters

- Web: `apps/web/src/tours/` (`TourProvider`, `TourTarget`, `TourCoachmark`, `TourCleanupPanel`).
- Native: `TourCoachmarkSheet` with `chapterId`; Create/Help/Plan evidence bridges in `App.tsx`.
- Help entry: Learn the app → Start: (chapter title).

## Validation

- `pnpm exec vitest run tests/unit/phase79-tour-engine.test.ts tests/unit/phase80-everyday-tours.test.ts`
- `node scripts/phase80-tour-evidence.mjs --required` (requires real UI attestation under `artifacts/phase80/`)
- Phase 78 Help catalog regressions remain green when chapter states change.
