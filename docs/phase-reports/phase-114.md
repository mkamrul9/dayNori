# Phase 114: Daynori Ask Nori Text-Assistant Release-Gate Verification and Reviewed Organizer Creation Audit

## Identity and scope

- Phase: [114 — Daynori Ask Nori text-assistant release-gate verification and reviewed organizer creation audit](../roadmap/phases/114-daynori-ask-nori-text-assistant-release-gate-verification-and-reviewed-organizer-creation-audit.md).
- Status: **blocked** — Comprehensive commercial provider and operating decisions package authored for owner sign-off ([docs/engineering/ai-text-assistant-provider-and-operating-decisions.md](../engineering/ai-text-assistant-provider-and-operating-decisions.md)); live provider integration truthfully recorded as blocked (`outcome: "blocked"`, `reason: "missing_ai_provider_config"`, gate `DEF-V2-008` in `artifacts/phase114/live-blocked.json`) because live provider credentials and spending authorization are unset in the environment; zero real user content transmitted; all tests run strictly with synthetic prompts and fixtures; rigorous integration suite verifies versioned consent, 3-tier kill-switch (server env `DAYNORI_AI_KILL_SWITCH = 'true'` returning 503), multi-tenant workspace isolation, default-off journal opt-in, unconditional vault exclusion (`isVaultAiTarget` returning 403), grounded citations (`[source:<id>#r1]`) and anti-hallucination abstention (`ABSTAIN:`), in-flight cancellation via `AbortController`, error recovery (429 rate limit, 503 outage), and concurrency-safe PostgreSQL budget reservations (`app.ai_create_reservation`) with 429 exhaustion; the 7-step reviewed creation lifecycle is verified for "create a note", "write this journal", and "set a deadline" with editable previews, date clarification for ambiguous inputs, explicit confirmation tokens, durable mutation receipts under `AI_DEVICE_ID = 'ai-assistant-proposal'`, canonical deep links (`getOrganizerDeepLink`), idempotent re-confirmation, and zero organizer writes on cancellation; web and mobile interfaces verified across `AssistantPanel.tsx`, `AssistantSheet.tsx`, `AppSidebar.tsx`, `AppHeader.tsx`, and `NoriCompanionLauncher.tsx` with truthful gating banners under `DEF-V2-008`; 26 automated tests passing across integration, UI, and mobile suites; all standing release gates preserved.
- Contributor/date: Antigravity agent, 2026-11-14.
- Base revision/branch: `f890f69`, `codex/free-core-preview`.
- Hard prerequisites: Phases **94**, **108**, and **113**.
- Owner Scheduling Authorization: The owner authorized Phase 114 with explicit instructions:
  > "Select one bounded Ask Nori text-assistant release-gate phase. Follow AGENTS.md and Phases 90–94/108. Prepare the provider, privacy, retention, region, cost ceiling, consent, and kill-switch decision for owner review. Use synthetic prompts for initial live provider tests only after authorized credentials and spending are available; never send real user content as a test.
  >
  > Verify grounded answers and citations, abstention, workspace isolation, journal opt-in, vault exclusion, cancellation, outage/rate-limit handling, and budget settlement. Test “create a note,” “write this journal,” and “set a deadline” through editable proposals, date clarification, explicit confirmation, durable receipts, idempotent retry, and working deep links. Test the actual web/mobile interface, not only domain functions. Keep AI disabled for users until live evidence and provider terms pass. Correct the report and function register; commit and push one reviewed phase."

---

## Result

### Implementation and Verifications Delivered

1. **Owner Review Package: Commercial Provider & Operating Decisions**:
   - Authored [docs/engineering/ai-text-assistant-provider-and-operating-decisions.md](../engineering/ai-text-assistant-provider-and-operating-decisions.md) detailing:
     - Provider evaluation: Google Cloud Vertex AI (Gemini 1.5 Flash recommended primary), OpenAI (GPT-4o-mini wire protocol).
     - Commercial terms: zero customer data used for model training, DPA with EU SCCs, 30-day transient abuse logging cap.
     - Privacy & minimization: PII minimization, prompt token bounds (max 20,000 chars), unconditional vault exclusion (`isVaultAiTarget`), default-off journal opt-in (`contentScope.journal = false`).
     - Retention: Ephemeral in-memory handling, zero prompt/completion disk logging, user history wiping (`DELETE /v1/ai/history`).
     - Region pinning: `us-central1` and `europe-west1` regional endpoints. Global dynamic routing prohibited.
     - Cost ceiling: \$1.00 USD/workspace/day, \$10.00 USD/workspace/month, concurrency-safe PostgreSQL budget reservations (`app.ai_create_reservation`) with fail-closed 429 `AI_BUDGET_EXHAUSTED`.
     - 3-tier kill-switch: server env `DAYNORI_AI_KILL_SWITCH = 'true'` (503 `AI_KILL_SWITCH_ACTIVE`), workspace toggle (`ai_enabled = false`), client UI gating banner (`DEF-V2-008`).
     - Synthetic testing protocol: strictly zero real user data transmission.

2. **Domain Package Enhancement**:
   - Added `isVaultAiTarget(kind, securityScope)` in `packages/domain/src/aiConsent.ts` and exported via `packages/domain/src/index.ts`. Recompiled domain package cleanly.

3. **7-Step Reviewed Organizer Creation Lifecycle Verified**:
   - *Flow 1 (Note)*: Prompt "create a note about project launch" -> editable preview -> edit payload (`PATCH /v1/ai/proposals/:proposalId`) -> explicit confirm (`POST /v1/ai/proposals/:proposalId/confirm`) -> durable sync receipt (`AI_DEVICE_ID = 'ai-assistant-proposal'`) -> deep link (`/library?noteId=...`).
   - *Flow 2 (Journal)*: Prompt "write this journal entry: yesterday was productive" -> ambiguous date flagged (`detectJournalDateAmbiguity`) -> asks clarification -> explicit date "2026-11-20" provided -> proposal created -> confirm -> durable receipt -> deep link (`/journal?entryId=...`).
   - *Flow 3 (Deadline)*: Prompt "set a deadline for tomorrow" -> ambiguous deadline flagged (`detectTaskDeadlineAmbiguity`) -> asks clarification -> explicit deadline "2026-12-15" provided -> proposal created -> confirm -> durable receipt -> deep link (`/plan?targetId=...&targetType=task`).
   - *Idempotent Retry*: Submitting confirmation twice returns the existing confirmed entity without duplicate database rows.
   - *Zero-Write Cancellation*: Cancelling a proposal (`POST /v1/ai/proposals/:proposalId/cancel`) leaves zero rows in domain tables.

4. **Web and Mobile Interface Verification**:
   - `AssistantPanel.tsx` (Web): Verified truthful gating banner under `DEF-V2-008`, disabled input textarea and ask button, proposal card rendering, editable preview, explicit confirm/cancel buttons, deep link navigation, and sanitized markdown citations.
   - `AssistantSheet.tsx` (Mobile): Verified with React Native `TestRenderer`; displays truthful gating banner under `DEF-V2-008`, disabled ask button, input text state, and close actions.
   - `AppSidebar.tsx` & `AppHeader.tsx`: Surfaced entry points with "Gated" pill badges and accessible labels.
   - `NoriCompanionLauncher.tsx`: Verified mobile launcher floating button accessibility (min 44x44 target, explicit accessibility label).

---

## Gate Limitations & Live Provider Status (Truthfully Recorded)

| Gate / Requirement | Target | Result | Reason |
| --- | --- | --- | --- |
| `ownerAiProviderCredentials` | Commercial LLM API keys | **unmet** | Live commercial provider credentials and billing spend unconfigured in environment (`DEF-V2-008`). |
| `liveProviderContract` | Commercial DPA & Zero-Training contract | **unmet** | Enterprise DPA with zero model training and 30-day transient cap awaiting owner execution. |
| `consentFencing` | Version-locked user consent | **pass** | Rejects unconsented or outdated disclosure versions fail-closed. |
| `serverKillSwitch` | Server environment kill-switch | **pass** | `DAYNORI_AI_KILL_SWITCH = 'true'` instantly returns 503 `AI_KILL_SWITCH_ACTIVE`. |
| `workspaceIsolation` | Multi-tenant tenant boundaries | **pass** | Cross-workspace retrieval, proposal editing, confirmation, and cancellation strictly fail closed (404/403). |
| `journalOptIn` | Strict journal scope opt-in | **pass** | Refuses journal proposals when opt-in is false; permits only when explicitly enabled. |
| `vaultExclusion` | Unconditional vault isolation | **pass** | `isVaultAiTarget` rejects vault proposals with 403 `vault_excluded`. |
| `groundedRetrievalAndAbstain` | Citation grounding & abstention | **pass** | Grounded citations (`[source:<id>#r1]`) and anti-hallucination abstention (`ABSTAIN:`) verified. |
| `inFlightCancellation` | Request abort handling | **pass** | `AbortController` cancellation discards output; user draft preserved with zero zombie operations. |
| `operationalErrorRecovery` | Upstream failure mapping | **pass** | 429 maps to `AI_PROVIDER_RATE_LIMIT`, 503 maps to `AI_PROVIDER_OUTAGE`. |
| `concurrencySafeBudget` | PostgreSQL budget reservation | **pass** | `app.ai_create_reservation` safely enforces daily/monthly ceilings, returning 429 `AI_BUDGET_EXHAUSTED` when exceeded. |
| `reviewedCreationLifecycle` | 7-step reviewed proposal engine | **pass** | Note, Journal, and Deadline flows verified through date clarification, editable preview, explicit confirm, durable receipts (`AI_DEVICE_ID`), deep links, and idempotent retry. |
| `uiInterfaceVerification` | Web & Mobile UI components | **pass** | Verified `AssistantPanel`, `AssistantSheet`, `AppSidebar`, `AppHeader`, `NoriCompanionLauncher` with truthful gating banners. |

Evidence files:
- `artifacts/phase114/provider-evidence.json`
- `artifacts/phase114/live-blocked.json`
- `artifacts/phase114/ai-capabilities-matrix.json`
- `artifacts/phase114/evidence-summary.json`
- `docs/engineering/ai-text-assistant-provider-and-operating-decisions.md`
- `docs/decisions/0114-ask-nori-text-assistant-release-gate-and-reviewed-creation-audit.md`

---

## Automated evidence

| Test Suite | Result |
| --- | --- |
| `tests/integration/phase114-ask-nori-assistant-release-gate.test.ts` | Pass (16 tests) |
| `tests/unit/phase114-ask-nori-ui-interface.test.ts` | Pass (8 tests) |
| `apps/mobile/src/phase114-assistant-mobile-views.test.ts` | Pass (2 tests) |
| `tests/integration/phase108-assistant-release-gate.test.ts` | Pass (14 tests) |
| `tests/integration/phase94-assistant-limits.test.ts` | Pass (12 tests) |
| `tests/integration/phase93-assistant-proposal-review.test.ts` | Pass (16 tests) |
| `tests/integration/phase92-assistant-proposal-lifecycle.test.ts` | Pass (11 tests) |
| `tests/integration/phase91-assistant-grounding.test.ts` | Pass (13 tests) |
| `tests/integration/phase90-assistant-consent-gate.test.ts` | Pass (9 tests) |
