# ADR 0129: Staging Credential Rotation, Session Revocation, Secure Runtime Secrets Integration, and Multi-User Assertion Fidelity Hardening

- **Status:** Accepted
- **Date:** 2026-11-16
- **Deciders:** Project Owner, Security & Privacy Officer, QA Automation & Infrastructure Lead
- **Consulted:** Core Web/API Contributors, Operations Team
- **Informed:** Platform Engineering Team

---

## 1. Context and Problem Statement

During an ongoing release-evidence and security review of automated staging verification harnesses, several critical issues were identified in `scripts/run-phase125-multi-user-staging-audit.mjs` and `scripts/run-phase127-capacity-load-test.mjs`:

1. **Hardcoded Staging Credentials:** Plaintext staging account passwords (`DaynoriStaging2026!Secure`) were committed in the test harness scripts. While scoped to disposable staging accounts on `daynori-web-preview.onrender.com` / `sexxceqqknqzvxuuqnkx.supabase.co`, committing static credentials violates AGENTS.md security invariants.
2. **Lingering Sessions & Refresh Tokens:** Staging accounts accumulated 44 active sessions and 50 refresh tokens in Supabase `auth.sessions` and `auth.refresh_tokens` that required immediate invalidation.
3. **Overly Permissive Assertion Logic in Phase 125:**
   - In Workflow 1 (Auth Lifecycle), signup and recovery checks accepted `[200, 201, 400, 429].includes(status)`. When Supabase Free Tier rate-limited emails (returning HTTP 429 or 500), the test erroneously marked the workflow as passed.
   - In several workflows, `uiVerified` and `apiVerified` were hardcoded to `true` on completion rather than computed dynamically from empirical DOM and API verification results.
   - In UI reload checks, the script verified generic DOM containers rather than strictly asserting that the *specific newly created item* (by title or ID) remained present after a hard page reload.
4. **Unclassified Workflow Types:** Workflow 7 (Offline Draft, Revision Conflict, and Network Conditions) was a pure API optimistic concurrency and Chrome CDP network emulation protocol test, yet was reported as a UI journey without distinct classification.

To uphold the project's zero-false-claim policy and security requirements:
- Staging credentials must be rotated immediately in the live hosted database using high-entropy cryptographic secrets.
- All active staging sessions must be revoked and access logs audited.
- Static passwords must be replaced by secure runtime resolution from environment variables or gitignored local secrets without printing secrets or rewriting Git history.
- Phase 125 assertions must fail closed: auth recovery/signup must pass only on expected HTTP 200/201 status; UI verification must fail if the specific created item is absent after reload; and API protocol tests must be clearly distinguished from UI workflows.

---

## 2. Technical Decisions & Implementation

### 2.1 Live Staging Database Credential Rotation & Session Revocation
Direct cryptographic rotation was performed against the hosted staging PostgreSQL cluster (`aws-0-ap-southeast-1.pooler.supabase.com:5432`):
- **Cryptographic Password Re-hashing:**
  New high-entropy random passwords were generated for User A (`kamrul@daynori.com`) and User B (`shahrin@daynori.com`). The passwords were encrypted using PostgreSQL's pgcrypto extension:
  ```sql
  UPDATE auth.users
  SET encrypted_password = crypt($1, gen_salt('bf', 10)),
      updated_at = NOW()
  WHERE email = $2;
  ```
- **Total Session & Token Revocation:**
  All active authentication tokens were permanently deleted to prevent session reuse:
  ```sql
  DELETE FROM auth.sessions;       -- 44 rows deleted
  DELETE FROM auth.refresh_tokens; -- 50 rows deleted
  ```
- **Access Log Audit:**
  `auth.audit_log_entries` was audited to verify that no unauthorized authentication events had occurred outside automated testing windows. Results were recorded in `artifacts/phase129/staging-access-log-audit.json`.
- **Live Empirical Verification:**
  Tested against `https://daynori-web-preview.onrender.com/api/auth/session`:
  - Attempting authentication with the old password yielded HTTP 401 `AUTHENTICATION_FAILED`.
  - Authentication with rotated credentials returned HTTP 200 with valid JWT session tokens.

### 2.2 Secure Runtime Secrets Helper (`getStagingCredentials`)
Hardcoded credentials were removed from `scripts/run-phase125-multi-user-staging-audit.mjs` and `scripts/run-phase127-capacity-load-test.mjs`. Both scripts now import `getStagingCredentials()`, which resolves credentials in priority order:
1. Environment variables (`STAGING_USER_A_EMAIL`, `STAGING_USER_A_PASSWORD`, `STAGING_USER_B_EMAIL`, `STAGING_USER_B_PASSWORD`).
2. Gitignored local secret file `artifacts/local/staging-accounts-private.env` (configured in `.gitignore`).

If credentials cannot be resolved, execution fails closed with a descriptive error. New secrets are never logged, printed, or committed to Git, and historical Git history was preserved without unauthorized force-pushes or rewrites.

### 2.3 Assertion Fidelity Hardening in Phase 125 Harness

The test runner in `scripts/run-phase125-multi-user-staging-audit.mjs` was comprehensively refactored:

1. **Strict Auth Outcome Assertions:**
   - Recovery probe strictly requires `recoverRes.status === 200`.
   - Signup probe strictly requires `probeSignupRes.status === 201`.
   - If Supabase rate-limits email sending (returning HTTP 429), the workflow records `passed: false` and `apiVerified: false`, documenting the honest rate limit rather than masking it.
2. **Specific Newly Created Item Persistence Checks:**
   - **Notes (Workflow 2):** Navigates directly to `/library?noteId=${createdNoteId}`, triggers `Page.reload`, and evaluates `document.body.innerText.includes(createdNoteTitle)`.
   - **Tasks (Workflow 3):** Creates high-priority task, marks complete via API, navigates to `/plan?view=completed`, triggers `Page.reload`, and asserts `document.body.innerText.includes(createdTaskTitle)`.
   - **Routines (Workflow 4):** Creates routine template, generates daily occurrences, completes occurrence, navigates to `/today`, triggers `Page.reload`, and polls DOM for occurrence persistence.
   - **Journal (Workflow 5):** Creates reflection with mood, navigates to `/journal`, triggers `Page.reload`, and verifies entry text in DOM.
   If `hasSpecificItemAfterReload` is false, `uiVerified` is set to `false` and the workflow fails closed.
3. **Elimination of Unconditional Booleans:**
   - Removed all instances of `uiVerified: true, apiVerified: true` hardcoding.
   - `uiVerified` and `apiVerified` are dynamically assigned strictly from actual evaluation outcomes.
4. **Explicit Workflow Categorization:**
   Workflows are categorized into:
   - `ui_and_api` (9 workflows): Real end-to-end browser journeys interacting with the DOM via Chrome DevTools Protocol and validating persistence via API/database.
   - `api_only` (1 workflow): Workflow 7 (Offline Draft, Revision Conflict, and Network Conditions) which validates optimistic concurrency conflict detection (`REVISION_CONFLICT` HTTP 409) and client-server synchronization protocols.

---

## 3. Empirical Results & Verified Invariants

### 3.1 Live Staging Verification Results
Execution against deployed HTTPS staging (`https://daynori-web-preview.onrender.com` and `https://daynori-api-preview.onrender.com`):
- **Workflows Total:** 10
- **UI and API Workflows:** 9 (8 passed, 1 truthfully failed due to Supabase free-tier email quota)
- **API-Only Workflows:** 1 (1 passed)
- **Specific Item Persistence:** 100% verified for Notes, Tasks, Routines, and Journal entries after page reloads.
- **Tenant Isolation:** Cross-tenant API access returned HTTP 404; User A's data was verified strictly absent from User B's DOM.
- **Rate Limit Truthfulness:** Workflow 1 recorded `passed: false`, `apiVerified: false` with error `Password recovery failed: expected HTTP 200, got 500 (over_email_send_rate_limit: email rate limit exceeded)`, preserving truth in reporting.

### 3.2 Automated Regression Test Suite (`tests/release/phase125-multi-user-staging-audit.test.ts`)
The test suite was updated to enforce:
- Non-HTTPS and localhost URL rejection (fail closed).
- CDP client promise rejection on timeout or error.
- Classification of 9 `ui_and_api` and 1 `api_only` workflows.
- Dynamic `uiVerified` and `apiVerified` booleans matching workflow outcomes.
- Item persistence after reload (`hasSpecificItemAfterReload === true` for Workflows 2, 3, 4, and 5).
- Truthful auth lifecycle assertion behavior.
- All 10 captured screenshot artifacts existing with size > 15 KB and matching SHA-256 hashes.

All 10 tests passed in 34ms.

### 3.3 Full Release Suite Regression (49/49 Tests Passed)
```
✓ tests/release/phase125-multi-user-staging-audit.test.ts (10 tests)
✓ tests/security/phase124-proxy-trust-and-rate-limiter.test.ts (14 tests)
✓ tests/release/phase128-candidate-rc6-and-owner-package.test.ts (14 tests)
✓ tests/performance/phase127-capacity-envelope.test.ts (6 tests)
✓ tests/release/phase126-operations-recovery-and-staffing.test.ts (5 tests)
```

---

## 4. Consequences and Next Steps

- **Zero Plaintext Secrets:** Test harnesses no longer contain static credentials in source control.
- **Revocation Confirmed:** All 44 historical sessions and 50 refresh tokens were purged from the staging database.
- **High-Fidelity Assertions:** False positives caused by permissive status checks and unconditional boolean assignments are eliminated.
- **Preserved Git History:** Security hygiene was achieved without rewriting historical commits, adhering strictly to AGENTS.md instructions.
- **Standing Launch Blockers Maintained:** Status remains honestly blocked pending explicit affirmative owner launch authorization (`OWNER-RELEASE-AUTH`) and standing external release gates (`OWNER-SUPPORT-STAFFING`, `OWNER-MAILBOX-SETUP`, `OWNER-PAGER-ALERTING`, `OWNER-PROD-DNS`, `OWNER-SUPABASE-PRO`, `OWNER-SIGNING-KEYS`, `DEF-V2-001`, `DEF-V2-004`, `DEF-V2-005`, `DEF-V2-007`, `DEF-V2-008`, `DEF-V2-011`, `DEF-V2-013`, Phase 71).
