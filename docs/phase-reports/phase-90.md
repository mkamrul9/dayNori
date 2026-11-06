# Phase 90: AI provider consent, privacy, and operating decisions

## Identity and scope

- Phase: [90 — AI provider consent privacy and operating decisions](../roadmap/phases/90-ai-provider-consent-privacy-and-operating-decisions.md).
- Status: **blocked** — Foundational implementation and independent verification complete: server-enforced kill switch (AI-001) implemented and verified in `@daynori/domain` and API (`DAYNORI_AI_KILL_SWITCH='true'` -> 503 `AI_KILL_SWITCH_ACTIVE`); provider error classification, input bounding (<=20k chars), and oversized response rejection (AI-002) verified; durable concurrency-safe budget reservations (AI-003) verified; idempotent settlement (AI-004) verified; post-provider result fencing on consent withdrawal (AI-005) verified with accurate disclosure that already-transmitted content cannot be recalled; strict journal opt-in and unconditional vault/secrets exclusion (AI-006) verified; cancellation via AbortSignal (AI-007) verified; precise micro-USD monetary accounting (AI-008) verified; provider comparative analysis authored; AI budget, cancellation, and operations guide authored; AI privacy and consent disclosures authored; concrete live synthetic test package authored; 6 test suites with 130 tests passing; production AI activation and live provider calls remain fail-closed pending explicit owner approval of live synthetic test and enterprise provider contract (`DEF-V2-008` retained).
- Contributor/date: Antigravity agent, 2026-11-06.
- Base revision/branch: `0e8568d85075adcc4bca4325179171d63ae59a7d`, `codex/free-core-preview`.
- Hard prerequisites: Phases **65**, **68**, **77**, **78**, and **81**.
- Owner Scheduling Authorization: The owner authorized Phase 90 foundational implementation and independent verification before final acceptance of Phase 81 ([ADR 0090](../decisions/0090-ai-provider-consent-privacy-and-operating-decisions.md)). Phase 90 is recorded as `blocked` due to unmet owner live synthetic test approval and enterprise contract gates (`DEF-V2-008` retained). Outstanding checks for Phases 71, 75, 80, 81, 84, 85, 86, 87, 88, 89, and 99 remain preserved. Standing push authorized under ADR 0074. No unverified production capability, live calls, or paid infrastructure claimed.

---

## Result

### Implementation and Verifications Delivered

1. **Server-Enforced Kill Switch (AI-001 Remediation):**
   - Implemented `isAiKillSwitchActive` in `@daynori/domain/src/aiGate.ts` and integrated it into `assertAiLocal` in `apps/api/src/modules/ai/service.ts` and `resolveAiProvider` in `apps/api/src/modules/ai/provider.ts`.
   - Setting `DAYNORI_AI_KILL_SWITCH='true'` immediately halts all AI routes with HTTP 503 `AI_KILL_SWITCH_ACTIVE`, background indexing jobs fence immediately with `AI_DISABLED`, and provider resolution fails closed.

2. **Provider Error Classification & Transport Bounds (AI-002 Remediation):**
   - Enhanced `OpenAiCompatibleProvider` to bound input prompts (<=20,000 characters for user prompt, <=10,000 characters for system prompt, returning HTTP 400 `AI_PROVIDER_INPUT_TOO_LARGE`).
   - Distinctly classified HTTP response statuses: HTTP 429 maps to `AI_PROVIDER_RATE_LIMIT` (HTTP 429), HTTP 401/403 maps to `AI_PROVIDER_AUTH_ERROR` (HTTP 503), and HTTP 500-504 maps to `AI_PROVIDER_OUTAGE` (HTTP 503).
   - Responses exceeding 20,000 characters or missing message content are rejected as `AI_PROVIDER_MALFORMED`.

3. **Concurrency-Safe Durable Budget Reservation (AI-003 Verification):**
   - Verified that `app.ai_create_reservation` locks the user's monthly budget window row in `app.ai_budget_windows` using `FOR UPDATE`.
   - Verified that if `spent + reserved + requested > budget_limit`, the reservation fails closed with HTTP 429 `AI_BUDGET_EXHAUSTED`. Concurrent requests cannot over-allocate the budget.

4. **Idempotent Settlement & Double-Deduction Prevention (AI-004 Verification):**
   - Verified that `app.ai_settle_request` releases reserved tokens and increments spent tokens by actual usage on initial call.
   - Verified that duplicate calls with the same `requestId` return `already_settled: true`, preserving idempotent replay safety without double-incrementing spent tokens.

5. **Post-Provider Result Fencing on Consent Withdrawal (AI-005 Verification):**
   - Verified that when a user disables AI or withdraws consent while an external provider request is in flight, the post-provider fence in `retrieveAuthorizedAnswer` inspects live consent and generation.
   - The model output is completely discarded and replaced with an `ABSTAIN` notice with empty citations. Disclosures explicitly inform users that already-transmitted content cannot be recalled externally.

6. **Strict Journal Opt-in & Unconditional Vault Exclusion (AI-006 Verification):**
   - Verified that journal indexing and retrieval are strictly opt-in (`DEFAULT_AI_CONTENT_SCOPE.journal === false`).
   - Verified that vault items (`security_scope: 'vault'`) are unconditionally excluded from indexing, retrieval, context snippets, and citations regardless of user consent. Shared rooms and chat messages are not accessible to personal AI.

7. **Cancellation via AbortSignal (AI-007 Verification):**
   - Verified that client connection drops or user cancellation trigger `AbortSignal`, interrupting provider HTTP transport and settling request with status `'cancelled'` and bounded token cost (up to 100 overhead tokens), throwing HTTP 499 `AI_CANCELLED`.

8. **Precise Monetary Accounting (AI-008 Remediation):**
   - Implemented `calculateEstimatedAiCost` in `@daynori/domain/src/aiConsent.ts` mapping prompt and completion token counts to exact micro-USD ($0.000001) and USD amounts for `gpt-4o-mini`, `gpt-4o`, `claude-3-5-haiku`, and `gemini-1.5-flash` based on official published pricing.

9. **Comprehensive Documentation & Packages Delivered:**
   - Authored `docs/engineering/ai-provider-comparison-and-operating-decisions.md` evaluating OpenAI, Anthropic, and Vertex AI.
   - Authored `docs/engineering/ai-budget-cancellation-and-operations-guide.md` documenting budget lifecycle, cancellation invariants, and kill switch runbook.
   - Authored `docs/policy/ai-privacy-and-consent-disclosures-2026-11-06.md` detailing user consent disclosures, data boundaries, and subprocessor roles.
   - Prepared `artifacts/phase90/synthetic-test-package.json` for owner review and approval prior to any live provider calls.

---

### Gate Limitations & Operational Status (Truthfully Recorded)

| Gate / Requirement | Target | Result | Reason |
| --- | --- | --- | --- |
| `ownerSyntheticTestApproval` | Explicit Owner Approval | **pending** | Awaiting owner review and sign-off on `synthetic-test-package.json` (`DEF-V2-008`). |
| `liveProviderCalls` | Live Provider Execution | **prohibited** | Real provider network calls prohibited until explicit owner approval is granted. |
| `productionAiActivation` | Production AI Gate | **fail-closed** | `isAiLocallyEnabled()` strictly returns `false` in production. |
| `realUserContentTransmission` | Zero Real User Content | **pass** | No real user notes, journal entries, or vault data transmitted; fake and mock transport only. |
| `serverKillSwitch` | Server-Side Kill Switch | **pass** | `DAYNORI_AI_KILL_SWITCH='true'` immediately halts all AI routes with 503 `AI_KILL_SWITCH_ACTIVE`. |
| `unconditionalVaultExclusion` | Zero Vault Exposure | **pass** | Vault records unconditionally excluded from indexing, retrieval, and citations. |
| `separateJournalOptIn` | Explicit Journal Consent | **pass** | Journal entries excluded by default; requires explicit `journal: true` opt-in. |
| `durableBudgetReservation` | Concurrency-Safe Quota | **pass** | Atomic reservations under row locks; idempotent settlement prevents double-counting. |
| `cancellationFencing` | Post-Provider Discard | **pass** | In-flight results discarded on cancel/disable; non-recall invariant transparently disclosed. |

Production AI remains **fail-closed** (`isAiLocallyEnabled()` returns `false` in production). `DEF-V2-008` is retained in `docs/roadmap/v2/function-register.json`.

Evidence files:
- `artifacts/phase90/findings-register.json`
- `artifacts/phase90/synthetic-test-package.json`
- `artifacts/phase90/evidence-summary.json`
- `artifacts/phase90/manual-ui-evidence.json`
- `docs/engineering/ai-provider-comparison-and-operating-decisions.md`
- `docs/engineering/ai-budget-cancellation-and-operations-guide.md`
- `docs/policy/ai-privacy-and-consent-disclosures-2026-11-06.md`
- `docs/decisions/0090-ai-provider-consent-privacy-and-operating-decisions.md`

---

## Automated Evidence

| Test Suite | Result |
| --- | --- |
| `tests/integration/phase90-ai-consent-privacy-readiness.test.ts` | Pass (10 tests) |
| `tests/integration/phase55-ai-privacy-retrieval.test.ts` | Pass (9 tests) |
| `tests/integration/phase55-ai-repair.test.ts` | Pass (7 tests) |
| `tests/integration/phase56-ai-assistant-actions.test.ts` | Pass (12 tests) |
| `tests/integration/phase56-ai-repair.test.ts` | Pass (6 tests) |
| `packages/domain/src/domain.test.ts` | Pass (86 tests) |
| Total AI Test Coverage | Pass (130/130 tests) |
| TypeScript check (`@daynori/domain`) | Pass (`tsc -b`) |
| TypeScript check (`@daynori/api`) | Pass (`tsc --noEmit`) |

---

## Next Steps

1. Await owner review and explicit authorization of the live synthetic test package (`artifacts/phase90/synthetic-test-package.json`).
2. Upon owner approval and provision of server-side test credentials, execute bounded synthetic calls (<=5 requests, <=$0.05 USD) and record transport receipts.
3. Retain `DEF-V2-008` in `docs/roadmap/v2/function-register.json` and keep production AI disabled (`isAiLocallyEnabled()` returning `false`).
