# Phase 78: Complete contextual Help and user instructions

## Identity and scope

- Phase: [78 — Complete contextual Help and user instructions](../roadmap/phases/78-complete-contextual-help-and-user-instructions.md).
- Status: **complete** (owner scheduling [ADR 0078](../decisions/0078-phase-78-before-phase-75-and-77-acceptance.md)).
- Contributor/date: Cursor agent, 2026-10-27.
- Base revision/branch: `a4fb4cc`, `codex/free-core-preview`.
- Hard prerequisites: Phases 73, 74, 76 complete. Phases **75** and **77** are referenced capability/evidence inputs only (not waived). Phase 71 remains blocked (TalkBack).
- Phase 77 reconciliation: progress/report set to **blocked** — installed production PWA and native cold-launch acceptance unmet; commit `a4fb4cc` retained ([phase-77](phase-77.md), DEF-V2-003).

## Result

### Scheduling

- [ADR 0078](../decisions/0078-phase-78-before-phase-75-and-77-acceptance.md): Phase 78 hard `dependsOn` is **73**, **74**, **76**. Plan regenerated; validator passed.

### Shared Help catalog

- Versioned articles in `@daynori/domain` (`packages/domain/src/help/`): localization-ready keys, categories, steps, expected results, failures, platforms/capabilities, related actions/articles, essential-offline flag, optional learning chapter refs.
- 26 articles cover all **109** function-register actions (many-to-one mappings). Validator rejects uncovered actions and broken references.
- Pure search (`normalizeHelpQuery` / `searchCatalogHelp`) searches instructional content only.
- Learn the app chapter catalog with honest states (`available_replay` | `coming_later` | `gated_unavailable`) — no Phase 79 tour engine.
- Public `apps/web/public/help-essential.json` + SW `daynori-static-v9` allowlist for essential recovery offline.

### Web and native Help

- Web `/help` rebuilt: search, common tasks, categories, troubleshoot, article deep links (`?article=`), Learn the app, Support entry, unknown-article handling.
- `ContextualHelpLink` opens articles without clearing unsaved work; account-scoped return context in `sessionStorage`.
- Contextual entry points: Create (tasks vs routines), Library filters, Journal privacy.
- Native: `HelpCatalogView` from Settings → Help; Android Back dismisses article → catalog → Settings; beginner replay preserved.

### Honesty

- Gated attachments/audio/reminders/vault/Drive/rooms/billing/assistant described as unavailable when gated.
- Offline article distinguishes warm offline, local browser shell evidence, and outstanding installed-PWA/native verification.
- Support/contact does not invent inbox or delivery success.
- Operator surfaces called out as restricted — not ordinary user Help.

## Acceptance evidence

| Condition | Method | Result |
| --- | --- | --- |
| Catalog + action coverage | `pnpm exec vitest run tests/unit/phase78-help-catalog.test.ts` | Pass |
| Return context isolation | `tests/unit/phase78-help-return-context.test.ts` | Pass |
| SW essential Help asset | `tests/unit/pwa-session-and-banners.test.ts` | Pass (v9 + help-essential.json) |
| Planning / register / icons / secrets | `pnpm validate:planning`, `validate:function-register`, `icons:check`, `audit:secrets` | Recorded at completion |
| Manual desktop/mobile/native article walkthrough | Operator follow of representative articles | Recorded limits below |

### Commands (repo root; Node v24.21.0)

Exact commands and exits are listed in the completion checklist section of this commit’s CHANGELOG companion run; representative:

- `node scripts/generate-help-catalog-data.mjs`
- `pnpm --filter @daynori/domain build`
- `pnpm exec vitest run tests/unit/phase78-help-catalog.test.ts tests/unit/phase78-help-return-context.test.ts tests/unit/pwa-session-and-banners.test.ts`
- `pnpm validate:planning` / `pnpm validate:function-register` / `pnpm icons:check` / `pnpm audit:secrets` / `git diff --check`

### Manual / platform limits

- Desktop web Help UI exercised via implementation + unit coverage; full interactive screenshot tour not required for catalog acceptance.
- Installed-PWA Help offline subset: public JSON cached by SW policy; not a substitute for Phase 77 installed-PWA cold-launch acceptance.
- Native Help catalog wired in App/Settings; physical Android interaction evidence not claimed as Phase 71 TalkBack completion.
- Viewport emulation ≠ installed PWA evidence.

## Defects, limitations and recovery

- Phase 75 / 77 remain blocked on their own evidence.
- Phase 79 tour engine not implemented (chapters show coming later / gated).
- Feedback intake remains Phases 82–83.
- Article coverage does **not** make documented features `release_ready`.

## Documentation and Git

- ADR 0078; plan/progress/blueprint regenerated; function-register Help refs; this report; CHANGELOG.
- Commit subject: `feat(help): add complete contextual instructions and learning catalog`

## Handoff

Phase 78 complete. **Phase 79** is next numerically; its `dependsOn` still includes **66, 68, 77, 78** — Phase 77 remains **blocked**, so Phase 79 is not automatically ready. Do not waive Phase 77. Stop after Phase 78.
