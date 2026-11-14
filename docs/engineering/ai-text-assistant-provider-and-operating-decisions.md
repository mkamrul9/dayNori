# AI Text-Assistant Provider, Privacy, Retention, Region, Cost Ceiling, Consent, and Kill-Switch Decisions

## Purpose

This document provides the comprehensive operating, security, privacy, and commercial architecture for the Daynori Ask Nori text-assistant release gate (`DEF-V2-008`). It specifies the concrete requirements, cost ceilings, retention bounds, geographic pinning, multi-level kill-switches, and synthetic testing protocols required before any production AI provider is authorized for live end-user traffic.

---

## 1. Provider Evaluation & Commercial Terms

### 1.1 Candidate Providers Comparison

| Provider / Model | Reasoning / Tool Quality | Data Privacy / Training Policy | Cost per 1M Input Tokens | Cost per 1M Output Tokens | Enterprise DPA / BAA | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| **Google Cloud Vertex AI (Gemini 1.5 Flash)** | Excellent latency, high grounding fidelity, native JSON schema mode | Zero customer data retention for model training; covered by Google Cloud Master Services Agreement | \$0.075 | \$0.30 | Yes (HIPAA BAA + EU SCCs) | **Primary Recommended** |
| **Google Cloud Vertex AI (Gemini 1.5 Pro)** | Superior multi-turn complex reasoning; overkill for single organizer proposals | Zero customer data retention for model training | \$1.25 | \$5.00 | Yes | Secondary fallback for complex tasks |
| **OpenAI API (GPT-4o-mini)** | Strong structured JSON output, fast response times | Zero Data Retention (ZDR) policy available for eligible enterprise agreements; standard API retains 30-day transient abuse logs | \$0.15 | \$0.60 | Yes (Standard DPA + ZDR addendum) | Approved Wire Protocol Candidate |
| **Anthropic API (Claude 3.5 Haiku)** | Strong safety alignment, precise citations | Does not train on API customer data; 30-day transient retention | \$0.25 | \$1.25 | Yes | Alternative candidate |

### 1.2 Mandatory Commercial Invariants
Prior to enabling live user traffic:
1. **Zero Model Training**: The provider agreement must explicitly state in writing that customer prompts, inputs, attachments, context snippets, and completions are **never** used to train, retrain, or improve foundational, fine-tuned, or public AI models.
2. **Data Processing Agreement (DPA)**: Standard Contractual Clauses (SCCs) and GDPR Article 28 compliance must be executed with the provider.
3. **Transient Abuse Logging**: Provider log retention for abuse monitoring must be strictly capped at 30 days or less, with a formal protocol for early deletion.

---

## 2. Privacy & Data Minimization Architecture

### 2.1 Principle of Least Privilege
- Only explicitly authorized organizer content within the user's active personal workspace is provided as context.
- Cross-workspace retrieval is strictly prevented at both the database level (PostgreSQL Row Level Security and workspace tenant scoping) and the application layer.

### 2.2 Unconditional Vault Exclusion
- **Invariant**: Cryptographic keys, vault items, encrypted attachments, and master passphrases must **never** be transmitted to any external AI provider or indexed into AI search chunks.
- The `isVaultAiTarget(kind, securityScope)` guard strictly checks all targets:
  - Any item with `security_scope = 'vault'` or `kind = 'vault_item'` is excluded.
  - Attempting to set `securityScope = 'vault'` on an AI proposal fails closed with HTTP 403 `vault_excluded` / `AI_VAULT_FORBIDDEN`.

### 2.3 Strict Journal Opt-in (Default: Disabled)
- Daynori treats personal journal entries as deeply private reflections.
- **Default State**: `contentScope.journal = false`.
- When disabled:
  - Personal journal entries are excluded from retrieval chunk generation.
  - Asking the assistant to "write this journal entry" returns guidance informing the user that journal access is disabled and must be explicitly opted in within Settings.
- When enabled by explicit user toggle:
  - Journal entries are included in context retrieval.
  - Requests to draft journal entries produce editable preview proposals requiring explicit date clarification and Save/Confirm action.

---

## 3. Retention & Ephemeral Storage Policy

### 3.1 Ephemeral Request Handling
- Prompt strings and model responses are treated as transient in-flight data.
- Server logs (stdout, stderr, disk logs) **must never log** prompt texts, document content, or raw model completions. Only structured metadata (token count, duration, turn ID, workspace ID) may be logged.

### 3.2 Assistant Message History
- Chat history is stored in `app.assistant_chat_turns` with foreign key cascade to the workspace.
- Users have full autonomy over history:
  - Individual turns can be deleted: `DELETE /v1/ai/history/:turnId`.
  - All history can be wiped: `DELETE /v1/ai/history`.
  - Clearing consent or disconnecting AI automatically purges all stored search chunks from `app.ai_index_chunks`.

---

## 4. Region & Data Residency Pinning

### 4.1 Geographic Pinning
- To prevent unintended jurisdictional data transfers, all API calls to AI providers must be pinned to specific approved geographic endpoints:
  - Primary: `us-central1` (US tenant cluster) or `europe-west1` (EU tenant cluster).
- Unpinned global multi-region routing that randomly dispatches requests across continents is strictly prohibited.

---

## 5. Cost Ceiling & Concurrency-Safe Budget Settlement

### 5.1 Hard Financial Ceilings
To protect both the user and the platform from runaway costs:
- **Daily Workspace Ceiling**: \$1.00 USD maximum consumption per workspace per day.
- **Monthly Workspace Ceiling**: \$10.00 USD maximum consumption per workspace per month.
- **Per-Request Bounds**:
  - Maximum context length: 20,000 characters (`AI_MAX_CONTEXT_CHARS`).
  - Maximum output tokens: 1,000 tokens (`AI_MAX_OUTPUT_TOKENS`).

### 5.2 Concurrency-Safe Budget Reservation
1. Before any provider I/O is dispatched, Daynori executes `app.ai_create_reservation(userId, tokens, generation, monthlyLimit)`.
2. If accumulated usage plus the reservation exceeds the budget ceiling, the transaction throws HTTP 429 `AI_BUDGET_EXHAUSTED`.
3. After completion, `app.ai_settle_reservation` settles the actual token count and releases unused reserved tokens.
4. If a request is cancelled in-flight via `AbortController`, the reservation is settled with status `cancelled`, recording only tokens already consumed.

---

## 6. Consent & Disclosure Governance

### 6.1 Versioned Consent Contract
- Consent is strictly version-locked:
  - `CURRENT_AI_CONSENT_VERSION = 'v1'`
  - `CURRENT_AI_PROVIDER_DISCLOSURE_VERSION = 'v1-2026-10-25'`
- If either the terms or provider disclosure versions change, all AI interactions fail closed with `requiresAcceptance = true` until the user reviews and confirms updated consent.

### 6.2 Granular Content Scopes
Users independently control:
- `notes`: Include personal notes in context retrieval (default: true).
- `tasks`: Include personal tasks and deadlines in context retrieval (default: true).
- `journal`: Include personal reflections (default: false, explicit opt-in).

---

## 7. Multi-Level Kill-Switch

Daynori implements a 3-tier defense-in-depth kill-switch:

1. **Global Server Environment Kill-Switch**:
   - `DAYNORI_ASSISTANT_KILL_SWITCH=true` immediately suspends all assistant and AI routes with HTTP 503 `AI_KILL_SWITCH_ACTIVE`.
   - In production runtimes (`NODE_ENV === 'production'`), AI endpoints fail closed unless `DAYNORI_AI_LIVE_ENABLED=true` is explicitly set with reviewed credentials.
2. **Workspace Admin Kill-Switch**:
   - Workspace owners can disable AI at any time in Settings (`ai_enabled = false`), which revokes consent and purges index chunks.
3. **Client UI Gating Banner (`DEF-V2-008`)**:
   - When gated, Web and Mobile applications prominently render the `assistant-gated-banner` informing users that live AI assistant features are unavailable pending operating authorization.

---

## 8. Synthetic Testing Protocols (Strictly Zero Real User Content)

### 8.1 Prohibition on Real User Data
- Real user notes, tasks, journals, or personal identifiers must **never** be used to test AI features or verify live provider endpoints.
- Any engineer or test runner violating this rule will be in direct violation of project security invariants.

### 8.2 Standardized Synthetic Personas
All testing must use standardized synthetic fixtures:
- Synthetic Note: "Team Retrospective Sprint 42: Discussion of test automation milestones."
- Synthetic Task: "Submit corporate tax return by 2026-12-15."
- Synthetic Journal: "2026-11-20: Completed the architecture milestone with verified tests."
- Synthetic Date Ambiguity: "Walked through the forest yesterday" / "Submit report tomorrow."

---

## 9. Reviewed Proposal Creation Flow (Zero Unreviewed Writes)

To prevent hallucinations, data corruption, or silent modifications:
1. **Assistant Proposes, Never Writes**: Output is strictly a typed proposal (`status: 'pending'`).
2. **Date Clarification Gate**: Ambiguous relative dates ("yesterday", "tomorrow", "আগামীকাল") trigger mandatory clarification questions before any proposal is drafted.
3. **Editable Preview**: The user can modify title, date, content, or amount via `PATCH /v1/ai/proposals/:proposalId`.
4. **Explicit Confirmation**: Saving to organizer domain tables requires explicit user click (`POST /v1/ai/proposals/:proposalId/confirm`) using an opaque single-use server confirmation token.
5. **Durable Mutation Receipt**: Confirmed creations record an auditable entry in `app.mutation_receipts` under `AI_DEVICE_ID = 'ai-assistant-proposal'`.
6. **Canonical Deep Link**: Response provides a verified link (`/plan?targetId=...`, `/library?noteId=...`, `/journal?entryId=...`) opening the created item.
7. **Idempotent Retry**: Re-submitting a confirmed proposal returns the existing entity without duplicates.
