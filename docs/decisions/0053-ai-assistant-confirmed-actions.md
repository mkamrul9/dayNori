# ADR-0053: AI assistant and confirmed organizer actions (provisional local)

- Status: accepted (provisional local).
- Date: 2026-10-20.
- Related: Phase 56; ADR 0052; [release-gates — AI assistant](../engineering/release-gates.md).

## Context

Phase 56 needs source-linked answers and narrowly allow-listed draft organizer actions without granting the model execution authority, vault access, sharing, or live private-content providers.

## Decision

1. **Assistant ask** reuses Phase 55 `retrieveAuthorizedAnswer` (consent fencing, budgets, bound citations). Turns persist under `ai_assistant_turns` with 30-day expiry; drafts upsert one row per user/workspace. Responses are labeled `provisional-local-fake-or-gated`. Fake answers are not evaluated live intelligence.
2. **Allow-list only:** `create_personal_task`, `update_personal_task`, `create_personal_note`. Payloads validate through existing Create/Update schemas. Vault `securityScope`, share, permanent delete, external messaging, SQL/scripts/URLs/shell, and consent/scope changes are rejected.
3. **Proposals are durable and opaque.** Server stores actor, workspace, operation, normalized payload (with stable create `id` for idempotent retry), target/revision, consent generation, expiry (15 minutes), status, and a high-entropy `confirmation_token`. Confirm API accepts **only** that token — never model-supplied approval text or substituted client arguments.
4. **Execution** runs inside the same user-context transaction as confirmation consumption, reauthorizes membership/consent, calls existing task/note services, and stores an `execution_receipt`. Safe retries return the same receipt. Cancel before confirm prevents writes. After commit, cancel cannot undo; reconcile via receipt.
5. **Scope:** personal workspace only. Journal remains behind distinct Phase 55 consent. Vault content is never unlocked, retrieved, or targeted. Rooms/chat AI out of scope.
6. **Lifecycle:** disable/purge and account deletion remove turns, proposals, and related AI rows. Does not recall content already transmitted externally.
7. **Gates:** `isAiLocallyEnabled` / live provider flags unchanged from ADR 0052. No real-user AI, deploy, or paid infra implied.

## Consequences

- UI must show exact proposal payload and require an explicit Confirm control.
- Status remains **blocked/provisional** until AI release gates and live-provider owner decisions land.
- Stop before Phase 57.
