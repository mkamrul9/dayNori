# Phase 70: Mobile web and PWA layout redesign

## Identity and scope

- Phase: [70 — Mobile web and PWA layout redesign](../roadmap/phases/70-mobile-web-and-pwa-layout-redesign.md).
- Status: **complete**.
- Contributor/date: Cursor agent, 2026-10-26, Asia/Dhaka.
- Base revision/branch: `de6fab2` (Phase 69), `codex/free-core-preview`.
- Prerequisites: Phases 68–69 complete; Warm notebook (ADR 0069); ADR 0065/0066/0068 preserved.
- Included: Compact mobile chrome, grouped Settings subpages, mobile full-screen editors, agenda-first calendar affordances, visualViewport/safe-area/banner coordination, responsive e2e + CDP overflow captures.
- Excluded: Native Android redesign (Phase 71), push delivery, cold offline organizer reconstruction (Phase 77), participant sessions (Phase 99), physical installed-PWA/IME proof, `release_ready`.

## Result

### Mobile / PWA shell

- Compact sticky header without essential `overflow-x` scrolling; labeled **Create**; Search/Account always present; All features + Settings hide below 380px (reachable via drawer).
- Bottom nav remains registry-driven labeled tabs; Journal hide → three tabs.
- Path shell → All features → destination preserved (`#global-all-features-btn` / drawer).

### Settings

Stable routes:

| Group | Route |
| --- | --- |
| Hub | `/settings` |
| Account | `/settings/account` |
| Appearance and accessibility | `/settings/appearance` |
| Notifications | `/settings/notifications` |
| Workspace and visible features | `/settings/workspace` |
| Privacy and data | `/settings/privacy` |
| Help and feedback | `/settings/help` |

Shared chrome provides Back, heading focus on arrival, loading/error/retry, revision conflict messaging, and account-switch guards so late responses do not apply another user’s form. Quiet hours and journal preview privacy persist via profile preferences. Operator harnesses remain under `/developer`.

### Editors, calendar, banners

- Task/routine editors use mobile full-screen panels, sticky Save/Cancel, Escape, body scroll lock, and `unsavedWork` (ADR 0066).
- Calendar stays agenda-default; month reachable; selected date preserved; narrow hint + month→agenda control.
- `visualViewport` adapter sets `--daynori-keyboard-inset` / `--daynori-vv-height`; status banners sit above bottom nav + keyboard inset. Update remains prioritized over Install.
- Desktop (≥768) Phase 69 composition unchanged.

### ADR

- [ADR 0070](../decisions/0070-mobile-web-pwa-layout-and-settings.md) accepted.

## Acceptance evidence

| Condition | Result |
| --- | --- |
| 320–412px no unintended overflow / duplicated nav / hidden primary actions | **Pass (scoped)** — e2e 320 reflow; CDP capture widths 320/360/390/412/768 |
| 200% text, landscape, open keyboard, install mode, long labels usable | **Pass (partial)** — 200% e2e; keyboard inset CSS + simulation only; landscape/standalone sampled in CSS/`display-mode`; physical IME unverified |
| Desktop keeps approved composition; shared record behavior unchanged | **Pass** — desktop e2e sidebar; domain/integration regressions |

### Nominated test environment

- Runtime: Node **v24.21.0** (`.tools\node-v24.21.0-win-x64`); pnpm 9.15.5.
- Browser e2e: Edge/Chromium CDP (`Edg/156.0.4314.42`), production `next start` on `:3105`, API `:3001`.
- Capture: headless Chrome CDP against `http://127.0.0.1:3010` (production build).
- Auth: anonymous shell/layout evidence + synthetic API fixtures in integration tests; not provider-authenticated create/save/reopen matrix.
- Feature flags: core preview notice may show; no gated modules enabled.

### Commands

cwd: repo root.

| Command | Exit | Observed |
| --- | --- | --- |
| `pnpm exec vitest run tests/unit/phase70-mobile-pwa-layout.test.ts tests/unit/mobile-pwa-usability.test.ts tests/unit/pwa-session-and-banners.test.ts apps/web/src/web.test.ts` | 0 | 25 passed |
| `pnpm exec vitest run tests/integration/phase30-today-home.test.ts tests/integration/phase31-onboarding.test.ts tests/integration/phase66-operator-and-personalization.test.ts` | 0 | 27 passed |
| `pnpm --filter @daynori/ui-web build` | 0 | OK |
| `pnpm --filter @daynori/web build` | 0 | Routes include `/settings/*` |
| `pnpm --filter @daynori/web typecheck` / `pnpm typecheck` | 0 | OK |
| `pnpm test:e2e:web` | 0 | 50 passed / 0 failed (demo-library hierarchy skipped when empty) |
| `node scripts/capture-pwa-usability-shots.mjs http://127.0.0.1:3010` | 0 | `layoutFailCount=0`; PNGs under `artifacts/local/pwa-usability-shots/`; CDP metric WS helper errored (fallback screenshots still written; emulation only) |
| `pnpm lint` | 0 | Clean |
| `pnpm icons:check` | 0 | 83 names |
| `pnpm validate:planning` | 0 | Pass |
| `pnpm validate:function-register` | 0 | After report present |
| `pnpm audit:secrets` | 0 | Clean |
| `git diff --check` | 0 | Clean (phase-69 CRLF warning only; left untouched) |

### Rendered evidence

- E2E screenshots: `artifacts/web-e2e/` (today mobile 320, settings Bangla, library 320, calendar, etc.).
- Capture script: `artifacts/local/pwa-usability-shots/{route}-{width}.png` + `summary.json` (emulation; not physical PWA).
- Overflow: document `scrollWidth`/`clientWidth` plus clipped-control sampling in capture script; intentional skip-link off-screen positioning is not treated as a defect.

### Manual / keyboard

- Keyboard: e2e shortcuts, Escape, skip-link target size, focus trap on Dialog.
- Screen reader: route announcer check only; no full NVDA/JAWS session log.

## Defects, limitations and recovery

- **Physical Android installed-PWA** keyboard open/dismiss, hardware Back, safe areas, TalkBack, rotation: **unverified** (no device in this session). Emulation is not a substitute.
- Authenticated create → save → reopen journeys were not re-proven with provider auth in this phase; domain/integration coverage remains the API/local evidence.
- Library demo hierarchy e2e cases skip when empty (Phase 69 default); create-folder requires authenticated workspace.
- Keyboard inset uses `visualViewport` when available; simulation ≠ physical IME.
- Phase 99 still owns deferred five-participant prototype review.
- No `release_ready` claim.

## Documentation and Git

- Report, CHANGELOG, progress.json, ADR 0070, IA/design-system/responsive notes, Help copy, function-register updates.
- Intended commit: `feat(pwa): deliver phone-specific layouts and settings`.

## Handoff

**Next eligible phase: 71 — Native Android interface and navigation parity** (prerequisites: Phase 70 complete; native shell still respects ADR 0068). Stop after Phase 70.
