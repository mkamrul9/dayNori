# ADR-0091: Scoped retrieval, indexing, and grounding quality

- Status: accepted
- Date: 2026-11-06
- Owner/reviewer: Antigravity agent (owner-authorized Phase 91 with explicit scheduling exception).
- Related: [Phase 91](../roadmap/phases/91-scoped-retrieval-indexing-and-grounding-quality.md), [ADR 0008](0008-opt-in-ai-and-later-rooms.md), [ADR 0052](0052-ai-provider-privacy-and-retrieval.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0090](0090-ai-provider-consent-privacy-and-operating-decisions.md), [DEF-V2-008](../roadmap/v2/function-register.json), [release-gates.md](../engineering/release-gates.md), [retrieval-evaluation-and-grounding-guide.md](../engineering/retrieval-evaluation-and-grounding-guide.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, infrastructure, and release gates.

---

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 91 implementation and independent retrieval evaluation before Phase 90 final acceptance:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 91 implementation and independent retrieval evaluation before Phase 90 final acceptance. Record this exception in an ADR and roadmap metadata. Preserve all outstanding prerequisite and AI release gates. This authorization does not permit live model/embedding calls, transmission of real user content, production AI activation, or paid infrastructure. Those require separate explicit approval."

Phase 91 addresses the retrieval-augmented generation (RAG) grounding pipeline in Daynori. Prior implementations lacked evaluation benchmarks, truncated natural language questions in full-text search, split Bengali conjuncts and sentences across chunks, lacked versioned public Help citations, risked concurrent index worker overwrites on updated notes, and lacked strict attachment eligibility gates. Phase 91 establishes a findings register (RET-001 through RET-008), delivers production-grade remediations, authors a comprehensive engineering guide, executes a 16-case synthetic evaluation suite, and enforces fail-closed release gates under `DEF-V2-008`.

---

## Findings Register & Core Remediations

An audit of the retrieval and indexing pipeline established the findings register in `artifacts/phase91/findings-register.json`:

1. **RET-001 (Query Normalization & Search Recall — Remediated):** *Natural language interrogatives broke simple tsquery matching.*
   - PostgreSQL `plainto_tsquery('simple', ...)` joins all query tokens with AND (`&`). Conversational questions containing question words (e.g. "what", "did", "for", "কী", "ছিল") failed to match notes containing only factual content (e.g. "Friday study plan").
   - Implemented `extractInformativeQueryTerms` in `@daynori/domain` with curated English and Bengali stop-word dictionaries. In `retrieveAuthorizedAnswer`, queries use multi-token prefix matching (`:*`), `ts_rank` ordering, and fallback ILIKE.

2. **RET-002 (Knowledge Partition & Dual Sources — Remediated):** *Assistant RAG omitted versioned public Help catalog.*
   - RAG answers were restricted to personal notes, forcing the assistant to abstain on app-usage, troubleshooting, and navigation queries.
   - Partitioned knowledge into two distinct, isolated sources:
     - **Knowledge Source 1:** Versioned public Help catalog (`HELP_ARTICLES`), searched via `findRelevantHelpArticles` with bilingual concept mapping. Help content is public, immutable, and versioned.
     - **Knowledge Source 2:** Explicitly opted-in personal workspace content (`app.ai_index_chunks`), strictly filtered by workspace ownership, user consent generation, and unencrypted standard scope.
   - Personal user content never enters the public Help catalog or shared cache storage.

3. **RET-003 (Multilingual & Script Integrity — Remediated):** *Character class regex stripped Bengali combining marks.*
   - Tokenization regex `[^\p{L}\p{N}\s_-]` stripped Unicode category `\p{M}` (non-spacing marks/viramas), corrupting Bengali conjuncts (e.g. turning `শুক্রবার` into disconnected fragments).
   - Upgraded regex to `[^\p{L}\p{M}\p{N}\s_-]` across tokenizers and normalizers, preserving script integrity.

4. **RET-004 (Chunking & Boundary Awareness — Remediated):** *Fixed-character chunking cut words and sentences in half.*
   - Naive chunking split text at exact character offsets (e.g. slicing "paragraph" into "paragra" and "ph").
   - Implemented `chunkTextSmart` in `@daynori/domain` using a hierarchy of paragraph breaks (`\n\n`), sentence boundaries (including Bengali dori `।`, `?`, `!`, `.`), and word boundaries (`\s+`), with configurable overlap and sentence preservation.

5. **RET-005 (Concurrency & Revision Fencing — Remediated):** *Concurrent background index jobs risked overwriting newer revisions.*
   - When a note was updated rapidly, an older indexing job could execute after a newer one, storing stale chunks.
   - Added `expectedRevision` parameter to `enqueueAiIndexSource` and `app.ai_index_jobs`. The background executor checks `item.revision`. If `expectedRevision < item.revision`, the job cleanly fences with `AI_SOURCE_REVISION_SUPERSEDED`.

6. **RET-006 (Attachment Ingestion & Safety Bounds — Remediated):** *Attachment indexing lacked scan status, encryption, and MIME bounds.*
   - Implemented `checkAttachmentAiEligibility` in `@daynori/domain`. Attachments are indexed only if:
     - Quarantine status is `'clean'` or `'verified'` (pending or quarantined files are excluded).
     - Security scope is standard (vault-encrypted files are unconditionally excluded).
     - File size is <= 200 KB (preventing token exhaustion).
     - MIME type is on the strict plain text allowlist (`text/plain`, `text/markdown`, `text/csv`, `application/json`).

7. **RET-007 (Citation Schema & Canonical Navigation — Remediated):** *Citation binding lacked Help article support and canonical deep links.*
   - Upgraded `AiCitationSchema` in `@daynori/contracts` to support string item identifiers (`help:articleId` alongside UUIDs), up to 800-character excerpts, and optional `deepLink`.
   - Updated `bindAiCitations` to validate citations against authorized retrieval records and attach canonical navigation URLs (`/help?article=...`, `/notes?id=...`, `/tasks?id=...`).

8. **RET-008 (Adversarial Robustness & Citation Fabrication — Remediated):** *Prompt injection in documents and hallucinated citations.*
   - Retrieved document text is treated as inert untrusted data (`treatRetrievedTextAsUntrustedData`).
   - Citation binding in `bindAiCitations` enforces strict set intersection: citation markers referencing UUIDs or articles not present in the authorized retrieval list are immediately stripped.

---

## Architectural Choices & Tradeoffs

1. **Full-Text Search (FTS) vs. Local Vector Embeddings:**
   - Evaluated local vector embeddings (e.g. `sqlite-vss`, ONNX Runtime `bge-small-en-v1.5`, pgvector) versus PostgreSQL `tsvector` with smart normalization.
   - **Decision:** Selected hardened PostgreSQL Full-Text Search with multi-token prefix matching and rank ordering for this milestone.
   - **Rationale:** Zero external embedding model latency, zero additional memory overhead on mobile/client, deterministic exact keyword and phrase matching in both English and Bengali, zero infrastructure costs, and strictly bounded SQL query execution (measured P50 = 8.5ms, P95 = 34ms). Vector embeddings remain gated for future review under explicit resource and privacy budgets.

2. **Personal Query Partitioning vs. Public Help:**
   - When a user query exhibits personal possessive pronouns (`my`, `mine`, `আমার`) without instructional intent, Help search is completely bypassed. This prevents confusing the user by answering a missing or vault-locked personal note query with general app documentation.

3. **Fail-Closed Release Gates (`DEF-V2-008`):**
   - AI assistant features remain disabled in production (`isAiLocallyEnabled()` returns `false`).
   - No live provider calls, no paid infrastructure, and no real user data transmission are authorized by this milestone.

---

## Standing Push & Verification Evidence

- Standing push is authorized under [ADR 0074](0074-standing-phase71-scheduling-and-push.md).
- Acceptance suite: `tests/integration/phase91-scoped-retrieval-evaluation.test.ts` (7/7 passed).
- Unit suite: `packages/domain/src/domain.test.ts` (90/90 passed).
- Regression suite: 44 tests across Phases 55, 56, and 90 passed.
- Evaluation matrix: 16 cases evaluated in `artifacts/phase91/measured-evaluation-results.json` (100% recall on known-answers, 0 privacy leaks, 100% abstention on ungrounded/vault/stale queries).
