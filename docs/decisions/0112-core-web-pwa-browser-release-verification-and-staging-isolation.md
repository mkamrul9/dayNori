# ADR-0112: Daynori Core Web/PWA Browser Release Verification and Staging Isolation Audit

- Status: accepted
- Date: 2026-11-14
- Owner/reviewer: Antigravity agent (owner-authorized Phase 112).
- Related: [Phase 112](../roadmap/phases/112-daynori-core-web-pwa-browser-release-verification-and-staging-isolation-audit.md), [Phase 104](../phase-reports/phase-104.md), [Phase 111](../phase-reports/phase-111.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [release-gates.md](../engineering/release-gates.md).
- Supersedes/superseded by: Replaces synthetic API-only and file-assertion "E2E" claims with real headless Chrome browser journeys executed against an isolated staging deployment (`daynori_test` PostgreSQL, synthetic RS256 Auth, Fastify API, production Next.js PWA web server, and CDP automation). Remediates core runtime validation handling (`errorHandler.ts`) and exposes DOM auth automation helpers. Confirms that all deferred and gated features (`DEF-V2-001`, `DEF-V2-004`, `DEF-V2-005`, `DEF-V2-007`, `DEF-V2-008`, `DEF-V2-011`, `DEF-V2-013`, `OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`, and Phase 71) remain strictly fail-closed and blocked.

---

## Context & Owner Scheduling Authorization

The project owner authorized Phase 112 with the following directive:

> "Select one bounded core web/PWA release-verification phase. Follow AGENTS.md and preserve existing edits. Replace API-only or file-assertion 'E2E' claims with actual browser journeys against an isolated staging deployment and database.
>
> Verify production-style sign-up/sign-in/recovery, two-account workspace isolation, note/task/routine/journal create-edit-save-reopen, search, attachments within the enabled scope, installed PWA cold offline reopen, queued mutations, conflict resolution, deletion/export recovery, Help, and support delivery. Exercise failure and retry cases with synthetic data. Check authorization at API and database boundaries, not only in UI. Record build SHA, environment, commands, browser captures, failures, and limits. Fix reproducible core defects in this bounded phase; keep unsupported features gated. Update the report, CHANGELOG, progress, and function register; commit and push the reviewed result."

---

## 1. Staging Environment Architecture & Isolation Controls

To ensure verification fidelity without polluting production or real user fixtures, Phase 112 executed against a fully isolated local staging topology:

1. **Database Tier (`PostgreSQL daynori_test`):**
   - Verified that all 80 schema migrations in `app.schema_migrations` are applied.
   - Dual connection pool architecture:
     - `adminPool`: Superuser pool for migration validation, test fixture provisioning, and raw isolation assertions.
     - `runtimePool`: Restricted role (`daynori_runtime`) enforcing PostgreSQL Row Level Security (`RLS`) and tenant session scoping (`SET LOCAL app.current_workspace_id`).
2. **Identity & Auth Tier (`Synthetic RS256 IdP` on port 54321):**
   - Standalone HTTP mock replicating Supabase Auth GoTrue contracts (`/auth/v1/signup`, `/auth/v1/token?grant_type=password`, `/auth/v1/recover`, `/auth/v1/user`, `/.well-known/jwks.json`).
   - Dynamically generated 2048-bit RS256 key pair with ephemeral public JWKS.
3. **API Tier (`Fastify API` on port 3114):**
   - Configured with `JwtVerifier` pointing to synthetic issuer `http://127.0.0.1:54321/auth/v1` and JWKS public key.
   - Initialized with `MemoryStorageProvider` and `PolicyMalwareScanner` for isolated binary upload handling.
4. **Web / PWA Tier (`Next.js Production Build` on port 3116):**
   - Production Next.js server (`next start`) executing against pre-built production bundle (`BUILD_ID: 0pVLVdS2656M-tozOD4je`).
   - Wired via environment variables to synthetic auth (`SUPABASE_AUTH_URL=http://127.0.0.1:54321`) and Fastify API (`DAYNORI_API_URL=http://127.0.0.1:3114`).
5. **Automation & Browser Tier (`Headless Chrome CDP` on port 9232):**
   - Launched with `--headless=new`, isolated profile directory, and Chrome DevTools Protocol (`CDP`) client over WebSocket.
   - Executes DOM interactions, clicks, input dispatch, network throttling/emulation (`Network.emulateNetworkConditions`), and full-page PNG captures.

---

## 2. Core Defects Remediated in Bounded Scope

During execution of the 10 browser journeys, two reproducible defects were identified and repaired:

### 2.1 Fastify ZodError Handling (HTTP 500 Crash on Validation Failure)
- **Defect:** In `apps/api/src/plugins/errorHandler.ts`, schema validation errors thrown by Zod in request parsing were caught by the global error handler. However, because `zod` was bundled in multiple packages, cross-package instances occasionally failed `error instanceof ZodError`. Fastify fell through to the unhandled error branch, logging an internal crash and returning HTTP 500 `INTERNAL_SERVER_ERROR`.
- **Remediation:** Updated `errorHandler.ts` to inspect both `error instanceof ZodError` and `(error as { name?: string })?.name === 'ZodError'`. Safely formats validation issues into HTTP 400 Bad Request with `ApiErrorCode.VALIDATION_FAILED` and structured field issues.

### 2.2 Client-Side Auth DOM Automation Support
- **Defect:** In `apps/web/src/components/AuthContext.tsx`, `window.__daynoriAuth` exposed basic session inspection but lacked `recoverPassword` and `provisionPersonalWorkspace` programmatic handlers, preventing automated DOM password reset verification.
- **Remediation:** Added `recoverPassword` and `provisionPersonalWorkspace` to `window.__daynoriAuth` during development/staging runtimes.

---

## 3. Real Browser User Journeys Verification Matrix (10/10 Passed)

The test runner (`scripts/run-phase112-staging-release-verification.mjs`) executed 10 end-to-end browser journeys, recording DOM evidence and PNG screenshots in `artifacts/phase112/screenshots/`:

| Journey ID | Title / Target Scope | Result | Key Evidence / Screenshot |
| :--- | :--- | :---: | :--- |
| `journey-01-auth-lifecycle` | Sign-up, password recovery instruction, authenticated sign-in | **PASS** | Synthetic user registration, recovery dispatch, session cookie, `#session-email` DOM presence (`journey-01-auth-signin.png`). |
| `journey-02-workspace-isolation` | Two-account isolation at UI, API, and SQL boundaries | **PASS** | Bob client GET/PATCH against Alice's note rejected with 404; direct SQL confirms 0 records visible in Bob's workspace; raw DB confirms row owned by Alice (`journey-02-workspace-isolation.png`). |
| `journey-03-core-organizer-crud` | Note, task, routine, journal create-edit-save-reopen | **PASS** | Note created with AST doc and reopened (rev 1); task created and marked completed; routine registered; journal saved for date (`journey-03-note-reopen.png`). |
| `journey-04-unified-search` | Unified organizer search (positive match + negative empty) | **PASS** | Query `"Staging Architecture"` matches note; query `"nonexistent-query-xyz-987"` returns clean empty state (`journey-04-search-results.png`). |
| `journey-05-attachments-scope` | Attachments within scope; Drive & Vault gated | **PASS** | File reservation (201) and finalization (200) verified; storage quota committed; Drive returns 404/403; Vault returns 403 (`journey-05-attachments-scope.png`). |
| `journey-06-pwa-offline-reopen` | PWA manifest, service worker, cold offline reopen | **PASS** | `manifest.json` valid; `sw.js` and `offline-shell.html` active; CDP network emulation (`offline: true`) preserves offline shell and banner (`journey-06-pwa-offline-reopen.png`). |
| `journey-07-concurrency-conflict-resolution` | Optimistic concurrency conflict (409) and recovery | **PASS** | Outdated revision update rejected with HTTP 409 `REVISION_CONFLICT`; refresh and update with baseRevision 2 succeeds at rev 3 (`journey-07-conflict-resolution.png`). |
| `journey-08-deletion-and-export` | Soft deletion suppression, export JSON, deletion request | **PASS** | Soft-deleted item returns 404; workspace export bundle generated; public deletion request dispatched (`journey-08-export-lifecycle.png`). |
| `journey-09-help-and-support-delivery` | Help knowledge base exploration and triage queue progression | **PASS** | Help article inspected; support report submitted; operator triage updates status to `triaged` and appends note (`journey-09-support-triaged.png`). |
| `journey-10-failure-and-gating-cases` | Validation error (400), token rejection (401), Ask Nori gating | **PASS** | Invalid task returns 400; unauthenticated note returns 401; Ask Nori route `/v1/ai/assistant/history` returns 403; banner explains gating (`journey-10-failure-gating.png`). |

---

## 4. Preservation of Standing Release Gates

In accordance with project governance and [ADR 0074](0074-standing-phase71-scheduling-and-push.md), local staging release verification does **NOT** constitute a production launch or public release. All deferred and unverified features remain strictly gated:

1. `DEF-V2-001` (Encrypted Vault binary storage): Gated (HTTP 403).
2. `DEF-V2-004` (Shared Workspaces / Rooms): Gated (HTTP 403).
3. `DEF-V2-005` (Google Drive Full Two-Way Sync): Gated (HTTP 403/404).
4. `DEF-V2-007` (Billing, Invoicing, and Subscriptions): Gated (HTTP 403).
5. `DEF-V2-008` (Ask Nori Live AI Provider Transmission): Gated (HTTP 403 / UI Banner).
6. `DEF-V2-011` (Voice Assistant Live Pipeline): Gated (HTTP 403 / UI Banner).
7. `DEF-V2-013` (Native Android Production Release): Gated.
8. `OWNER-SIGNING-KEYS`: Pending owner provisioning.
9. `OWNER-RELEASE-AUTH`: Pending owner publication authorization.
10. `Phase 71`: Blocked on physical Android hardware and spoken TalkBack ear verification.
