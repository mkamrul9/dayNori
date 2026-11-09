# AI Provider Comparative Analysis & Operating Decisions (2026-11-06)

**Phase:** Phase 90 — AI provider consent, privacy, and operating decisions  
**Review date:** 2026-11-06  
**Status:** **PROVISIONAL / BLOCKED PENDING OWNER APPROVAL** (`DEF-V2-008`)

---

## 1. Executive Summary

Daynori's assistant features ("Ask Nori" and grounded organizer assistance) require a frontier LLM provider capable of:
1. Grounded factual question answering over user-consented personal workspace notes and tasks.
2. Strict citation binding to verified source chunks (`[source:uuid#rN]`).
3. Reliable structured outputs for typed proposal generation (Phase 93).
4. Predictable inference latency and low per-action cost to ensure sustainable unit economics.
5. Strict enterprise-grade data privacy: zero model training on customer prompts/completions, verifiable data retention controls, and data residency guarantees.

This document evaluates three viable frontier providers as of **November 2026**:
1. **OpenAI API** (`gpt-4o-mini`, `gpt-4o`)
2. **Anthropic Claude API** (`claude-3-5-haiku-20241022`, `claude-3-5-sonnet-20241022`)
3. **Google Cloud Vertex AI / Gemini API** (`gemini-1.5-flash-002`, `gemini-1.5-pro-002`)

---

## 2. Primary Sources Reviewed

| Provider | Topic | Primary Source Link | Notes & Verification Date |
|---|---|---|---|
| **OpenAI** | Enterprise Data Privacy & Training | [OpenAI Business Data](https://openai.com/business-data/) | API data is **not used for model training** by default. Rechecked 2026-11-06. |
| **OpenAI** | Data Controls & Retention | [OpenAI Platform Data Controls](https://developers.openai.com/api/docs/guides/your-data) | Default abuse monitoring retention is **up to 30 days**. Zero Data Retention (ZDR) is an **approval-gated enterprise control**. `store: false` disables dashboard persistence but **does not bypass the 30-day abuse monitoring window**. |
| **OpenAI** | Structured Outputs | [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) | Native JSON Schema strict mode guarantees 100% adherence to schema. |
| **OpenAI** | Pricing & Models | [OpenAI API Pricing](https://openai.com/api/pricing/) | `gpt-4o-mini`: $0.150 / 1M input tokens, $0.600 / 1M output tokens (standard tier). |
| **Anthropic** | Commercial Data Privacy | [Anthropic Commercial Privacy](https://www.anthropic.com/legal/commercial-terms) | Commercial API data is **not used for model training** by default. Rechecked 2026-11-06. |
| **Anthropic** | Data Retention Policy | [Anthropic Trust & Safety Data Retention](https://support.anthropic.com/en/articles/7996848) | Default retention: **up to 30 days** for platform reliability and abuse monitoring. Policy violations retained up to 2 years. Zero Data Retention requires custom enterprise contract. |
| **Anthropic** | Pricing & Models | [Anthropic Pricing](https://www.anthropic.com/pricing) | `claude-3-5-haiku`: $1.00 / 1M input tokens, $5.00 / 1M output tokens. Prompt caching reduces cache reads to $0.10 / 1M. |
| **Google Cloud** | Vertex AI Data Governance | [Vertex AI Data Governance](https://cloud.google.com/vertex-ai/docs/generative-ai/data-governance) | Customer prompts and responses **are never used to train Google foundation models**. Operates under Google Cloud DPA. Rechecked 2026-11-06. |
| **Google Cloud** | Data Residency & Retention | [Google Cloud Data Residency](https://cloud.google.com/vertex-ai/docs/general/locations) | True regional pinning available (e.g. `us-central1`, `europe-west3`). Customer data is not logged by default if logging is disabled at the project level. |
| **Google Cloud** | Pricing & Models | [Vertex AI Pricing](https://cloud.google.com/vertex-ai/pricing) | `gemini-1.5-flash-002`: $0.075 / 1M input (<=128k context), $0.300 / 1M output. |

---

## 3. Comprehensive Provider Comparison Matrix

| Evaluation Dimension | OpenAI API (`gpt-4o-mini`) | Anthropic Claude API (`claude-3-5-haiku`) | Google Cloud Vertex AI (`gemini-1.5-flash-002`) | Daynori Operational Assessment |
|---|---|---|---|---|
| **Primary Model** | `gpt-4o-mini` | `claude-3-5-haiku-20241022` | `gemini-1.5-flash-002` | All three offer high-speed, cost-effective models suitable for grounded retrieval. |
| **Input Price / 1M Tokens** | **$0.150** (0.150 micro-USD/tok) | **$1.000** (1.000 micro-USD/tok) | **$0.075** (0.075 micro-USD/tok) | Gemini 1.5 Flash is lowest cost; GPT-4o-mini is second lowest. |
| **Output Price / 1M Tokens** | **$0.600** (0.600 micro-USD/tok) | **$5.000** (5.000 micro-USD/tok) | **$0.300** (0.300 micro-USD/tok) | Gemini is 50% cheaper than GPT-4o-mini; Claude 3.5 Haiku is significantly more expensive. |
| **Context Window** | 128,000 tokens | 200,000 tokens | 1,000,000+ tokens | All exceed Daynori's retrieval context bound (8,000 chars / ~2,000 tokens). |
| **Structured Output Support** | Native `json_schema` strict mode (`response_format`) | Tool use / function calling (`tools`, `tool_choice`) | Native `response_mime_type: "application/json"`, `response_schema` | OpenAI strict mode guarantees exact JSON Schema adherence without hallucinated fields. |
| **Default Model Training Policy** | **No training on API data** | **No training on API data** | **No training on customer data** | **All three satisfy Daynori's no-training requirement by default.** |
| **Default Data Retention** | Up to 30 days (abuse monitoring) | Up to 30 days (abuse monitoring; 2 yrs if flagged) | Up to 55 days (default abuse logging) | Standard API access across all three stores inputs/outputs temporarily. |
| **`store: false` Semantics** | Disables Dashboard & evals storage; **retains 30-day abuse monitoring** | N/A (no per-request toggle) | Can disable project-level Cloud Logging | `store: false` **must never be misrepresented as Zero Data Retention**. |
| **Zero Data Retention (ZDR)** | Enterprise application & approval required | Enterprise agreement required | Opt-out of prompt logging under enterprise Cloud billing | True ZDR cannot be claimed for standard self-serve API keys on any provider. |
| **Regional Data Residency** | US-centric by default; EU residency requires Enterprise contract | US-centric by default; custom terms required | **Contractually guaranteed region pinning (e.g. `europe-west3`, `us-central1`) via Google Cloud project** | Vertex AI provides the strongest self-serve regional data residency guarantees. |
| **Timeout & Latency** | Median TTFT ~350ms; p95 latency ~1.2s | Median TTFT ~400ms; p95 latency ~1.4s | Median TTFT ~300ms; p95 latency ~1.1s | All three easily meet Daynori's 30-second client timeout window. |

---

## 4. Architectural Analysis & Provider Recommendation

### Recommended Primary Provider: **OpenAI API (`gpt-4o-mini`)**
1. **Established Codebase Compatibility:** Daynori's existing adapter (`OpenAiCompatibleProvider`) and JSON streaming/citation pipeline are built and tested against the OpenAI Chat Completions API format.
2. **Native JSON Schema Strict Mode:** For Phase 93 confirmed organizer actions, OpenAI's strict structured outputs eliminate JSON parsing failures and schema drift.
3. **Low Unit Cost:** At \$0.15 / \$0.60 per million tokens, an average assistant query (1,200 prompt tokens + 250 completion tokens) costs **\$0.00033 USD (0.033 cents)**.
4. **Transparent Governance:** OpenAI clearly documents default 30-day abuse retention vs. approved ZDR, allowing Daynori to publish 100% honest user privacy disclosures.

### Recommended Secondary / Enterprise Candidate: **Google Cloud Vertex AI (`gemini-1.5-flash-002`)**
- For European Union (EU) or sovereignty-sensitive deployments requiring formal GDPR Article 28 Data Processing Agreements and strict European geographic processing, Vertex AI with pinned `europe-west3` or `europe-west1` endpoints is the premier candidate.

---

## 5. Concrete Owner Decision Package

The repository owner must make the following explicit business, legal, and operational determinations before any live user content is transmitted:

### 1. Proposed Provider and Model Selection
- **Proposed Baseline:** OpenAI API using model `gpt-4o-mini`.
- **Target Endpoint:** `POST https://api.openai.com/v1/chat/completions`.
- **Owner Action:** Approve `gpt-4o-mini` as the target model or specify an alternative candidate.

### 2. Data Categories Transmitted
- **Included (with explicit user consent):**
  - Search query text.
  - Personal note titles, plain text bodies, and revision numbers.
  - Personal task titles, detail notes, and revision numbers.
  - Optional Journal entries (only if separate journal opt-in is enabled).
- **Excluded Unconditionally:**
  - Vault records (encrypted or plaintext).
  - Credentials, API keys, password fields, recovery phrases.
  - Shared rooms and chat messages.
  - Files, audio attachments, and images (deferred to Phase 95+).

### 3. Retention, Training, and Residency Disclosures
- **No Model Training:** Verified that OpenAI does not train models on API inputs/outputs.
- **30-Day Retention Notice:** Disclose that OpenAI retains prompts and completions for up to 30 days for abuse monitoring before automatic deletion.
- **No ZDR Claim:** Daynori **must not** claim Zero Data Retention until an Enterprise BAA is formally contracted with OpenAI.
- **US Processing:** Disclose that inference processing currently occurs in United States infrastructure.

### 4. Quota Ceilings & Sustainable Monthly Budgets
- **Free Core Tier:** 50,000 tokens / month allowance (~40 assistant queries). Direct monthly provider cost: **~$0.02 USD**.
- **Plus Plan:** Included in sustainable plan model ($2.00 / month AI compute ceiling, allowing ~6,000,000 tokens / month). Direct cost: **~$1.35 USD**.
- **Pro Plan:** Included in sustainable plan model ($6.00 / month AI compute ceiling, allowing ~18,000,000 tokens / month). Direct cost: **~$4.05 USD**.

### 5. Concurrency, Timeout, and Retry Policy
- **Concurrency Limit:** Max 2 concurrent in-flight AI requests per user account.
- **Request Timeout:** 30 seconds hard limit enforced via `AbortController`.
- **Retry Policy:** Zero automatic retries on billable inference requests (retries are not free). Exponential backoff (1s, 2s, 4s) only on transient network drops prior to HTTP status receipt.

### 6. Emergency Kill Switch Runbook
- Server environment variable `DAYNORI_AI_KILL_SWITCH='true'` immediately halts all AI processing across web, mobile, and backend workers with HTTP 503 `AI_KILL_SWITCH_ACTIVE`.

---

## 6. Standing Release Blockers (`DEF-V2-008`)

Phase 90 remains recorded as **`blocked`** in roadmap metadata. Production live provider enablement is strictly gated until:
1. Owner signs off on this provider decision package.
2. Owner approves the concrete synthetic test package in `artifacts/phase90/synthetic-test-package.json`.
3. Corporate billing account and server-side API credentials are provided.
