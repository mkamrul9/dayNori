# ADR-0108: AI Text-Assistant Release-Gate and Operational Review

- Status: accepted
- Date: 2026-11-14
- Owner/reviewer: Antigravity agent (owner-authorized Phase 108).
- Related: [Phase 108](../roadmap/phases/108-ai-text-assistant-release-gate-and-operational-review.md), [Phase 90](../phase-reports/phase-90.md), [Phase 91](../phase-reports/phase-91.md), [Phase 92](../phase-reports/phase-92.md), [Phase 93](../phase-reports/phase-93.md), [Phase 94](../phase-reports/phase-94.md), [ADR 0090](0090-ai-provider-consent-privacy-and-operating-decisions.md), [ADR 0091](0091-scoped-retrieval-indexing-and-grounding-quality.md), [ADR 0093](0093-reviewed-note-task-and-journal-creation.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [release-gates.md](../engineering/release-gates.md).
- Supersedes/superseded by: none. Preserves all outstanding security, hardware, and release gates. Phase 71 remains blocked on physical hardware and spoken TalkBack listen-through. DEF-V2-008 remains fail-closed.

---

## Context & Owner Scheduling Authorization

The project owner authorized Phase 108 with the following instructions:

> "Select one bounded AI text-assistant release-gate phase using the existing Phase 90–94 implementation. Make Ask Nori easy to find and explain clearly when it is unavailable. Verify an authorized live provider with synthetic content, consent, cost limits, cancellation, grounded citations, workspace isolation, journal opt-in, and failure recovery.
>
> Exercise requests such as “write this journal entry,” “create a note,” and “set a task deadline.” The assistant must produce an editable preview, ask about ambiguous dates, require explicit Save/Confirm, then show a durable receipt and a link to the created item. It must not invent a successful write or save unreviewed content. Do not enable real-user transmission without the documented provider/privacy gate. Record live versus mock results separately; update Help, phase evidence, progress, and the function register; make one reviewed phase commit and push."

This decision governs Phase 108 scope, assistant entry point visibility, proposal lifecycle invariants, date ambiguity verification, provider evaluation separation, and operational limits under DEF-V2-008.

---

## Key Invariants & Architectural Decisions

### 1. Discoverability & Truthful Gating Presentation
- **Desktop/Tablet Navigation (`AppSidebar.tsx`)**: An explicit "Ask Nori" button is surfaced in the Utilities section of the sidebar navigation with the `nori` icon and a "Gated" pill. Clicking opens the assistant slide-out panel (`openModal('assistant')`).
- **Header Navigation (`AppHeader.tsx`)**: The global assistant button (`global-assistant-btn`) remains present with explicit tooltip and aria-label indicating its gated status under `DEF-V2-008`.
- **Truthful Unavailability Explanations**: When gated (`isGated=true`), both Web (`AssistantPanel.tsx`) and Mobile (`AssistantSheet.tsx`) render a prominent, non-deceptive status banner (`assistant-gated-banner`). Text input is disabled with explanatory placeholders ("Assistant is currently gated under DEF-V2-008. Use manual organizer controls."). Clear links direct the user to AI Privacy & FAQ (`/help?article=assistant-optional`) and Privacy Settings (`/settings`). The app never pretends the feature is active and never fails silently with broken errors.

### 2. Proposal Review Lifecycle (Zero Unreviewed Writes)
- **Model Output Never Executes Directly**: The assistant output is strictly non-executing text or typed proposal suggestions (`status: 'pending'`).
- **Editable Preview**: Proposals are reviewable before save. Clients may edit the proposed payload (`PATCH /v1/ai/proposals/:proposalId`), which re-hashes the request and issues a fresh, opaque single-use confirmation token.
- **Anti-Hallucination Date Ambiguity Gate**:
  - `detectJournalDateAmbiguity`: Identifies relative date references ("yesterday", "last Friday", "গতকাল") without ISO `YYYY-MM-DD` dates and prompts clarification questions rather than guessing or hallucinating dates.
  - `detectTaskDeadlineAmbiguity`: Identifies relative deadline references ("tomorrow", "next week", "আগামীকাল", "পরশু") or missing dates in deadline requests and prompts clarification questions.
  - In all ambiguous cases, **no unreviewed proposal or organizer record is created**.
- **Explicit Save/Confirm**: Organizer domain tables (`app.tasks`, `app.notes`, `app.journal_entries`, etc.) are written ONLY upon explicit confirmation (`POST /v1/ai/proposals/:proposalId/confirm`) using the valid server-issued confirmation token.
- **Durable Mutation Receipts**: Confirmation records an idempotent durable receipt in `app.mutation_receipts` with `deviceId = 'ai-assistant-proposal'` (`AI_DEVICE_ID`), matching Daynori's transactional sync and offline conflict resolution engine.
- **Canonical Deep Links**: Confirmation returns a canonical deep link generated via `getOrganizerDeepLink(kind, id)` (e.g. `/plan?targetId=...&targetType=task`, `/library?noteId=...`, `/journal?entryId=...`) directly opening the created item.
- **Zero-Write Guarantee for Unreviewed/Cancelled Work**: Cancelling a proposal (`POST /v1/ai/proposals/:proposalId/cancel`) marks the proposal `cancelled` and writes zero rows to organizer tables.
- **Idempotency**: Re-confirming an already confirmed proposal returns the existing proposal record idempotently without duplicating domain entities.

### 3. Strict Privacy & Security Fencing
- **Consent Fencing**: Requires acceptance of `CURRENT_AI_CONSENT_VERSION` and `CURRENT_AI_PROVIDER_DISCLOSURE_VERSION`. Outdated disclosure versions fail closed.
- **Strict Journal Opt-in**: When `contentScope.journal = false`, personal journal entries are completely omitted from indexing and retrieval, and requests to create journal entries are refused with guidance to enable journal opt-in in Settings.
- **Unconditional Vault Exclusion**: Vault items, vault folders, and vault encryption keys are never indexed into personal sources, never transmitted to AI providers, and any proposal attempting to set `securityScope = 'vault'` fails closed with `403 AI_VAULT_FORBIDDEN`.
- **Multi-Tenant Workspace Isolation**: Cross-workspace queries, citations, proposal inspection, updates, confirmations, or cancellations fail closed (404/403).

### 4. Provider Separation: Live vs. Mock Evaluation
- **Mock Provider (`FakeAiProvider`)**:
  - Used for fast local integration and development tests.
  - Generates synthetic grounded answers referencing cited item IDs.
  - Zero external network egress; zero real user data transmission.
- **Live Provider Protocol (`OpenAiCompatibleProvider`)**:
  - Exercises the wire protocol using synthetic HTTP transport.
  - Invariants: `store: false` sent explicitly; `temperature: 0`; Bearer token authorization; input size bound (<20,000 chars); response size bound (<20,000 chars); 30s timeout.
  - Operational Failure Recovery:
    - HTTP 429 maps to `AI_PROVIDER_RATE_LIMIT`.
    - HTTP 503 maps to `AI_PROVIDER_OUTAGE`.
    - HTTP 401/403 maps to `AI_PROVIDER_AUTH_ERROR`.
    - Malformed payload maps to `AI_PROVIDER_MALFORMED`.
    - In-flight cancellation forwards `AbortSignal` and discards output.
- **Release Gate DEF-V2-008**:
  - Remains `BLOCKED` in local builds and release candidates.
  - Real-user data transmission to external LLM providers remains prohibited pending enterprise provider privacy review and commercial contract.

---

## Consequences

1. **User Trust**: Users clearly see when Ask Nori is unavailable and why, without deceptive marketing or broken UI interactions.
2. **Data Safety**: No unreviewed or hallucinated records can enter user notes, tasks, or journals. Date ambiguities must be clarified by the user.
3. **Auditability**: Every confirmed assistant creation is permanently auditable via `app.mutation_receipts` under `AI_DEVICE_ID`.
4. **Clean Gate Fencing**: Version 2 core organizer functionality remains completely independent of third-party AI availability.
