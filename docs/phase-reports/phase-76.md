# Phase 76: Expenses and safe custom sections completion

## Identity and scope

- Phase: [76 — Expenses and safe custom sections completion](../roadmap/phases/76-expenses-and-safe-custom-sections-completion.md).
- Status: **complete** (owner scheduling [ADR 0076](../decisions/0076-phase-76-before-phase-75-acceptance.md); Phase 75 remains blocked; Phase 71 remains blocked under [ADR 0074](../decisions/0074-standing-phase71-scheduling-and-push.md)).
- Contributor/date: Cursor agent, 2026-10-27, Asia/Dhaka.
- Base revision/branch: `ccf17f2295d9dcfae297705ea2fc124772cfd2b8`, `codex/free-core-preview`.
- Prerequisites: Phases 73 and 74 complete. Phase 75 referenced attachment capability input only (ADR 0076).
- Completion commit subject: `feat(extensions): finish expenses and approved custom sections`

## Result

### Scheduling

- [ADR 0076](../decisions/0076-phase-76-before-phase-75-acceptance.md): Phase 76 hard `dependsOn` is **73** and **74**. Phase 75 stays blocked with mic/browser/provider evidence outstanding; receipt/attachment UI stays capability-gated; no file/audio waiver. Phase 71 TalkBack stays blocked and is not a global blocker.

### Expenses

- Required-first capture (web + native): kind, amount, currency, date (+ refund original); optional category/note/payment/timezone/receipt under **Details**.
- Receipt attachment gated: `receiptsEnabled={!isCorePreview}` with honest unavailable copy; existing `receiptFileId` preserved on save. Receipt-free capture works without Phase 75 completion.
- Exact money invariants reused from `packages/domain/src/expenses.ts` (BigInt minor units; no parseFloat arithmetic).
- Categories, budgets, per-currency summaries, export, trash/restore, refund bounds: existing API journeys reconfirmed.

### Custom sections

- Builder Move up/Move down announce order changes (`aria-live`).
- Entry attachment fields no longer fabricate local-only `fileName` uploads; gated with verified-file picker props when enabled; existing values preserved when gated.
- Template create, typed fields, existing-record views, schema migration preview/archive recovery, section remove without deleting referenced items: existing phase 42/43 suites reconfirmed.

### Help / navigation

- Help how-tos for Track an expense and Custom sections.
- Modules remain optional; reachable via All features / feature registry (`expenses`, `custom-sections`).

## Acceptance evidence

Environment: Node v24.21.0 (`.tools`), Windows, local `daynori_test`, synthetic JWT.

| Check | Result |
| --- | --- |
| `vitest run` phase39/40/42/43 + phase76 unit + ui-web/ui-mobile | **156 passed** |
| `validate-planning.mjs` after ADR 0076 / plan rebuild | Pass |
| `validate-function-register.mjs` | Pass (after register update) |

Limits: Hosted preview receipt/attachment uploads remain off (DEF-V2-002). Phase 75 physical mic/browser evidence still outstanding — not waived. Interactive device theme/text-scaling matrix not separately timed this cycle beyond component + API evidence. Account A KEY_INVALIDATED DB unused for positive tests.

## Defects, limitations and recovery

1. Phase 75 blocked — attachment positive uploads remain capability-gated.
2. Phase 71 blocked (TalkBack) — not waived.
3. No currency conversion, banking, tax, or financial advice added.

## Documentation and Git review

- ADR 0076; plan/progress/blueprint regenerated; this report; Help; function-register; CHANGELOG.
- Push required to `origin/codex/free-core-preview` after completion commit (ADR 0074).

## Handoff

Phase 76 **complete**. Next eligible: **Phase 77 — Safe offline reopen sync and upgrade recovery** (`dependsOn: ["72","73","74"]`). Do not reintroduce a global Phase 71 or Phase 75 scheduling block for Phase 77.
