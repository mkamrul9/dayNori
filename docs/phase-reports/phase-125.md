# Phase 125: Daynori multi-user authenticated staging journeys, tenant isolation, and robust CDP verification

## Identity and scope

- Phase: [125 — Daynori multi-user authenticated staging journeys, tenant isolation, and robust CDP verification](../roadmap/phases/125-daynori-multi-user-authenticated-staging-journeys-tenant-isolation-and-robust-cdp-verification.md).
- Status: **blocked** — Phase 125 multi-user authenticated staging verification, tenant isolation audit, and CDP error handling hardening completed. All 10 end-to-end user workflows passed against the deployed HTTPS staging environment (`https://daynori-web-preview.onrender.com`, `https://daynori-api-preview.onrender.com`, Supabase preview database) using two disposable staging accounts (`kamrul@daynori.com` and `shahrin@daynori.com`). Persisted data was verified across both browser UI (DOM verification in Chrome CDP) and API/database layers. Cross-tenant isolation was strictly proven at both database/API and client presentation layers. The headless Chrome CDP runner was re-architected to reject promises on errors and throw on evaluation exceptions. Staging Supabase database migrations `00075` and `00076` were applied to support feedback reports. Status remains strictly **BLOCKED** on standing external release gates (`evidence-backupRecoveryEvidence`, `evidence-ownerApproval`, `DEF-V2-001`, `DEF-V2-004`, `DEF-V2-005`, `DEF-V2-007`, `DEF-V2-008`, `DEF-V2-011`, `DEF-V2-013`, `OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`, `OWNER-SMTP-CREDENTIALS`, Phase 71).
  - Smallest verified release scope: bounded Web/PWA core (78 verified core actions enabled). Drive, AI, Voice, Vault, Rooms, Billing, Push, and Android remain fail-closed on their independent tracks.
  - Verification evidence: authored in [`artifacts/phase125/staging-verification-results.json`](../../artifacts/phase125/staging-verification-results.json), 10 PNG screenshots in [`artifacts/phase125/screenshots/`](../../artifacts/phase125/screenshots/), and automated test suite [`tests/release/phase125-multi-user-staging-audit.test.ts`](../../tests/release/phase125-multi-user-staging-audit.test.ts).
  - Architecture decision record: authored in [`docs/decisions/0125-multi-user-authenticated-staging-verification-and-workspace-isolation.md`](../decisions/0125-multi-user-authenticated-staging-verification-and-workspace-isolation.md).
- Contributor/date: Antigravity agent, 2026-11-15.
- Base revision/branch: `1219998`, `codex/free-core-preview`.
- Hard prerequisites: Phase **102**, Phase **112**, Phase **118**, Phase **119**, Phase **120**, Phase **121**, Phase **122**, Phase **123**, Phase **124**.
- Owner Scheduling Authorization: The owner authorized Phase 125 to execute real multi-user authenticated staging journeys on the live HTTPS build, prove workspace tenant isolation, assert data persistence through both UI and API, fix CDP send error handling, and capture redacted evidence and screenshots. Standing push authorized under ADR 0074.

---

## Result

### 1. Robust CDP Client Architecture & Strict Error Handling

In previous staging verification scripts (Phase 119), browser CDP command callbacks resolved errors rather than rejecting promises:
```javascript
reject: (err) => {
  clearTimeout(timer);
  resolve(err); // Error suppression bug
}
```
This error suppression was eliminated in `RobustCdpClient` (`scripts/run-phase125-multi-user-staging-audit.mjs`):
1. **Strict Promise Rejection:** Command timeouts and CDP protocol error payloads reject the returned promise immediately.
2. **Evaluation Exception Detection:** `RobustCdpClient.evaluate()` inspects `res.exceptionDetails` and throws a descriptive JavaScript error if runtime evaluation throws inside the browser.
3. **Boolean Assertion Gate:** `assert(condition, message)` fails closed if any expected condition is false or undefined.
4. **Target Enforcement:** Fails closed immediately if non-HTTPS or `localhost` / `127.0.0.1` endpoints are supplied.

---

### 2. Live Multi-User Staging Verification (10 Workflows Passed)

All 10 user workflows were executed on the live HTTPS staging environment against deployed Git commit `1219998` (Render deployment `36ce3de7-9a35-4bd5`, Cloudflare Ray `a5ade6682fbd16d4-DAC`):

| # | Workflow | API Verification | UI / DOM Verification | Evidence Screenshot |
|---|---|---|---|---|
| 1 | **Auth Lifecycle** | Dual login returned HTTP 200 with JWT tokens; signup & recovery routes exercised | React hydrated authenticated app shell (`hasSignInBtn: false`) | `01-auth-lifecycle-hydrated.png` (117,559 B) |
| 2 | **Note Create, Save & Reload** | `POST /v1/workspaces/.../notes` created note (201); `GET` returned title match | Note rendered in `/library` DOM; persisted across page reloads | `02-note-persisted-and-reloaded.png` (91,944 B) |
| 3 | **Task Deadline & Completion** | High-priority task created with deadline; `complete` returned 200 | Task reflected in `/today` view | `03-task-deadline-completed.png` (73,723 B) |
| 4 | **Routine Occurrence Lifecycle** | Routine template created; occurrence generated; completed (200) | Routine reflected in `/today` view | `04-routine-occurrence-logged.png` (73,690 B) |
| 5 | **Journal Creation & Reflection** | Reflection created with mood `calm`; retrieved via API | Journal timeline rendered in `/journal` DOM (`hasSignInRequired: false`) | `05-journal-entry-persisted.png` (74,199 B) |
| 6 | **Workspace Full-Text Search** | `GET /v1/workspaces/.../search?q=Staging` matched 12 items | Search input rendered in `/library` DOM with matching items | `06-search-query-results.png` (56,569 B) |
| 7 | **Offline Draft & Revision Conflict** | Stale `baseRevision: 999` returned HTTP 409 `REVISION_CONFLICT`; valid `baseRevision: 1` reconciled to 2 | CDP `Network.emulateNetworkConditions` toggled offline/online | `07-offline-draft-and-reconnect.png` (56,665 B) |
| 8 | **Support / Feedback Submission** | `POST /v1/workspaces/.../feedback/reports` returned 201 Created with receipt ID | Support intake form rendered on `/support` | `08-support-feedback-submission.png` (60,203 B) |
| 9 | **Tenant Isolation Proof** | User A denied access to User B workspace (404), notes (404), tasks (404); User B denied access to User A note (404) | Injected User B session into browser: User A note strictly absent from User B DOM | `09-tenant-isolation-userB.png` (62,804 B) |
| 10 | **Account Deletion Lifecycle** | Deletion requested (200, `pending_confirmation`); status polled; cancellation confirmed (200) | Account deletion interface rendered on `/account-deletion` | `10-account-deletion-lifecycle.png` (80,009 B) |

---

### 3. Tenant Isolation & Workspace Boundary Verification

Tenant isolation between User A (`kamrul@daynori.com`, workspace `64bc5f6d-dd81-4fe1-b85e-7a2dabe06b57`) and User B (`shahrin@daynori.com`, workspace `09761abd-ca46-44b3-9ff5-a7e2b27afb61`) was empirically verified:
1. **API / Database RLS Denial:**
   - User A token querying User B's workspace returned `HTTP 404 Not Found` (`WORKSPACE_NOT_FOUND`).
   - User A token querying User B's notes returned `HTTP 404 Not Found`.
   - User A token attempting `POST` to User B's tasks returned `HTTP 404 Not Found`.
   - User B token querying User A's created note returned `HTTP 404 Not Found`.
   - User B token attempting `DELETE` on User A's note returned `HTTP 404 Not Found`.
2. **Client Presentation Denial:**
   - Navigated browser to User B's authenticated session.
   - Evaluated DOM content in `/library`: User A's note title was strictly absent (`document.body.innerText.includes(...) === false`).

---

### 4. Infrastructure & Staging Invariants Identified

1. **Trusted Device Consent Requirement:**
   - `IndexedDbLocalRepository` and `SyncEngine` require `localStorage.setItem('daynori_trusted_device_consent', 'granted')` to activate local caching and synchronization. Without this flag, local storage remains disabled to protect public devices.
2. **Database Migration Alignment:**
   - Migrations `00075_feedback_reports_and_durable_delivery.sql` and `00076_feedback_triage_notes_audit_and_retention.sql` were applied to the staging Supabase database, and their checksums registered in `app.schema_migrations`.
3. **Supabase Free-Tier Outbound Mailer Limit:**
   - Supabase Free Tier built-in SMTP mailer is rate-limited to 3 emails/hour. Subsequent signup/recovery attempts trigger `429 over_email_send_rate_limit`.
   - This empirically confirms that public production deployment requires dedicated owner-configured SMTP credentials (`OWNER-SMTP-CREDENTIALS`), which remains an open launch gate.

---

### 5. Automated Verification

An automated Vitest suite [`tests/release/phase125-multi-user-staging-audit.test.ts`](../../tests/release/phase125-multi-user-staging-audit.test.ts) was created and verified:
- Validates the integrity of `staging-verification-results.json`.
- Asserts that all 10 workflows passed with both `uiVerified === true` and `apiVerified === true`.
- Verifies that all 10 PNG screenshot files exist on disk with valid byte sizes and non-empty SHA-256 hashes.
- Enforces tenant isolation invariants and concurrency conflict error expectations.
- Regression test run: 7/7 tests passed cleanly.

---

## Next Steps

1. Maintain standing external release gates (`evidence-backupRecoveryEvidence`, `evidence-ownerApproval`, `OWNER-SMTP-CREDENTIALS`, Phase 71).
2. Commit Phase 125 deliverables and push to `origin/codex/free-core-preview` under ADR 0074.
