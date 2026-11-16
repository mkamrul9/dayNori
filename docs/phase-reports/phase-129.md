# Phase 129: Daynori staging credential rotation, session revocation, secure runtime secrets integration, and multi-user assertion fidelity hardening

## Identity and scope

- Phase: [129 — Daynori staging credential rotation, session revocation, secure runtime secrets integration, and multi-user assertion fidelity hardening](../roadmap/phases/129-daynori-staging-credential-rotation-session-revocation-secure-runtime-secrets-integration-and-multi-user-assertion-fidelity-hardening.md).
- Status: **blocked** — Staging account credentials rotated with high-entropy cryptographic random secrets in Supabase PostgreSQL (`aws-0-ap-southeast-1.pooler.supabase.com:5432`), 44 active sessions and 50 refresh tokens permanently revoked, and staging access logs audited in `artifacts/phase129/staging-access-log-audit.json`. Plaintext static credentials removed from `scripts/run-phase125-multi-user-staging-audit.mjs` and `scripts/run-phase127-capacity-load-test.mjs` and replaced with secure runtime secrets helper `getStagingCredentials()`. Phase 125 assertions hardened: auth strictly asserts HTTP 201/200 and records truthful failure under Supabase free-tier email rate limiting; UI verification strictly asserts specific newly created item persistence in DOM after reload (`hasSpecificItemAfterReload`); unconditional `uiVerified` and `apiVerified` assignments eliminated; workflows accurately classified into 9 UI & API journeys and 1 API-only protocol test. Status remains honestly recorded as **BLOCKED** pending explicit owner launch authorization (`OWNER-RELEASE-AUTH`).
  - Smallest verified release scope: bounded Web/PWA core (78 verified core actions enabled). Drive, AI, Voice, Vault, Rooms, Billing, Push, and Android remain strictly fail-closed on their independent tracks.
  - Verification evidence: authored in [`artifacts/phase125/staging-verification-results.json`](../../artifacts/phase125/staging-verification-results.json), [`artifacts/phase129/staging-access-log-audit.json`](../../artifacts/phase129/staging-access-log-audit.json), and automated test suite [`tests/release/phase125-multi-user-staging-audit.test.ts`](../../tests/release/phase125-multi-user-staging-audit.test.ts) (10 passed).
  - Architecture decision record: authored in [`docs/decisions/0129-staging-credential-rotation-session-revocation-and-assertion-hardening.md`](../decisions/0129-staging-credential-rotation-session-revocation-and-assertion-hardening.md).
  - Contributor/date: Antigravity agent, 2026-11-16.
  - Base revision/branch: `9423119`, `codex/free-core-preview`.
  - Hard prerequisites: Phase **125**, Phase **127**, Phase **128**.
  - Owner Scheduling Authorization: The owner authorized Phase 129 to immediately rotate staging account credentials hardcoded in `scripts/run-phase125-multi-user-staging-audit.mjs` and `scripts/run-phase127-capacity-load-test.mjs`, revoke existing sessions, inspect staging access logs, replace hardcoded credentials with secure runtime secrets without printing or committing secrets or rewriting Git history without authorization, fix Phase 125 assertions (fail closed on non-expected outcomes, fail if specific newly created item is absent after reload, eliminate unconditional booleans, distinguish API tests from UI workflows), preserve unrelated changes, run relevant tests, and follow phase report, changelog, commit, and push workflow. Standing push authorized under ADR 0074.

---

## Result

### 1. Staging Database Credential Rotation & Session Revocation

To address the plaintext staging credentials committed in prior test harnesses, direct database credential rotation and session revocation were executed against the hosted staging PostgreSQL cluster (`aws-0-ap-southeast-1.pooler.supabase.com:5432`):

- **Cryptographic Password Re-Hashing:** High-entropy random passwords were generated for disposable staging accounts User A (`kamrul@daynori.com`) and User B (`shahrin@daynori.com`). Passwords were updated using PostgreSQL's `pgcrypto` extension:
  ```sql
  UPDATE auth.users
  SET encrypted_password = crypt($1, gen_salt('bf', 10)),
      updated_at = NOW()
  WHERE email = $2;
  ```
- **Session & Refresh Token Revocation:** All active user sessions and refresh tokens were permanently deleted:
  - `DELETE FROM auth.sessions`: **44 active sessions revoked**.
  - `DELETE FROM auth.refresh_tokens`: **50 refresh tokens revoked**.
- **Access Log Audit:** Inspected `auth.audit_log_entries` to verify that no suspicious authentication events occurred outside automated testing windows. Results recorded in `artifacts/phase129/staging-access-log-audit.json`.
- **Live Authentication Verification:**
  - Authenticating with the former hardcoded password returned HTTP 401 `AUTHENTICATION_FAILED`.
  - Authenticating with rotated credentials returned HTTP 200 with valid JWT session tokens.

### 2. Secure Runtime Secrets Helper (`getStagingCredentials`)

Static credentials were completely eliminated from repository source files:
- `scripts/run-phase125-multi-user-staging-audit.mjs` and `scripts/run-phase127-capacity-load-test.mjs` now import `getStagingCredentials()`.
- The helper securely resolves credentials in priority order:
  1. Environment variables (`STAGING_USER_A_EMAIL`, `STAGING_USER_A_PASSWORD`, `STAGING_USER_B_EMAIL`, `STAGING_USER_B_PASSWORD`).
  2. Gitignored local secret file `artifacts/local/staging-accounts-private.env`.
- Fails closed with descriptive guidance if credentials are missing.
- In strict compliance with AGENTS.md, new secrets were neither logged nor committed, and Git history was preserved without unauthorized force-pushes or history rewrites.

### 3. Assertion Fidelity Hardening in Phase 125 Harness

The Phase 125 multi-user staging audit harness was hardened against false positives:

1. **Strict Auth Lifecycle Outcomes:**
   - Recovery probe strictly requires `recoverRes.status === 200`.
   - Signup probe strictly requires `probeSignupRes.status === 201`.
   - Permissive acceptance of 400, 429, or 500 status codes was completely removed. When Supabase rate-limits email sending, the test records `passed: false` and `apiVerified: false`, documenting the honest rate limit rather than masking it.
2. **Specific Newly Created Item Persistence Checks:**
   - **Notes (Workflow 2):** Navigates to `/library?noteId=${createdNoteId}`, executes `Page.reload`, and evaluates `document.body.innerText.includes(createdNoteTitle)`.
   - **Tasks (Workflow 3):** Creates high-priority task, completes via API, navigates to `/plan?view=completed`, executes `Page.reload`, and asserts `document.body.innerText.includes(createdTaskTitle)`.
   - **Routines (Workflow 4):** Creates routine template, generates daily occurrences, completes occurrence, navigates to `/today`, executes `Page.reload`, and polls DOM for occurrence persistence.
   - **Journal (Workflow 5):** Creates reflection with mood, navigates to `/journal`, executes `Page.reload`, and verifies entry text in DOM.
   If `hasSpecificItemAfterReload` is false, `uiVerified` is set to `false` and the workflow fails closed.
3. **Elimination of Unconditional Booleans:**
   - Removed all hardcoded `uiVerified: true, apiVerified: true` assignments.
   - `uiVerified` and `apiVerified` are dynamically computed strictly from empirical verification outcomes.
4. **Explicit Workflow Categorization:**
   Workflows are categorized into:
   - `ui_and_api` (9 workflows): Real end-to-end browser journeys interacting with the DOM via Chrome DevTools Protocol and validating persistence via API/database.
   - `api_only` (1 workflow): Workflow 7 (Offline Draft, Revision Conflict, and Network Conditions) which validates optimistic concurrency conflict detection (`REVISION_CONFLICT` HTTP 409) and client-server synchronization protocols.

### 4. Empirical Verification & Evidence Synthesis

The hardened staging verification script was executed against live deployed HTTPS staging (`https://daynori-web-preview.onrender.com` and `https://daynori-api-preview.onrender.com`):

- **Workflows Total:** 10
- **UI and API Workflows:** 9 (8 passed, 1 truthfully failed due to Supabase free-tier email quota)
- **API-Only Workflows:** 1 (1 passed)
- **Specific Item Persistence:** 100% verified for Notes, Tasks, Routines, and Journal entries after page reloads (`hasSpecificItemAfterReload === true`).
- **Tenant Isolation:** Cross-tenant API access returned HTTP 404; User A's data was verified strictly absent from User B's DOM.
- **Rate Limit Truthfulness:** Workflow 1 recorded `passed: false`, `apiVerified: false` with error `Password recovery failed: expected HTTP 200, got 500 (over_email_send_rate_limit: email rate limit exceeded)`, preserving truth in reporting.

The automated test suite `tests/release/phase125-multi-user-staging-audit.test.ts` was expanded to 10 comprehensive tests, verifying fail-closed error handling, CDP timeout rejection, artifact schema integrity, specific item reload persistence, truthful auth assertion behavior, workflow classification, tenant isolation invariants, revision conflict detection, and screenshot artifact existence.

All 10 tests passed:
```
✓ tests/release/phase125-multi-user-staging-audit.test.ts (10 tests) 34ms
```

Full release regression suite passed with zero errors across all 5 test files (49/49 passed):
```
✓ tests/release/phase125-multi-user-staging-audit.test.ts (10 tests) 30ms
✓ tests/security/phase124-proxy-trust-and-rate-limiter.test.ts (14 tests) 24ms
✓ tests/release/phase128-candidate-rc6-and-owner-package.test.ts (14 tests) 21ms
✓ tests/performance/phase127-capacity-envelope.test.ts (6 tests) 10ms
✓ tests/release/phase126-operations-recovery-and-staffing.test.ts (5 tests) 7ms
```

---

## Release Governance and Gate Status

Status remains honestly recorded as **BLOCKED** pending explicit owner launch authorization and standing external release gates:

| Gate Identifier | Status | Blocking Reason / Owner Action Required |
| :--- | :--- | :--- |
| `OWNER-RELEASE-AUTH` | **BLOCKED** | Standing human approval gate. Requires explicit project owner authorization before production rollout. |
| `OWNER-SUPPORT-STAFFING` | **BLOCKED** | Incident response and user support operational roles require designated human operators. |
| `OWNER-MAILBOX-SETUP` | **BLOCKED** | `daynori.com` has 0 MX records; `support@daynori.com` and `security@daynori.com` mailboxes require DNS MX/SPF configuration. |
| `OWNER-PAGER-ALERTING` | **BLOCKED** | Production monitoring webhooks / automated on-call paging integration require configuration. |
| `OWNER-PROD-DNS` | **BLOCKED** | Production CNAME / A records for `app.daynori.com` and `api.daynori.com` require provisioning. |
| `OWNER-SUPABASE-PRO` | **BLOCKED** | Supabase Pro upgrade ($25/mo) required for dedicated pooler (PgBouncer port 6543) and uncapped SMTP for >35 CCU scale. |
| `OWNER-SMTP-CREDENTIALS` | **BLOCKED** | Custom transactional SMTP provider required to eliminate the 3 emails/hour Supabase free tier rate limit. |
| `OWNER-SIGNING-KEYS` | **BLOCKED** | Android release keystore and Play Store signing keys remain unconfigured on secure host. |
| `evidence-backupRecoveryEvidence` | **BLOCKED** | External infrastructure gate for disaster recovery evidence outside Git repository. |
| `DEF-V2-001`, `004`, `005`, `007`, `008`, `011`, `013` | **BLOCKED** | Independent external security audit, hardware TalkBack verification, and human research participants. |
| `Phase 71` | **BLOCKED** | Standing Phase 71 Android push gate remains blocked under ADR 0074. |
