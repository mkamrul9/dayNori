# Phase 93: Reviewed note, task, and journal creation

## Identity and scope

- Phase: [93 — Reviewed note task and journal creation](../roadmap/phases/93-reviewed-note-task-and-journal-creation.md).
- Status: **blocked** — Foundational implementation, domain services, proposal edit endpoint, batch confirmation, date ambiguity detection, journal consent scope fencing, UI review cards, and independent integration verification complete: typed personal note, task, and journal creation delivered under strict proposal/confirm model; proposal editing supported via `PATCH /v1/ai/proposals/:proposalId` with payload re-validation and cryptographic token rotation; date ambiguity detection implemented via `detectJournalDateAmbiguity` in `@daynori/domain` asking clarifying questions on relative dates (e.g. "yesterday", "গত শুক্রবার") without guessing; journal opt-in scope strictly enforced under `contentScope.journal`; batch confirmation supported via `POST /v1/ai/proposals/batch-confirm`; durable mutation receipts recorded in `app.sync_mutation_receipts` under `AI_DEVICE_ID`; crash-safe idempotent confirmation retry returns existing receipts without duplication; canonical deep links (`/library`, `/plan`, `/journal`) distinguishing local draft vs persisted cloud state; interactive UI review cards delivered in `AssistantPanel.tsx` and `AssistantSheet.tsx`; all 11 integration tests in `phase93-reviewed-organizer-creation.test.ts` pass; production AI activation and live provider calls remain fail-closed pending explicit owner approval of synthetic test package (`DEF-V2-008` retained).
- Contributor/date: Antigravity agent, 2026-11-09.
- Base revision/branch: `680e628924745569e172396bec655de40c28fcaa`, `codex/free-core-preview`.
- Hard prerequisites: Phase **92**.
- Owner Scheduling Authorization: The owner authorized Phase 93 implementation and local verification before Phase 92 final acceptance ([ADR 0093](../decisions/0093-reviewed-note-task-and-journal-creation.md)). Phase 93 is recorded as `blocked` due to unmet owner live synthetic test approval and enterprise contract gates (`DEF-V2-008` retained). Outstanding checks for Phases 71, 75, 80, 81, 84, 85, 86, 87, 88, 89, 90, 91, 92, and 99 remain preserved. Standing push authorized under ADR 0074. No unverified production capability, live calls, or paid infrastructure claimed.

---

## Result

### Implementation and Verifications Delivered

1. **Typed Proposal Operations for Notes, Tasks, and Journals (REV-001 Remediation):**
   - Added `create_personal_journal_entry` to `AiAssistantOperationSchema` in `@daynori/contracts`.
   - Applied migration `00078_ai_proposals_journal_and_edit.sql` updating `app.ai_proposals` constraint `ai_proposals_operation_check`.
   - Wired payload validation through `CreateJournalEntryRequestSchema`, `CreateTaskRequestSchema`, and `CreateNoteRequestSchema`.
   - Unconditionally rejected `securityScope: 'vault'` across all operations.

2. **Proposal Payload Editing & Token Rotation (REV-002 Remediation):**
   - Implemented `PATCH /v1/ai/proposals/:proposalId` via `updateAiProposalPayload`.
   - Revalidates edited fields, recalculates `request_hash`, updates `review_summary`, and rotates `confirmation_token` to ensure users only confirm what they reviewed.
   - Added `updateAiProposal` method to `@daynori/api-client`.

3. **Date Ambiguity Detection & Voice Preservation (REV-003 Remediation):**
   - Implemented `detectJournalDateAmbiguity` in `@daynori/domain/src/organizerProposals.ts`.
   - Detects relative ambiguous date expressions in English ("yesterday", "last night", "last Friday") and Bengali ("গতকাল", "গত রাত", "গত শুক্রবার", "কয়েকদিন আগে").
   - Generates explicit clarifying questions requesting `YYYY-MM-DD` rather than guessing dates or fabricating emotions.
   - Implemented `sanitizeOrganizerText` preserving exact user voice and factual statements.

4. **Journal Privacy & Consent Scope Fencing (REV-004 Remediation):**
   - Enforced `consent.contentScope.journal` check across `createAiProposal`, `updateAiProposalPayload`, and `confirmAiProposal`.
   - Disabling journal scope rejects journal proposals with `403 AI_JOURNAL_SCOPE_REQUIRED`.

5. **Batch Confirmation (REV-005 Remediation):**
   - Implemented `POST /v1/ai/proposals/batch-confirm` and `batchConfirmAiProposals` in `assistantService.ts`.
   - Enables one explicit user confirmation to execute a reviewed batch of actions (e.g. task + note + journal) with per-item outcomes.
   - Added `batchConfirmAiProposals` method to `@daynori/api-client`.

6. **Timezone Calendar Date Formatting (REV-006 Remediation):**
   - Repaired `mapRowToTask` in `apps/api/src/modules/tasks/service.ts` to format `deadline_date` via `getFullYear()`, `getMonth() + 1`, and `getDate()`, preventing off-by-one shifts in non-UTC offsets.

7. **UI Proposal Review Cards & Deep Link Navigation (REV-007 Remediation):**
   - Delivered interactive review cards in both `AssistantPanel.tsx` (web) and `AssistantSheet.tsx` (mobile).
   - Clear visual status distinction: `Local Draft (Unsaved)` amber badge vs `Saved (Cloud Persisted)` green badge.
   - Inline edit form with title, date, and content inputs.
   - Direct `Open Created Item` buttons routing to canonical paths: `/library?noteId=...`, `/plan?targetId=...&targetType=task`, `/journal?entryId=...`.

8. **Phase 93 Integration Test Suite Delivered:**
   - Authored `tests/integration/phase93-reviewed-organizer-creation.test.ts` covering note creation, task creation, journal creation, proposal editing, token rotation, date ambiguity detection, journal consent fencing, batch confirmation, crash recovery idempotency, IDOR rejection, and vault exclusion.
   - All 11 tests pass. All 36 assistant tests pass across the entire suite.

---

## Verification and Evidence

### Commands Run (repo root)

| Command | Exit | Notes |
|---|---|---|
| `npx vitest run tests/integration/phase93-reviewed-organizer-creation.test.ts` | 0 | 11 passed (933ms); Node v24.11.1; 2026-11-09 |
| `npx vitest run tests/integration/phase56-ai-assistant-actions.test.ts tests/integration/phase56-ai-repair.test.ts tests/integration/phase92-assistant-chat-stream-guidance.test.ts tests/integration/phase93-reviewed-organizer-creation.test.ts` | 0 | 36 passed across all 4 assistant test suites |
| `npx vitest run packages/domain/src/domain.test.ts` | 0 | 95 passed; verified AST-008, AST-009, AST-010 |
| `pnpm --filter @daynori/contracts run build` | 0 | Contracts package builds cleanly |
| `pnpm --filter @daynori/domain run build` | 0 | Domain package builds cleanly |
| `pnpm --filter @daynori/api-client run build` | 0 | API client package builds cleanly |
| `pnpm --filter @daynori/api run typecheck` | 0 | API routes & services typecheck cleanly |
| `pnpm --filter @daynori/web run typecheck` | 0 | Web UI components typecheck cleanly |
| `pnpm --filter @daynori/mobile run typecheck` | 0 | Mobile UI components typecheck cleanly |
| `pnpm validate:planning` | 0 | Canonical roadmap verification |
| `pnpm validate:function-register` | 0 | Function register schema verification |
| `pnpm icons:check` | 0 | Clean design token icons verification |
| `pnpm audit:secrets` | 0 | 2125 files checked; zero secrets detected |
| `git diff --check` | 0 | No whitespace errors |

---

## Artifacts Generated

- `artifacts/phase93/findings-register.json`: Catalog of 8 architecture findings (`REV-001` through `REV-008`) and remediations.
- `artifacts/phase93/synthetic-provider-package.json`: Live synthetic test package (max $0.05 cap, pending owner approval).
- `artifacts/phase93/manual-ui-evidence.json`: Audit of web desktop drawer and mobile sheet controls, review cards, and tour targets.
- `artifacts/phase93/evidence-summary.json`: Summary of Phase 93 verification metrics and blocking gate status.

---

## Defects, Limitations & Recovery

- Status remains **blocked** due to `DEF-V2-008` (production AI activation and live model provider calls require separate owner approval of `synthetic-provider-package.json`).
- Broader multi-step organizer orchestration, calendar event drafting, and routine creation belong to Phase 94.
- Rollback: `00078_ai_proposals_journal_and_edit.sql` can be rolled back; pending proposals expire after 15 minutes.

---

## Next Steps

Phase 93 is ready for review and local commit. Next phase in sequence: **Phase 94 — Multi-step organizer tools and execution review**.
