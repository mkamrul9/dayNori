# Action-verified tour authoring (Phase 79+)

Shared definitions live in `packages/domain/src/tours/`. Presentation adapters must not invent parallel Create/Save paths.

## Rules

1. Chapter and step IDs are stable. Bump `definitionVersion` / `contentVersion` when predicates or required targets change.
2. Completion predicates are typed enums implemented in trusted code (`correlation.ts`). Never execute user-supplied scripts, expressions, or SQL.
3. Persist semantic `targetId` values only — never CSS selectors, coordinates, or native view handles.
4. Progress (`preferences.tourProgress`) stores IDs, outcomes, operation refs, and practice entity IDs. Never store note bodies, journal text, financial values, credentials, or media bytes.
5. Action steps complete only via correlated evidence. Informational `Next` must not bypass unverified action steps.
6. Mark Help learning chapters `runnable` only after the chapter definition ships and is verified. Leave Phase 80/81 chapters `coming_later` / `gated_unavailable`.
7. V1 onboarding migration (`migration.ts`) must not fabricate completion of action-verified chapters. Sample IDs stay on `onboarding.createdSampleItemIds`.
8. Practice tasks use deterministic IDs (`getTourPracticeTaskId`) and labeled titles (`Tour practice task`). Replay must not duplicate after restart.
9. Local-save steps require durable local commit evidence. Cloud-sync steps wait for server acknowledgment. Do not label local work synchronized merely because Save was clicked.
10. Missing targets yield retry / pause / skip / unavailable recovery — never timeout auto-complete.

## Web / native adapters

- Web: `apps/web/src/tours/` (`TourProvider`, `TourTarget`, `TourCoachmark`).
- Native: `apps/mobile/src/views/TourCoachmarkSheet.tsx` plus Create/Help wiring in `App.tsx`.
- Help entry: Learn the app → runnable chapter → Start guided chapter.

## Validation

- `pnpm exec vitest run tests/unit/phase79-tour-engine.test.ts`
- `node scripts/phase79-tour-evidence.mjs --required`
- Phase 78 Help catalog regressions remain green when chapter states change.
