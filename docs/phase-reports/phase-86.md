# Phase 86: Vault review recovery and release gate closure

## Identity and scope

- Phase: [86 — Vault review recovery and release gate closure](../roadmap/phases/86-vault-review-recovery-and-release-gate-closure.md).
- Status: **blocked** — Vault security baseline audited against ADR 0043 threat model; bounded findings register VR-001 through VR-008 established; remediations delivered for unlock timeout recovery (VR-001), cooldown counter reset (VR-002), notification destination redaction (VR-003), biometric invalidation guidance (VR-004), cross-tab lock coordination (VR-005), and recovery secret canonicalization (VR-006); leakage and privacy boundaries verified (zero server/sync/search/cache/log/assistant leakage); review packet prepared under `docs/engineering/vault-security-review-packet.md`; production vault remains disabled fail-closed pending qualified independent external security review and physical Android hardware evidence (DEF-V2-004 retained).
- Contributor/date: Antigravity agent, 2026-11-06.
- Base revision/branch: `3d365818c600bf9d490a603ea59811b189fe6366`, `codex/free-core-preview`.
- Hard prerequisites: Phases **75** (files and audio), **77** (safe offline reopen sync), and **81** (advanced tour coverage).
- Owner Scheduling Authorization: The owner authorized Phase 86 review, independent implementation work, and bounded remediation before final acceptance of Phases 75 and 81 ([ADR 0086](../decisions/0086-vault-review-recovery-and-release-gate-closure.md)). Phase 86 recorded as `blocked` due to unmet independent external review and physical hardware evidence. Outstanding checks for Phases 71, 75, 80, 81, 84, 85, and 99 remain preserved. Standing push authorized under ADR 0074. No `release_ready` claim.

## Result

### Implementation and Remediations Delivered

1. **Vault Session Lifecycle & Recovery (`packages/domain/src/vaultLifecycle.ts`)**:
   - **VR-001 (Stale unlock recovery)**: Added `unlockStartedAt: string | null` to `VaultSessionSnapshot` and `createLockedVaultSession`. Defined `UNLOCK_OPERATION_TIMEOUT_MS = 30_000` (30 seconds). In `admitUnlockAttempt`, if `session.state === 'unlock_pending'` and elapsed time exceeds 30s, allowed a new unlock attempt to cleanly supersede the stale hung attempt. Reset `unlockStartedAt: null` upon `unlock_succeeded` and transition to locked.
   - **VR-002 (Cooldown counter reset)**: In `reduceVaultSession` for `case 'unlock_started'`, when `cooldownUntil` has elapsed, reset `failedAttempts` to 0 and cleared `cooldownUntil` to null for the new attempt window.
2. **Notification Destination Privacy Redaction (`apps/mobile/src/notifications/adapter.ts`)**:
   - **VR-003 (Notification redaction)**: In `scheduleLocalReminderAsync`, explicitly added `options.destination === 'vault'` and `options.targetType === 'vault'` checks alongside journal entries, unconditionally forcing generic title (`'Daynori Reminder'`) and placeholder body (`'You have a scheduled reminder'`) regardless of user privacy configuration.
3. **Findings Register & Review Packet**:
   - Created `artifacts/phase86/findings-register.json` tracking VR-001 through VR-008 with severity, reproduction, remediation, regression tests, and final dispositions.
   - Updated `docs/engineering/vault-security-review-packet.md` with base commit `3d365818c600bf9d490a603ea59811b189fe6366`, full test vector status (111 tests passing across 5 suites), and clear reviewer handoff instructions.

### Privacy and Confidentiality Verification

Verified across unit and integration security tests:
- **Server Storage & Sync**: Zero vault plaintext stored on server or transmitted in sync payloads. Payloads contain strictly AES-256-GCM ciphertext envelopes with canonical AAD.
- **Search Indexes**: `SearchItemTypeSchema` strictly limits indexed types to `['task', 'routine', 'journal', 'project', 'note']`; vault items are excluded.
- **Browser Cache Storage**: Service Worker (`apps/web/public/sw.js`) explicitly bypasses Cache Storage for all `/api/v1/vault/*` and `/vault/*` routes.
- **Mobile Push Notifications**: Generic title and placeholder body unconditionally enforced for vault targets.
- **AI Assistant**: Ingestion contexts in `apps/api/src/modules/ai/assistantService.ts` strictly filter out vault records.
- **Lock UI Presentation**: Lock screen UI and screen-locking controls never claim to encrypt data; vault cryptography is treated as a distinct cryptographic envelope boundary.

### Gate Limitations & External Review Status (Truthfully Recorded)

| Review / Gate | Target | Result | Reason |
| --- | --- | --- | --- |
| `independentSecurityReview` | External qualified cryptography reviewer | **unmet** | Formal written report from a qualified external security audit firm unavailable in local environment. |
| `physicalAndroidDevice` | Physical Android ARM64 device | **unmet** | Physical Android phone hardware running Android 14+ with Keystore biometric hardware unavailable in local runner. |
| `attachmentStreamingAEAD` | Chunked streaming AEAD format | **gated** | Single-envelope AES-256-GCM retained for objects ≤ 16 MiB; libsodium secretstream chunking remains proposed-only pending review. |

Production vault remains **disabled fail-closed**. `DEF-V2-004` is retained in `docs/roadmap/v2/function-register.json`.

Evidence files:
- `artifacts/phase86/findings-register.json`
- `artifacts/phase86/phase86-ui-evidence.json`
- `artifacts/phase86/evidence-summary.json`
- `artifacts/phase86/manual-ui-evidence.json`

## Automated evidence

| Check | Result |
| --- | --- |
| `tests/security/phase86-vault-review-recovery.test.ts` | Pass (23 tests) |
| `tests/security/phase44-vault-crypto.test.ts` | Pass (30 tests) |
| `tests/security/phase45-vault-prep.test.ts` | Pass (22 tests) |
| `tests/security/phase46-vault-lifecycle.test.ts` | Pass (23 tests) |
| `tests/security/phase47-web-vault.test.ts` | Pass (13 tests) |
| Total vault security tests | Pass (111/111 tests) |
| `pnpm --filter @daynori/domain build` | Pass |
| `pnpm validate:planning` | Pass |
| `pnpm validate:function-register` | Pass |
| `pnpm icons:check` | Pass |
| `pnpm audit:secrets` | Pass |
| `git diff --check` | Pass |

## Next steps

- Keep production vault disabled fail-closed under DEF-V2-004 until independent external security audit and physical Android device evidence are obtained.
- Retain Phase 71, 75, 80, 81, 84, and 85 blocked statuses.
- Implement Phase 87 when selected by the owner.
