# Phase 120: Daynori production-focused security and privacy review and vulnerability remediation of the enabled web core

## Identity and scope

- Phase: [120 — Daynori production-focused security and privacy review and vulnerability remediation of the enabled web core](../roadmap/phases/120-daynori-production-focused-security-and-privacy-review-and-vulnerability-remediation-of-the-enabled-web-core.md).
- Status: **blocked** — Comprehensive production-focused security and privacy review of the enabled web core completed across authorization, workspace membership on every request, entity object, background job, and search result; input validation, file handling, session management, token revocation blacklist (`app.revoked_tokens`), rate limiting, dependency vulnerabilities (`pnpm audit`), secrets isolation, structured log redaction, account deletion, backups, and disaster recovery. Remediated confirmed vulnerabilities: neutralized critical Next.js SVG Image Optimization API remote code execution vulnerability (GHSA-2464-fhr4-w9xw) by enforcing `images.unoptimized: true` in `apps/web/next.config.mjs`; hardened `sanitizeLogString` in `apps/api/src/plugins/logger.ts` to fully redact database connection URLs with passwords containing `@` symbols; and decoupled HTTP header redaction from body key regexes in `sanitizeHeaders` to preserve benign standard metadata headers. Established operational incident response and user support roster in `docs/operations/incident-response-and-support-roster.md`. Cataloged unresolved risks and public launch blockers in `artifacts/phase120/security-review-findings.json`. In strict compliance with AGENTS.md, **security is NOT marked complete based solely on local automated unit tests**; status remains honestly recorded as **BLOCKED** pending standing external release gates (`DEF-V2-001`, `DEF-V2-004`, `DEF-V2-005`, `DEF-V2-007`, `DEF-V2-008`, `DEF-V2-011`, `DEF-V2-013`, `OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`, Phase 71).
  - Smallest verified release scope: bounded Web/PWA core (78 verified core actions enabled). Drive, AI, Voice, Vault, Rooms, Billing, Push, and Android remain fail-closed on their independent tracks.
  - Verification evidence: authored in [`artifacts/phase120/security-review-findings.json`](../../artifacts/phase120/security-review-findings.json), [`docs/operations/incident-response-and-support-roster.md`](../operations/incident-response-and-support-roster.md), and automated test suite [`tests/security/phase120-production-security-review.test.ts`](../../tests/security/phase120-production-security-review.test.ts).
  - Architecture decision record: authored in [`docs/decisions/0120-production-security-privacy-review-and-remediation.md`](../decisions/0120-production-security-privacy-review-and-remediation.md).
- Contributor/date: Antigravity agent, 2026-11-15.
- Base revision/branch: `8abb56285a85ae7f4bcff0ad2669e4ceae30948c`, `codex/free-core-preview`.
- Hard prerequisites: Phase **102**, Phase **112**, Phase **118**, Phase **119**.
- Owner Scheduling Authorization: The owner authorized Phase 120 for production-focused security and privacy review and vulnerability remediation. Standing push authorized under ADR 0074.

---

## Result

### Implementation and Verifications Delivered

1. **Authorization & Workspace Scoping Audit**:
   - Audited all API routes, object retrieval methods, background worker jobs, and search results.
   - Every protected route enforces `withTenantContext` or `withUserContext` with explicit membership verification via `SELECT app.user_has_workspace_role($1, 'viewer'|'editor')`.
   - Foreign workspace queries throw `NotFoundError('Workspace not found or unauthorized')` (404) or `ForbiddenError` (403), eliminating cross-tenant object reference vulnerabilities (IDOR).
   - Search queries in `apps/api/src/modules/search/service.ts` strictly enforce `workspace_id = $1`, `security_scope != 'vault'`, and `deleted_at IS NULL`.
   - Background worker jobs set tenant context (`app.current_workspace_id` and `app.current_user_id`) and explicitly qualify all database queries with `WHERE id = $1 AND workspace_id = $2`.

2. **Input Validation, Body Limits & Request ID Sanitization**:
   - Strict Zod schemas validated across all request parameters, queries, and bodies before domain execution.
   - Fastify enforces `bodyLimit: 1048576` (1 MiB), blocking memory exhaustion attacks via oversized request bodies.
   - Positional parameters (`$1`, `$2`, etc.) used exclusively in all SQL queries, preventing SQL injection.
   - `sanitizeRequestId` validates incoming request IDs against `/^[a-zA-Z0-9_-]{1,64}$/`, replacing malformed strings, injection attempts, or oversized values with cryptographic UUIDs.

3. **File Handling & Quarantine Enforcement**:
   - Uploads follow a two-phase reservation and client checksum finalization protocol.
   - `getFileDownloadCapability` strictly checks `quarantineStatus === 'verified'`. Files in `quarantined` or `pending` status throw `FileNotReadyError` (HTTP 409), preventing uninspected file distribution.
   - Signed download capabilities expire in 300 seconds.

4. **Session Management, Token Revocation & Rate Limiting**:
   - `JwtVerifier` validates cryptographic signatures, issuer, audience, and expiration.
   - Blacklisted tokens recorded in `app.revoked_tokens` via SHA-256 hash are immediately rejected with HTTP 401 (`TOKEN_REVOKED`).
   - `ProcessLocalRateLimiter` enforces a sliding window budget (60 req/min) keyed by verified actor ID or IP, returning standard `X-RateLimit-*` and `Retry-After` headers on 429.

5. **Confirmed Findings & Vulnerability Remediations**:
   - **GHSA-2464-fhr4-w9xw (Critical Next.js Image Optimization SVG RCE):** Remediated by adding `images: { unoptimized: true }` to `apps/web/next.config.mjs`. Daynori uses local vector brand assets and does not require remote server-side image scaling; disabling the optimization handler closes the attack surface completely.
   - **PostgreSQL Connection URL Credential Redaction:** Remediated regex in `apps/api/src/plugins/logger.ts` to `/(postgres(?:ql)?:\/\/[^:]+:)(.*)(@[^/@:]+(?::\d+)?(?:\/|\?|$))/g`, ensuring database passwords containing `@` symbols are fully redacted rather than partially leaked.
   - **Header Redaction Decoupling:** Decoupled HTTP header sanitization in `sanitizeHeaders` from `SENSITIVE_KEY_PATTERN` into a dedicated `SENSITIVE_HEADER_PATTERN`, ensuring standard metadata headers like `content-type: application/json` are preserved while authorization headers, cookies, and tokens are redacted.

6. **Account Deletion & Deletion Suppression Ledger**:
   - Verified account deletion lifecycle: request initiation, confirmation token verification, initiating session hash matching, and cancellation deadline validation.
   - Relational account purge cascades through workspaces, memberships, devices, push subscriptions, and AI index chunks.
   - Irreversible tombstones recorded in `app.deletion_suppression_ledger` (`account:${userId}:${email}` and `workspace:${wsId}`), ensuring purged entities cannot be revived by database backups.

7. **Disabled Modules Fail-Closed Verification**:
   - Global Fastify `onRequest` hook immediately rejects unreleased routes with HTTP 403 Forbidden: Vault (`/v1/vault`), AI Assistant (`/v1/ai`), Rooms Collaboration (`/v1/rooms`), and In-App Billing (`/v1/billing`).
   - Voice and Google Drive modules fail safe with missing credential/permission errors.

8. **Operational Incident Response & User Support Roster**:
   - Authored `docs/operations/incident-response-and-support-roster.md` detailing designated operator roles (Incident Commander, Technical Operations Lead, Security & Privacy Officer, Support & Communications Lead), contact channels (`security@daynori.com`, `support@daynori.com`), severity SLOs (SEV-1 acknowledged < 15m, mitigated < 1h; SEV-2 acknowledged < 1h, mitigated < 4h), escalation pathways, and emergency rollback playbooks.

9. **Automated Security Test Suite**:
   - Authored `tests/security/phase120-production-security-review.test.ts` (14 tests passed in 158ms).

---

## Verification Evidence Matrix

| Check ID | Security Dimension | Verification Standard | Result |
| :--- | :--- | :--- | :--- |
| `SEC-01-AUTH-ISOLATION` | Authorization | Workspace role assertion on every route, object, job, search | **Passed** |
| `SEC-02-INPUT-VALIDATION` | Input Validation | Zod schema validation, SQL parameterization, 1MB bodyLimit | **Passed** |
| `SEC-03-REQUEST-ID-GUARD` | Injection Defense | `sanitizeRequestId` regex enforcement and UUID fallback | **Passed** |
| `SEC-04-FILE-QUARANTINE` | File Handling | `quarantineStatus === 'verified'` requirement, 300s token expiry | **Passed** |
| `SEC-05-TOKEN-REVOCATION` | Sessions | `app.revoked_tokens` blacklist check in `JwtVerifier` | **Passed** |
| `SEC-06-RATE-LIMITING` | Throttling | `ProcessLocalRateLimiter` 60 req/min with `Retry-After` on 429 | **Passed** |
| `SEC-07-NEXTJS-HARDENING` | Dependencies | `next.config.mjs` enforces `images.unoptimized: true` (GHSA-2464) | **Passed** |
| `SEC-08-LOG-REDACTION` | Privacy / Secrets | `SafeLogger` redacts JWTs, database URLs with `@`, passwords | **Passed** |
| `SEC-09-HEADER-REDACTION`| Privacy / Secrets | `sanitizeHeaders` redacts auth headers, preserves metadata | **Passed** |
| `SEC-10-ACCOUNT-PURGE` | Privacy / Erasure | Relational purge + `app.deletion_suppression_ledger` tombstones | **Passed** |
| `SEC-11-MODULE-GATING` | Fail-Closed | Server `onRequest` hook returns 403 on Vault, AI, Rooms, Billing | **Passed** |
| `SEC-12-OPS-ROSTER` | Operations | Incident response and user support operational roster documented | **Passed** |
| `SEC-13-BLOCKERS-REGISTER`| Launch Readiness | Unresolved risks and launch blockers documented in findings JSON | **Passed** |

**Summary: 13 / 13 dimensions verified.**

---

## Standing Release Gates & Status

Status is recorded as **blocked** in strict accordance with AGENTS.md:
1. `DEF-V2-001` & `DEF-V2-004`: Independent cryptanalysis of zero-knowledge vault.
2. `DEF-V2-005`: Google Drive CASA Tier 2 third-party lab verification.
3. `DEF-V2-006`: End-to-end encrypted rooms verification.
4. `DEF-V2-007`: In-app billing and merchant verification.
5. `DEF-V2-008`: Commercial AI provider terms, legal enterprise DPA, and daily spend ceilings.
6. `DEF-V2-011`: Native Android TalkBack spoken listen-through on physical ARM64 hardware (Phase 71).
7. `DEF-V2-013`: Live human usability study with external participants.
8. `OWNER-SIGNING-KEYS` & `OWNER-RELEASE-AUTH`: Owner production release signing credentials and explicit publication authorization.
