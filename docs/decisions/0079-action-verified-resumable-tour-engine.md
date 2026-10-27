# ADR-0079: Action-verified resumable tour engine

- Status: accepted.
- Date: 2026-10-27.
- Owner/reviewer: Cursor agent (owner-authorized Phase 79).
- Related phase and specifications: [Phase 79](../roadmap/phases/79-action-verified-resumable-tour-engine.md), [guided tours](../roadmap/v2/guided-tours.md), Phase 31 onboarding, Phase 78 Help chapters.
- Supersedes/superseded by: none. Complements ADR 0077 offline reopen; does not waive Phase 71/75 gates.

## Context

Phase 31 beginner onboarding is informational with optional practice IDs. Phase 78 Learn-the-app chapters are honest but not action-verified. Users need resumable chapters that advance only after real application commands produce durable results, without a parallel fake Create/Save path or fabricated completion of future Phase 80/81 coverage.

## Options

1. **Extend V1 onboarding steps only** — Cannot express chapter/version correlation, skip-vs-complete, or multi-chapter catalogs.
2. **Third-party product-tour SDK** — Risks DOM selectors, opaque scripts, and private telemetry; rejects repo trust model.
3. **Shared domain state machine + platform presentation adapters (chosen)** — Definitions/predicates/progress in `@daynori/domain` + contracts; web/native coachmarks; progress in revision-controlled preferences; proof chapter only in Phase 79.

## Decision

- Tour definitions are versioned declarative records with semantic target IDs, informational vs action steps, typed completion predicates (trusted code only — never user/SQL/script expressions), and recovery/skip policies.
- Progress is scoped to account + workspace inside `preferences.tourProgress` (revision/expectedRevision conflict handling unchanged). Device-only permission demos remain device-local when introduced later.
- Action steps complete only when a correlated evidence event matches chapter/run/step/account/workspace/entity/operation; Next cannot bypass unverified action steps.
- V1 onboarding migrates into tour progress without inventing completion of new action-verified chapters; practice IDs remain deterministic and non-duplicating.
- Phase 79 ships one runnable proof chapter (`chapter.task-create-save`) teaching create → save → reopen → complete → undo on the same practice task. Remaining Learn chapters stay `coming_later` / `gated_unavailable` / `available_replay`.
- Presentation adapters register semantic targets (not CSS/coordinates). Missing targets yield retry/pause/skip/unavailable — never timeout auto-complete.

## Consequences

- Help catalog gains a `runnable` chapter state; only verified chapters may use it.
- Preference payload grows with bounded tour progress (IDs/refs only — no note/journal bodies).
- Full everyday/advanced chapter collections remain Phase 80/81.
- Physical TalkBack spoken review and Phase 75 attachments remain separate gates.

## Verification and revisit

- Domain unit tests for machine, correlation, migration, conflicts.
- Web/native proof journeys on real controls; required-mode evidence helpers.
- Revisit if preference size limits are hit, or if a dedicated tour sync document becomes necessary.
