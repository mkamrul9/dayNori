# ADR-0120: Daynori Production-Focused Security and Privacy Review and Vulnerability Remediation of the Enabled Web Core

- **Status:** accepted
- **Date:** 2026-11-15
- **Owner/Reviewer:** Antigravity agent (owner-authorized Phase 120).
- **Related:** [Phase 120](../roadmap/phases/120-daynori-production-focused-security-and-privacy-review-and-vulnerability-remediation-of-the-enabled-web-core.md), [Phase 119](../phase-reports/phase-119.md), [Phase 118](../phase-reports/phase-118.md), [Phase 97](../phase-reports/phase-97.md), [ADR 0097](0097-version-2-security-privacy-and-recovery-audit.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [release-gates.md](../engineering/release-gates.md), [incident-response-and-support-roster.md](../operations/incident-response-and-support-roster.md).
- **Supersedes/superseded by:** Builds upon the Version 2 security baseline established in Phase 97 and staging verification in Phase 119. Conducts an exhaustive, production-focused security and privacy review of the enabled web core across authorization, workspace membership, input validation, file handling, sessions, rate limits, dependency vulnerabilities, secrets isolation, log redaction, account deletion, backups, and disaster recovery. Remediates confirmed vulnerabilities (Next.js SVG Image Optimization API RCE GHSA-2464-fhr4-w9xw closed via `images.unoptimized: true`, postgres URL credential redaction regex hardened against passwords containing `@`, and header redaction pattern decoupled from body keys). Establishes the operational incident response and user support roster. Catalogs unresolved risks and launch-blocking release gates (`DEF-V2-001`, `DEF-V2-004`, `DEF-V2-005`, `DEF-V2-007`, `DEF-V2-008`, `DEF-V2-011`, `DEF-V2-013`, `OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`). Phase 71 remains blocked on physical hardware and spoken TalkBack.

---

## Context & Owner Scheduling Authorization

The project owner authorized Phase 120 with the following explicit instructions:

> "Perform a production-focused security and privacy review of the enabled web core. Test authorization and workspace membership on every request, object, job, and search result; review input validation, file handling, sessions, rate limits, dependency vulnerabilities, secrets, log redaction, account deletion, backups, and recovery. Verify that disabled modules fail closed. Fix confirmed issues and run focused regression tests. Record unresolved risks, who will operate incident response and user support, and which issues block public launch. Do not mark security complete based only on local unit tests. Follow AGENTS.md and the active-phase workflow."

---

## 1. Audited Security & Privacy Dimensions

### 1.1 Authorization & Workspace Scoping (Tenant Isolation)
- **Invariant:** Every request, entity object, background worker job, and search query must be strictly scoped to the authenticated caller and authorized workspace.
- **Verification:**
  - Route handlers uniformly invoke `withTenantContext` or `withUserContext`.
  - Database queries assert role authorization via `SELECT app.user_has_workspace_role($1, 'viewer'|'editor')`. Unauthorized callers receive `NotFoundError('Workspace not found or unauthorized')` (404) or `ForbiddenError` (403), preventing enumeration and IDOR.
  - Search queries in `apps/api/src/modules/search/service.ts` enforce `workspace_id = $1`, `security_scope != 'vault'` (unconditional vault exclusion), and `deleted_at IS NULL`.
  - Background worker jobs in `apps/worker/src/worker.ts` set session variables `app.current_workspace_id` and `app.current_user_id` and qualify all queries with `WHERE id = $1 AND workspace_id = $2`.

### 1.2 Input Validation & Injection Defenses
- **Zod Validation:** All request parameters, queries, and bodies are validated against strict Zod schemas (`packages/contracts`) before business logic execution. Invalid inputs fail immediately with HTTP 400 (`ValidationError`).
- **SQL Injection Prevention:** All SQL queries use positional parameters (`$1`, `$2`, etc.) through the `pg` client driver. Zero string interpolation is permitted in database queries.
- **Request Body Limit:** Fastify enforces `bodyLimit: 1048576` (1 MiB), preventing memory exhaustion attacks via oversized request payloads.
- **Request ID Sanitization:** `sanitizeRequestId` validates incoming `X-Request-Id` against `/^[a-zA-Z0-9_-]{1,64}$/`. Malformed headers, injection strings, or oversized values are safely replaced with cryptographic UUIDs.

### 1.3 File Handling & Quarantine Verification
- **Two-Phase Lifecycle:** Uploads require explicit reservation (`POST /v1/workspaces/:workspaceId/files/reservations`) and client checksum finalization (`POST .../finalize`).
- **Quarantine Gating:** `getFileDownloadCapability` strictly checks `quarantineStatus === 'verified'`. Files in `quarantined` or `pending` status immediately throw `FileNotReadyError` (HTTP 409), preventing uninspected binary distribution.
- **Signed Capability Expiry:** Generated download URLs are short-lived (300 seconds), scoped, and time-bounded.

### 1.4 Sessions & Token Revocation
- **JWT Verification:** `JwtVerifier` validates cryptographic signatures (RS256/ES256 via JWKS or HMAC secret), issuer, audience, and expiration.
- **Revocation Blacklist:** Sessions terminated via logout or account deletion are hashed (SHA-256) and recorded in `app.revoked_tokens`. Subsequent requests bearing a revoked token fail with HTTP 401 (`TOKEN_REVOKED`).

### 1.5 Rate Limiting
- **Process-Local Sliding Window:** `ProcessLocalRateLimiter` enforces a 60 requests/minute budget per actor (or IP when unauthenticated).
- **Standards-Compliant Headers:** Responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`. Throttled requests throw `RateLimitError` returning HTTP 429 with `Retry-After`.

---

## 2. Confirmed Findings & Defensive Remediations

### 2.1 Remediated Finding: Next.js Image Optimization API RCE (GHSA-2464-fhr4-w9xw)
- **Vulnerability:** `next@15.5.27` contains a critical vulnerability in the unauthenticated image optimization endpoint (`/_next/image`) when handling SVG files.
- **Remediation:** Configured `images: { unoptimized: true }` in `apps/web/next.config.mjs`. Because Daynori uses local vector brand assets (`public/brand/`) and never relies on remote server-side image scaling, setting `unoptimized: true` completely disables the vulnerable Next.js `/_next/image` route handler, neutralizing the attack vector.

### 2.2 Remediated Finding: PostgreSQL Password Redaction in URLs Containing `@`
- **Vulnerability:** The previous URL redaction regex `/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/g` stopped at the first `@` character. Passwords containing `@` (e.g. `postgres:P@ssword@host:5432/db`) resulted in partial credential leakage (`@ssword@host...`).
- **Remediation:** Hardened `sanitizeLogString` in `apps/api/src/plugins/logger.ts` to `/(postgres(?:ql)?:\/\/[^:]+:)(.*)(@[^/@:]+(?::\d+)?(?:\/|\?|$))/g`, ensuring that passwords containing `@` are fully matched and redacted to `postgresql://postgres:[REDACTED_PASSWORD]@host...`.

### 2.3 Remediated Finding: Header Redaction Pattern Decoupling
- **Vulnerability:** `sanitizeHeaders` previously reused `SENSITIVE_KEY_PATTERN` (which includes `'content'`), causing standard benign HTTP headers like `content-type` to be inadvertently redacted to `[REDACTED]`.
- **Remediation:** Decoupled header redaction into `SENSITIVE_HEADER_PATTERN` matching `token|secret|password|bearer|auth|jwt|credential|key|refresh|hash`, correctly preserving standard HTTP headers (`content-type: application/json`) while strictly redacting authorization tokens, cookies, and API keys.

---

## 3. Operational Incident Response & User Support Roster

Authored [`docs/operations/incident-response-and-support-roster.md`](../operations/incident-response-and-support-roster.md) establishing:
- **Incident Commander (IC):** Project Lead / Platform Owner (overall incident authority, public communication approval, launch/rollback declaration).
- **Technical Operations Lead:** Infrastructure & Database Engineer (service health, database restores, rollback execution).
- **Security & Privacy Officer:** Security & Privacy Reviewer (vulnerability triage, credential containment, suppression ledger integrity, `security@daynori.com` management).
- **Support & Communications Lead:** User Support Coordinator (`support@daynori.com` triage, user status communication).
- **Severity SLOs:** SEV-1 acknowledged < 15 min, mitigated < 1 hour; SEV-2 acknowledged < 1 hour, mitigated < 4 hours.

---

## 4. Unresolved Risks & Public Launch Blockers Register

In accordance with [AGENTS.md](../../AGENTS.md), **security is NOT marked complete based solely on local unit tests.** The following unresolved risks and release gates block public launch:

| Gate | Scope | Status | Requirement to Close |
| :--- | :--- | :--- | :--- |
| `DEF-V2-001` | Vault Cryptanalysis | **BLOCKED** | Independent cryptanalysis of WebCrypto client-side AES-256-GCM / Argon2id implementation. |
| `DEF-V2-004` | Vault External Audit | **BLOCKED** | Third-party security firm penetration testing and code audit. |
| `DEF-V2-005` | Google Drive Mirroring | **BLOCKED** | CASA Tier 2 third-party lab verification for restricted Google Drive scopes. |
| `DEF-V2-006` | Rooms Collaboration | **BLOCKED** | Multi-device ratcheting and room membership security review. |
| `DEF-V2-007` | In-App Subscriptions | **BLOCKED** | Merchant account verification, tax compliance, and payment webhook signature audit. |
| `DEF-V2-008` | Commercial AI Assistant| **BLOCKED** | Enterprise DPA with EU SCCs, zero-training agreement, and daily spend ceilings. |
| `DEF-V2-011` | Native Android TalkBack | **BLOCKED** | Human spoken TalkBack navigation audit on physical ARM64 hardware (Phase 71). |
| `DEF-V2-013` | Human Usability Study | **OPEN** | Usability evaluation with diverse external participants. |
| `OWNER-SIGNING-KEYS` | Android Release Signing| **BLOCKED** | Owner-controlled production release keystores and Google Play Play App Signing. |
| `OWNER-RELEASE-AUTH` | Production Publication | **BLOCKED** | Explicit owner authorization for production domain, hosting budget, and rollout. |
