# Phase 69: Desktop shell and focused Today experience

## Identity and scope

- Phase: [69 — Desktop shell and focused Today experience](../roadmap/phases/69-desktop-shell-and-focused-today-experience.md).
- Status: **complete**.
- Contributor/date: Cursor agent, 2026-10-25, Asia/Dhaka.
- Base revision/branch: `c191428` (Phase 68), `codex/free-core-preview`.
- Prerequisites: Phases 66–68 complete; Warm notebook direction.
- Included: Desktop sidebar hierarchy, Warm page density, focused Today defaults, registry-driven mobile drawer, Create emphasis on Today.
- Excluded: Full mobile/PWA redesign (Phase 70), tour engine (79), participant sessions (99), release_ready, physical device proof.

## Result

- Sidebar sections: **Primary / Pins / Utilities** (ADR 0068 tabs + pins + All features/Help/Settings).
- Mobile drawer uses `useFeatureNavigation` primary tabs/pins (Journal hide → three tabs).
- `.daynori-page` Warm density (28px pad desktop; 16px narrow).
- Default Today: tasks, routines, upcoming, journal prompt; Quick Capture and module chips off by default; Create opens shell modal.
- Existing routes, prefs migration, sync/conflict, and operator gates preserved.

## Acceptance evidence

| Condition | Result |
| --- | --- |
| Primary destinations, Create, Search, Help obvious + keyboard | **Pass (scoped)** — shell shortcuts unchanged; Create on Today + header |
| Today uses real scoped records; no unsolicited samples | **Pass** — defaults only; no seeded tasks |
| Create/save/reopen, sync, task/routine semantics survive | **Pass (regression)** — domain/featureRegistry tests; layout defaults updated intentionally |

### Commands

Runtime: Node **v24.21.0**. cwd: repo root.

| Command | Exit | Observed |
| --- | --- | --- |
| `pnpm exec vitest run packages/domain/src/domain.test.ts packages/domain/src/featureRegistry.test.ts` | 0 | 99 passed |
| `pnpm --filter @daynori/domain build` | 0 | OK |
| `pnpm exec vitest run tests/integration/phase30-today-home.test.ts tests/integration/phase66-operator-and-personalization.test.ts` | 0 | 17 passed |
| `pnpm --filter @daynori/web typecheck` | 0 | OK |
| `pnpm validate:planning` | 0 | Pass |
| `pnpm audit:secrets` | 0 | Clean |
| `git diff --check` | 0 | Clean |

Manual: desktop sidebar labels + empty pin hint; Today Create → shell menu; hidden Journal leaves three primary tabs via registry.

## Defects, limitations and recovery

- Full authenticated desktop screenshot matrix (empty/offline/error light/dark) not claimed in this local pass.
- Narrow-web regression: page padding reduced under 768; Phase 70 owns full mobile/PWA redesign.
- Phase 99 still owns deferred five-participant review.
- Existing user prefs keep prior homeLayout; new defaults apply to new/migrated missing keys.

## Documentation and Git

- Report, CHANGELOG, progress.json updated.
- Commit subject: `feat(web): redesign desktop navigation and Today`.

## Handoff

**Next eligible phase: 70 — Mobile web and PWA layout redesign.**
