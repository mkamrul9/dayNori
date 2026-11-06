# ADR-0086: Vault review, recovery, and release gate closure

- Status: accepted
- Date: 2026-11-06
- Owner/reviewer: Antigravity agent (owner-authorized Phase 86 with explicit scheduling exception).
- Related: [Phase 86](../roadmap/phases/86-vault-review-recovery-and-release-gate-closure.md), [ADR 0043](0043-vault-cryptography-and-recovery-proof.md), [ADR 0044](0044-android-vault-unlock-lifecycle-provisional.md), [ADR 0045](0045-browser-vault-lifecycle-provisional.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [Phase 75](../phase-reports/phase-75.md), [Phase 77](../phase-reports/phase-77.md), [Phase 81](../phase-reports/phase-81.md), [release-gates.md](../engineering/release-gates.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, and release gates.

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 86 review, independent implementation work, and bounded remediation before final acceptance of Phases 75 and 81:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 86 review, independent implementation work, and bounded remediation before final acceptance of Phases 75 and 81. Record this scheduling exception in an ADR and roadmap metadata. Preserve all outstanding prerequisite, security, hardware, and release gates. This authorization does not permit enabling an unreviewed vault or treating any blocked phase as complete."

Phase 86 conducts a rigorous security and threat-model baseline audit of the provisional vault subsystem, establishes a bounded findings register (VR-001 through VR-008), delivers independent actionable remediations, verifies end-to-end leakage and privacy boundaries, prepares the formal independent review packet, and enforces fail-closed release gates.

## Baseline Audit & Findings Register

An audit of the vault implementation against the threat model ([ADR 0043](0043-vault-cryptography-and-recovery-proof.md), [ADR 0044](0044-android-vault-unlock-lifecycle-provisional.md), [ADR 0045](0045-browser-vault-lifecycle-provisional.md), and [security-and-vault.md](../architecture/security-and-vault.md)) established the bounded findings register in `artifacts/phase86/findings-register.json`:

1. **VR-001 (High — Remediated)**: *Stale or interrupted unlock operation recovery.*
   - If an async unlock unwrap provider is interrupted or hangs, `session.state` was stuck in `unlock_pending`, permanently rejecting future attempts as `already_pending`.
   - *Remediation*: Added `unlockStartedAt: string | null` to `VaultSessionSnapshot` and `createLockedVaultSession`. Defined `UNLOCK_OPERATION_TIMEOUT_MS = 30_000`. In `admitUnlockAttempt`, if `session.state === 'unlock_pending'` and `at - unlockStartedAt > UNLOCK_OPERATION_TIMEOUT_MS`, a new unlock attempt cleanly supersedes the stale pending operation.

2. **VR-002 (Medium — Remediated)**: *Cooldown counter reset on elapsed cooldown window.*
   - After reaching maximum failed passphrase attempts, a 60-second cooldown is enforced. Previously, once the 60s window elapsed, `failedAttempts` remained at 5, causing any single subsequent typo to immediately re-enter cooldown.
   - *Remediation*: In `reduceVaultSession` for `case 'unlock_started'`, when `cooldownUntil` is in the past, `failedAttempts` is reset to 0 and `cooldownUntil` is cleared to null for the new attempt cycle.

3. **VR-003 (High — Remediated)**: *Mobile push notification privacy exclusion for vault destinations.*
   - Reminder alert scheduling must never expose vault details on notification banners or lock screens.
   - *Remediation*: In `apps/mobile/src/notifications/adapter.ts`, added explicit `options.destination === 'vault'` and `options.targetType === 'vault'` checks alongside private journal entries, unconditionally forcing generic title ("Daynori Reminder") and generic body ("You have a scheduled reminder") under all privacy modes.

4. **VR-004 (Medium — Remediated)**: *Biometric invalidation fallback guidance message.*
   - When an Android Keystore biometric key is invalidated due to new biometric enrollment, the controller locks.
   - *Remediation*: Verified `biometric_invalidated` failure response provides explicit user-facing guidance: `"Biometric enrollment changed; device key invalidated. Use passphrase."`

5. **VR-005 (Medium — Remediated)**: *Cross-tab lock synchronization on backgrounding.*
   - When one browser tab is backgrounded (hidden), background locking occurred locally.
   - *Remediation*: Verified `lock_signal` with reason `'background'` is broadcast across `BroadcastChannel`, synchronizing lock across all open browser tabs without transmitting cryptographic keys or plaintext.

6. **VR-006 (Low — Remediated)**: *Strict recovery secret canonicalization & error differentiation.*
   - Verified recovery secret handling distinguishes between typo checksum failure (`"Recovery secret checksum validation failed"`) and structural formatting errors (odd length, invalid hex characters).

7. **VR-007 (High — Gated Limitation)**: *Large attachment streaming format unfinalized.*
   - Large file attachments (> 16 MiB) require chunked streaming AEAD. Homegrown framing protocols are explicitly prohibited. The proposed libsodium `crypto_secretstream_*` candidate remains pending external review.
   - *Disposition*: Retained single-envelope AES-256-GCM for objects ≤ 16 MiB. Streaming attachments remain gated; production encrypted attachment capability remains disabled.

8. **VR-008 (High — Release Gate Limitation)**: *Independent qualified external audit and physical Android device evidence unmet.*
   - In accordance with [release-gates.md](../engineering/release-gates.md), production vault enablement requires a written report from a qualified external cryptography/application-security firm and candidate-library harness execution on physical ARM64 Android hardware.
   - *Disposition*: Preserved fail-closed gate. Production vault remains disabled. Phase 86 is honestly recorded as `blocked` in roadmap metadata and the phase report; `DEF-V2-004` is retained.

## Privacy & Leakage Verification

All end-to-end privacy and confidentiality boundaries were verified through automated security test suite `tests/security/phase86-vault-review-recovery.test.ts` (23 tests passed):
- **Server Storage & Sync**: Zero vault plaintext stored on server or transmitted in sync payloads. Payloads contain only AES-256-GCM ciphertext envelopes with canonical authenticated data.
- **Search Indexes**: `SearchItemTypeSchema` in `packages/contracts/src/api/search.ts` explicitly restricts searchable entity types to `['task', 'routine', 'journal', 'project', 'note']`. Vault records are excluded.
- **Browser Cache Storage**: Service Worker `apps/web/public/sw.js` explicitly bypasses Cache Storage for all `/api/v1/vault/*` and `/vault/*` routes.
- **Mobile Push Notifications**: Generic title and placeholder body unconditionally enforced for vault targets.
- **AI Assistant**: Ingestion contexts in `apps/api/src/modules/ai/assistantService.ts` strictly filter out vault records.
- **Lock UI Presentation**: Lock screen UI and screen-locking controls never claim to encrypt data; vault cryptography is treated as a distinct cryptographic envelope boundary.

## Decision & Release Gate Closure

1. **Owner Scheduling Exception**: Formally recorded in `docs/roadmap/progress.json` and this ADR. Outstanding acceptance checks for Phases 71, 75, 80, 81, 84, 85, and 99 retain their recorded blocked states.
2. **Review Packet Delivered**: Updated `docs/engineering/vault-security-review-packet.md` with base commit `3d365818c600bf9d490a603ea59811b189fe6366`, test vectors, findings register, platform evidence, and clear reviewer handoff instructions.
3. **Fail-Closed Vault Status**: The vault is not enabled for production environments. `GET /v1/vault/status` returns 403 or unavailable under production validation. The developer vault harness remains gated behind `OperatorGate` (`apps/web/src/components/auth/OperatorGate.tsx`).
4. **Defect Retention**: `DEF-V2-004` remains active in `docs/roadmap/v2/function-register.json`. Phase 86 is marked `blocked` with clear disposition in `docs/roadmap/progress.json` and `docs/phase-reports/phase-86.md`.
5. **No Release Ready Claim**: Scaffolding, synthetic test harness passing, and internal agent review do not constitute qualified external security clearance or physical device verification.
