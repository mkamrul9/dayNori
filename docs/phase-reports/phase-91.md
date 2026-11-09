# Phase 91: Scoped retrieval, indexing, and grounding quality

## Identity and scope

- Phase: [91 — Scoped retrieval, indexing, and grounding quality](../roadmap/phases/91-scoped-retrieval-indexing-and-grounding-quality.md).
- Status: **blocked** — Foundational implementation, evaluation dataset, and independent verification complete: natural language interrogatives in FTS repaired (RET-001) via `extractInformativeQueryTerms` and multi-token ranking; dual knowledge sources partition implemented and verified (RET-002) with public versioned Help vs opted-in personal items; Bengali combining marks preserved (RET-003) via `\p{M}` regex; boundary-aware smart chunking implemented and verified (RET-004) via `chunkTextSmart`; background index concurrency fencing implemented and verified (RET-005) with `expectedRevision` rejecting stale updates with `AI_SOURCE_REVISION_SUPERSEDED`; attachment ingestion security gates implemented and verified (RET-006) via `checkAttachmentAiEligibility` enforcing clean/verified scan status, standard scope, size limits, and plain text MIME allowlist; citation binding upgraded (RET-007) with `AiCitationSchema` supporting Help articles and canonical deep links; prompt injection treated as inert data with hallucinated citation rejection verified (RET-008); 16-case synthetic evaluation matrix executed with 100% recall on known answers, 0 privacy leaks, and 100% abstention on ungrounded/vault/stale queries; 7 test suites with 141 tests passing; production AI activation and live provider calls remain fail-closed pending explicit owner approval of live synthetic test and enterprise provider contract (`DEF-V2-008` retained).
- Contributor/date: Antigravity agent, 2026-11-06.
- Base revision/branch: `8e645806ab235164cff0ea2e4a18f80cc8f0f800`, `codex/free-core-preview`.
- Hard prerequisites: Phase **90**.
- Owner Scheduling Authorization: The owner authorized Phase 91 implementation and independent retrieval evaluation before Phase 90 final acceptance ([ADR 0091](../decisions/0091-scoped-retrieval-indexing-and-grounding-quality.md)). Phase 91 is recorded as `blocked` due to unmet owner live synthetic test approval and enterprise contract gates (`DEF-V2-008` retained). Outstanding checks for Phases 71, 75, 80, 81, 84, 85, 86, 87, 88, 89, 90, and 99 remain preserved. Standing push authorized under ADR 0074. No unverified production capability, live calls, or paid infrastructure claimed.

---

## Result

### Implementation and Verifications Delivered

1. **Natural Language FTS & Interrogative Stop-Word Filtering (RET-001 Remediation):**
   - Implemented `extractInformativeQueryTerms` in `@daynori/domain/src/aiConsent.ts` featuring curated English and Bengali stop-word dictionaries.
   - Natural language questions (e.g. "What did I plan for Friday study session?") strip non-informative interrogatives ("what", "did", "for"), extracting informative content terms (`['plan', 'friday', 'study', 'session']`).
   - In `apps/api/src/modules/ai/service.ts`, queries employ multi-token prefix matching (`:*`), `ts_rank` relevance ordering, and fallback ILIKE.

2. **Dual Knowledge Sources & Help Partitioning (RET-002 Remediation):**
   - Partitioned knowledge into two strictly isolated sources:
     - **Knowledge Source 1:** Versioned public Help catalog (`HELP_ARTICLES`), matched via `findRelevantHelpArticles` with bilingual concept mapping. Help content is public, immutable, and versioned.
     - **Knowledge Source 2:** Explicitly opted-in personal workspace content (`app.ai_index_chunks`), strictly filtered by workspace ownership, user consent generation, and unencrypted standard scope.
   - When a user query exhibits personal possessive pronouns (`my`, `mine`, `আমার`) without instructional intent, Help search is completely bypassed. Personal user content never enters the public Help catalog or shared cache storage.

3. **Multilingual Unicode & Script Integrity (RET-003 Remediation):**
   - Upgraded tokenization regex from `[^\p{L}\p{N}\s_-]` to `[^\p{L}\p{M}\p{N}\s_-]`, explicitly preserving Unicode category `\p{M}` (non-spacing marks / viramas).
   - Preserves Bengali conjunct characters (e.g. `শুক্রবার` is parsed intact rather than broken into fragmented syllables).

4. **Sentence- and Boundary-Aware Smart Chunking (RET-004 Remediation):**
   - Implemented `chunkTextSmart` in `@daynori/domain/src/aiConsent.ts`.
   - Chunks text along natural hierarchy: paragraphs (`\n\n`), sentence boundaries (Bengali dori `।`, `?`, `!`, `.`), and word boundaries (`\s+`). Words are never split mid-character.

5. **Background Index Concurrency & Revision Fencing (RET-005 Remediation):**
   - Added `expectedRevision` parameter to `enqueueAiIndexSource` and `app.ai_index_jobs`.
   - In `apps/api/src/modules/ai/jobExecutor.ts`, background indexing inspects current `item.revision`. If `expectedRevision < item.revision`, the stale job cleanly fences with `AI_SOURCE_REVISION_SUPERSEDED`, preventing race conditions.

6. **Attachment Ingestion Security Gates (RET-006 Remediation):**
   - Implemented `checkAttachmentAiEligibility` in `@daynori/domain/src/aiConsent.ts`.
   - Attachments are indexed only if quarantine status is `'clean'` or `'verified'`, security scope is `standard` (vault files are unconditionally excluded), size is <= 200 KB, and MIME type is on the strict plain text allowlist (`text/plain`, `text/markdown`, `text/csv`, `application/json`).

7. **Citation Schema & Canonical Deep Links (RET-007 Remediation):**
   - Upgraded `AiCitationSchema` in `@daynori/contracts/src/api/ai.ts` to support string item identifiers (`help:articleId` alongside UUIDs), up to 800-character excerpts, and optional `deepLink`.
   - Updated `bindAiCitations` in `@daynori/domain/src/aiConsent.ts` to attach canonical navigation URLs (`/help?article=...`, `/notes?id=...`, `/tasks?id=...`).

8. **Prompt Injection Resistance & Fabrication Rejection (RET-008 Remediation):**
   - Retrieved document text is treated as inert untrusted data (`treatRetrievedTextAsUntrustedData`).
   - Citation binding in `bindAiCitations` strictly enforces set intersection: citation markers referencing UUIDs or articles not present in the authorized retrieval list are immediately stripped.

9. **Evaluation Dataset & Synthetic Test Package Delivered:**
   - Authored `artifacts/phase91/evaluation-dataset-v1.json` (16 test cases across 11 categories).
   - Executed full evaluation matrix in `artifacts/phase91/measured-evaluation-results.json` (100% recall on known answers, 0 privacy leaks, 100% abstention on ungrounded/vault/stale queries).
   - Authored `docs/engineering/retrieval-evaluation-and-grounding-guide.md` documenting query normalization, chunking invariants, Help/personal isolation, citation binding, and runbooks.
   - Authored `docs/decisions/0091-scoped-retrieval-indexing-and-grounding-quality.md` (ADR 0091).
   - Prepared `artifacts/phase91/synthetic-provider-package.json` for owner review and approval prior to any live provider calls.

---

## Gate Limitations & Operational Status (Truthfully Recorded)

| Gate / Requirement | Target | Result | Reason |
| --- | --- | --- | --- |
| `ownerSyntheticTestApproval` | Explicit Owner Approval | **pending** | Awaiting owner review and sign-off on `synthetic-provider-package.json` (`DEF-V2-008`). |
| `liveProviderCalls` | Live Provider Execution | **prohibited** | Real provider network calls prohibited until explicit owner approval is granted. |
| `productionAiActivation` | Production AI Gate | **fail-closed** | `isAiLocallyEnabled()` strictly returns `false` in production. |
| `realUserContentTransmission` | Zero Real User Content | **pass** | No real user notes, journal entries, or vault data transmitted; synthetic test data only. |
| `knowledgePartitioning` | Public Help / Personal Isolation | **pass** | Personal notes never enter public Help index; Help search bypassed on personal queries. |
| `unconditionalVaultExclusion` | Zero Vault Exposure | **pass** | Vault records unconditionally excluded from indexing, retrieval, and citations. |
| `attachmentSafetyGates` | Strict Quarantine & MIME Check | **pass** | Unscanned, infected, binary, and oversized attachments strictly excluded. |
| `revisionFencing` | Stale Index Race Prevention | **pass** | Out-of-order background index jobs fenced with `AI_SOURCE_REVISION_SUPERSEDED`. |
| `citationGrounding` | Zero Hallucinated Citations | **pass** | Fabricated citation markers stripped; canonical deep links attached to authorized sources. |

Production AI remains **fail-closed** (`isAiLocallyEnabled()` returns `false` in production). `DEF-V2-008` is retained in `docs/roadmap/v2/function-register.json`.

Evidence files:
- `artifacts/phase91/findings-register.json`
- `artifacts/phase91/evaluation-dataset-v1.json`
- `artifacts/phase91/measured-evaluation-results.json`
- `artifacts/phase91/synthetic-provider-package.json`
- `artifacts/phase91/manual-ui-evidence.json`
- `artifacts/phase91/evidence-summary.json`
- `docs/engineering/retrieval-evaluation-and-grounding-guide.md`
- `docs/decisions/0091-scoped-retrieval-indexing-and-grounding-quality.md`

---

## Automated Evidence

| Test Suite | Result |
| --- | --- |
| `tests/integration/phase91-scoped-retrieval-evaluation.test.ts` | Pass (7 tests) |
| `packages/domain/src/domain.test.ts` | Pass (90 tests) |
| `tests/integration/phase90-ai-consent-privacy-readiness.test.ts` | Pass (10 tests) |
| `tests/integration/phase55-ai-privacy-retrieval.test.ts` | Pass (9 tests) |
| `tests/integration/phase55-ai-repair.test.ts` | Pass (7 tests) |
| `tests/integration/phase56-ai-assistant-actions.test.ts` | Pass (12 tests) |
| `tests/integration/phase56-ai-repair.test.ts` | Pass (6 tests) |
| Total AI Test Coverage | Pass (141/141 tests) |
| TypeScript check (`@daynori/domain`) | Pass (`tsc -b`) |
| TypeScript check (`@daynori/api`) | Pass (`tsc -b`) |
