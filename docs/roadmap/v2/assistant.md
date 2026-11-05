# V2 assistant, grounded retrieval, voice, and Nori

Status: planned for Phases 90–96. Build on [ADR 0052](../../decisions/0052-ai-provider-privacy-and-retrieval.md), [ADR 0053](../../decisions/0053-ai-assistant-confirmed-actions.md), and the [AI release gate](../../engineering/release-gates.md). No real-user content transmission or provider purchase is authorized by this roadmap.

## User experience

Open Ask Nori from an ordinary labeled assistant control or the optional companion. Desktop uses a side panel that preserves current context; mobile uses a dedicated screen with keyboard-safe composer. Offer a few relevant starting suggestions instead of an empty complicated configuration panel. All manual creation remains usable when AI is disabled, offline, unavailable, or out of budget.

Examples of required outcomes:

- “Create a note about my study plan.” Produce an editable note draft with destination, then Save and a link to the canonical note.
- “Today I went to class, met a friend, and felt tired. Write my journal.” Preserve supplied facts and tone; ask about an ambiguous entry date; preview the entry. Do not invent events or emotions. Save only after confirmation.
- “Make a routine for study every weekday at 8pm.” Resolve timezone and weekday meaning, show schedule and reminder capability, then confirm the supported routine definition.
- “Create a study section with notes and this week's tasks.” Compose approved blocks referencing authorized records. Do not generate arbitrary executable HTML, SQL, scripts, or a new unsupported data schema.
- “What did I plan for Friday?” Retrieve only the permitted workspace and opted-in sources; cite records and abstain when evidence is insufficient.
- “How do I restore a deleted note?” Use version-matched Help material; offer a safe deep link or guided tour. Never describe an unavailable feature as enabled.

## Provider and data controls

Phase 90 records provider candidates, supported structured outputs/tool calls, streaming/cancellation, languages, context/attachment limits, measured cost, retention/training terms, region, subprocessors, and incident/deletion behavior. Recheck current official provider documentation at implementation. Do not fix an unverified future model name or assume a no-storage request flag is contractual zero retention.

Use backend-only secrets and adapters. Explicit consent names which content classes may be indexed and transmitted; Journal is a separate default-off choice. Vault remains excluded. Shared rooms remain excluded unless a separately reviewed feature checks current membership at ingestion, retrieval, generation completion, and write execution. Consent revocation fences in-flight work and deletes derived artifacts under the published retention policy. Cancellation cannot recall data already transmitted to a provider.

## Retrieval-augmented generation

Use two distinct knowledge sources: versioned public Help and explicitly opted-in personal workspace content. Apply workspace/membership/capability and content-class filters before retrieval, then recheck source access before displaying citations or executing actions. A model must never decide whether a user is authorized.

Reuse existing full-text indexing and measure it against a synthetic English/Bangla known-answer set. Add embeddings/hybrid ranking/reranking only if measured benefit justifies storage, cost, deletion, and complexity. RAG requires good retrieval and source binding, not necessarily a vector database.

Index jobs are durable, idempotent, revision-aware, bounded, and scoped. Handle create/edit/move/archive/trash/restore/import/deletion, revoked consent, membership changes, stale versions, and reindex failures. Attachments need approved safe extraction, type/size/time bounds, scan gates, and independent user consent before indexing. Do not index every file or audio recording merely because it exists.

Responses bind citations to actual authorized retrieved records, with relevant excerpts and canonical deep links under preview privacy settings. Distinguish retrieved facts from generated suggestions; stale/missing content produces an explanation or abstention. Treat source documents as untrusted data. Embedded instructions cannot enable tools, broaden retrieval, reveal secrets, or override consent.

## Creation and mutation contracts

Generation yields typed proposals, not direct writes. Each proposal includes action type, target workspace/folder, source IDs where relevant, expected revisions, normalized dates/timezones, proposed fields, and a user-readable preview. All fields and cross-record references receive server validation.

The user can edit, remove individual proposed actions, cancel, or confirm. Existing Phase 56 explicit confirmation remains the baseline, including when the original message says “write and save.” Use one clear confirmation for an understood batch rather than redundant dialogs. Background unreviewed autosaving of model-generated content would require a separate owner-selected product/security decision and is not part of this plan.

Execute through existing application/domain services and the sync/mutation-receipt architecture. Bind stable operation IDs to the proposal, apply revision checks, and persist terminal status. Confirmation retries after timeout/process death cannot duplicate records. Show saved-local vs synchronized status honestly; a server-only AI operation requires network and must not fabricate offline completion.

Initial confirmed tool catalog in Phase 93: create/update Note, create Task, and create Journal entry using verified existing domain support. Phase 94 expands to Routine, Event, Folder, Knowledge note, and approved Custom section blocks, with explicit API/domain work where missing. Expense drafting is included only with currency/amount validation and confirmation. Audio/file attachments link only existing authorized uploads. Sharing, purchases, account deletion, vault actions, arbitrary filesystem access, arbitrary external URLs, and undeclared tools are excluded from autonomous execution.

Multi-action requests show ordered steps and declared transaction boundaries. If one step fails, preserve successful receipts and show remaining/failed steps. Retry only safe unfinished actions; never claim the batch was atomic unless the implementation actually provides a transaction. Update conflicts return a new reviewable proposal, preserving manual edits.

## Voice

Explicit tap starts recording, with a visible recording state, stop/cancel, supported duration/size limits, and permission-denied fallback. Provide text input everywhere. Do not implement always-listening behavior.

Use an approved transcription adapter chosen with its own retention/cost/language review. Show and let the user correct the transcript before sending it for generation or saving content. Handle Bangla/English code-switching, silence, interrupted uploads, slow network, unsupported formats, timeout, and app backgrounding. No irreversible action follows uncertain recognition. Publish whether raw audio is transient or explicitly retained; default to delete after the bounded transcription workflow unless the user separately saves an attachment.

## Nori companion

Working name and design direction are proposals: Nori, an original folded-paper character using Daynori's teal/ink palette. Phase 96 creates original assets, establishes provenance/name review, and validates a small recognizable silhouette. It is not an emoji, a borrowed character, or a copy of Codex's pet.

Specify idle, greeting, listening, thinking, success, error, offline, and sleeping states. Use short state changes, not continuous motion. The mascot is an optional launcher for the same assistant state, consent, and capabilities; its appearance never implies that content is being monitored. Users can hide it, change corner where safe, disable motion, or use a labeled button instead. It must not cover editors, Save, bottom navigation, Help, banners, or the keyboard. No unsolicited sound or emotional pressure to keep using the app.

## Evidence gate

Measure retrieval relevance/citation correctness, abstention, source revocation, prompt injection at application boundaries, proposal accuracy, confirmations, duplicate prevention, voice correction, cancellation, latency, and per-action cost on synthetic fixtures. Include direct cross-workspace and consent-revocation races. Fake-provider tests are useful engineering evidence but cannot establish live-provider intelligence or retention. Complete real authorized provider and device validation before enabling the assistant for users.
