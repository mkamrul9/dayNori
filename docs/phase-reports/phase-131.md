# Phase 131: Day Path identity and core interface refresh

- Status: **complete for the bounded visual refresh**. Public publication remains blocked by a new candidate, staging verification, capacity, and operational gates.
- Selected by the owner on 2026-11-18 after rejecting green and cream, then revised when the owner requested more creative logo and coloring.
- Base branch: `codex/free-core-preview`. Existing unrelated working-tree edits are preserved.

## Delivered locally

- Replaced the shared light/dark semantic palette with cool lilac, ink, violet, lavender, and coral. The same tokens feed web and native UI.
- Regenerated the original rounded D and rising-path lockup and PWA/native raster exports from `assets/brand/geometry.json` using the existing brand generator. Updated web and native theme metadata and offline shell colors.
- Softened shared calm cards, reduced double padding on Today widgets, refreshed desktop and mobile navigation surfaces, and added short state/page transitions with a reduced-motion override.
- Replaced old green/cream literals in the companion launcher and selected shared surfaces, made the operator contrast gallery calculate its current values from tokens, and advanced the PWA static cache version to v11.
- Added restrained violet/coral treatments to the Create action and selected navigation plus low-opacity ambient color behind core content. Light and dark gradients use action and accent token colors with contrasting labels.
- Flattened the mobile Menu and Create rows, moved Search into the menu at 320px, fixed the narrow header overlap, and replaced the cream Plan consent panel with a semantic lilac surface.
- Replaced Today's inferred online = synchronized badge with the sync engine's state; signed-out visitors do not see a sync claim.
- Updated the README Today images from the final local build and corrected the roadmap's stale phase count.

## Verification

- `node scripts/build-brand-assets.mjs`: generated 29 local assets.
- `node scripts/check-brand-assets.mjs`: passed asset, safe-zone, cache, and native PNG checks.
- Gradient endpoint contrast by the repository's sRGB formula: light Create label on violet 6.26:1 and coral 5.50:1; dark Create label on lavender 7.96:1 and soft coral 8.84:1. These calculations do not replace rendered state review.
- `pnpm vitest run packages/design-tokens/src/tokens.test.ts packages/ui-mobile/src/ui-mobile.test.ts packages/ui-web/src/phase68-primitives.test.ts tests/unit/phase105-visual-tokens-and-a11y.test.ts tests/unit/phase106-native-android-tokens-and-a11y.test.ts tests/unit/pwa-session-and-banners.test.ts`: 61/61 passed for the revised palette and cache version.
- `pnpm typecheck`: passed across all 13 workspace projects after widening the companion launcher's local color state to `string`. The first run used host Node 24.11.1; the repository engine requires `^24.21.0`.
- `pnpm --filter @daynori/web build`: passed on the bundled Node 24.21.0 runtime; 32 routes generated. This is a local build, not a sealed release candidate.
- Final `pnpm build` on bundled Node 24.22.1: passed for all workspace build projects, including 32 Next.js routes and an Expo Android JavaScript export. Android export does not prove signed APK or physical-device behavior.
- Final `pnpm typecheck`: passed across all 13 workspace projects.
- Final focused Vitest run covering design tokens, shared web/mobile primitives, PWA cache, prior visual contracts, and gated assistant presentation: 10 files, 94/94 tests passed. Scoped ESLint: 0 errors.
- Windows builds intermittently returned `EPERM` while recreating folders under the generated `apps/web/.next` cache. After removing only that verified local build cache, the first revised build still failed on `.next/static/chunks/app`; precreating that output directory allowed the rerun to pass. This is a local build-tool limitation, not release evidence.
- `node scripts/validate-planning.mjs`: passed (132 phases, 22 mapped requirements, 554 Markdown files).
- `node scripts/build-blueprint.mjs`: regenerated the planning blueprint with the revised colors.
- `pnpm audit:secrets`: passed across 19,185 files.
- Targeted `pnpm exec eslint`: 0 errors. Targeted `pnpm exec prettier --check` on revised code/config files: passed after formatting touched files. A broader format check flagged the canonical `docs/roadmap/plan.json` file's existing style; `node scripts/build-phase-plans.mjs --check` and planning validation passed. Scoped `git diff --check`: passed; unrelated preexisting Nori asset whitespace changes are outside this phase.
- `node scripts/release-preflight-web-core.mjs`: 9 passed, 1 failed local check, 7 standing web blockers. The revised local BUILD_ID `vUOv0Fn57zr-izfmScyy1` differs from the sealed rc6 manifest BUILD_ID `whaN7HuVFERNvQiYRlevt`; rc6 must not be described as the current design candidate.
- After an approved local loopback run, `DAYNORI_CAPTURE_PHASE=131 DAYNORI_CAPTURE_SCREENS=today,plan,library,journal,settings,create,menus DAYNORI_CAPTURE_VIEWPORTS=desktop-1280,mobile-390,mobile-320 node scripts/capture-phase105-visual-evidence.mjs --after` captured 42 synthetic, signed-out states in both themes. `artifacts/phase131/capture-manifest-after.json` records 0 theme mismatches, 0 horizontal overflows, 21 visually distinct light/dark pairs, a reduced-motion page animation of `none`, and initial focus inside the mobile Menu dialog. Today, Plan, Library, Journal, Settings, Create, and Menu screenshots were reviewed at representative desktop and phone widths; the 320px overlap and nested menu boxes were fixed and recaptured. This does not cover authenticated flows or physical Android rendering.
- The first screenshot run exposed stale `packages/design-tokens/dist` output from a web-only build. Rebuilding dependent packages and the web app corrected the served palette. A web-only build from stale workspace package output must not be sealed as a release candidate.
- `pnpm test`: failed overall (200 files: 102 passed, 98 failed/skipped by suite setup; 1,063 tests passed, 50 failed, 1,054 skipped). Failures included missing local integration services/database, ClamAV loopback, old rc5/rc6 artifact assertions against the new build, and stale visual source assertions. The visual assertions affected by this phase were updated and the 94 focused tests passed on rerun. The full suite is not green; release work must resolve or explicitly gate each remaining failure.
- `pnpm exec prettier --check` initially found touched files needing formatting; they were formatted and the scoped final check passed.
- The generated logo preview was inspected visually: the violet D, coral rising path, and ink wordmark are legible at the supplied preview scale. This is brand evidence only, not a rendered app walkthrough.

## Remaining release work

A new sealed candidate and matching manifest, authenticated staging journeys, API build provenance, full-suite release test reconciliation, operational recovery and support gates, and owner launch authorization remain. Phase 130 remains blocked. Both documented public preview URLs timed out from this environment on 2026-11-18; their live health and provenance were not proven. No public deployment is claimed.

The seven recorded web-core blockers are staging provenance, owner launch authorization, production SMTP, production DNS, Supabase Pro pooling for the proposed scale, support/security mailbox setup, and pager alerting. The bounded release keeps Drive, AI, Voice, Vault, Rooms, Billing, Push, and Android outside its enabled scope.

The older generated Nori mascot sheets under `assets/brand/nori` are outside this bounded core refresh and already contain unrelated working-tree edits. The live vector companion uses the new semantic palette; the gated mascot art needs its own review before those features are enabled.
