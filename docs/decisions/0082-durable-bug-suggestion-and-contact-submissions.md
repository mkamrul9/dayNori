# ADR-0082: Durable bug, suggestion, and contact submissions

- Status: accepted
- Date: 2026-11-05
- Owner/reviewer: Antigravity agent (owner-authorized Phase 82).
- Related: [Phase 82](../roadmap/phases/82-durable-bug-suggestion-and-contact-submissions.md), [ADR 0066](0066-offline-shell-and-safe-pwa-updates.md), [ADR 0068](0068-feature-registry-personalization-and-operator-boundaries.md), [ADR 0077](0077-trusted-device-offline-boot-and-session.md), [ADR 0078](0078-phase-78-before-phase-75-and-77-acceptance.md).
- Supersedes/superseded by: none. Does not waive Phase 71, Phase 75, or Phase 80 gates.

## Context

Users need a dependable, private, and truthful intake mechanism for bugs, feature suggestions, and contact inquiries across desktop web, installed PWA, and native Android.

Private organizer users must never have sensitive data (passwords, tokens, private journal entries, prompt text, audio recordings, recovery secrets) exfiltrated into server logs or diagnostic reports. In addition:
- Submissions must be strictly isolated to the authenticated reporter and authorized workspace.
- Offline retries, transport timeouts, and application restarts must not create duplicate tickets or cross-submit a previous account's draft using a newly signed-in account's credentials.
- Operator triage must remain restricted and never surface in ordinary user settings.
- External delivery status must remain distinct from receipt acknowledgment; unconfigured external sinks must never fabricate a monitored inbox or false response-time SLA.

## Options Considered

1. **Third-party SaaS SDK integration (e.g. Sentry, Zendesk, Intercom)** — Rejected. Violates self-custody vault boundaries, introduces third-party script execution, increases binary attack surface, and risks leaking sensitive organizer content to external servers.
2. **Stateless email form / webhook forwarder** — Rejected. Network drops lose drafts, provides no durable receipts, lacks idempotency guarantees, and fails offline mobile resilience requirements.
3. **First-party durable intake with RLS, idempotent API, draft quarantine, and worker delivery queue (chosen)** — Combines shared domain contracts, strict PostgreSQL tenant isolation, opt-in sanitized client diagnostics, client-scoped draft quarantine, and truthful delivery state.

## Decision

- **Database and RLS**: Store reports in `app.feedback_reports` with foreign keys to `app.workspaces` and `app.profiles`. Enforce PostgreSQL Row-Level Security: ordinary user sessions (`daynori_runtime`) can only insert and read their own reports within their active workspace (`workspace_id = app.current_workspace_id() AND reporter_id = app.current_user_id()`). Background workers (`daynori_worker`) have restricted access to process delivery jobs.
- **Idempotency & Replay**: Use client-generated UUIDs (`client_report_id`) with a unique database constraint `(reporter_id, client_report_id)`. Replaying a submission after network failure returns the existing canonical receipt (`isReplay: true`) with HTTP 200 without creating a duplicate row.
- **Draft Isolation & Quarantine**: Store local drafts keyed by account and workspace (`daynori_feedback_draft_v1:${userId}:${workspaceId}`). When a user switches accounts or workspaces, existing drafts are isolated or quarantined; pending drafts from account A are never submitted under account B.
- **Sanitized Diagnostics**: Diagnostics collection is strictly opt-in and reviewable in the UI before submission. Collect only bounded technical metadata (app version, platform, browser/OS, route template, locale, timestamp, correlation ID). Redact JWTs, bearer tokens, passwords, cookies, authorization headers, and query parameters via domain sanitizers. Private report bodies and credentials are never emitted to logs.
- **Attachment Capability Gates**: Reuse approved file capability structures while respecting Phase 75 gates. Hosted attachment uploads remain explicitly disabled until Phase 75 capability gates are cleared; UI provides honest status indicators.
- **Decoupled Worker Delivery**: Persisting a report generates a durable server receipt immediately (`status: 'received'`). If external delivery destinations (webhook/email) are unconfigured, delivery status remains `'unconfigured'` with an explicit notice (`UNCONFIGURED_DELIVERY_NOTICE`). No fake monitored inbox or response-time SLA is promised. If configured, delivery is asynchronously queued to `app.background_jobs` with bounded retries and exponential backoff.

## Consequences

- Shared contracts (`@daynori/contracts/api/feedback`) and pure domain utilities (`@daynori/domain/feedback`) drive both Web and Mobile implementations.
- Users receive immediate cryptographic/canonical receipts confirming durable server receipt.
- Triage remains restricted to authorized operators; ordinary Settings never exposes other users' reports or internal triage queues.
- Phase 83 owns developer triage and verified monitored contact; Phase 82 does not send unsolicited external email or create public issues.
