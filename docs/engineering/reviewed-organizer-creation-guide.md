# Daynori Reviewed Organizer Creation Engineering Guide

This guide documents the architecture, data structures, mutation receipt lifecycle, date ambiguity handling, and operational verification for reviewed personal note, task, and journal creation (Phase 93).

---

## 1. Architectural Principles

1. **Untrusted Model Proposals:**
   - Model outputs NEVER execute automatically.
   - Proposed mutations are staged in `app.ai_proposals` with status `pending` and a 15-minute time-to-live (`expires_at`).
   - Confirmation is strictly bound to a high-entropy server-issued `confirmationToken`. The client cannot alter the payload or parameters during confirmation; the server re-validates the persisted proposal record.

2. **Full Review and Edit Capability:**
   - Before confirming, users can review every field of the proposed change (headline, destination, title, content, date, timezone).
   - Users can edit the proposal via `PATCH /v1/ai/proposals/:proposalId`.
   - Editing recalculates `request_hash` and rotates `confirmation_token`, invalidating prior tokens so that a user cannot approve stale or unreviewed changes.

3. **Domain Service Delegation:**
   - Confirmation does not execute ad-hoc SQL. It delegates directly to canonical domain services:
     - Notes: `createNote`
     - Tasks: `createTask` / `updateTask`
     - Journals: `createJournalEntry`
   - Changes generate atomic sequence numbers (`nextChangeSeq`), revision increments, and sync outbox intents.

4. **Durable Mutation Receipts & Crash Recovery:**
   - Every confirmed creation registers an entry in `app.sync_mutation_receipts` under `deviceId = 'ai-assistant-proposal'`.
   - The receipt binds `operation_id`, `canonicalPayloadHash`, `acceptedRevision`, and `resultPayload`.
   - In the event of a network timeout or duplicate confirmation request, the server detects the existing receipt and returns it idempotently without creating duplicate items.

---

## 2. Supported Operations & Payloads

| Operation | Target Destination | Required Payload Fields | Security Scope |
|---|---|---|---|
| `create_personal_note` | Library / Notes | `title`, `plainText` (or document) | Standard only (vault forbidden) |
| `create_personal_task` | Plan / Tasks | `title`, optional `details`, `priority`, `status`, `deadline` | Standard only (vault forbidden) |
| `update_personal_task` | Plan / Tasks | `targetItemId`, `expectedRevision`, `title`/`status`/`deadline` | Standard only (vault forbidden) |
| `create_personal_journal_entry` | Journal | `entryDate` (YYYY-MM-DD), optional `title`, `plainText`, `timezone` | Standard only (vault forbidden) |

### 2.1 Journal Consent Boundary

Journal entries require explicit opt-in under `contentScope.journal = true` in the user's AI consent settings (`app.ai_user_consent`). If a user has not enabled journal AI scope:
- `createAiProposal` with `create_personal_journal_entry` fails with `403 AI_JOURNAL_SCOPE_REQUIRED`.
- `updateAiProposalPayload` on a journal proposal fails with `403 AI_JOURNAL_SCOPE_REQUIRED`.
- `confirmAiProposal` cancels the pending proposal and fails with `403 AI_JOURNAL_SCOPE_REQUIRED`.

---

## 3. Date Ambiguity & Voice Preservation

### 3.1 Date Ambiguity Detection

When users express desires to journal about past events, human speech frequently uses relative timeframes ("yesterday", "last Friday", "last night", "a few days ago", or Bengali "গতকাল", "গত রাত", "কয়েকদিন আগে").

To prevent the model from inventing dates, fabricating details, or hallucinating emotions:
- `detectJournalDateAmbiguity(input, referenceDate)` in `@daynori/domain` checks for explicit `YYYY-MM-DD` ISO dates.
- If only relative references exist or date is omitted, the assistant returns an explicit clarification question:
  - English: *"Which date should this journal entry be recorded for? Please specify the date (YYYY-MM-DD)."*
  - Bengali: *"এই জার্নাল এন্ট্রিটি কোন তারিখের জন্য সংরক্ষণ করতে চান? অনুগ্রহ করে নির্দিষ্ট তারিখ উল্লেখ করুন (YYYY-MM-DD)।"*
- Proposal creation is deferred until the user confirms the unambiguous calendar date.

### 3.2 Voice & Fact Preservation

- `sanitizeOrganizerText(text)` strips control characters while strictly preserving user wording, dialect, and facts.
- The assistant does not embellish user input with synthetic claims or emotional appraisals.

---

## 4. API Endpoints

### 4.1 Create Proposal
- **Route:** `POST /v1/ai/proposals`
- **Request:** `CreateAiProposalRequestSchema`
- **Response:** `AiProposalResponseSchema` (`status: 'pending'`)

### 4.2 Edit Proposal
- **Route:** `PATCH /v1/ai/proposals/:proposalId`
- **Request:** `UpdateAiProposalRequestSchema` (`{ payload: Record<string, unknown> }`)
- **Response:** `AiProposalResponseSchema` (`confirmationToken` is rotated)

### 4.3 Confirm Proposal
- **Route:** `POST /v1/ai/proposals/:proposalId/confirm`
- **Request:** `ConfirmAiProposalRequestSchema` (`{ confirmationToken: string }`)
- **Response:** `AiProposalResponseSchema` (`status: 'confirmed'`, includes `executionReceipt` and canonical `deepLink`)

### 4.4 Batch Confirm Proposals
- **Route:** `POST /v1/ai/proposals/batch-confirm`
- **Request:** `BatchConfirmAiProposalsRequestSchema` (`{ items: Array<{ proposalId, confirmationToken }> }`)
- **Response:** `BatchConfirmAiProposalsResponseSchema` (array of per-item outcomes)

### 4.5 Cancel Proposal
- **Route:** `POST /v1/ai/proposals/:proposalId/cancel`
- **Response:** `AiProposalResponseSchema` (`status: 'cancelled'`)

---

## 5. UI Review Cards & Deep Link Navigation

Both Web (`AssistantPanel.tsx`) and Mobile (`AssistantSheet.tsx`) render dedicated proposal review cards:
1. **Status Badge:**
   - Amber `Local Draft (Unsaved)` for pending proposals.
   - Green `Saved (Cloud Persisted)` for confirmed proposals.
   - Red `Cancelled` for dismissed proposals.
2. **Review Summary:** Displays destination folder, target item, date, and timezone.
3. **Interactive Controls:**
   - `Confirm & Save` (Primary) -> commits durable mutation.
   - `Edit` -> toggles inline editable text inputs.
   - `Cancel` -> marks cancelled without mutation.
4. **Canonical Deep Links:**
   - Note: `/library?noteId=...`
   - Task: `/plan?targetId=...&targetType=task`
   - Journal: `/journal?entryId=...`
