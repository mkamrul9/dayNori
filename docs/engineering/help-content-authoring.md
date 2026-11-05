# Help content authoring (Phase 78+)

Ordinary user Help lives in `packages/domain/src/help/`. Restricted operator/runbook content must not be added there.

## Editing workflow

1. Prefer updating article definitions via `scripts/generate-help-catalog-data.mjs` (or carefully editing `catalogData.ts` after generation).
2. Re-run the generator after function-register action IDs change, then review the diff.
3. Keep titles/steps localization-ready (`key` + English `defaultText`). Bangla search matching alone does not claim a translated UI.
4. Map every register action to at least one article. Multiple actions may share one substantive article.
5. Mark `essentialOffline: true` only for public recovery guidance safe for Cache Storage.
6. Set `gatedFeature: true` when the article describes capability-gated behavior.
7. Learn chapters (`chapters.ts`) must stay honest: do not mark article reading as completed guided practice. Only mark `runnable` when a verified Phase 79+ tour definition exists (see `docs/engineering/tour-authoring.md`).

## Validation

- `pnpm exec vitest run tests/unit/phase78-help-catalog.test.ts`
- `pnpm validate:function-register` (Help article refs should use stable article IDs when updated)

## Platforms

Web adapters: `apps/web/src/app/help`, `ContextualHelpLink`, `helpReturnContext`.
Native adapters: `apps/mobile/src/views/HelpCatalogView.tsx` (Settings entry).
