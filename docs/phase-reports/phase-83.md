# Phase 83: Developer feedback triage and verified support contact

## Identity and scope

- Phase: [83 — Developer feedback triage and verified support contact](../roadmap/phases/83-developer-feedback-triage-and-verified-support-contact.md).
- Status: **complete** — restricted developer triage surface, confidential internal notes, immutable triage audit logging, reporter-visible verified responses on `/support`, bounded retention cleanup, and end-to-end operator/reporter browser journeys verified.
- Contributor/date: Antigravity agent, 2026-11-05.
- Base revision/branch: `844b35e`, `codex/free-core-preview`.
- Hard prerequisites: Phases **66** (developer boundaries and operator allowlist) and **82** (durable feedback reports and receipts) recorded complete.
- Preserved gates: Phase **71** TalkBack, Phase **75** attachments, Phase **80** physical/spoken reviews, and Phase **99** prototype review retain their recorded states and do not block Phase 83. Standing push authorized under ADR 0074. No `release_ready` claims.
- Defect resolution: **DEF-V2-009** ("Support contact and durable feedback delivery not configured") marked resolved locally via in-app verified developer contact route and operator triage dashboard.

## Result

### Implementation delivered

- **Shared contracts & domain logic** ([ADR 0083](../decisions/0083-developer-feedback-triage-and-verified-support-contact.md)):
  - Defined validated schemas and TypeScript types in `@daynori/contracts` (`FeedbackTriageQuerySchema`, `FeedbackTriageUpdateSchema`, `FeedbackInternalNoteCreateSchema`, `FeedbackInternalNoteSchema`, `FeedbackTriageAuditSchema`, `FeedbackPurgeRequestSchema`, `FeedbackPurgeResultSchema`).
  - Implemented pure domain utilities in `@daynori/domain/feedback` (`packages/domain/src/feedback/triage.ts`):
    - Strict triage status state machine (`new`, `received`, `acknowledged`, `investigating`, `resolved`, `closed`, `dismissed`, `duplicate`) with valid transitions, terminal state enforcement, and transition error messages.
    - Priority rules (`low`, `medium`, `high`, `urgent`).
    - Internal note validation and sanitization.
    - Reporter response validation separating internal technical details from reporter-facing messages.
    - Retention policy defaults (`DEFAULT_FEEDBACK_RETENTION_DAYS = 90`, `MIN_FEEDBACK_RETENTION_DAYS = 7`).
- **Database Schema and Row-Level Security**:
  - Migration `infra/supabase/migrations/00076_feedback_triage_notes_audit_and_retention.sql`:
    - Extends `app.feedback_reports` with `priority`, `duplicate_of_report_id`, `operator_response`, `operator_response_at`, `operator_responded_by_id`, and `last_triaged_at`.
    - Creates table `app.feedback_internal_notes` for operator-only confidential notes with foreign keys to `app.feedback_reports` and `app.profiles`.
    - Creates table `app.feedback_triage_audit` capturing immutable mutation history (actor, old/new status, old/new priority, duplicate link, internal note added flag, reporter response dispatched flag) without logging report contents, passwords, or secrets.
    - Grants least-privilege DML to `daynori_runtime` and configures dual-boundary RLS: reporters can never select internal notes or audit records, while operator APIs access them under server-side allowlist verification.
    - Adds database retention procedure `app.purge_expired_feedback_reports(p_retention_days INT)` for purging resolved/closed/dismissed reports older than the retention threshold.
- **API backend & client**:
  - Implemented operator service methods in `apps/api/src/modules/feedback/service.ts`:
    - `listOperatorReports`: Bounded pagination, filtering by status, category, reportType, priority, search text, and date bounds.
    - `getOperatorReport`: Retrieves report details including confidential internal notes and triage audit trail.
    - `updateOperatorReport`: Enforces valid status transitions, updates priority and duplicate links, records reporter responses, dispatches audit logs, and triggers reporter notification jobs.
    - `addInternalNote`: Appends confidential operator-only note and records audit entry.
    - `purgeExpiredReports`: Executes bounded retention cleanup.
  - Fastify routes in `apps/api/src/routes/v1/operatorFeedback.ts`:
    - Enforces `assertOperator` (fail-closed check against `DAYNORI_OPERATOR_USER_IDS` allowlist) on all endpoints under `/v1/operator/feedback/*`.
    - Denies unauthorized and non-operator users with HTTP 403 `OPERATOR_ACCESS_REQUIRED`.
  - Added operator methods to `DaynoriApiClient` in `packages/api-client/src/client.ts`.
- **Background Worker**:
  - Registered `feedback_retention_cleanup` job handler in `apps/worker/src/feedbackJobs.ts` and `apps/worker/src/worker.ts` for automated scheduled database pruning.
- **Web UI (`apps/web`)**:
  - Built developer triage surface `apps/web/src/app/developer/triage/page.tsx` protected by `<OperatorGate>`:
    - Filter bar: status, category, type, and search inputs with instant reload.
    - Triage report list with status indicators and priority badges.
    - Detail drawer displaying reporter metadata, sanitized diagnostics snippet, reporter-visible verified response, confidential internal notes feed, quick action status buttons (`Investigating`, `Resolved`, `Closed`, `Duplicate`), priority selection buttons, note composer, verified response composer, audit history, and retention purge button.
  - Linked triage dashboard in `/developer` hub.
  - Updated `/support` (`apps/web/src/app/support/page.tsx`) with a verified operator response card (`data-testid="feedback-operator-response"`) and live status refresh button (`data-testid="btn-check-status"`).

## Real UI journey verification

Executed full end-to-end multi-role journey via `scripts/phase83-run-all-journeys.mjs` against real Fastify API, PostgreSQL DB, Next.js server, and headless browser:

1. **Journey 1: Reporter Bug Submission with Receipt**:
   - Authenticated as reporter (`reporter-...@example.test`).
   - Submitted bug report on `/support` with opt-in diagnostics.
   - Received durable receipt:
     - Receipt ID: `69121145-5a6e-4d5b-8f47-fc26d8f8990c`
     - Client ID: `22e3d31d-ff1b-473f-8b10-10002f9698b9`
     - Status: `received`
   - Screenshot: `artifacts/phase83/journeys/01-reporter-bug-receipt.png` (SHA-256: `6b0e1a2d7a9fba83e78991c5e0e9a6d0ef42810b547d9a8706f302eec2fdeda8`)

2. **Journey 2: Authorized Operator Triage Dashboard**:
   - Authenticated as operator (`operator-...@example.test`) present in `DAYNORI_OPERATOR_USER_IDS`.
   - Navigated to `/developer/triage`.
   - Selected reporter's bug report:
     - Inspected report details and reviewed diagnostics.
     - Added confidential internal note: `"Investigated issue in LayoutEngine. Root cause identified as flex-wrap missing."`
     - Transitioned status to `investigating`.
     - Set priority to `high`.
     - Composed verified developer response: `"Thank you for reporting this! We confirmed the grid layout issue on Chromium and deployed a fix."`
   - Screenshot: `artifacts/phase83/journeys/02-operator-triage-dashboard.png` (SHA-256: `ff2beb1b60787e0046ac30aa83ba220560ab0e3307f47e2ef8ce8270890eb99e`)

3. **Journey 3: Reporter Verified Response Verification**:
   - Switched back to reporter session on `/support`.
   - Clicked "Check status / refresh".
   - Verified operator response rendered in dedicated verified support card:
     - Status: `investigating`
     - Developer response text verified.
     - Confidential internal note strictly excluded from reporter view.
   - Screenshot: `artifacts/phase83/journeys/03-reporter-verified-response.png` (SHA-256: `a85744243dd40b285deec79dc592245329eb09639a51e9ea52b7a281e86cbae1`)

4. **Journey 4: Unauthorized Access Denial**:
   - Authenticated as ordinary user (`unauthorized-...@example.test`) not in `DAYNORI_OPERATOR_USER_IDS`.
   - Attempted access to `/developer/triage`.
   - `<OperatorGate>` immediately intercepted and denied access (`Operator access required. This developer surface is restricted to authorized platform operators.`).
   - Screenshot: `artifacts/phase83/journeys/04-operator-gate-denial.png` (SHA-256: `f815812a42a5913cb5cb1df8bd2ad3b7616279e6d7997958b404892cb09fc493`)

- Full journey evidence summary recorded in `artifacts/phase83/phase83-journey-summary.json`.

## Automated evidence

| Check | Result |
| --- | --- |
| `tests/unit/phase83-feedback-triage-domain.test.ts` | Pass (13 tests) |
| `tests/integration/phase83-feedback-triage.test.ts` | Pass (8 tests) |
| `pnpm --filter @daynori/domain build` | Pass |
| `pnpm --filter @daynori/contracts build` | Pass |
| `pnpm --filter @daynori/api-client build` | Pass |
| `pnpm --filter @daynori/api build` | Pass |
| `pnpm --filter @daynori/worker build` | Pass |
| `pnpm --filter @daynori/web build` (Next.js 15.5.27 production build, 31 routes) | Pass |
| `pnpm validate:function-register` | Pass (109 actions, 12 defects, 22 families) |
| `pnpm validate:planning` | Pass (104 phases, 22 requirements, 398 files) |
| `pnpm icons:check` | Pass (83 names, native assets present) |
| `pnpm audit:secrets` | Pass (clean) |
| `git diff --check` | Pass (clean) |

## Invariants and security

- **Fail-Closed Operator Authorization**: All operator triage endpoints require strict allowlist presence via `DAYNORI_OPERATOR_USER_IDS`. Non-operators receive HTTP 403.
- **Confidential Internal Notes Segregation**: Internal operator notes and investigation observations are stored in `app.feedback_internal_notes` with row-level policies preventing reporter access. They are never returned in public or reporter feedback APIs.
- **Audit Logging Without Secret Exposure**: Triage mutations produce immutable records in `app.feedback_triage_audit` capturing actors, old/new states, priority changes, and timestamp without logging user report bodies, passwords, or personal organizer contents.
- **Bounded Retention & Deletion**: Scheduled worker and operator procedure prune closed/resolved reports past the retention threshold to minimize persistent data exposure.
- **Truthful Status Representation**: In-app support and triage status reflect real persisted states without fabricating external monitored inboxes, automated AI responses, or false SLA promises.

## Limits

- Real external monitored email/webhook relays remain unconfigured until production mail providers are integrated; in-app verified support routes are active and verified.
- Defect `DEF-V2-010` (developer surfaces on physical device) remains open pending physical Android testing.
- No `release_ready` claims.
