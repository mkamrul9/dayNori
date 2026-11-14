# ADR-0114: Ask Nori Text-Assistant Release-Gate Verification and Reviewed Organizer Creation Audit

- Status: accepted
- Date: 2026-11-14
- Owner/reviewer: Antigravity agent (owner-authorized Phase 114).
- Related: [Phase 114](../roadmap/phases/114-daynori-ask-nori-text-assistant-release-gate-verification-and-reviewed-organizer-creation-audit.md), [Phase 90](../phase-reports/phase-90.md), [Phase 91](../phase-reports/phase-91.md), [Phase 92](../phase-reports/phase-92.md), [Phase 93](../phase-reports/phase-93.md), [Phase 94](../phase-reports/phase-94.md), [Phase 108](../phase-reports/phase-108.md), [ADR 0090](0090-ai-provider-consent-privacy-and-operating-decisions.md), [ADR 0091](0091-scoped-retrieval-indexing-and-grounding-quality.md), [ADR 0093](0093-reviewed-note-task-and-journal-creation.md), [ADR 0108](0108-ai-text-assistant-release-gate-and-operational-review.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ai-text-assistant-provider-and-operating-decisions.md](../engineering/ai-text-assistant-provider-and-operating-decisions.md), [release-gates.md](../engineering/release-gates.md).
- Supersedes/superseded by: none. Preserves all outstanding security, hardware, and release gates. Phase 71 remains blocked on physical hardware and spoken TalkBack listen-through. DEF-V2-008 remains strictly fail-closed.

---

## Context & Owner Scheduling Authorization

The project owner authorized Phase 114 with the following instructions:

> "Select one bounded Ask Nori text-assistant release-gate phase. Follow AGENTS.md and Phases 90–94/108. Prepare the provider, privacy, retention, region, cost ceiling, consent, and kill-switch decision for owner review. Use synthetic prompts for initial live provider tests only after authorized credentials and spending are available; never send real user content as a test.
>
> Verify grounded answers and citations, abstention, workspace isolation, journal opt-in, vault exclusion, cancellation, outage/rate-limit handling, and budget settlement. Test “create a note,” “write this journal,” and “set a deadline” through editable proposals, date clarification, explicit confirmation, durable receipts, idempotent retry, and working deep links. Test the actual web/mobile interface, not only domain functions. Keep AI disabled for users until live evidence and provider terms pass. Correct the report and function register; commit and push one reviewed phase."

This decision governs Phase 114 scope, the commercial provider and operating decisions package for owner review, privacy and minimization bounds, the 3-tier kill-switch architecture, empirical verification of grounded retrieval and abstention, the 7-step reviewed organizer creation lifecycle across web and mobile interfaces, and the maintenance of release gate DEF-V2-008 under ADR 0074.

---

## Review of Prior Foundations (Phases 90–94 & 108)

1. **Phase 90 Consent & Provider Abstraction ([ADR 0090](0090-ai-provider-consent-privacy-and-operating-decisions.md))**:
   - Established versioned consent (`CURRENT_AI_CONSENT_VERSION = 1`, `CURRENT_AI_PROVIDER_DISCLOSURE_VERSION = 1`).
   - Implemented provider interface abstraction (`AiProvider`) and mock provider (`FakeAiProvider`).
   - Implemented client gating banner and fail-closed gate `DEF-V2-008`.

2. **Phase 91 Scoped Retrieval & Grounding Quality ([ADR 0091](0091-scoped-retrieval-indexing-and-grounding-quality.md))**:
   - Built scoped personal retrieval pipeline (`buildGroundingContext`) strictly isolated by workspace ID.
   - Enforced default-off journal exclusion and unconditional vault omission.
   - Evaluated grounded citations (`[source:<id>#r<index>]`) and out-of-domain abstention (`ABSTAIN:`).

3. **Phase 92 & 93 Proposal Review & Durable Receipts ([ADR 0093](0093-reviewed-note-task-and-journal-creation.md))**:
   - Designed proposal review lifecycle: model outputs typed suggestions (`status: 'pending'`); never auto-writes.
   - Confirmation writes to domain tables and writes durable mutation receipts (`AI_DEVICE_ID = 'ai-assistant-proposal'`).
   - Implemented date ambiguity detection for journal and task creation.

4. **Phase 94 & 108 Operational Hardening & UI Presentation ([ADR 0108](0108-ai-text-assistant-release-gate-and-operational-review.md))**:
   - Integrated budget windows in PostgreSQL (`app.ai_budget_windows` and `app.ai_create_reservation`).
   - Enforced operational error mapping (429 -> `AI_PROVIDER_RATE_LIMIT`, 503 -> `AI_PROVIDER_OUTAGE`).
   - Surfaced discoverable entry points in Desktop Sidebar (`AppSidebar.tsx`), Header (`AppHeader.tsx`), and Mobile Launcher (`NoriCompanionLauncher.tsx`).

---

## Commercial Provider Evaluation & Operating Decisions for Owner Review

Phase 114 authors a comprehensive operational decisions package ([docs/engineering/ai-text-assistant-provider-and-operating-decisions.md](../engineering/ai-text-assistant-provider-and-operating-decisions.md)) for owner sign-off:

### 1. Provider Comparison & Commercial Terms
- **Primary Recommendation: Google Cloud Vertex AI (Gemini 1.5 Flash)**:
  - *Enterprise Invariant*: Zero customer data used for model training or foundation improvement by default under Google Cloud Terms of Service.
  - *Compliance*: Covered by standard Google Cloud Data Processing Addendum (DPA) with EU Standard Contractual Clauses (SCCs).
  - *Data Retention*: Ephemeral processing; zero prompt or completion logging to disk by the provider.
  - *Cost Efficiency*: Approximately \$0.075 / 1M input tokens, \$0.30 / 1M output tokens (well within Daynori's financial bounds).
- **Secondary / Protocol Compatibility: OpenAI (GPT-4o-mini)**:
  - Wire-compatible via `OpenAiCompatibleProvider`.
  - Enterprise Zero Data Retention (ZDR) and Business DPA required before public enablement.

### 2. Privacy & Minimization Invariants
- **PII Minimization**: Queries and retrieved context pass through redaction and token length bounding (max 20,000 characters).
- **Unconditional Vault Exclusion**: Enforced at domain layer via `isVaultAiTarget(kind, securityScope)`. Any entity or proposal with `securityScope = 'vault'` is rejected fail-closed with HTTP 403 `AI_VAULT_FORBIDDEN`.
- **Strict Journal Opt-in**: Personal journal entries are excluded by default (`contentScope.journal = false`). When disabled, journal items are excluded from retrieval and journal creation requests fail with `403 AI_JOURNAL_OPT_IN_REQUIRED`.
- **Multi-Tenant Workspace Isolation**: Every retrieval query, proposal creation, update, confirmation, or cancellation is bound strictly to `auth.workspace_id`. Cross-workspace operations return HTTP 404 / 403.

### 3. Retention & Ephemeral Storage
- **Daynori Application DB**: Assistant prompt history and conversation turns are stored only in client local state and ephemeral server memory during the request.
- **Wiping & Deletion**: Users may delete individual turns (`DELETE /v1/ai/history/:turnId`) or wipe the entire conversation history (`DELETE /v1/ai/history`).
- **Provider Side**: Contracts must enforce zero retention beyond a strict 30-day transient abuse/security window.

### 4. Geographic Region Pinning
- Cross-border data flows are restricted. Outbound LLM provider requests are pinned to explicit regional endpoints:
  - Google Cloud Vertex AI: `us-central1` (US tenant pool) or `europe-west1` (EU tenant pool).
  - Unpinned or dynamically routed global LLM endpoints are prohibited.

### 5. Cost Ceilings & Concurrency-Safe Budget Settlement
- **Hard Ceilings**:
  - Daily Ceiling: \$1.00 USD per workspace per rolling 24-hour day.
  - Monthly Ceiling: \$10.00 USD per workspace per calendar month.
- **Reservation Protocol**:
  - Before invoking the provider, the server calls `app.ai_create_reservation(user_id, token_estimate, budget_limit)` within a transactional PostgreSQL function.
  - If requested tokens exceed the remaining budget window, the function raises `AI_BUDGET_EXHAUSTED` and the server immediately returns HTTP 429 without making external provider calls.
  - Concurrency safety prevents race conditions and overdrafts.

### 6. Three-Tier Kill-Switch Architecture
1. **Tier 1 (Server Environment Override)**:
   - Setting `DAYNORI_AI_KILL_SWITCH = 'true'` in the server environment (or system process) immediately short-circuits all AI routes (`/v1/ai/*`) and returns HTTP 503 `AI_KILL_SWITCH_ACTIVE`.
2. **Tier 2 (Workspace Tenant Toggle)**:
   - Workspace administrators can toggle `ai_enabled = false` in workspace settings, returning HTTP 403 `AI_WORKSPACE_DISABLED` for all members.
3. **Tier 3 (Client UI Gating Banner)**:
   - When release gate `DEF-V2-008` is active, the UI renders the informative gating banner in `AssistantPanel.tsx` and `AssistantSheet.tsx`, disabling input controls with guidance to manual tools.

### 7. Synthetic Testing Protocol
- **Zero Real User Data Egress**: In accordance with project policy, under no circumstances will real user journals, notes, tasks, or identities be used for provider validation.
- All testing uses strictly synthetic test fixtures.

---

## 7-Step Reviewed Organizer Creation Lifecycle

Daynori assistant proposal execution strictly adheres to the 7-step reviewed lifecycle:

1. **User Prompt & Date Ambiguity Check**:
   - The user inputs a natural language prompt (e.g. "write this journal entry", "create a note", "set a task deadline").
   - Relative dates ("yesterday", "tomorrow", "next week", "গতকাল", "আগামীকাল") are flagged by `detectJournalDateAmbiguity` and `detectTaskDeadlineAmbiguity`.
   - The assistant asks clarification questions rather than guessing or hallucinating dates.
2. **Pending Proposal Generation**:
   - Assistant outputs typed payload (`kind: 'note' | 'journal' | 'task' | ...`) with `status: 'pending'` and a server-issued confirmation token.
   - **Zero writes occur to organizer domain tables**.
3. **Editable Preview**:
   - The UI renders an editable preview card showing all proposed fields (title, content, tags, due date, priority).
   - The user can modify any field prior to saving (`PATCH /v1/ai/proposals/:proposalId`), which re-hashes the proposal and invalidates the previous confirmation token.
4. **Explicit Confirmation**:
   - The user must click an explicit "Save / Confirm" button.
   - The client submits `POST /v1/ai/proposals/:proposalId/confirm` with the active confirmation token.
5. **Durable Mutation Receipt**:
   - The database transaction inserts the entity into domain tables (`app.notes`, `app.journal_entries`, `app.tasks`) and simultaneously writes a durable receipt into `app.mutation_receipts` with `deviceId = 'ai-assistant-proposal'` (`AI_DEVICE_ID`).
   - Ensures full integration with transactional sync and offline conflict resolution.
6. **Canonical Deep Link Delivery**:
   - Confirmation returns a canonical deep link generated by `getOrganizerDeepLink(kind, id)` (e.g. `/library?noteId=...`, `/journal?entryId=...`, `/plan?targetId=...&targetType=task`).
   - Clicking opens the exact created entity in its native organizer view.
7. **Idempotent Retry & Zero-Write Cancellation**:
   - Submitting confirmation a second time returns the existing proposal idempotently without creating duplicate organizer records.
   - Explicit cancellation (`POST /v1/ai/proposals/:proposalId/cancel`) marks the proposal `cancelled` and writes zero records to organizer tables.

---

## Actual Web and Mobile Interface Verification

Phase 114 verifies the actual web and mobile interfaces rather than domain functions alone:
- **Web Interface (`apps/web`)**:
  - `AssistantPanel.tsx`: Verified truthful gating presentation (`DEF-V2-008`), disabled text areas and buttons when gated, proposal review flows, field editing, explicit confirm/cancel buttons, deep links, and sanitized markdown rendering.
  - `AppSidebar.tsx` & `AppHeader.tsx`: Verified accessible entry points, "Gated" pills, tooltip indicators, and keyboard accessibility.
- **Mobile Interface (`apps/mobile`)**:
  - `AssistantSheet.tsx`: Verified React Native rendering via `TestRenderer`, truthful gating banner, disabled ask action when gated, and dismissible sheet actions.
  - `NoriCompanionLauncher.tsx`: Verified accessible touch target (min 44x44), clear accessibility label, and click handler opening the assistant.

---

## Empirical Verification Summary

Phase 114 delivers a total of 26 automated tests verifying the release gate:
- **16 Integration Tests (`tests/integration/phase114-ask-nori-assistant-release-gate.test.ts`)**:
  - Consent fencing & version lock.
  - Server kill-switch (`DAYNORI_AI_KILL_SWITCH = 'true'`) returning 503.
  - Multi-tenant workspace isolation.
  - Strict journal exclusion when opt-in is disabled.
  - Journal inclusion when opt-in is enabled.
  - Unconditional vault exclusion (`isVaultAiTarget`) returning 403.
  - Grounded citations (`[source:<id>#r1]`) and anti-hallucination abstention (`ABSTAIN:`).
  - In-flight cancellation via `AbortController`.
  - Error mapping (429 rate limit, 503 outage).
  - Concurrency-safe budget reservation & 429 exhaustion.
  - Note creation flow: editable preview -> confirm -> durable receipt (`AI_DEVICE_ID`) -> deep link (`/library?noteId=...`).
  - Journal flow: ambiguous date clarification -> explicit date confirm -> durable receipt -> deep link (`/journal?entryId=...`).
  - Deadline flow: ambiguous deadline clarification -> explicit deadline confirm -> durable receipt -> deep link (`/plan?targetId=...&targetType=task`).
  - Idempotent retry preventing duplicates.
  - Proposal cancellation with zero organizer writes.
  - Live provider wire protocol (`store: false`, `temperature: 0`, Bearer token).
- **8 UI Interface Tests (`tests/unit/phase114-ask-nori-ui-interface.test.ts`)**:
  - Web gating banner presentation & form disabling.
  - Proposal card rendering, editable preview, and explicit confirm/cancel actions.
  - Sidebar & Header navigation buttons with "Gated" pills.
  - Mobile launcher floating action button & accessibility labels.
  - Canonical organizer deep link paths.
  - Markdown citation rendering & HTML sanitization.
  - Button touch targets & focus styles.
  - Mobile sheet component structure.
- **2 Mobile View Tests (`apps/mobile/src/phase114-assistant-mobile-views.test.ts`)**:
  - `AssistantSheet` renders truthful gating banner under `DEF-V2-008` with disabled controls.
  - `AssistantSheet` input updates state and responds to close actions.

---

## Standing Release Gates & Fail-Closed Status

Live commercial AI provider integration remains fail-closed under `DEF-V2-008` (`missing_ai_provider_config` recorded in `artifacts/phase114/live-blocked.json`). No live provider credentials or spend authorizations are present in the environment, and zero real user content has been transmitted.

All other standing release gates remain intact:
- `DEF-V2-001`: Core offline sync & conflict resolution.
- `DEF-V2-004`: Storage and export data preservation.
- `DEF-V2-005`: Google Drive integration (fail-closed under Phase 113).
- `DEF-V2-007`: Real-time rooms & collaboration.
- `DEF-V2-008`: AI text assistant (fail-closed under Phase 114).
- `DEF-V2-011`: Voice capture & transcription (fail-closed under Phase 109).
- `DEF-V2-013`: Billing & subscription metering.
- `OWNER-SIGNING-KEYS` & `OWNER-RELEASE-AUTH`: Release binary publication gates.
- `Phase 71`: Native Android physical device and spoken TalkBack verification.
