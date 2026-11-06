# ADR-0083: Developer feedback triage and verified support contact

- Status: accepted
- Date: 2026-11-05
- Owner/reviewer: Antigravity agent (owner-authorized Phase 83).
- Related: [Phase 83](../roadmap/phases/83-developer-feedback-triage-and-verified-support-contact.md), [Phase 82](../phase-reports/phase-82.md), [ADR 0068](0068-feature-registry-personalization-and-operator-boundaries.md), [ADR 0082](0082-durable-bug-suggestion-and-contact-submissions.md).
- Supersedes/superseded by: none. Does not waive Phase 71, Phase 75, Phase 80, or Phase 99 gates.

## Context

In Phase 82, durable private bug, suggestion, and contact submissions were delivered with client idempotency keys, tenant isolation, opt-in redacted diagnostics, and offline quarantine. However, developer triage remained planned, and the verified human support contact route needed to be established without inventing a fake external email address or response-time SLA.

Triage operations introduce several critical security and privacy requirements:
1. **Operator Boundaries**: Platform operators must be able to review, triage, and reply to user reports across workspaces without exposing cross-workspace records to ordinary users or relaxing row-level security for ordinary requests.
2. **Confidentiality of Internal Notes**: Operator discussions, triage notes, and internal debugging deliberations must be kept strictly separate from reporter-visible responses and must never be exposed through reporter endpoints.
3. **Audit Trail Integrity**: Triage actions (status transitions, priority changes, assignments, duplicate linking, notes, and responses) must be tracked for accountability without storing sensitive passwords, session tokens, or private organizer content in audit logs.
4. **Truthful Support Contact**: The system must provide a genuine, staffed response route. A private in-app operator triage inbox satisfies this without fabricating an unmonitored external email or automated public GitHub posting.
5. **Bounded Retention and Deletion**: Resolved and duplicate reports must have a clear retention and deletion lifecycle so stale tickets and diagnostic metadata are not retained indefinitely.

## Options Considered

1. **Third-party Helpdesk / Ticketing SaaS (e.g. Zendesk, Linear, GitHub Issues)** — Rejected. Auto-posting private reports or diagnostics to external platforms leaks sensitive technical context and potential personal details, violates self-custody vault principles, and creates unmonitored external dependencies.
2. **Unrestricted Developer Mode in Ordinary Settings** — Rejected. Placing triage toggles in client-side settings or relying solely on client-side role flags risks privilege escalation (IDOR) and cross-workspace data leakage.
3. **First-party Role-Restricted Triage with Dual-Boundary RLS, Private In-App Inbox, and Bounded Retention (chosen)** — Employs server-enforced platform operator allowlists (`DAYNORI_OPERATOR_USER_IDS`), PostgreSQL transaction-local session variables for operator RLS, segregated internal notes and audit tables, verified in-app operator reply delivery, and an automated retention purge procedure.

## Decision

- **Operator Authorization**: Restrict developer triage routes (`/v1/operator/feedback/*`) strictly to platform operators validated via `isPlatformOperator({ userId: actor.userId }, process.env)` from `@daynori/domain`. Unauthorized actors immediately receive HTTP 403 Forbidden (`ExplicitForbiddenError`).
- **Dual-Boundary Row-Level Security**:
  - Ordinary users access reports through `daynori_runtime` where RLS strictly limits SELECT and UPDATE to their own identity and active workspace: `(workspace_id = app.current_workspace_id() AND reporter_id = app.current_user_id())`.
  - Operator transactions execute via `withOperatorContext(pool, actor.userId, ...)` which sets `app.is_platform_operator = 'true'` with `is_local = true`. This activates operator RLS policies (`p_feedback_reports_operator_select`, `p_feedback_reports_operator_update`) for the lifetime of that transaction only, resetting immediately upon commit or rollback.
- **Segregated Internal Notes**: Store operator notes in `app.feedback_internal_notes` with RLS allowing access only when `app.is_platform_operator` is true. Internal notes are strictly excluded from reporter queries (`/v1/workspaces/:workspaceId/feedback/reports/:reportId`).
- **Audit Trail without Sensitive Data**: Store audit events in `app.feedback_triage_audit`. All detail payloads pass through `sanitizeTriageAuditDetails`, which strips passwords, tokens, auth headers, full report descriptions, and note bodies, retaining only safe metadata, status identifiers, and length counters.
- **State Machine Transitions**: Enforce `isValidFeedbackStatusTransition` on status updates. Reports progress from `new`/`received` -> `acknowledged` -> `investigating` -> `resolved` -> `closed` (or `duplicate`/`dismissed`). Reopening is permitted strictly from terminal states to `investigating`.
- **Verified In-App Support Inbox**: Operator replies recorded in `response_text` are durably presented to the reporter on `/support` when viewing their submission receipt. Unconfigured external delivery channels (webhooks/emails) remain truthfully marked `unconfigured`.
- **Bounded Retention**: Provide database procedure `app.purge_expired_feedback_reports(retention_days)` and background worker task `feedback_retention_cleanup`. Terminal reports older than `retention_days` (default 90) are purged along with cascaded notes and audit records. Active reports (`new`, `acknowledged`, `investigating`) are never expired.

## Consequences

- Ordinary users cannot view or triage other users' reports or internal notes under any circumstance (anti-IDOR verified).
- Platform operators have an accessible, unified triage surface at `/developer/triage` with bounded pagination, category/status/priority filters, duplicate linking, and diagnostic inspection.
- Reporters receive verified developer responses directly within their support view without leaking developer email identities or internal notes.
- Retention cleanup is bounded, idempotent, and testable on synthetic test records.
- DEF-V2-009 ("Support contact and durable feedback delivery not configured") is resolved.
