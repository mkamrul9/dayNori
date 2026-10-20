# ADR-0053: AI assistant and confirmed organizer actions (provisional local)

- Status: accepted (provisional local).
- Date: 2026-10-20.
- Related: Phase 56; ADR 0052; [release-gates — AI assistant](../engineering/release-gates.md).

## Context

Phase 56 needs source-linked answers and narrowly allow-listed draft organizer actions without granting the model execution authority, vault access, sharing, or live private-content providers.

## Decision

1. **Assistant ask** reuses Phase 55 `retrieveAuthorizedAnswer` (consent fencing, budgets, bound citations). Turns persist under `ai_assistant_turns` with 30-day expiry; drafts upsert one row per user/workspace. Responses are labeled `provisional-local-fake-or-gated`. Fake answers are not evaluated live intelligence.
2. **Allow-list only:** `create_personal_task`, `update_personal_task`, `create_personal_note`. Payloads validate through existing Create/Update schemas. Vault `securityScope`, share, permanent delete, external messaging, SQL/scripts/URLs/shell, and consent/scope changes are rejected.
3. **Proposals are durable and opaque.** Server stores actor, workspace, operation, normalized payload, `operation_id`, immutable `request_hash`, user-facing `review_summary`, target/revision, consent generation, expiry (15 minutes), status, and a high-entropy `confirmation_token`. Confirm API accepts **only** that token — never model-supplied approval text or substituted client arguments.
4. **Execution** reauthorizes membership/consent, validates update targets (kind, non-vault scope, revision), calls existing task/note services, and stores an `execution_receipt`. Create recovery binds to `operation_id` + mutation receipt + `request_hash` — an unrelated pre-existing item id is a conflict, not success. Terminal states (`expired` / `cancelled` / `failed` / `confirmed`) commit with the request transaction; API errors are returned only after that durable outcome.
5. **Ask lifecycle:** consent generation is captured before retrieval and revalidated before turn/proposal persistence; AbortSignal cancel discards persistence (content already transmitted cannot be recalled). Drafts have get/save/clear; history is limited to the current consent generation. Source open rechecks access. Expired rows are physically deleted via `ai_cleanup_expired_assistant_data`.
6. **Scope:** personal workspace only. Journal remains behind distinct Phase 55 consent. Vault content is never unlocked, retrieved, or targeted. Rooms/chat AI out of scope.
7. **Lifecycle:** disable/purge and account deletion remove turns, proposals, and related AI rows. Does not recall content already transmitted externally.
8. **Gates:** `isAiLocallyEnabled` / live provider flags unchanged from ADR 0052. No real-user AI, deploy, or paid infra implied.

## Consequences

- UI must show review summaries and require an explicit Confirm control; Cancel ask is distinct from declining a proposal.
- Status remains **blocked/provisional** until AI release gates and live-provider owner decisions land.
- Amended 2026-10-20 for Phase 56 repair.
