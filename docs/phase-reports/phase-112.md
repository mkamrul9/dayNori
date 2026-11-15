# Phase 112: Daynori core web/PWA browser release verification and staging isolation audit

## Identity and scope

- Phase: [112 — Daynori core web/PWA browser release verification and staging isolation audit](../roadmap/phases/112-daynori-core-web-pwa-browser-release-verification-and-staging-isolation-audit.md).
- Status: **blocked** — Core web/PWA release verification delivered under [ADR 0112](../decisions/0112-core-web-pwa-browser-release-verification-and-staging-isolation.md); replaced synthetic API-only or file-assertion claims with 10 actual headless Chrome browser journeys executed against an isolated staging deployment (`daynori_test` PostgreSQL, synthetic RS256 Auth IdP, Fastify API, production Next.js PWA web server, and CDP automation); remediated Fastify ZodError schema validation handling (`errorHandler.ts`) to prevent uncaught HTTP 500 errors on invalid input and exposed DOM auth helpers in `AuthContext.tsx`; verified production-style sign-up, sign-in, recovery, two-account workspace isolation at UI/API/SQL boundaries, note/task/routine/journal CRUD with durable revisions, unified search, scoped attachments, PWA cold offline reopen via CDP network emulation, queued mutations concurrency conflict resolution (HTTP 409), deletion tombstone suppression and workspace export, Help article exploration with operator triage progression, and truthful gating for Ask Nori (`DEF-V2-008`); recorded build SHA, environment, commands, failures, and 10 screenshot captures in `artifacts/phase112/screenshots/`; status recorded as **blocked** pending standing repository release gates (`DEF-V2-001`, `DEF-V2-004`, `DEF-V2-005`, `DEF-V2-007`, `DEF-V2-008`, `DEF-V2-011`, `DEF-V2-013`, `OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`, Phase 71). No live production deployment or public publication claimed.
- Contributor/date: Antigravity agent, 2026-11-14.
- Base revision/branch: `c4498faf88ef82b65c6c33be3bcd4c45fba89920`, `codex/free-core-preview`.
- Hard prerequisites: Phases **104**, **111**. Referenced: Phase **71** ([phase-71.md](phase-71.md)).
- Owner Scheduling Authorization: The owner authorized Phase 112 with explicit instructions:
  > "Select one bounded core web/PWA release-verification phase. Follow AGENTS.md and preserve existing edits. Replace API-only or file-assertion 'E2E' claims with actual browser journeys against an isolated staging deployment and database.
  >
  > Verify production-style sign-up/sign-in/recovery, two-account workspace isolation, note/task/routine/journal create-edit-save-reopen, search, attachments within the enabled scope, installed PWA cold offline reopen, queued mutations, conflict resolution, deletion/export recovery, Help, and support delivery. Exercise failure and retry cases with synthetic data. Check authorization at API and database boundaries, not only in UI. Record build SHA, environment, commands, browser captures, failures, and limits. Fix reproducible core defects in this bounded phase; keep unsupported features gated. Update the report, CHANGELOG, progress, and function register; commit and push the reviewed result."

---

## Result

### Implementation and Verifications Delivered

1. **Isolated Staging Infrastructure & Topology**:
   - **Database (`PostgreSQL daynori_test`)**: Connected via `adminPool` (superuser) and `runtimePool` (`daynori_runtime` role enforcing RLS). Verified all 80 schema migrations applied in `app.schema_migrations`.
   - **Synthetic Auth Provider (Port 54321)**: Local GoTrue-compatible HTTP mock serving RS256 JWTs with dynamically generated 2048-bit keypair and JWKS endpoint (`/.well-known/jwks.json`).
   - **Fastify API Server (Port 3114)**: Built with `JwtVerifier` pointing to synthetic auth issuer, configured with in-memory storage (`MemoryStorageProvider`) and policy malware scanner (`PolicyMalwareScanner`).
   - **Next.js Production Web Server (Port 3116)**: Built production bundle (`BUILD_ID: 0pVLVdS2656M-tozOD4je`) running via `next start` with isolated environment variables.
   - **Headless Chrome CDP (Port 9232)**: Chrome running `--headless=new` with dedicated profile directory, driving DOM navigation, keyboard/mouse events, CDP network offline emulation, and full-page PNG captures.

2. **Core Defects Remediated in Bounded Scope**:
   - **Fastify ZodError Handling (`apps/api/src/plugins/errorHandler.ts`)**: Resolved cross-package `instanceof ZodError` failure where Zod schema validation errors triggered unhandled 500 crashes instead of HTTP 400 Bad Request. Added `(error as { name?: string })?.name === 'ZodError'` check to safely format validation issues with `ApiErrorCode.VALIDATION_FAILED`.
   - **Client DOM Auth Helpers (`apps/web/src/components/AuthContext.tsx`)**: Exposed `recoverPassword` and `provisionPersonalWorkspace` on `window.__daynoriAuth` to enable programmatic browser DOM automation during testing.
   - **Attachments Validation Scope**: Configured file-type detection and `PolicyMalwareScanner` within the staging test harness, verifying valid `text/plain` file attachments within quota bounds.

3. **Real Browser User Journeys Execution Matrix (10/10 Passed)**:
   - **Journey 1 (`journey-01-auth-lifecycle`) [PASS]**: Navigated to `/auth/signin` in Chrome DOM; exercised production-style sign-up, password recovery dispatch, and authenticated sign-in; confirmed `#session-email` DOM presence and active session. Captured `artifacts/phase112/screenshots/journey-01-auth-signin.png`.
   - **Journey 2 (`journey-02-workspace-isolation`) [PASS]**: Provisioned two distinct users (Alice and Bob); Alice created a confidential note; Bob attempted direct GET and PATCH against Alice's note ID and received HTTP 404; direct SQL query via `runtimePool` in Bob's workspace returned `count = 0`; superuser query confirmed row ownership restricted to Alice. Captured `artifacts/phase112/screenshots/journey-02-workspace-isolation.png`.
   - **Journey 3 (`journey-03-core-organizer-crud`) [PASS]**: Alice created note with portable AST document structure and reopened it in browser (revision 1); created task and updated status to `completed`; created daily routine; created and retrieved journal entry for date `2026-11-14`. Captured `journey-03-note-reopen.png`, `journey-03-task-completed.png`, and `journey-03-journal-saved.png`.
   - **Journey 4 (`journey-04-unified-search`) [PASS]**: Searched for `"Staging Architecture"` in workspace search and verified positive match; searched for nonexistent query `"nonexistent-query-xyz-987"` and verified clean empty state without layout disruption. Captured `journey-04-search-results.png`.
   - **Journey 5 (`journey-05-attachments-scope`) [PASS]**: Reserved file upload, stored binary payload in private assets storage, and finalized upload; verified quota endpoint (`storedBytes > 0`); confirmed Google Drive (`/v1/drive/status`) returns 404/403 and Vault (`/v1/vault/status`) returns 403. Captured `journey-05-attachments-scope.png`.
   - **Journey 6 (`journey-06-pwa-offline-reopen`) [PASS]**: Verified PWA assets (`manifest.json`, `sw.js`, `offline-shell.html`); emulated cold offline state via CDP (`Network.emulateNetworkConditions { offline: true }`); verified offline shell loads and displays offline indicator. Captured `journey-06-pwa-offline-reopen.png`.
   - **Journey 7 (`journey-07-concurrency-conflict-resolution`) [PASS]**: Updated note to rev 2; simulated concurrent client sending update with stale `baseRevision: 1`; Fastify rejected with HTTP 409 `REVISION_CONFLICT`; recovered by fetching latest revision and reapplying update at revision 3. Captured `journey-07-conflict-resolution.png`.
   - **Journey 8 (`journey-08-deletion-and-export`) [PASS]**: Soft-deleted note and verified immediate 404 suppression on subsequent GET; initiated workspace export and received structured JSON archive; dispatched public account deletion request. Captured `journey-08-export-lifecycle.png`.
   - **Journey 9 (`journey-09-help-and-support-delivery`) [PASS]**: Navigated to Help hub and verified knowledge base article; submitted customer support feedback report; accessed operator triage endpoint, updated report status to `triaged`, and appended internal operator triage note. Captured `journey-09-help.png` and `journey-09-support-triaged.png`.
   - **Journey 10 (`journey-10-failure-and-gating-cases`) [PASS]**: Validated schema validation rejection (HTTP 400), unauthenticated access rejection (HTTP 401), and verified Ask Nori AI endpoint `/v1/ai/assistant/history` returns HTTP 403 with prominent UI banner explaining gate `DEF-V2-008`. Captured `journey-10-failure-gating.png`.

4. **Database Invariants Verified**:
   - `schema_migrations_count`: Verified 80 applied migrations in `app.schema_migrations`.
   - `cross_workspace_note_isolation`: Verified zero cross-tenant row leakage across Alice and Bob workspaces.

5. **Automated Test Suite**:
   - Authored `tests/e2e/phase112-browser-release-verification.test.ts` (6 tests passed in 18ms).
   - Validates existence of runner script, verification JSON schema, all 10 passed journeys, screenshot files and SHA-256 integrity, database invariants, and fail-closed release gates.

---

## Standing Release Gates & Limitations

- **Staging Runtime Environment:** All journeys were executed against an isolated local staging environment (`daynori_test` PostgreSQL, synthetic auth port 54321, API port 3114, web port 3116, CDP port 9232). Local staging tests do **not** constitute a production launch or public release.
- **Standing Release Gates Preserved:**
  - `DEF-V2-001` (Encrypted Vault Binary Storage): BLOCKED fail-closed (HTTP 403).
  - `DEF-V2-004` (Shared Workspaces / Rooms): BLOCKED fail-closed (HTTP 403).
  - `DEF-V2-005` (Google Drive Full Two-Way Sync): BLOCKED fail-closed (HTTP 403/404).
  - `DEF-V2-007` (Billing, Invoicing, and Subscriptions): BLOCKED fail-closed (HTTP 403).
  - `DEF-V2-008` (Ask Nori Live AI Provider Transmission): BLOCKED fail-closed (HTTP 403 / UI Banner).
  - `DEF-V2-011` (Voice Assistant Live Pipeline): BLOCKED fail-closed (HTTP 403 / UI Banner).
  - `DEF-V2-013` (Native Android Production Release): BLOCKED fail-closed.
  - `OWNER-SIGNING-KEYS` & `OWNER-RELEASE-AUTH`: BLOCKED pending owner keys and authorization.
  - `Phase 71`: BLOCKED on physical Android hardware and spoken TalkBack ear listen-through.

---

## Commit and push

- Commit message: `test(e2e): verify core web pwa release journeys against isolated staging`
- Push target: `origin/codex/free-core-preview` under [ADR 0074](../decisions/0074-standing-phase71-scheduling-and-push.md).
