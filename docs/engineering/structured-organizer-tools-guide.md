# Daynori Structured Organizer Tools & Multi-Action Creation Engineering Guide

This guide documents the architecture, data structures, mutation receipt lifecycle, cross-step reference resolution, and operational safety for structured organizer tools and multi-action creation (Phase 94).

---

## 1. Architectural Principles

1. **Untrusted Model Proposals:**
   - Model outputs NEVER execute automatically or perform background writes.
   - Proposed mutations are staged in `app.ai_proposals` with status `'pending'` and a 15-minute time-to-live (`expires_at`).
   - Confirmation is strictly bound to a server-issued high-entropy `confirmationToken`. The client cannot alter payload parameters at confirmation time; the server executes from the validated proposal record.

2. **Full Review, Inline Editing & Token Rotation:**
   - Before confirming, users can inspect every field of proposed actions (operation, title, destination, recurrence, start/end timestamps, folder hierarchy, currency, minor-unit amounts, dependencies).
   - Proposals can be edited via `PATCH /v1/ai/proposals/:proposalId`.
   - Editing recalculates `request_hash`, updates `review_summary`, and rotates `confirmation_token`, invalidating prior tokens so stale drafts cannot be accidentally approved.

3. **Multi-Action Ordering & Dynamic Reference Resolution:**
   - Assistant proposals can be grouped by `planId` with explicit sequential ordering (`stepIndex`) and dependencies (`dependsOn`).
   - Downstream steps can reference identifiers created in earlier steps using `$ref:0`, `$ref:step_0`, or `$ref:<proposalId>` syntax.
   - Dynamic references are resolved to concrete UUIDs at confirmation time using the outputs of previously executed steps.

4. **Per-Action Transaction Boundaries & Durable Mutation Receipts:**
   - In batch confirmation, each proposal executes within its own transactional boundary.
   - Succeeded actions record a durable receipt in `app.sync_mutation_receipts` under `deviceId = 'ai-assistant-proposal'`.
   - If a step fails, downstream dependent steps are safely skipped with `AI_PREREQUISITE_FAILED` and marked `status = 'skipped'`.
   - A subsequent confirmation retry executes only pending steps, safely recognizing already completed steps via durable mutation receipts without duplicating records.

---

## 2. Approved Tool Catalog

The organizer assistant tool catalog is strictly limited to 9 approved operations:

| Operation | Target Destination | Required Payload Fields | Security Scope |
|---|---|---|---|
| `create_personal_task` | Plan / Tasks | `title`, optional `details`, `priority`, `status`, `deadline` | Standard only (vault forbidden) |
| `update_personal_task` | Plan / Tasks | `targetItemId`, `expectedRevision`, `title`/`status`/`deadline` | Standard only (vault forbidden) |
| `create_personal_note` | Library / Notes | `title`, `plainText` (or document), optional `folderId` | Standard only (vault forbidden) |
| `create_personal_journal_entry` | Journal | `entryDate` (YYYY-MM-DD), optional `title`, `plainText`, `timezone` | Standard only (vault forbidden; requires `contentScope.journal = true`) |
| `create_personal_routine` | Plan / Routines | `title`, `frequency` (`daily` or `weekdays`), `weekdays` (if `weekdays`), `scheduledTime` (HH:mm), `timezone` | Standard only (vault forbidden) |
| `create_personal_calendar_event` | Plan / Calendar | `title`, `allDay` (boolean), `startDate`/`endDate` (if all-day) or `startAt`/`endAt` (if timed ISO 8601), `timezone` | Standard only (vault forbidden) |
| `create_personal_folder` | Library / Folders | `name`, optional `parentId` (or `$ref:N`), optional `color` | Standard only (vault forbidden; depth bounded) |
| `create_personal_custom_section` | Workspace / Sections | `title`, `blocks` (strictly `existing_record_view` or `field_collection`) | Standard only (vault forbidden; scripts/SQL rejected) |
| `create_personal_expense` | Ledger / Expenses | `title`, `amountMinor` (integer minor units), `currency` (ISO 4217), `transactionDate` (YYYY-MM-DD) | Standard only (vault forbidden) |

---

## 3. Data Model & Migration (00079)

Migration `00079_ai_proposals_structured_organizer_tools.sql` updates `app.ai_proposals`:

```sql
-- 1. Update operation check constraint
ALTER TABLE app.ai_proposals DROP CONSTRAINT IF EXISTS ai_proposals_operation_check;
ALTER TABLE app.ai_proposals ADD CONSTRAINT ai_proposals_operation_check CHECK (
  operation IN (
    'create_personal_task',
    'update_personal_task',
    'create_personal_note',
    'create_personal_journal_entry',
    'create_personal_routine',
    'create_personal_calendar_event',
    'create_personal_folder',
    'create_personal_custom_section',
    'create_personal_expense'
  )
);

-- 2. Update status check constraint to include 'skipped'
ALTER TABLE app.ai_proposals DROP CONSTRAINT IF EXISTS ai_proposals_status_check;
ALTER TABLE app.ai_proposals ADD CONSTRAINT ai_proposals_status_check CHECK (
  status IN ('pending', 'confirmed', 'cancelled', 'expired', 'failed', 'skipped')
);

-- 3. Add multi-action plan and dependency columns
ALTER TABLE app.ai_proposals
  ADD COLUMN IF NOT EXISTS plan_id uuid,
  ADD COLUMN IF NOT EXISTS step_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depends_on jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 4. Create index for plan lookups
CREATE INDEX IF NOT EXISTS idx_ai_proposals_plan_id
  ON app.ai_proposals (workspace_id, plan_id)
  WHERE plan_id IS NOT NULL;
```

---

## 4. Cross-Step Reference Syntax (`$ref:`)

When proposing a multi-step plan, an assistant can link subsequent steps to items created earlier:
- **By Step Index:** `"$ref:0"`, `"$ref:1"`, etc.
- **By Step Tag:** `"$ref:step_0"`, `"$ref:step_1"`, etc.
- **By Proposal ID:** `"$ref:<proposalId>"`.

### Resolution Rules
During batch confirmation:
1. Succeeded steps register their created item UUID into `stepResolutions`:
   - `stepResolutions.set(String(stepIndex), { id: createdId, kind: proposal.operation })`
   - `stepResolutions.set(proposal.id, { id: createdId, kind: proposal.operation })`
   - `stepResolutions.set(`step_${stepIndex}`, { id: createdId, kind: proposal.operation })`
2. Before executing step `N`, `resolveProposalCrossReferences(payload, stepResolutions)` traverses the payload object recursively and replaces any string matching the `$ref:` pattern with the corresponding concrete UUID.
3. If an unresolved `$ref:` remains (e.g. referencing a step that failed or was omitted), confirmation halts for that step and marks it `failed` with code `AI_UNRESOLVED_REFERENCE`.

---

## 5. Security & Safety Invariants

### 5.1 Unconditional Vault Exclusion
All organizer operations strictly check `securityScope`:
- If `securityScope: 'vault'`, `normalizeProposalPayload` throws `403 AI_VAULT_FORBIDDEN`.
- `confirmAiProposal` and `batchConfirmAiProposals` verify `securityScope !== 'vault'`, failing closed with `403 AI_VAULT_FORBIDDEN`.

### 5.2 Custom Section Block Allowlisting
Custom sections allow organizing custom views and fields:
- **Permitted Blocks:** `existing_record_view`, `field_collection`.
- **Prohibited:** Any block with code execution, scripts, HTML tags, or raw SQL queries is rejected with `400 AI_INVALID_PROPOSAL_PAYLOAD`.

### 5.3 Currency & Minor Unit Parsing
Expenses require exact integer minor unit representation:
- Supported currencies: `USD`, `EUR`, `GBP`, `BDT`, `JPY`, `CAD`, `AUD`, `CHF`, `INR`.
- Parsing: `parseExpenseAmountToMinorUnits('12.50', 'USD')` produces `1250`.
- Zero-decimal currencies (such as `JPY`) parse directly: `'500'` -> `500`.
- Unknown currencies or invalid decimal formats are rejected with `400 AI_INVALID_PROPOSAL_PAYLOAD`.

### 5.4 Ambiguity Clarification
Ambiguous inputs trigger non-committal clarifying questions rather than hallucinations:
- **Routines:** Missing recurrence frequency or time triggers `detectRoutineAmbiguity`.
- **Calendar Events:** Missing start date/time triggers `detectCalendarEventAmbiguity`.
- **Expenses:** Missing amount or currency triggers `detectExpenseAmbiguity`.

---

## 6. API Endpoints

### 6.1 Create Proposal (Single or Multi-Action)
- **Route:** `POST /v1/ai/proposals`
- **Request Body:**
  ```json
  {
    "operation": "create_personal_routine",
    "payload": {
      "title": "Morning Stretching",
      "frequency": "weekdays",
      "weekdays": [1, 2, 3, 4, 5],
      "scheduledTime": "07:30",
      "timezone": "Asia/Dhaka"
    },
    "planId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "stepIndex": 0,
    "dependsOn": []
  }
  ```
- **Response:** `AiProposalResponseSchema` (`status: 'pending'`, `confirmationToken: '...'`)

### 6.2 Update Proposal Payload
- **Route:** `PATCH /v1/ai/proposals/:proposalId`
- **Request Body:**
  ```json
  {
    "payload": {
      "title": "Morning Stretching & Hydration",
      "scheduledTime": "07:15"
    }
  }
  ```
- **Response:** Updated proposal with rotated `confirmationToken`.

### 6.3 Batch Confirm Proposals
- **Route:** `POST /v1/ai/proposals/batch-confirm`
- **Request Body:**
  ```json
  {
    "proposals": [
      { "proposalId": "uuid-1", "confirmationToken": "token-1" },
      { "proposalId": "uuid-2", "confirmationToken": "token-2" }
    ]
  }
  ```
- **Response:**
  ```json
  {
    "results": [
      { "proposalId": "uuid-1", "outcome": "ok", "receipt": { ... } },
      { "proposalId": "uuid-2", "outcome": "ok", "receipt": { ... } }
    ]
  }
  ```

---

## 7. UI Components & Accessibility

- **Web Assistant Panel (`apps/web/src/components/AssistantPanel.tsx`):**
  - Renders multi-action proposal sequences grouped by `planId`.
  - Shows step index badges (`Step 1 of 2`), dependency tags (`Depends on Step 1`), destination badges, and effect summaries.
  - Inline editing for all 9 operations with live token rotation.
  - One-click batch confirmation via `Confirm All Reviewed (${count})` (`data-tour="assistant-batch-confirm"`).
  - Canonical deep links to `/routines`, `/calendar`, `/library`, `/ledger`, `/sections`.
- **Mobile Assistant Sheet (`apps/mobile/src/views/AssistantSheet.tsx`):**
  - Mobile-responsive multi-action sequence display in `ScrollView`.
  - Quick action chips (+ Routine, + Event, + Folder, + Section, + Expense, + Plan).
  - Touch target minimum 48dp on all action buttons.
  - High contrast WCAG AA accessible badges and screen reader labels.
