# Phase 108: AI text-assistant release-gate and operational review

## Identity and scope

- Phase: [108 — AI text-assistant release-gate and operational review](../roadmap/phases/108-ai-text-assistant-release-gate-and-operational-review.md).
- Status: **blocked** — Comprehensive release-gate and operational review of Ask Nori completed under [ADR 0108](../decisions/0108-ai-text-assistant-release-gate-and-operational-review.md); discoverability enhanced on desktop (`AppSidebar.tsx`) and mobile with truthful unavailable explanations and status banner under `DEF-V2-008`; proposal review lifecycle verified with editable previews, anti-hallucination date ambiguity verification (clarification prompts required for relative dates), explicit Confirm/Save requirement, durable sync mutation receipts in `app.mutation_receipts` under `AI_DEVICE_ID` (`ai-assistant-proposal`), and canonical deep links via `getOrganizerDeepLink`; strict privacy fencing enforced (current disclosure version, multi-tenant workspace isolation, strict journal opt-in, and unconditional vault exclusion); mock provider evaluated under `FakeAiProvider`; live provider wire protocol evaluated under `OpenAiCompatibleProvider` with `store: false`, error mapping for HTTP 429/503/401/malformed, and in-flight cancellation; status recorded as **blocked** pending enterprise provider privacy review and commercial contract (`DEF-V2-008` fail-closed). No real-user data transmission enabled.
- Contributor/date: Antigravity agent, 2026-11-14.
- Base revision/branch: `a6c017fd988e3d6eccffb90591a02fef6b9b1705`, `codex/free-core-preview`.
- Hard prerequisites: Phases **94** and **107**.
- Owner Scheduling Authorization: The owner authorized Phase 108 with explicit instructions:
  > "Select one bounded AI text-assistant release-gate phase using the existing Phase 90–94 implementation. Make Ask Nori easy to find and explain clearly when it is unavailable. Verify an authorized live provider with synthetic content, consent, cost limits, cancellation, grounded citations, workspace isolation, journal opt-in, and failure recovery.
  >
  > Exercise requests such as “write this journal entry,” “create a note,” and “set a task deadline.” The assistant must produce an editable preview, ask about ambiguous dates, require explicit Save/Confirm, then show a durable receipt and a link to the created item. It must not invent a successful write or save unreviewed content. Do not enable real-user transmission without the documented provider/privacy gate. Record live versus mock results separately; update Help, phase evidence, progress, and the function register; make one reviewed phase commit and push."

---

## Result

### Implementation and Verifications Delivered

1. **Discoverability and Truthful Gating Presentation**:
   - Web: Added a prominent "Ask Nori" button in `apps/web/src/components/AppSidebar.tsx` under the Utilities section with the `nori` icon, a "Gated" status indicator, and click action to open the assistant panel (`openModal('assistant')`).
   - Header: Retained global assistant button with explicit tooltip and aria-label indicating gating status under `DEF-V2-008`.
   - Gated Status Presentation: `AssistantPanel.tsx` (web) and `AssistantSheet.tsx` (mobile) render an explicit status banner (`assistant-gated-banner`) truthfully explaining that live AI assistant queries and voice transcription are intentionally disabled under release gate `DEF-V2-008` pending enterprise provider privacy authorization. Query inputs are disabled with helpful placeholders and links to AI Privacy & FAQ (`/help?article=assistant-optional`) and Settings (`/settings`).

2. **Help Documentation Update**:
   - Updated `help.assistant-optional` in `packages/domain/src/help/catalogData.ts` to comprehensively document:
     - The release gate and privacy explanation (`DEF-V2-008`).
     - The proposal review workflow: editable previews, date ambiguity prompts, explicit Save/Confirm requirement, durable receipts, and canonical links.
     - Strict journal opt-in (`contentScope.journal`) and unconditional vault exclusion.
     - Cancellation semantics and transient (0-day) voice transcription.

3. **Anti-Hallucination Date Ambiguity Gate**:
   - Implemented `detectTaskDeadlineAmbiguity` in `@daynori/domain` (`packages/domain/src/organizerProposals.ts`) to detect relative deadline references ("tomorrow", "next Friday", "আগামীকাল", "পরশু") or missing dates in deadline requests and prompt clarifying questions.
   - Verified `detectJournalDateAmbiguity` for relative journal dates ("yesterday", "last week", "গতকাল").
   - Verified that ambiguous date requests **never invent or guess dates**, and **never create unreviewed organizer records**.

4. **Exercise Journeys: Note, Task Deadline, and Journal**:
   - "write this journal entry" with ambiguous date ("yesterday"): triggers clarification question, zero records created in `app.journal_entries`.
   - "write this journal entry" with explicit ISO date (`2026-11-20`): creates editable preview proposal, confirmed via `confirmAiProposal`, creates entry in `app.journal_entries`, records durable receipt in `app.mutation_receipts` under `AI_DEVICE_ID` (`ai-assistant-proposal`), and returns canonical deep link (`/journal?entryId=...`).
   - "create a note": creates editable preview proposal, edited via `updateAiProposal` (issuing a fresh single-use confirmation token), confirmed via `confirmAiProposal`, creates note in `app.notes`, records durable receipt in `app.mutation_receipts`, returns deep link (`/library?noteId=...`).
   - "set a task deadline" with ambiguous date ("tomorrow"): triggers clarification question, zero records created in `app.tasks`.
   - "set a task deadline" with explicit date (`2026-12-15`): creates editable preview proposal with deadline `{ type: 'date', date: '2026-12-15' }`, confirmed via `confirmAiProposal`, creates task in `app.tasks`, records durable receipt in `app.mutation_receipts`, returns deep link (`/plan?targetId=...&targetType=task`).
   - Cancelled / unreviewed proposals: cancelled via `cancelAiProposal`, verified zero writes to organizer tables.
   - Idempotent confirmation retry: re-confirming already confirmed proposal returns existing record idempotently without duplicate rows.

5. **Strict Privacy and Security Fencing**:
   - Current provider disclosure version required (`CURRENT_AI_PROVIDER_DISCLOSURE_VERSION`); outdated versions fail closed.
   - Journal opt-in enforced: when `contentScope.journal = false`, journal entries are excluded from retrieval and journal proposals are refused.
   - Vault exclusion enforced: vault items, plaintexts, and keys are never indexed or transmitted, and any proposal with `securityScope = 'vault'` fails closed with HTTP 403 `AI_VAULT_FORBIDDEN`.
   - Multi-tenant workspace isolation: cross-workspace queries, citations, and proposal operations fail closed with HTTP 403/404.

6. **Provider Separation: Live vs. Mock Evaluation**:
   - Mock Provider (`FakeAiProvider`): verified fast local execution, citation binding to cited item markers, and cancellation pause gates.
   - Live Provider Protocol (`OpenAiCompatibleProvider`): evaluated using synthetic HTTP transport; verified wire protocol invariants (`store: false`, Bearer token, temperature 0, model `gpt-4o-mini`, 30s timeout, <20,000 char bounds).
   - Operational Failure Recovery: verified typed domain error mappings for HTTP 429 (`AI_PROVIDER_RATE_LIMIT`), HTTP 503 (`AI_PROVIDER_OUTAGE`), HTTP 401 (`AI_PROVIDER_AUTH_ERROR`), malformed JSON (`AI_PROVIDER_MALFORMED`), and in-flight cancellation via `AbortSignal`.
   - Live and mock evaluation results recorded into separate evidence artifacts (`artifacts/phase108/live-provider-evaluation.json` and `artifacts/phase108/proposals-journey-evidence.json`).

---

## Gate Limitations & Operational Status (Truthfully Recorded)

| Gate / Requirement | Target | Result | Reason |
| --- | --- | --- | --- |
| `DEF-V2-008` (Live AI Gate) | Enterprise provider privacy review & contract | **blocked** | Live external LLM calls remain disabled fail-closed. Real user content is never transmitted without signed BAA/enterprise privacy terms. |
| `truthfulGatedUI` | Informative gating presentation | **pass** | Desktop sidebar, header, and mobile sheets render explicit gating status banner and disabled inputs without deceptive availability claims. |
| `proposalReviewFlow` | Zero unreviewed writes | **pass** | Proposals start as pending; explicit Confirm/Save required; durable receipts and deep links verified. |
| `dateAmbiguityGate` | Anti-hallucination clarification | **pass** | Ambiguous relative dates for journals and task deadlines prompt clarifying questions; no unreviewed writes occur. |
| `vaultExclusion` | Strict isolation of vault data | **pass** | Unconditional exclusion; vault items/keys never indexed, retrieved, or proposed (HTTP 403 `AI_VAULT_FORBIDDEN`). |
| `journalOptIn` | Strict consent fence for journals | **pass** | Journal access requires explicit opt-in in `contentScope.journal`; omitted otherwise. |
| `workspaceIsolation` | Multi-tenant tenant boundary | **pass** | Cross-workspace proposal access, confirmation, or cancellation strictly rejected. |
| `wireProtocolInvariants` | OpenAI-compatible adapter protocol | **pass** | `store: false` verified; 429/503/401/malformed error mappings verified; in-flight cancellation verified. |
| `OWNER-RELEASE-AUTH` | Owner publication authorization | **open** | Version 2 release authorization remains with repository owner. |
| `DEF-V2-011` | Physical Android TalkBack hardware verification | **blocked** | Phase 71 remains blocked pending physical phone and spoken TalkBack verification. |

---

## Verification Evidence

- `pnpm vitest run tests/integration/phase108-ai-assistant-release-gate.test.ts`: 16/16 tests pass in 1.28s.
- `pnpm vitest run tests/integration/phase108-ai-assistant-release-gate.test.ts tests/integration/phase90-ai-consent-privacy-readiness.test.ts tests/integration/phase91-scoped-retrieval-evaluation.test.ts tests/integration/phase92-assistant-chat-stream-guidance.test.ts tests/integration/phase93-reviewed-organizer-creation.test.ts tests/integration/phase94-structured-organizer-tools.test.ts`: 63/63 tests pass across 6 test suites in 17.0s.
- `pnpm --filter @daynori/domain typecheck`: pass (tsc -b clean).
- `pnpm --filter @daynori/web typecheck`: pass.
- `pnpm --filter @daynori/mobile typecheck`: pass.
- `pnpm --filter @daynori/api typecheck`: pass.
- `pnpm lint`: pass (0 errors).
- Artifacts:
  - `artifacts/phase108/live-provider-evaluation.json`
  - `artifacts/phase108/proposals-journey-evidence.json`
  - `artifacts/phase108/evidence-summary.json`
