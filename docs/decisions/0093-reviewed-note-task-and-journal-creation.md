# ADR-0093: Reviewed note, task, and journal creation

- Status: accepted
- Date: 2026-11-09
- Owner/reviewer: Antigravity agent (owner-authorized Phase 93 with explicit scheduling exception).
- Related: [Phase 93](../roadmap/phases/93-reviewed-note-task-and-journal-creation.md), [ADR 0008](0008-opt-in-ai-and-later-rooms.md), [ADR 0052](0052-ai-provider-privacy-and-retrieval.md), [ADR 0053](0053-ai-assistant-confirmed-actions.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0090](0090-ai-provider-consent-privacy-and-operating-decisions.md), [ADR 0091](0091-scoped-retrieval-indexing-and-grounding-quality.md), [ADR 0092](0092-text-assistant-chat-and-contextual-guidance.md), [DEF-V2-008](../roadmap/v2/function-register.json), [release-gates.md](../engineering/release-gates.md), [reviewed-organizer-creation-guide.md](../engineering/reviewed-organizer-creation-guide.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, infrastructure, and release gates.

---

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 93 implementation and local verification before Phase 92 final acceptance:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 93 implementation and local verification before Phase 92 final acceptance. Record the scheduling exception in an ADR and roadmap metadata. Preserve the existing dependency list and outstanding acceptance gates. Live provider calls require separate approval for a specific synthetic test. Keep this phase focused on reviewed personal note, task, and journal creation. Preserve existing provisional contracts and keep broader organizer tools/orchestration gated (belongs to Phase 94)."

Phase 93 delivers the core reviewed creation experience for personal notes, tasks, and journal entries. All model-generated drafts remain strictly untrusted proposals; zero automated writes occur without explicit user confirmation.

---

## Findings Register & Remediations

An audit of the assistant proposal and confirmation architecture established the findings register in `artifacts/phase93/findings-register.json`:

1. **REV-001 (Schema & DB Constraint for Journal Creation — Remediated):**
   - *Finding:* `app.ai_proposals` table CHECK constraint and `AiAssistantOperationSchema` were restricted to tasks and notes, lacking `create_personal_journal_entry`.
   - *Remediation:* Added `create_personal_journal_entry` to `AiAssistantOperationSchema`, wired validation through `CreateJournalEntryRequestSchema`, and applied database migration `00078_ai_proposals_journal_and_edit.sql`.

2. **REV-002 (Proposal Editing Before Confirmation — Remediated):**
   - *Finding:* Proposals were previously immutable; users could only confirm or cancel. If title, date, or detail needed refinement, users were forced to decline and start over.
   - *Remediation:* Implemented `PATCH /v1/ai/proposals/:proposalId` via `updateAiProposalPayload`. Revalidates payload, recomputes `request_hash`, updates `review_summary`, and rotates `confirmation_token` so that old tokens cannot approve unreviewed edits.

3. **REV-003 (Journal Date Ambiguity & Voice Preservation — Remediated):**
   - *Finding:* Relative or ambiguous date references (e.g. "yesterday", "last Friday", "গতকাল") risked model hallucination of event dates and synthetic emotional claims.
   - *Remediation:* Implemented `detectJournalDateAmbiguity` and `sanitizeOrganizerText` in `@daynori/domain`. Detects ambiguous relative references in English and Bengali, prompts user with explicit clarifying questions asking for YYYY-MM-DD, and preserves exact user voice.

4. **REV-004 (Journal Consent Scope Fencing — Remediated):**
   - *Finding:* Users opting out of journal AI scope (`contentScope.journal = false`) could have journal proposals generated or executed.
   - *Remediation:* Enforced `consent.contentScope.journal` check during proposal creation, payload update, and confirmation, rejecting with `403 AI_JOURNAL_SCOPE_REQUIRED`.

5. **REV-005 (Batch Confirmation Support — Remediated):**
   - *Finding:* Multiple proposals (e.g. task + note + journal) required separate roundtrip confirmations.
   - *Remediation:* Implemented `POST /v1/ai/proposals/batch-confirm` and `batchConfirmAiProposals` in `assistantService` and `DaynoriApiClient`, allowing a single user review action to cover a batch of proposals with per-item outcomes and durable mutation receipts.

6. **REV-006 (Timezone Calendar Date Shift — Remediated):**
   - *Finding:* In `tasks/service.ts`, `r.deadline_date` Date objects were mapped via `new Date(r.deadline_date).toISOString().slice(0, 10)`, causing calendar date shifts in non-UTC offsets.
   - *Remediation:* Standardized on `getFullYear()`, `getMonth() + 1`, and `getDate()` formatting, eliminating timezone drift.

7. **REV-007 (Local Draft vs Persisted Cloud State — Remediated):**
   - *Finding:* UI lacked visual distinction between unsaved proposals and persisted cloud items.
   - *Remediation:* Added explicit `Local Draft (Unsaved)` amber badge and `Saved (Cloud Persisted)` green badge, review summary metadata (destination, date, timezone), and direct `Open Created Item` buttons in both web and mobile UIs.

8. **REV-008 (Durability, Idempotency & Vault Fencing — Remediated):**
   - *Finding:* Proposal execution required revalidation of actor, workspace, target, revision, and mutation receipt durability.
   - *Remediation:* Verified idempotency (duplicate confirmation returns identical receipt without duplicate records), tenant isolation (cross-user or cross-workspace proposal execution rejected), and unconditional vault exclusion (`securityScope: 'vault'` rejected with `403 AI_VAULT_FORBIDDEN`).

---

## Architectural Decisions

1. **Strict Zero-Write Proposal Model:**
   - Model outputs are untrusted proposals stored in `app.ai_proposals` with 15-minute TTL.
   - Confirmation requires a high-entropy server-issued `confirmationToken` bound cryptographically to `request_hash = hashRequest({ operation, payload, targetItemId, expectedRevision, workspaceId })`.
   - Client cannot substitute payload arguments at confirmation time.

2. **Token Rotation on Edit:**
   - When a user edits a proposal via `PATCH /v1/ai/proposals/:proposalId`, a new `confirmationToken` is generated and returned with the updated review summary.
   - The pre-edit confirmation token is invalidated, ensuring the user can only confirm what they have explicitly reviewed.

3. **Durable Mutation Receipts:**
   - Confirmed actions execute through canonical domain services (`createTask`, `createNote`, `createJournalEntry`, `updateTask`).
   - Every confirmed action inserts an idempotent mutation receipt into `app.sync_mutation_receipts` under `deviceId = 'ai-assistant-proposal'`.
   - Concurrent confirmation or network retries return the original durable receipt without creating duplicate items.

4. **Canonical Route Deep Links:**
   - Confirmed receipts return canonical deep links:
     - Note: `/library?noteId=...`
     - Task: `/plan?targetId=...&targetType=task`
     - Journal: `/journal?entryId=...`

5. **Release Gate Closure & Standing Push:**
   - Production AI capabilities remain fail-closed under `DEF-V2-008`.
   - Live provider calls require separate owner approval of `artifacts/phase93/synthetic-provider-package.json`.
   - Phase 93 code is committed using conventional subject `feat(assistant): create notes tasks and journals through reviewed actions` and pushed without force under ADR 0074.

---

## Consequences

- Users have complete review, edit, cancel, and confirmation control over organizer proposals.
- No model output can mutate the personal organizer without explicit confirmation.
- Journal entries strictly respect privacy opt-in boundaries and preserve user voice.
- Broader multi-step organizer orchestration belongs to Phase 94.
