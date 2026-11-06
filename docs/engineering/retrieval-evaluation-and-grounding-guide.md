# Retrieval Evaluation and Grounding Engineering Guide

**Phase:** 91 — Scoped retrieval, indexing, and grounding quality
**Audience:** Core platform, search, and AI assistant engineers
**Related Specifications:** [ADR 0091](../decisions/0091-scoped-retrieval-indexing-and-grounding-quality.md), [ADR 0052](../decisions/0052-ai-provider-privacy-and-retrieval.md), [ADR 0090](../decisions/0090-ai-provider-consent-privacy-and-operating-decisions.md), [assistant.md](../roadmap/v2/assistant.md).

---

## 1. Architectural Overview & Knowledge Partitioning

Daynori's retrieval-augmented generation (RAG) system enforces strict physical and logical partitioning between two knowledge sources:

```
                            User Query
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
       Instructional Intent?          Personal Data Query?
        (e.g. "How do I...")         (e.g. "What did I plan...")
                 │                             │
                 ▼                             ▼
   ┌───────────────────────────┐ ┌───────────────────────────┐
   │ Knowledge Source 1:       │ │ Knowledge Source 2:       │
   │ Versioned Public Help     │ │ Personal Workspace Items  │
   │ - Public & immutable      │ │ - Strict user opt-in      │
   │ - Versioned catalog       │ │ - Workspace-scoped        │
   │ - Multi-platform steps    │ │ - Standard scope only     │
   │ - Canonical deep links    │ │ - Revision-fenced         │
   └─────────────┬─────────────┘ └─────────────┬─────────────┘
                 │                             │
                 └──────────────┬──────────────┘
                                ▼
                   Authorized Citation Context
                                ▼
                       Grounded Synthesis
```

### Invariant 1: Source Isolation
Personal workspace content **never** enters the public Help catalog or shared cache storage. Public Help articles are code-shipped or content-versioned public documentation accessible to all users without authentication.

### Invariant 2: Personal Query Disambiguation
When a user query contains personal possessive markers (`my`, `mine`, `আমার`) without instructional intent, Help search is completely disabled. If the requested personal item is missing, deleted, or vault-locked, the system **must abstain** rather than regurgitating general Help articles.

---

## 2. Query Normalization & Multilingual Processing

### 2.1 Unicode and Script Preservation
Natural language text in English and Bengali requires Unicode category `\p{M}` (combining marks / viramas) to prevent splitting conjunct characters:

- **Defective Regex:** `/[^\p{L}\p{N}\s_-]+/gu` strips non-spacing vowel signs and viramas (e.g. `শুক্রবার` is corrupted into fragmented syllables `রব`, `পর`, `কল`).
- **Repaired Regex:** `/[^\p{L}\p{M}\p{N}\s_-]+/gu` preserves full Unicode combining marks for Bengali and other non-Latin scripts.

### 2.2 Curated Stop-Word Dictionaries
Natural language queries contain interrogatives ("what", "did", "for", "কী", "ছিল") that do not appear in terse notes ("Friday study plan"). `extractInformativeQueryTerms` tokenizes the query, classifies question intent, and extracts informative content terms using language-specific stop-word sets:

- **English Stop Words:** `a`, `about`, `an`, `and`, `are`, `as`, `at`, `be`, `by`, `can`, `did`, `do`, `does`, `for`, `from`, `how`, `i`, `in`, `is`, `it`, `me`, `my`, `of`, `on`, `or`, `our`, `that`, `the`, `their`, `this`, `to`, `was`, `we`, `were`, `what`, `when`, `where`, `which`, `who`, `will`, `with`, `you`, `your`.
- **Bengali Stop Words:** `এই`, `একটি`, `এবং`, `ও`, `করে`, `কী`, `কি`, `ছিল`, `জন্য`, `থেকে`, `না`, `পর`, `বা`, `হতে`, `হবে`, `হয়`, `হয়েছে`, `আমার`, `আমাদের`, `কিভাবে`, `কীভাবে`, `কোথায়`, `কবে`.

---

## 3. Smart Chunking & Ingestion Lifecycle

### 3.1 Sentence- and Boundary-Aware Chunking (`chunkTextSmart`)
Naive character-length chunking cuts words in half. `chunkTextSmart` chunks text along natural boundaries:

1. **Paragraphs:** Primary split on `\n\n`.
2. **Sentences:** Secondary split on sentence terminators: Bengali dori (`।`), question mark (`?`), exclamation mark (`!`), and period (`.`).
3. **Words:** Tertiary split on whitespace (`\s+`).
4. **Preservation:** Words are never split mid-character. Overlap carries full trailing sentences or words into the next chunk.

### 3.2 Concurrency & Revision Fencing
When a note is rapidly edited, background index jobs must not overwrite newer revisions with older content:

```sql
-- Fencing check in executeAiBackgroundJob:
SELECT revision FROM app.items WHERE id = $itemId;
-- If job.expectedRevision < item.revision:
-- Return status: 'fenced', errorCode: 'AI_SOURCE_REVISION_SUPERSEDED'
```

### 3.3 Attachment Ingestion Gates (`checkAttachmentAiEligibility`)
Attachments linked to items are evaluated before chunking:

| Criteria | Allowed | Rejected |
|---|---|---|
| **Security Scope** | `standard` | `vault` (unconditionally excluded) |
| **Quarantine Status** | `clean`, `verified` | `pending`, `quarantined`, `infected` |
| **Byte Size** | <= 200 KB (204,800 B) | > 200 KB (`file_too_large`) |
| **MIME Type** | `text/plain`, `text/markdown`, `text/csv`, `application/json` | Any binary, executable, audio, or image |

---

## 4. Grounding, Citations & Deep Linking

### 4.1 Citation Marker Grammar
The provider is instructed to cite sources using standard markers:
- Personal item: `[source:<uuid>#r<revision>]`
- Public Help: `[source:help:<articleId>#v<contentVersion>]`

### 4.2 Citation Binding (`bindAiCitations`)
The server validates every citation marker produced by the model:
1. Marker ID must match an item in the `authorized` retrieval list.
2. Fabricated UUIDs (e.g. from prompt injections) are stripped.
3. Canonical deep links are attached:
   - Personal note: `/notes?id=<uuid>`
   - Personal task: `/tasks?id=<uuid>`
   - Personal journal: `/journal?id=<uuid>`
   - Public Help: `/help?article=<articleId>`

---

## 5. Synthetic Evaluation Protocol

The retrieval pipeline is evaluated against a 16-case synthetic matrix (`artifacts/phase91/evaluation-dataset-v1.json`):

| Category | Cases | Target Recall / Abstention |
|---|---|---|
| Known-Answer Personal (EN, BN, Mixed) | 4 | Recall@1 = 1.0, MRR = 1.0 |
| Known-Answer Help (EN, BN, Paraphrase) | 3 | Recall@1 = 1.0, MRR = 1.0 |
| Ambiguous Entity Queries | 1 | Grounded answer with top ranked citation |
| Unknown Topic Queries | 1 | 100% Abstention (`insufficient_support`) |
| Stale Source Revisions | 1 | 100% Fenced (`AI_SOURCE_REVISION_SUPERSEDED`) |
| Trashed / Deleted Items | 1 | 100% Abstention (filtered at SQL layer) |
| Unconsented Journal Content | 1 | 100% Abstention (scope gate) |
| Cross-Workspace Isolation | 1 | 100% Abstention (RLS access check) |
| Vault Security Scope | 1 | 100% Abstention (vault exclusion) |
| Prompt Injection Resistance | 1 | Untrusted inert text; 0 fake citation leaks |
| Citation Fabrication | 1 | 100% Abstention / stripped invalid citations |

---

## 6. Live Synthetic Provider Package

A live synthetic test package (`artifacts/phase91/synthetic-provider-package.json`) is staged for explicit owner approval:
- **Provider & Model:** OpenAI API, model `gpt-4o-mini`.
- **Ceiling:** Max 5 requests, max 500 tokens/request, hard cost limit **$0.05 USD**.
- **Payload:** Strictly synthetic test data (plant care, HVAC maintenance, factual abstention, cancellation). Zero real user content, zero vault items, zero journal entries, zero PII.
- **Approval Gate:** Under repository instructions, no live provider HTTP calls are executed until explicit owner sign-off.
