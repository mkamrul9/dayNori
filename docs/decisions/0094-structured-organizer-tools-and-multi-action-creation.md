# ADR-0094: Structured organizer tools and multi-action creation

- Status: accepted
- Date: 2026-11-09
- Owner/reviewer: Antigravity agent (owner-authorized Phase 94 with explicit scheduling exception).
- Related: [Phase 94](../roadmap/phases/94-structured-organizer-tools-and-multi-action-creation.md), [ADR 0008](0008-opt-in-ai-and-later-rooms.md), [ADR 0052](0052-ai-provider-privacy-and-retrieval.md), [ADR 0053](0053-ai-assistant-confirmed-actions.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0090](0090-ai-provider-consent-privacy-and-operating-decisions.md), [ADR 0091](0091-scoped-retrieval-indexing-and-grounding-quality.md), [ADR 0092](0092-text-assistant-chat-and-contextual-guidance.md), [ADR 0093](0093-reviewed-note-task-and-journal-creation.md), [DEF-V2-008](../roadmap/v2/function-register.json), [release-gates.md](../engineering/release-gates.md), [structured-organizer-tools-guide.md](../engineering/structured-organizer-tools-guide.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, infrastructure, and release gates.

---

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 94 implementation and local verification before Phase 93 final acceptance:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 94 implementation and local verification before Phase 93 final acceptance. Record the scheduling exception in an ADR and roadmap metadata. Preserve the dependency list and outstanding acceptance gates. Obtain separate approval for any live provider test. Inspect the actual proposal and batch-confirm implementations. Work only on Phase 94. Reuse the Phase 93 review flow and existing domain services; deliver typed routines, events, folders, notes in folders, sections, and expenses without broad permissions, live model calls, or unreviewed execution."

Phase 94 delivers structured organizer tools across a 9-operation approved catalog and multi-action creation capabilities with dynamic cross-step references, dependency tracking, safe partial failure, and idempotent retry. All drafts remain strictly untrusted proposals; zero automated writes occur without explicit user confirmation.

---

## Approved Tool Catalog

The organizer assistant tool catalog is strictly limited to 9 approved operations:
1. `create_personal_task` (Phase 93): Task creation with optional deadline, priority, and reminder deep link.
2. `update_personal_task` (Phase 93): Update existing personal task status or fields.
3. `create_personal_note` (Phase 93 + Phase 94): Markdown note creation, including folder placement via `folderId` and dynamic references (`$ref:0`).
4. `create_personal_journal_entry` (Phase 93): Reflection creation with strict date ambiguity detection and `contentScope.journal` fencing.
5. `create_personal_routine` (Phase 94): Recurring routine with frequency (`daily` or `weekdays`), scheduled time (`HH:mm`), timezone, and reminder deep link.
6. `create_personal_calendar_event` (Phase 94): Calendar event with all-day vs timed ISO datetime (`startAt`/`endAt`), timezone, and location.
7. `create_personal_folder` (Phase 94): Folder creation with parent hierarchy, max depth constraints, standard security scope, and personal workspace isolation.
8. `create_personal_custom_section` (Phase 94): Modular section composed strictly of approved block types (`existing_record_view`, `field_collection`); scripts and SQL are strictly rejected.
9. `create_personal_expense` (Phase 94): Financial transaction draft with validated ISO 4217 currency, exact decimal-to-minor-unit conversion, and transaction date.

Broad capabilities, sharing, invitations, purchases, vault mutations, and arbitrary code execution are unconditionally excluded.

---

## Findings Register & Remediations

An audit of the assistant proposal and multi-action architecture established the findings register in `artifacts/phase94/findings-register.json`:

1. **STR-001 (Tool Catalog Expansion — Remediated):**
   - *Finding:* `app.ai_proposals` CHECK constraint and `AiAssistantOperationSchema` were restricted to tasks, notes, and journals.
   - *Remediation:* Added `create_personal_routine`, `create_personal_calendar_event`, `create_personal_folder`, `create_personal_custom_section`, and `create_personal_expense` to `AiAssistantOperationSchema` and applied migration `00079_ai_proposals_structured_organizer_tools.sql`.

2. **STR-002 (Multi-Action Ordering & Plan Metadata — Remediated):**
   - *Finding:* Proposals lacked plan-level grouping, sequential order, and dependency tracking.
   - *Remediation:* Added `plan_id`, `step_index`, and `depends_on` columns to `app.ai_proposals` under migration 00079. Updated `AiProposalReviewSummarySchema` to include `planId`, `stepIndex`, `totalSteps`, `dependsOnStepIndex`, and `effects`.

3. **STR-003 (Cross-Step Reference Resolution — Remediated):**
   - *Finding:* When a subsequent step references an ID produced by an earlier step (e.g. `$ref:0`), strict Zod UUID schema validation rejected the proposal.
   - *Remediation:* Extracted `$ref:` placeholders prior to schema validation in `normalizeProposalPayload` and re-attached them to payload fields. Implemented `resolveProposalCrossReferences` in `@daynori/domain` and `assistantService` to resolve references dynamically at confirmation time.

4. **STR-004 (Partial Failure & Safe Retry — Remediated):**
   - *Finding:* In multi-step confirmation, a failure in step 0 caused step 1 to fail or produce corrupted state. Retrying risked duplicating step 0.
   - *Remediation:* Implemented per-action transaction boundaries with durable mutation receipts under `AI_DEVICE_ID = 'ai-assistant-proposal'`. Implemented `checkStepDependencies` to mark dependent steps as `status = 'skipped'` (`AI_PREREQUISITE_FAILED`). Enabled updating `failed` proposals back to `pending` with token rotation for idempotent batch retry.

5. **STR-005 (Custom Section Security Fencing — Remediated):**
   - *Finding:* Custom section proposals could attempt to inject executable scripts or raw database queries.
   - *Remediation:* Enforced strict block type allowlist in `normalizeProposalPayload`: only `'existing_record_view'` and `'field_collection'` blocks are permitted. Any attempt to supply scripts or SQL blocks is rejected with `400 AI_INVALID_PROPOSAL_PAYLOAD`.

6. **STR-006 (Exact Expense Currency & Decimal Parsing — Remediated):**
   - *Finding:* Financial expenses risk floating-point rounding errors and invalid currency codes.
   - *Remediation:* Enforced ISO 4217 currency validation (USD, EUR, GBP, BDT, JPY, CAD, AUD, CHF, INR) and exact decimal string parsing into integer minor units (e.g. `'12.50'` USD -> 1250 cents) via `parseExpenseAmountToMinorUnits` in `@daynori/domain`.

7. **STR-007 (Ambiguity Clarification for Schedules and Amounts — Remediated):**
   - *Finding:* Ambiguous inputs risked models inventing recurrence, meeting times, currencies, or spending amounts.
   - *Remediation:* Implemented `detectRoutineAmbiguity`, `detectCalendarEventAmbiguity`, and `detectExpenseAmbiguity` in `@daynori/domain`. Prompts the user with explicit clarifying questions without generating ungrounded proposals.

8. **STR-008 (Vault SecurityScope Fencing — Remediated):**
   - *Finding:* Proposals must never target or mutate vault-scoped records under the ADR 0043 threat model.
   - *Remediation:* Enforced unconditional `403 AI_VAULT_FORBIDDEN` check across `normalizeProposalPayload`, `confirmAiProposal`, and `batchConfirmAiProposals` for all 9 operations whenever `securityScope` is `'vault'`.

---

## Architectural Decisions

1. **Untrusted Multi-Action Proposals in `app.ai_proposals`:**
   - Multi-action proposals share a common `plan_id` UUID and carry sequential `step_index` integers and `depends_on` integer arrays.
   - Each proposal carries a server-generated `confirmation_token` cryptographically bound to its `request_hash`.
   - Proposals expire after 15 minutes.

2. **Cross-Step Reference Syntax (`$ref:`):**
   - Dependent proposal payloads express relationships to preceding steps using canonical syntax:
     - By step index: `"$ref:0"`, `"$ref:1"`, etc.
     - By step tag: `"$ref:step_0"`, `"$ref:step_1"`, etc.
     - By proposal UUID: `"$ref:<proposalId>"`.
   - At batch confirmation, earlier executed steps populate a resolution map `Map<string, { id: string; kind?: string }>` mapping step indices and proposal IDs to created item UUIDs.
   - `resolveProposalCrossReferences` recursively replaces all `$ref:` strings in payload fields before invoking the target domain service.

3. **Per-Action Transaction Boundaries & Durable Mutation Receipts:**
   - In batch confirmation, each proposal executes within its own transactional boundary.
   - Succeeded actions record a durable receipt in `app.sync_mutation_receipts` with `device_id = 'ai-assistant-proposal'` and `request_id = proposal.id`.
   - If an earlier step fails or is skipped, all downstream steps declaring a dependency on it are marked `status = 'skipped'` with error code `AI_PREREQUISITE_FAILED`.
   - A subsequent confirmation retry executes only the pending steps, safely recognizing already completed steps via durable mutation receipts without duplicating records.

4. **UI Multi-Action Review Cards & Inline Editing:**
   - Both `AssistantPanel.tsx` (web) and `AssistantSheet.tsx` (mobile) render multi-action sequences grouped by plan, displaying step numbers, dependencies, and effects.
   - Users can edit fields inline across all 9 operations. Editing invokes `PATCH /v1/ai/proposals/:proposalId`, revalidating the payload, recalculating the `request_hash`, and rotating the `confirmation_token`.
   - Batch confirmation executes all reviewed proposals via a single `POST /v1/ai/proposals/batch-confirm` request.

5. **Release Gate Closure & Standing Push:**
   - Production AI capabilities remain fail-closed under `DEF-V2-008`.
   - Live provider calls require separate owner approval of `artifacts/phase94/synthetic-provider-package.json`.
   - Phase 94 code is committed using conventional subject `feat(assistant): add safe structured and multi-action organizer tools` and pushed without force under ADR 0074.

---

## Consequences

- Users gain full review and batch confirmation control over routines, calendar events, folders, custom sections, and expenses in addition to tasks, notes, and journals.
- Complex multi-step actions (such as setting up a folder and creating a note inside it) execute safely with ordered dependency tracking and cross-step reference resolution.
- Safe partial failure semantics prevent orphaned records and allow clean retry without duplicate creation.
- Security boundaries (vault exclusion, script/SQL rejection, currency validation) remain completely airtight.
