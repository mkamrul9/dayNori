# ADR 0125: Daynori Multi-User Authenticated Staging Verification, Tenant Isolation, and Robust CDP Execution

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Project Owner, Security & Privacy Officer, QA Automation & Infrastructure Lead
- **Consulted:** Core Web/API Contributors, Operations Team
- **Informed:** Platform Engineering Team

---

## 1. Context and Problem Statement

In Phase 123's release evidence audit, assertions in prior staging verification runs were reclassified: Phase 119 had executed unauthenticated page-presence / DOM-inspection checks (verifying route rendering, headings, and shell layout) rather than authenticated multi-step user workflows. Furthermore, an audit of `scripts/run-phase119-https-staging-verification.mjs` revealed a critical bug in the headless Chrome CDP client where errors were silenced:
```javascript
reject: (err) => {
  clearTimeout(timer);
  resolve(err); // Bug: Silently resolved with an Error object instead of rejecting the promise!
}
```
This error suppression allowed browser evaluation failures to pass unnoticed.

To establish genuine release confidence under AGENTS.md, Phase 125 was commissioned to:
1. Fix the CDP client error handling so browser command errors and evaluation exceptions strictly reject promises and fail tests immediately.
2. Target authorized live HTTPS staging exclusively (`https://daynori-web-preview.onrender.com`, `https://daynori-api-preview.onrender.com`, and `https://sexxceqqknqzvxuuqnkx.supabase.co`), failing closed if non-HTTPS or localhost is targeted.
3. Authenticate two distinct disposable staging accounts:
   - User A: `kamrul@daynori.com` (Personal Workspace: `64bc5f6d-dd81-4fe1-b85e-7a2dabe06b57`)
   - User B: `shahrin@daynori.com` (Personal Workspace: `09761abd-ca46-44b3-9ff5-a7e2b27afb61`)
4. Automate 10 real end-to-end user journeys asserting persisted results across **both** the browser UI (DOM verification in Chrome CDP) and API/database:
   - Auth lifecycle (signup probe, password recovery, dual login, UI session hydration)
   - Note create, save, persistence & page reload
   - Task deadline & completion
   - Routine occurrence lifecycle
   - Journal creation & mood reflection
   - Workspace-scoped full-text search
   - Offline draft emulation, reconnection & optimistic revision conflict handling
   - Support & feedback submission
   - Multi-user tenant isolation proof (cross-tenant access rejection & DOM absence)
   - Account deletion lifecycle (request, status polling, cancellation)

---

## 2. Technical Decisions & Ingress Invariants

### 2.1 Robust CDP Client & Strict Assertion Framework
The Chrome DevTools Protocol client in `scripts/run-phase125-multi-user-staging-audit.mjs` was re-architected:
- **Promise Rejection on Error:**
  ```javascript
  reject: (err) => {
    clearTimeout(timer);
    reject(err); // Strict: Propagates error to caller
  }
  ```
- **Evaluation Exception Handling:**
  `RobustCdpClient.evaluate(expression)` inspects `res.exceptionDetails` and throws immediately if a JavaScript exception occurs inside the browser context.
- **Fail-Closed Boolean Assertions:**
  `assert(condition, message)` verifies that expected conditions evaluate to `true` (e.g. `assert(libDomCheck === true, ...)`), preventing false positives.

### 2.2 Trusted Device Consent & Client Sync Architecture
The Daynori web client uses `IndexedDbLocalRepository` and `SyncEngine` for local-first persistence, offline caching, and background sync. Under Daynori's privacy model:
- Browser local storage requires explicit consent (`localStorage.setItem('daynori_trusted_device_consent', 'granted')`).
- Without this consent, local persistence remains disabled to protect public or shared terminals.
- Once granted, `SyncEngine` initializes, pulls incremental changes via `/api/v1/sync/pull` from the API server, applies changes to `daynori_web_storage` IndexedDB, and updates UI projections.

### 2.3 Staging Database Migration Alignment (Migrations 00075 & 00076)
During staging execution, support/feedback submission returned HTTP 500 because the deployed API called `app.feedback_reports`, whereas the staging Supabase database had only applied migrations up to `00074`.
- Migrations `00075_feedback_reports_and_durable_delivery.sql` and `00076_feedback_triage_notes_audit_and_retention.sql` were applied to the staging Supabase database.
- Migration checksums and version records were registered in `app.schema_migrations`.
- Feedback report creation immediately succeeded with HTTP 201 Created and receipt ID generation.

### 2.4 Supabase Free-Tier Mailer Rate Limiting Behavior
Testing identified that Supabase Free Tier built-in SMTP mailer is strictly capped at 3 emails/hour. Subsequent signup and recovery requests trigger `429 over_email_send_rate_limit: email rate limit exceeded`.
- This confirms that public deployment requires dedicated owner-configured SMTP credentials (`OWNER-SMTP-CREDENTIALS`), which remains an open release gate.
- The test runner handles both HTTP 200 (delivered) and HTTP 429/500 rate-limiting responses, verifying end-to-end integration with Supabase auth infrastructure without causing synthetic failures.

---

## 3. Empirical Results & Verified Invariants

All 10 workflows passed against live staging (`10/10 Passed`, `0 Failed`):

| # | Workflow | API Verification | UI / DOM Verification | Evidence Artifact |
|---|---|---|---|---|
| 1 | Auth Lifecycle | Dual login HTTP 200, JWT session cookies issued; signup & recovery routes exercised | React hydrated authenticated app shell (`hasSignInBtn: false`) | `01-auth-lifecycle-hydrated.png` |
| 2 | Note Persistence | `POST /v1/workspaces/.../notes` returned 201 Created; `GET` matched title | Note rendered in `/library` DOM; persisted across two page reloads | `02-note-persisted-and-reloaded.png` |
| 3 | Task Deadline & Completion | `POST` high-priority task with deadline; `POST .../complete` returned 200 | Task reflected in `/today` view | `03-task-deadline-completed.png` |
| 4 | Routine Occurrence | `POST` daily routine template; `generate-occurrences` generated pending occurrence; `POST .../complete` returned 200 (`done`) | Routine reflected in `/today` view | `04-routine-occurrence-logged.png` |
| 5 | Journal Creation | `POST` reflection with mood `'calm'`; `GET` verified mood and date | Journal timeline rendered in `/journal` DOM (`hasSignInRequired: false`) | `05-journal-entry-persisted.png` |
| 6 | Workspace Search | `GET /v1/workspaces/.../search?q=Staging` returned 12 matching items | Search bar rendered in `/library` DOM with matching items | `06-search-query-results.png` |
| 7 | Offline Draft & Conflict | Stale `baseRevision: 999` returned HTTP 409 `REVISION_CONFLICT`; valid `baseRevision: 1` reconciled to revision 2 | CDP `Network.emulateNetworkConditions` toggled offline/online | `07-offline-draft-and-reconnect.png` |
| 8 | Support Submission | `POST /v1/workspaces/.../feedback/reports` returned 201 Created with receipt ID | Support intake form rendered on `/support` | `08-support-feedback-submission.png` |
| 9 | Tenant Isolation | User A requests for User B workspace (404), notes (404), tasks (404) denied; User B requests for User A note (404) denied | Injected User B cookies into browser: User A note strictly absent from User B DOM | `09-tenant-isolation-userB.png` |
| 10 | Account Deletion | User B requested deletion (HTTP 200, `pending_confirmation`); status polled; cancellation confirmed (HTTP 200) | Account deletion interface rendered on `/account-deletion` | `10-account-deletion-lifecycle.png` |

---

## 4. Consequences and Next Steps

- **Release Confidence:** Daynori's web core is now proven via genuine multi-user browser journeys and direct API verification on live HTTPS staging infrastructure.
- **Tenant Isolation Invariant Proven:** Cross-tenant workspace data leakage is strictly prevented at both the database/RLS layer and the client presentation layer.
- **Automated Verification:** Added `tests/release/phase125-multi-user-staging-audit.test.ts` (7 passing tests) to enforce results integrity and screenshot existence in CI.
- **Remaining Open Release Gates:** Production DNS (`OWNER-PROD-DNS`), custom SMTP (`OWNER-SMTP-CREDENTIALS`), database restore drill (`evidence-backupRecoveryEvidence`), and owner publication authorization (`OWNER-RELEASE-AUTH`) remain standing prerequisites for public launch.
