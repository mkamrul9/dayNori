# ADR-0097: Version 2 Security, Privacy, and Recovery Audit

- Status: accepted
- Date: 2026-11-10
- Owner/reviewer: Antigravity agent (owner-authorized Phase 97 with explicit scheduling exception).
- Related: [Phase 97](../roadmap/phases/97-version-2-security-privacy-and-recovery-audit.md), [ADR 0038](0038-account-deletion-suppression-ledger-and-disaster-recovery.md), [ADR 0043](0043-vault-cryptography-and-recovery-proof.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0086](0086-vault-review-recovery-and-release-gate-closure.md), [vault-independent-review-package.md](../engineering/vault-independent-review-package.md), [release-gates.md](../engineering/release-gates.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, and release gates.

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 97 local audit, bounded remediation, and synthetic recovery drills before final acceptance of its blocked prerequisites:
> "OWNER SCHEDULING AUTHORIZATION: I authorize the Phase 97 local audit, bounded remediation, and synthetic recovery drills before final acceptance of its blocked prerequisites. Record this scheduling exception in an ADR and roadmap metadata. Preserve the dependency list and all outstanding gates. Use isolated synthetic environments for abuse and recovery drills."

Phase 97 executes a comprehensive audit of the complete Version 2 attack surface (tenant isolation/IDOR, operator triage, session revocation, malware quarantine, assistant streaming sanitization, AI/voice consent boundaries, telemetry redaction, Drive and room access fencing), conducts a live synthetic disaster recovery drill with disposable databases and pre-access deletion suppression barriers, and prepares the independent vault review package while honestly keeping Phase 97 blocked under `DEF-V2-004` and `DEF-V2-008`.

## Baseline Audit & Findings Register

An audit of the V2 attack surface established the findings register in `artifacts/phase97/findings-register.json`:

1. **SEC-001 (Medium — Remediated)**: *Operator triage endpoints returned HTTP 400 instead of HTTP 401 on unauthenticated access.*
   - Unauthenticated requests to `/v1/operator/feedback/reports` threw `ValidationError` resulting in HTTP 400 Bad Request instead of challenging with HTTP 401 Unauthorized.
   - *Remediation*: In `apps/api/src/routes/v1/operatorFeedback.ts`, updated `assertOperator` to throw `AuthError('Authentication required')` when `request.actor` is absent.

2. **SEC-002 (Medium — Remediated)**: *Workspace storage quota endpoint leaked unhandled PostgreSQL RLS 500 error on cross-tenant access.*
   - Cross-tenant requests to `/v1/workspaces/:workspaceId/files/quota` executed `INSERT INTO app.workspace_storage_usage` before verifying membership, triggering an unhandled PostgreSQL RLS policy violation.
   - *Remediation*: In `apps/api/src/routes/v1/files.ts`, added explicit membership verification inside `withTenantContext`, throwing `NotFoundError('Workspace not found or access denied')` to guarantee uniform IDOR non-existence proof.

3. **SEC-003 (High — Audited & Verified)**: *Session revocation and token blacklisting verification.*
   - Verified that terminated sessions and revoked tokens recorded in `app.revoked_tokens` are rejected immediately on subsequent requests with HTTP 401 (`TOKEN_REVOKED`).

4. **SEC-004 (High — Audited & Verified)**: *Malware quarantine & unverified file download fencing.*
   - Verified that files marked with `quarantine_status != 'verified'` fail closed, rejecting download URL requests with HTTP 409 (`FileNotReadyError`).

5. **SEC-005 (High — Audited & Verified)**: *Assistant markdown sanitization.*
   - Verified that `sanitizeAssistantMarkdown` completely strips `<script>`, `<iframe>`, `<object>`, `javascript:` pseudo-protocols, and remote 1x1 tracking pixels while preserving safe markdown structure and internal relative links.

6. **SEC-006 (Critical — Audited & Verified)**: *AI consent versioning, 0-day transient audio retention, and vault exclusion boundary.*
   - Verified that unconsented audio transcription and AI proposal generation fail with HTTP 403 Forbidden; targetKind `'vault'` is unconditionally rejected; and 0-day transient audio retention is strictly enforced.

7. **SEC-007 (Medium — Audited & Verified)**: *Diagnostic export and push notification telemetry leakage redaction.*
   - Verified that diagnostic exporter redacts bearer tokens, email addresses, and personal journal bodies to `[REDACTED]`, and mobile push adapter enforces generic titles and bodies for sensitive destinations.

8. **SEC-008 (High — Audited & Verified)**: *Room membership revocation and Google Drive disconnection access fencing.*
   - Verified that cross-workspace callers cannot disconnect or access foreign Drive connections; Drive disconnect executes cleanly and idempotently without deleting remote cloud files.

9. **SEC-009 (Critical — Gate Retained)**: *Outstanding external independent cryptography review and physical Android ARM64 hardware evidence.*
   - Formally documented in `docs/engineering/vault-independent-review-package.md`. In accordance with [release-gates.md](../engineering/release-gates.md), production vault remains disabled; Phase 97 remains recorded as `blocked` under `DEF-V2-004` and `DEF-V2-008`.

## Disaster Recovery & Deletion Suppression Drill

Executed real, isolated disaster recovery verification via `scripts/disaster-recovery-drill.mjs` against disposable databases (`daynori_dr_src_*` and `daynori_dr_dst_*`):
- **Recovery Time Objective (RTO)**: Total drill duration 5.13 seconds (backup: 1.14s, restore: 1.88s).
- **Byte-Exact Integrity**: Survivor file binary payload verified with matching SHA-256 checksums post-restore.
- **Pre-Access Deletion Suppression Ledger Barrier**: Verified that tombstoned accounts, workspaces, and binary objects remain suppressed post-restore, preventing data resurrection.
- **Idempotent Purge**: Replayed deletion tombstone recordings update cleanly without duplicate key constraint collisions.
- **Missing Binary Object Visible Failure**: Verified that if an object is missing from storage post-restore, download requests fail visibly with clean errors rather than serving empty or corrupted data.
- **Dual-Key Secret Rotation**: Verified that JWKS dual-key windows allow seamless zero-downtime key rotation with fallback verification.

## Consequences & Next Steps

- All 12 security, privacy, and disaster recovery automated tests in `tests/security/phase97-v2-security-privacy-recovery.test.ts` pass cleanly.
- Phase 97 is documented and recorded as `blocked` in roadmap metadata due to outstanding external review and hardware gates (`DEF-V2-004`, `DEF-V2-008`).
- Stop after Phase 97. Phase 98 remains unselected pending explicit owner instruction.
