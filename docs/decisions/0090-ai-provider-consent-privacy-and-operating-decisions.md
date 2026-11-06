# ADR-0090: AI provider consent, privacy, and operating decisions

- Status: accepted
- Date: 2026-11-06
- Owner/reviewer: Antigravity agent (owner-authorized Phase 90 with explicit scheduling exception).
- Related: [Phase 90](../roadmap/phases/90-ai-provider-consent-privacy-and-operating-decisions.md), [ADR 0008](0008-opt-in-ai-and-later-rooms.md), [ADR 0052](0052-ai-provider-privacy-and-retrieval.md), [ADR 0053](0053-ai-assistant-confirmed-actions.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [Phase 75](../phase-reports/phase-75.md), [Phase 81](../phase-reports/phase-81.md), [release-gates.md](../engineering/release-gates.md), [ai-provider-comparison-and-operating-decisions.md](../engineering/ai-provider-comparison-and-operating-decisions.md), [ai-budget-cancellation-and-operations-guide.md](../engineering/ai-budget-cancellation-and-operations-guide.md), [ai-privacy-and-consent-disclosures-2026-11-06.md](../policy/ai-privacy-and-consent-disclosures-2026-11-06.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, infrastructure, and release gates.

---

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 90 foundational implementation and independent verification before final acceptance of Phase 81:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 90 foundational implementation and independent verification before Phase 81 final acceptance. Record this exception in an ADR and roadmap metadata. Preserve outstanding prerequisite and release gates. This authorization does not permit live provider calls, transmission of real user content, production AI activation, or paid infrastructure. Prepare a concrete live synthetic test for separate owner approval."

Phase 90 audits Daynori's AI assistant subsystem, establishes a bounded findings register (AI-001 through AI-008), delivers production-grade remediations for server-enforced kill switches, provider error classification, and monetary accounting, prepares a comprehensive provider comparison and owner operating decision package, drafts clear user privacy disclosures, designs a concrete live synthetic test package, and enforces fail-closed release gates under `DEF-V2-008`.

---

## Baseline Audit & Findings Register

An audit of the AI subsystem against Daynori's privacy invariants and external provider requirements established the findings register in `artifacts/phase90/findings-register.json`:

1. **AI-001 (Operational Control & Safety — Remediated):** *Server-enforced kill switch overriding all environment and test modes.*
   - Implemented `isAiKillSwitchActive` in `@daynori/domain` and integrated it into `assertAiLocal` and `resolveAiProvider`.
   - When `DAYNORI_AI_KILL_SWITCH = 'true'`, all AI routes immediately halt with HTTP 503 `AI_KILL_SWITCH_ACTIVE`, background indexing jobs fence immediately with `AI_DISABLED`, and provider resolution fails closed.

2. **AI-002 (Adapter Resilience & Transport Bounds — Remediated):** *Provider error classification, input bounding, and malformed response rejection.*
   - `OpenAiCompatibleProvider` bounds user prompt input to 20,000 characters and system prompt to 10,000 characters (throwing HTTP 400 `AI_PROVIDER_INPUT_TOO_LARGE`).
   - Provider HTTP errors are distinctly classified: HTTP 429 maps to `AI_PROVIDER_RATE_LIMIT` (HTTP 429), HTTP 401/403 maps to `AI_PROVIDER_AUTH_ERROR` (HTTP 503), and HTTP 500-504 maps to `AI_PROVIDER_OUTAGE` (HTTP 503).
   - Responses exceeding 20,000 characters or missing message content are rejected as `AI_PROVIDER_MALFORMED`.

3. **AI-003 (Budget & Quota Durability — Verified Satisfied):** *Concurrency-safe durable per-request budget reservation.*
   - Atomic reservation via `app.ai_create_reservation` within `app.ai_budget_windows` using PostgreSQL `FOR UPDATE` row locks.
   - If `spent + reserved + requested > budget_limit`, reservation fails closed with HTTP 429 `AI_BUDGET_EXHAUSTED`. Concurrent requests cannot over-allocate the monthly token budget.

4. **AI-004 (Monetary Accounting & Settlement — Verified Satisfied):** *Idempotent settlement releases reservation once without double-counting.*
   - `app.ai_settle_request` updates budget windows and requests atomically.
   - Initial call releases reserved tokens and increments spent tokens by actual usage (which may legitimately exceed the estimate, never clipped). Duplicate settlement calls return `already_settled: true` without double-incrementing spent tokens.

5. **AI-005 (Privacy & Consent Lifecycle — Verified Satisfied):** *Post-provider result fencing discards output upon consent withdrawal or disable.*
   - When a user disables AI or withdraws consent while an external provider request is in flight, the post-provider fence in `retrieveAuthorizedAnswer` inspects live consent and generation.
   - If consent was revoked or generation incremented, the model output is completely discarded and replaced with an `ABSTAIN` notice with empty citations. Disclosures explicitly inform users that already-transmitted content cannot be recalled externally.

6. **AI-006 (Scope Boundaries & Exclusion — Verified Satisfied):** *Strict journal opt-in requirement and unconditional vault/secrets exclusion.*
   - Journal indexing and retrieval are strictly opt-in (`DEFAULT_AI_CONTENT_SCOPE.journal === false`). Ordinary journal visibility or global search settings cannot enable journal indexing.
   - Vault items (`security_scope: 'vault'`) are unconditionally excluded from indexing, retrieval, context snippets, and citations regardless of user consent. Shared rooms and chat messages are not accessible to personal AI.

7. **AI-007 (Cancellation Fencing — Verified Satisfied):** *Cancellation via AbortSignal bounds settlement and throws 499 AI_CANCELLED.*
   - Client connection drops or user cancellation trigger `AbortSignal`, interrupting provider HTTP transport and settling request with status `'cancelled'` and bounded token cost (up to 100 overhead tokens), throwing HTTP 499 `AI_CANCELLED`.

8. **AI-008 (Unit Economics & Rate Calculations — Remediated):** *Precise monetary accounting in micro-USD across candidate model rates.*
   - Implemented `calculateEstimatedAiCost` in `@daynori/domain` mapping prompt and completion token counts to exact micro-USD ($0.000001) and USD amounts for `gpt-4o-mini`, `gpt-4o`, `claude-3-5-haiku`, and `gemini-1.5-flash` based on official published pricing.

---

## Provider Comparative Analysis & Operating Choices

A comprehensive analysis of frontier AI providers was authored in `docs/engineering/ai-provider-comparison-and-operating-decisions.md`:

1. **OpenAI API (`gpt-4o-mini`):**
   - Recommended baseline candidate: low inference cost ($0.150 / $0.600 per 1M tokens), native JSON Schema strict mode for structured outputs, commercial API policy guarantees zero training on customer data by default.
   - Retention policy: default up to 30 days abuse monitoring. `store: false` disables dashboard persistence but does not eliminate 30-day abuse retention. Zero Data Retention (ZDR) requires explicit enterprise agreement and application approval.
2. **Anthropic Claude API (`claude-3-5-haiku`):**
   - Viable alternative with high reasoning quality; significantly higher output token cost ($5.00 / 1M tokens). Zero training by default; 30-day default abuse retention.
3. **Google Cloud Vertex AI (`gemini-1.5-flash-002`):**
   - Strongest candidate for European Union (EU) regional data residency and sovereignty requirements. Contractual region pinning (e.g. `europe-west3`) under Google Cloud DPA.

---

## Live Synthetic Test Package & Approval Gate

A concrete, reviewable live synthetic test package was designed in `artifacts/phase90/synthetic-test-package.json`:
- **Provider & Model:** OpenAI API, model `gpt-4o-mini`.
- **Ceiling:** Max 5 requests, max 500 tokens/request, hard spending limit of **$0.05 USD**.
- **Payload:** Strictly synthetic test data (plant care, HVAC maintenance, factual abstention, cancellation). Zero real user content, zero vault items, zero journal entries, zero PII.
- **Approval Gate:** In accordance with repository instructions, no live provider HTTP calls are executed until explicit owner sign-off on the test package is received.

---

## Verification Evidence

All 6 relevant AI and domain test suites pass completely (130/130 tests passing):
- `tests/integration/phase90-ai-consent-privacy-readiness.test.ts` (10 passed)
- `tests/integration/phase55-ai-privacy-retrieval.test.ts` (9 passed)
- `tests/integration/phase55-ai-repair.test.ts` (7 passed)
- `tests/integration/phase56-ai-assistant-actions.test.ts` (12 passed)
- `tests/integration/phase56-ai-repair.test.ts` (6 passed)
- `packages/domain/src/domain.test.ts` (86 passed)

TypeScript checks:
- `@daynori/domain`: pass (`tsc -b`, 0 errors)
- `@daynori/api`: pass (`tsc --noEmit`, 0 errors)

---

## Decision & Release Gate Closure

1. **Owner Scheduling Authorization:** Recorded in `docs/roadmap/progress.json` and this ADR.
2. **Foundational Architecture Complete:** Server-enforced kill switch (AI-001), provider error mapping (AI-002), budget reservation (AI-003), settlement idempotency (AI-004), consent fencing (AI-005), journal/vault scoping (AI-006), cancellation handling (AI-007), and monetary calculations (AI-008) are fully implemented and verified.
3. **Fail-Closed AI Gate Retained:** Production AI remains disabled (`isAiLocallyEnabled()` returns `false` in production). Defect `DEF-V2-008` is retained in `docs/roadmap/v2/function-register.json`.
4. **Honest Blocked Status:** Phase 90 is recorded as `blocked` in `docs/roadmap/progress.json` and `docs/phase-reports/phase-90.md` until explicit owner approval for live synthetic testing and enterprise provider contracts are signed.
