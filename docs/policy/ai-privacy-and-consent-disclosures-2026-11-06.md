# AI Privacy, Consent, and Data Disclosures (2026-11-06)

**Phase:** Phase 90 — AI provider consent, privacy, and operating decisions  
**Review date:** 2026-11-06  
**Status:** **PROVISIONAL / BLOCKED PENDING OWNER APPROVAL** (`DEF-V2-008`)

---

## 1. Executive Privacy Principles

Daynori is architected on local-first, privacy-preserving invariants. The integration of artificial intelligence (AI) assistant capabilities ("Ask Nori") introduces third-party cloud inference. To preserve user trust and regulatory compliance under GDPR, CCPA/CPRA, and Google Play developer policies, Daynori enforces the following non-negotiable privacy boundaries:

1. **Default Off:** AI features are completely deactivated by default. No background indexing, token reservations, or network requests occur until the user explicitly accepts the AI consent terms.
2. **Independent Authorization:** Ordinary search permissions, subscription status (Plus/Pro), terms of service acceptance, and UGC room terms **do not constitute AI consent**.
3. **Separate Journal Choice:** Personal journal entries are treated with heightened privacy sensitivity. Journal content is never indexed or shared with an AI provider unless the user explicitly checks a separate, distinct journal opt-in toggle.
4. **Unconditional Vault Exclusion:** Items designated with `security_scope: 'vault'` (encrypted records, credentials, passwords, recovery keys) are strictly and unconditionally excluded from AI indexing, retrieval context, prompts, and citations.
5. **No Model Training:** Daynori strictly utilizes commercial API endpoints with verified contractual commitments that customer prompts and completions **are not used to train or improve foundation models**.
6. **Honest Retention Disclosures:** Daynori never misrepresents standard API temporary abuse monitoring retention (up to 30 days) as "Zero Data Retention." True Zero Data Retention requires an enterprise BAA.
7. **Transparent Cancellation Invariant:** User cancellation, timeout, or consent withdrawal stops local processing and discards model responses, but **cannot recall or un-transmit data that has already crossed the network boundary to an external provider**.

---

## 2. In-App User Consent Text (Verbatim Disclosure)

When a user enables AI in Settings (`AssistantPanel` on web or `AssistantSheet` on mobile), they are presented with the following explicit disclosure:

> ### **Enable Ask Nori & AI Assistant**
>
> Daynori uses advanced cloud artificial intelligence to answer questions about your notes, summarize tasks, and help organize your workspace.
>
> **What data is processed:**
> - When you ask a question, relevant snippets from your personal notes and tasks are securely sent to our inference provider (**OpenAI**) to generate grounded answers.
> - **Personal Journal:** Your journal entries are **excluded by default**. You can separately choose to include them below.
> - **Vault & Secrets:** Encrypted vault records, credentials, and passwords are **never sent to AI under any circumstances**.
>
> **How your data is protected:**
> - **No Model Training:** OpenAI does not use your private content to train their AI models.
> - **Temporary Retention:** Prompts and completions are held by OpenAI for up to 30 days solely for security and abuse prevention, then automatically deleted.
> - **Cancellation:** You can cancel an in-flight request at any time to discard the answer, but content already transmitted to the provider cannot be recalled.
> - **Disable & Purge:** You can turn off AI at any time. Turning off AI immediately deletes all derived search indexes from our servers.

---

## 3. Scope and Content Boundary Matrix

| Data Category | AI Status | Enforcement Mechanism | Failure Outcome |
|---|---|---|---|
| **Personal Notes** | Included upon consent | `scope.notes === true` in `isAiSourceKindEligible` | Eligible for chunking and retrieval context |
| **Personal Tasks** | Included upon consent | `scope.tasks === true` in `isAiSourceKindEligible` | Eligible for chunking and retrieval context |
| **Personal Journal** | **Excluded by default**; requires separate opt-in | `scope.journal === true` check | If unconsented, indexing and retrieval skip journal records |
| **Vault Records** | **Strictly Excluded Unconditionally** | `security_scope === 'vault'` check in domain and SQL | Indexing rejected (`source_excluded`); excluded from SQL retrieval filter |
| **Shared Rooms / Chat** | **Strictly Excluded** | `workspace.kind === 'personal'` check | Non-personal workspaces rejected with 403 `AI_SCOPE_FORBIDDEN` |
| **Deleted / Trashed Items** | **Strictly Excluded** | `deleted_at IS NULL` SQL join filter | Trashed items immediately purged from `app.ai_index_chunks` |

---

## 4. Subprocessor Disclosure

In accordance with GDPR Article 28 and privacy transparency standards, the third-party subprocessors for Daynori AI are documented below:

| Subprocessor | Entity | Processing Location | Purpose | Retention Window | Training on Data |
|---|---|---|---|---|---|
| **OpenAI** | OpenAI OpCo, LLC | United States | Cloud LLM inference (`gpt-4o-mini`) | Up to 30 days (abuse monitoring); deleted automatically | **No** (commercial API default) |
| **Google Cloud** *(Alternative)* | Google LLC | United States or European Union (pinned region) | Vertex AI LLM inference (`gemini-1.5-flash-002`) | Up to 55 days (standard abuse logging); 0 days if logging disabled | **No** (enterprise Vertex AI default) |

---

## 5. Model Output as Untrusted Data

Daynori treats all external provider responses as **untrusted input**:
1. **No Autonomous Mutations:** Model output is displayed purely as text or formatted proposals. A model completion can never directly modify database state, create items, or delete records.
2. **Confirmed Organizer Actions (Phase 56 / 93):** Any proposed organizer changes require opaque, server-signed confirmation tokens and explicit user interaction before execution.
3. **Bound Citations:** Model answers must cite exact `[source:uuid#rN]` markers matching authorized context chunks. Citations with missing revisions, bare UUIDs, or unretrieved records are rejected with `ABSTAIN`.
