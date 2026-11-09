# Phase 97: Version 2 security, privacy, and recovery audit

## Identity and scope

- Phase: [97 — Version 2 security privacy and recovery audit](../roadmap/phases/97-version-2-security-privacy-and-recovery-audit.md).
- Status: **blocked** — Comprehensive audit of the complete Version 2 attack surface (tenant isolation/IDOR, operator triage authorization, session revocation, malware quarantine, assistant markdown sanitization, AI/voice consent boundaries, diagnostic/notification telemetry redaction, Google Drive and room membership access fencing), bounded remediations for SEC-001 (operator feedback unauthenticated 401 challenge) and SEC-002 (workspace storage quota cross-tenant 404 IDOR fencing), live disaster recovery rehearsal with disposable databases and pre-access suppression ledger barrier, dual-key secret rotation with zero downtime, and complete independent vault review package complete: all 12 tests in `tests/security/phase97-v2-security-privacy-recovery.test.ts` pass; external independent cryptography audit (`DEF-V2-004`) and physical Android ARM64 hardware testing (`DEF-V2-008`) remain unmet, so Phase 97 is honestly recorded as `blocked`.
- Contributor/date: Antigravity agent, 2026-11-10.
- Base revision/branch: `848adc4a8e3c691709d2ded4b79ca205a70a05f5`, `codex/free-core-preview`.
- Hard prerequisites: Phases **75**, **76**, **77**, **83**, **84**, **85**, **86**, **87**, **88**, **89**, **94**, **95**, **96**.
- Owner Scheduling Authorization: The owner explicitly authorized Phase 97 local audit, bounded remediation, and synthetic recovery drills before final acceptance of its blocked prerequisites ([ADR 0097](../decisions/0097-version-2-security-privacy-and-recovery-audit.md)). Outstanding prerequisite, hardware, security, and release gates are preserved. Standing push authorized under ADR 0074. No unverified production capability, live model calls, or paid infrastructure claimed.

---

## Result

### Implementation and Verifications Delivered

1. **Version 2 Attack Surface Audit & Findings Catalog (SEC-001 through SEC-009):**
   - Authored bounded findings register in `artifacts/phase97/findings-register.json` covering 9 security, privacy, and recovery dimensions across all V2 endpoints.
   - Audited developer/support roles, feedback attachments, AI assistant streaming, voice transcription, search boundaries, local boot, and push notification sanitization.

2. **Bounded Remediation SEC-001 (Operator Triage Unauthenticated 401 Challenge):**
   - Fixed `assertOperator` in `apps/api/src/routes/v1/operatorFeedback.ts`. Unauthenticated calls without an active session actor now throw `AuthError('Authentication required')`, returning HTTP 401 rather than validation error HTTP 400.
   - Authenticated non-operators continue to receive HTTP 403 Forbidden (`ExplicitForbiddenError`), while authorized operators receive HTTP 200.

3. **Bounded Remediation SEC-002 (Workspace Storage Quota Cross-Tenant IDOR Fencing):**
   - Fixed `GET /v1/workspaces/:workspaceId/files/quota` in `apps/api/src/routes/v1/files.ts`.
   - Explicitly asserts membership in `app.workspace_memberships` inside `withTenantContext` before calling `getStorageUsage()`. Foreign tenants are rejected with HTTP 404 `NotFoundError('Workspace not found or access denied')` rather than leaking unhandled PostgreSQL RLS 500 errors.

4. **Session Revocation & Token Blacklisting Audit (SEC-003):**
   - Verified that terminated sessions and revoked tokens recorded in `app.revoked_tokens` via SHA-256 hash are immediately rejected by `JwtVerifier` on subsequent requests with HTTP 401 (`TOKEN_REVOKED`).

5. **Malware Quarantine & Unverified File Download Fencing (SEC-004):**
   - Verified that `getFileDownloadCapability` checks `quarantine_status = 'verified'`. Files in `quarantined` or `pending` status fail closed with HTTP 409 (`FileNotReadyError`), preventing download capability generation.

6. **Assistant Streaming & Rich Markdown Output Sanitization (SEC-005):**
   - Verified `sanitizeAssistantMarkdown` in `@daynori/domain` strips `<script>`, `<iframe>`, `<object>`, `javascript:` pseudo-protocols, and remote 1x1 tracking pixels while preserving safe markdown headings, bullet lists, bold text, and relative workspace links.

7. **AI Consent Boundaries, 0-Day Audio Retention & Vault Exclusion (SEC-006):**
   - Verified that unconsented audio transcription and AI proposal generation fail with HTTP 403 Forbidden.
   - Enforced strict 0-day transient audio retention; targetKind `'vault'` is unconditionally forbidden in AI proposals.

8. **Diagnostic & Push Notification Telemetry Leakage Redaction (SEC-007):**
   - Verified that diagnostic exporter redacts bearer tokens, email addresses, and personal journal bodies to `[REDACTED]`, and mobile push adapter enforces generic titles and bodies for sensitive destinations.

9. **Room Membership Revocation & Google Drive Fencing (SEC-008):**
   - Verified that cross-workspace callers cannot access or disconnect foreign Drive connections. Disconnecting Drive is safe and idempotent, removing local OAuth tokens without modifying or trashing remote Google Drive originals.

10. **Synthetic Disaster Recovery Drill with Disposable Databases (REC-01 & REC-02):**
    - Executed real, isolated disaster recovery verification via `scripts/disaster-recovery-drill.mjs` using dedicated disposable databases (`daynori_dr_src_*` and `daynori_dr_dst_*`).
    - Verified byte-exact binary restore matching SHA-256 checksums, post-restore tenant RLS isolation under `daynori_runtime`, and pre-access deletion suppression ledger barrier ensuring erased accounts and workspaces remain suppressed. Total drill RTO: 5.13s (backup 1.14s, restore 1.88s).

11. **Idempotent Purge & Missing Object Visible Failure (REC-04 & REC-05):**
    - Verified that tombstone insertion into `app.deletion_suppression_ledger` is strictly idempotent upon replayed invocations.
    - Verified that if a restored database references a binary storage object missing from storage, download attempts produce a visible error rather than serving empty or corrupted data.

12. **Dual-Key Secret Rotation with Zero-Downtime Fallback (REC-06):**
    - Verified that `JwtVerifier` supporting dual-key JWKS allows smooth key rotation: new tokens are accepted, retired key tokens are rejected, and fallback verifier ensures zero downtime during rotation interruptions.

13. **Vault Independent Review Package Authored (SEC-009):**
    - Prepared formal submission package in `docs/engineering/vault-independent-review-package.md` specifying baseline revision, cryptographic primitives, test harnesses, and open release gates.
    - Preserved release gates `DEF-V2-004` (independent external review) and `DEF-V2-008` (physical Android ARM64 hardware verification). Recorded Phase 97 honestly as `blocked`.

---

## Artifacts and Evidence

- Findings register: `artifacts/phase97/findings-register.json` (SEC-001 through SEC-009).
- Evidence summary: `artifacts/phase97/evidence-summary.json`.
- Manual UI evidence: `artifacts/phase97/manual-ui-evidence.json`.
- Recovery drill evidence: `artifacts/phase97/recovery-drill-evidence.json`.
- Architecture Decision Record: `docs/decisions/0097-version-2-security-privacy-and-recovery-audit.md`.
- External Review Submission Package: `docs/engineering/vault-independent-review-package.md`.
- Automated security test suite: `tests/security/phase97-v2-security-privacy-recovery.test.ts` (12 tests passed in 5.91s).
