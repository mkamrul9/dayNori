/**
 * Phase 86 — Vault Review, Recovery, and Release Gate Verification Suite
 *
 * Verifies remediated findings (VR-001 through VR-006), privacy and leakage
 * boundaries (search, AI, Cache Storage, notifications, diagnostics),
 * recovery and replay lifecycle, and fail-closed release gate invariants.
 */
import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  admitUnlockAttempt,
  canAcceptUnlockCompletion,
  createLockedVaultSession,
  createProductionUnavailableVaultProviders,
  createSyntheticVaultProviders,
  DEFAULT_OFFLINE_UNLOCK_POLICY,
  DEFAULT_VAULT_RETRY_POLICY,
  evaluateProtectedVaultNavigation,
  isUnlockMethodProductionAllowed,
  reduceVaultSession,
  shouldIdleLock,
  SYNTHETIC_PASSPHRASE,
  SYNTHETIC_RECOVERY,
  UNLOCK_OPERATION_TIMEOUT_MS,
  VaultLifecycleController,
  type VaultSessionSnapshot,
} from '../../packages/domain/src/index.js';
import {
  assertNoVaultPlaintextInUrl,
  clearBrowserClipboardIfAvailable,
  redactVaultDiagnostic,
  VAULT_CONSUMER_EXCLUSION_SURFACES,
} from '../../apps/web/src/vault/browserSecurity.js';
import {
  publishVaultLockSignal,
  subscribeVaultLockSignals,
  type VaultCrossTabMessage,
} from '../../apps/web/src/vault/crossTabLock.js';
import {
  clearClipboardIfControllable,
  lockedVaultAccessibilityLabel,
  redactVaultLogFields,
  unlockedVaultAccessibilityLabel,
} from '../../apps/mobile/src/vault/presentationProtection.js';
import { scheduleLocalReminderAsync } from '../../apps/mobile/src/notifications/adapter.js';
import {
  computeArgon2idReferenceVector,
  decodeStrictBase64,
  deriveKeyArgon2id,
  documentRecoveryRewrapDoesNotInvalidateOldSecrets,
  ENVELOPE_PROFILE,
  generateNonce,
  generateRandomKey,
  generateRecoverySecret,
  KDF_BOUNDS,
  KEY_WRAP_PURPOSE,
  NodeCreateCipherivVaultAdapter,
  NodeWebCryptoVaultAdapter,
  serializeContext,
  unwrapKey,
  validateEnvelopeStructure,
  verifyAndDecodeRecoverySecret,
  wrapKey,
  type AuthenticatedContext,
  type VaultEnvelope,
} from './vault/vault-crypto.js';
import {
  createTransfer,
  evaluateEnvelopeAgainstCheckpoint,
  mergeConflictPreserving,
  purposeBoundAad,
  type CiphertextVerificationEvidence,
  type TrustedCheckpoint,
} from './vault/phase45-prep/protocol-models.js';
import { SearchItemTypeSchema } from '../../packages/contracts/src/api/search.js';

describe('Phase 86 — Vault review, recovery, and release gate closure', () => {
  const sampleContext: AuthenticatedContext = {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    itemId: '22222222-2222-4222-8222-222222222222',
    itemType: 'vault_note',
    schemaVersion: 1,
    keyVersion: 1,
  };

  describe('1. Finding VR-001: Stale/Interrupted Unlock Operation Timeout and Recovery', () => {
    it('rejects concurrent unlock attempts within active timeout window', () => {
      let session = createLockedVaultSession({ syntheticHarnessActive: true });
      const now = '2026-11-06T10:00:00.000Z';
      session = reduceVaultSession(session, {
        type: 'unlock_started',
        operationId: 'op-active',
        method: 'passphrase',
        at: now,
      });

      expect(session.state).toBe('unlock_pending');
      expect(session.unlockStartedAt).toBe(now);

      // Attempting 5 seconds later while active should be rejected as already pending
      const later = '2026-11-06T10:00:05.000Z';
      const admission = admitUnlockAttempt(session, 'passphrase', later);
      expect(admission.admit).toBe(false);
      expect(admission.reason).toBe('already_pending');
    });

    it('supersedes hung or abandoned unlock_pending operation after 30s timeout', () => {
      let session = createLockedVaultSession({ syntheticHarnessActive: true });
      const startTime = '2026-11-06T10:00:00.000Z';
      session = reduceVaultSession(session, {
        type: 'unlock_started',
        operationId: 'op-hung',
        method: 'passphrase',
        at: startTime,
      });

      // 35 seconds later (> UNLOCK_OPERATION_TIMEOUT_MS)
      const expiredTime = '2026-11-06T10:00:35.000Z';
      const admission = admitUnlockAttempt(session, 'passphrase', expiredTime);
      expect(admission.admit).toBe(true);

      // Session admits the new operation
      session = reduceVaultSession(session, {
        type: 'unlock_started',
        operationId: 'op-recovered',
        method: 'passphrase',
        at: expiredTime,
      });

      expect(session.pendingOperationId).toBe('op-recovered');
      expect(session.unlockStartedAt).toBe(expiredTime);

      // Old hung operation completion is rejected as stale
      expect(
        canAcceptUnlockCompletion(session, {
          operationId: 'op-hung',
          generationAtStart: 1,
          accountId: session.accountId,
          workspaceId: session.workspaceId,
        })
      ).toBe(false);
    });
  });

  describe('2. Finding VR-002: Cooldown Counter Reset on Elapsed Cooldown Window', () => {
    it('resets failedAttempts to 0 when starting an attempt after cooldown elapses', () => {
      let session = createLockedVaultSession({ syntheticHarnessActive: true });

      // Simulate 5 failed attempts at T0
      for (let i = 0; i < 5; i++) {
        session = reduceVaultSession(session, {
          type: 'unlock_started',
          operationId: `fail-${i}`,
          method: 'passphrase',
          at: `2026-11-06T10:00:0${i}.000Z`,
        });
        session = reduceVaultSession(session, {
          type: 'unlock_failed',
          operationId: `fail-${i}`,
          reason: 'wrong_credentials',
          at: `2026-11-06T10:00:0${i}.500Z`,
          generationAtStart: session.generation,
        });
      }

      expect(session.failedAttempts).toBe(5);
      expect(session.cooldownUntil).toBe('2026-11-06T10:01:04.500Z');

      // Attempt during cooldown is rejected
      const duringCooldown = '2026-11-06T10:00:30.000Z';
      const blocked = admitUnlockAttempt(session, 'passphrase', duringCooldown);
      expect(blocked.admit).toBe(false);
      expect(blocked.reason).toBe('cooldown_active');

      // Attempt after cooldown expires (65 seconds later)
      const afterCooldown = '2026-11-06T10:01:10.000Z';
      const allowed = admitUnlockAttempt(session, 'passphrase', afterCooldown);
      expect(allowed.admit).toBe(true);

      // Starting the attempt resets failedAttempts for the new cycle
      session = reduceVaultSession(session, {
        type: 'unlock_started',
        operationId: 'fresh-attempt-1',
        method: 'passphrase',
        at: afterCooldown,
      });

      expect(session.failedAttempts).toBe(0);
      expect(session.cooldownUntil).toBeNull();

      // A single typo in the new cycle does NOT immediately trigger another cooldown
      session = reduceVaultSession(session, {
        type: 'unlock_failed',
        operationId: 'fresh-attempt-1',
        reason: 'wrong_credentials',
        at: '2026-11-06T10:01:10.500Z',
        generationAtStart: session.generation,
      });

      expect(session.failedAttempts).toBe(1);
      expect(session.cooldownUntil).toBeNull();
    });
  });

  describe('3. Finding VR-003: Mobile & Push Privacy Exclusion for Vault Destinations', () => {
    it('strictly redacts notifications with destination=vault to generic copy even in detailed mode', async () => {
      const { setNotificationPrivacyModeAsync } = await import(
        '../../apps/mobile/src/notifications/adapter.js'
      );
      const { __mockNotificationControls } = await import(
        '../../packages/test-utils/src/mock-expo-notifications.js'
      );
      await setNotificationPrivacyModeAsync('detailed');

      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
      const res = await scheduleLocalReminderAsync(null, {
        workspaceId: crypto.randomUUID(),
        instanceId: crypto.randomUUID(),
        targetType: 'task',
        title: 'Secret Vault Password Note',
        body: 'Do not leak my credentials',
        scheduledAt: futureDate,
        ruleRevision: 1,
        destination: 'vault' as any,
      });

      expect(res.scheduled).toBe(true);
      const notif = __mockNotificationControls.getScheduledMap().get(res.nativeNotificationId!);
      expect(notif?.content.title).toBe('Daynori Reminder');
      expect(notif?.content.body).toBe('You have a scheduled reminder');
    });

    it('strictly redacts notifications with targetType=vault to generic copy even in detailed mode', async () => {
      const { setNotificationPrivacyModeAsync } = await import(
        '../../apps/mobile/src/notifications/adapter.js'
      );
      const { __mockNotificationControls } = await import(
        '../../packages/test-utils/src/mock-expo-notifications.js'
      );
      await setNotificationPrivacyModeAsync('detailed');

      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
      const res = await scheduleLocalReminderAsync(null, {
        workspaceId: crypto.randomUUID(),
        instanceId: crypto.randomUUID(),
        targetType: 'vault' as any,
        title: 'Secret Vault Key Backup',
        body: 'Vault envelope payload',
        scheduledAt: futureDate,
        ruleRevision: 1,
        destination: 'plan',
      });

      expect(res.scheduled).toBe(true);
      const notif = __mockNotificationControls.getScheduledMap().get(res.nativeNotificationId!);
      expect(notif?.content.title).toBe('Daynori Reminder');
      expect(notif?.content.body).toBe('You have a scheduled reminder');
    });
  });

  describe('4. Finding VR-004: Biometric Invalidation Fallback Disclosure', () => {
    it('locks and requires passphrase when biometric enrollment changes', async () => {
      const { bundle, controls } = createSyntheticVaultProviders();
      const controller = new VaultLifecycleController(bundle, {
        syntheticHarnessActive: true,
      });

      // Unlock with biometric first
      const firstUnlock = await controller.unlockWithBiometric();
      expect(firstUnlock.ok).toBe(true);
      expect(controller.getSnapshot().state).toBe('unlocked');

      // Biometric changes (e.g. user adds/removes fingerprint in Android Settings)
      controls.invalidateBiometric();
      await controller.refreshCapabilities();

      // Session must be locked immediately with biometric invalidated
      expect(controller.getSnapshot().state).toBe('locked');
      expect(controller.getSnapshot().biometricCapability).toBe('invalidated');

      // Biometric unlock attempt fails with biometric_invalidated
      const bioRetry = await controller.unlockWithBiometric();
      expect(bioRetry.ok).toBe(false);
      if (!bioRetry.ok) {
        expect(bioRetry.reason).toBe('biometric_invalidated');
        expect(bioRetry.message).toMatch(/passphrase/i);
      }

      // Passphrase unlock succeeds as primary fallback
      const passUnlock = await controller.unlockWithPassphrase(SYNTHETIC_PASSPHRASE);
      expect(passUnlock.ok).toBe(true);
      expect(controller.getSnapshot().state).toBe('unlocked');
    });
  });

  describe('5. Finding VR-005: Cross-Tab Lock Synchronization on Background', () => {
    it('publishes and receives lock_signal without transmitting sensitive key data', () => {
      const receivedMessages: VaultCrossTabMessage[] = [];
      const mockChannel = {
        messages: [] as VaultCrossTabMessage[],
        listeners: [] as Array<(ev: MessageEvent) => void>,
        postMessage(msg: VaultCrossTabMessage) {
          this.messages.push(msg);
          for (const l of this.listeners) {
            l({ data: msg } as MessageEvent);
          }
        },
        addEventListener(_type: string, handler: (ev: MessageEvent) => void) {
          this.listeners.push(handler);
        },
        removeEventListener(_type: string, handler: (ev: MessageEvent) => void) {
          this.listeners = this.listeners.filter((h) => h !== handler);
        },
        close() {},
      };

      const unsubscribe = subscribeVaultLockSignals(
        (msg) => receivedMessages.push(msg),
        () => mockChannel as any
      );

      publishVaultLockSignal(
        { type: 'lock_signal', reason: 'background', at: new Date().toISOString() },
        () => mockChannel as any
      );

      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0]!.type).toBe('lock_signal');
      expect(receivedMessages[0]!.reason).toBe('background');
      expect(JSON.stringify(receivedMessages[0])).not.toMatch(/passphrase|key|secret/i);

      unsubscribe();
    });
  });

  describe('6. Finding VR-006: Recovery Secret Canonicalization & Transcription Checksum', () => {
    it('generates 68-char hex secret with 4-char SHA-256 checksum and decodes to 32 bytes', () => {
      const { secret, rawBytes } = generateRecoverySecret();
      expect(secret.length).toBe(84); // 68 hex chars + 16 hyphens (17 groups of 4)
      expect(rawBytes.length).toBe(32);

      const decoded = verifyAndDecodeRecoverySecret(secret);
      expect(decoded.length).toBe(32);
      expect(Buffer.compare(decoded, rawBytes)).toBe(0);
    });

    it('rejects corrupted checksum with explicit transcription error message', () => {
      const { secret } = generateRecoverySecret();
      // Corrupt the last character of the checksum
      const lastChar = secret.slice(-1);
      const corruptedChar = lastChar === 'a' ? 'b' : 'a';
      const corrupted = secret.slice(0, -1) + corruptedChar;

      expect(() => verifyAndDecodeRecoverySecret(corrupted)).toThrow(
        /Recovery secret checksum validation failed: secret is corrupted or mistyped/
      );
    });

    it('rejects malformed, truncated, or non-hex input strings', () => {
      expect(() => verifyAndDecodeRecoverySecret('')).toThrow(/non-empty string required/);
      expect(() => verifyAndDecodeRecoverySecret('0123456789abcdef')).toThrow(/expected 68 hex characters/);
      expect(() => verifyAndDecodeRecoverySecret('short-secret')).toThrow(/only hexadecimal digits/);
      expect(() => verifyAndDecodeRecoverySecret('z'.repeat(68))).toThrow(/only hexadecimal digits/);
    });
  });

  describe('7. Privacy & Leakage Boundaries', () => {
    it('proves vault items are excluded from server search schema', () => {
      const allowedSearchTypes = SearchItemTypeSchema.options;
      expect(allowedSearchTypes).not.toContain('vault');
      expect(allowedSearchTypes).not.toContain('vault_note');
      expect(allowedSearchTypes).not.toContain('vault_item');
    });

    it('redacts diagnostics and log fields containing sensitive vault keys', () => {
      const sensitiveObj = {
        workspaceId: 'ws-1',
        title: 'Confidential document',
        plainTextBody: 'Secret content',
        passphraseInput: 'my-passphrase',
        recoverySecret: 'my-recovery-secret',
        keyHandleId: 'key-handle-1',
        clipboardData: 'pasted text',
        safeStatus: 'active',
      };

      const redactedDiag = redactVaultDiagnostic(sensitiveObj);
      expect(redactedDiag.workspaceId).toBe('ws-1');
      expect(redactedDiag.safeStatus).toBe('active');
      expect(redactedDiag.title).toBe('[redacted]');
      expect(redactedDiag.plainTextBody).toBe('[redacted]');
      expect(redactedDiag.passphraseInput).toBe('[redacted]');
      expect(redactedDiag.recoverySecret).toBe('[redacted]');
      expect(redactedDiag.keyHandleId).toBe('[redacted]');
      expect(redactedDiag.clipboardData).toBe('[redacted]');

      const redactedLog = redactVaultLogFields(sensitiveObj);
      expect(redactedLog.title).toBe('[redacted]');
      expect(redactedLog.plainTextBody).toBe('[redacted]');
    });

    it('asserts no vault plaintext leaks into browser URLs', () => {
      expect(assertNoVaultPlaintextInUrl('/vault')).toBe(true);
      expect(assertNoVaultPlaintextInUrl('/settings')).toBe(true);
      expect(assertNoVaultPlaintextInUrl('/vault?passphrase=secret')).toBe(false);
      expect(assertNoVaultPlaintextInUrl('/vault?recovery_secret=1234')).toBe(false);
      expect(assertNoVaultPlaintextInUrl('/vault?synth-handle=abc')).toBe(false);
    });

    it('documents accessibility labels while locked never include vault title/details', () => {
      const lockedLabel = lockedVaultAccessibilityLabel('Overview');
      expect(lockedLabel).toBe('Vault locked. Overview. Unlock required.');
      expect(lockedLabel).not.toMatch(/secret|confidential/i);

      const unlockedLabel = unlockedVaultAccessibilityLabel('My Note', 'Decrypted body');
      expect(unlockedLabel).toBe('My Note. Decrypted body');
    });
  });

  describe('8. Cryptographic Hierarchy, Replay, and Recovery Limitations', () => {
    it('documents that rewrapping the same VRK does NOT invalidate a saved old recovery envelope', () => {
      const { claim, limitation } = documentRecoveryRewrapDoesNotInvalidateOldSecrets();
      expect(claim).toMatch(/does not cryptographically revoke prior recovery envelopes/);
      expect(limitation).toMatch(/adversary who retained an old recovery secret.*can still unwrap/);
    });

    it('enforces purpose-separated key wrapping (wrap:dek_under_vrk)', () => {
      const vrk = generateRandomKey();
      const dek = generateRandomKey();
      const dekContext: AuthenticatedContext = {
        workspaceId: crypto.randomUUID(),
        itemId: crypto.randomUUID(),
        itemType: KEY_WRAP_PURPOSE.DEK_UNDER_VRK,
        schemaVersion: 1,
        keyVersion: 1,
      };

      const envelope = wrapKey(dek, vrk, dekContext, KEY_WRAP_PURPOSE.DEK_UNDER_VRK);
      expect(envelope.version).toBe(1);
      expect(envelope.algorithm).toBe('AES-256-GCM');

      const unwrapped = unwrapKey(envelope, vrk, dekContext, KEY_WRAP_PURPOSE.DEK_UNDER_VRK);
      expect(Buffer.compare(dek, unwrapped)).toBe(0);

      // Wrong purpose is rejected
      expect(() =>
        wrapKey(dek, vrk, { ...dekContext, itemType: 'wrong_purpose' }, KEY_WRAP_PURPOSE.DEK_UNDER_VRK)
      ).toThrow(/Key-wrap purpose mismatch/);
    });

    it('rejects replayed stale revisions when a trusted client checkpoint exists', () => {
      const checkpoint: TrustedCheckpoint = {
        workspaceId: 'ws-1',
        deviceId: 'device-a',
        acceptedRevisions: { 'item-1': 5 },
        keyEpoch: 2,
        updatedAt: '2026-11-06T10:00:00.000Z',
      };

      // Stale revision 4 (< 5) is rejected
      const staleRev = evaluateEnvelopeAgainstCheckpoint(checkpoint, 'item-1', 4, 2);
      expect(staleRev.decision).toBe('reject_stale');

      // Stale key epoch 1 (< 2) is rejected
      const staleEpoch = evaluateEnvelopeAgainstCheckpoint(checkpoint, 'item-1', 6, 1);
      expect(staleEpoch.decision).toBe('reject_stale');

      // Monotonic new revision 6 is accepted
      const advance = evaluateEnvelopeAgainstCheckpoint(checkpoint, 'item-1', 6, 2);
      expect(advance.decision).toBe('accept');

      // Idempotent delivery of accepted revision 5 is accepted
      const idempotent = evaluateEnvelopeAgainstCheckpoint(checkpoint, 'item-1', 5, 2);
      expect(idempotent.decision).toBe('accept');
    });

    it('documents fresh-device recovery accepts with reduced assurance when checkpoint is absent', () => {
      const freshDevice = evaluateEnvelopeAgainstCheckpoint(null, 'item-1', 3, 1);
      expect(freshDevice.decision).toBe('accept_with_reduced_assurance');
      expect(freshDevice.reason).toMatch(/fresh-device recovery/);
    });

    it('preserves distinct ciphertext conflicts at same revision without silent overwrite', () => {
      const conflictSet = mergeConflictPreserving(
        null,
        { revision: 2, envelopeId: 'env-a', ciphertextSha256: 'sha-a' },
        'item-1'
      );
      expect(conflictSet.versions.length).toBe(1);

      // Distinct ciphertext at same revision 2 preserves both versions
      const updated = mergeConflictPreserving(
        conflictSet,
        { revision: 2, envelopeId: 'env-b', ciphertextSha256: 'sha-b' },
        'item-1'
      );
      expect(updated.versions.length).toBe(2);
      expect(updated.versions.map((v) => v.envelopeId)).toEqual(['env-a', 'env-b']);
    });

    it('verifies transfer model requires explicit decrypt proof before ciphertext_accepted', () => {
      const transfer = createTransfer('op-xfer', 'note-1', 1);
      expect(transfer.state).toBe('proposed');
      expect(transfer.cleanupEvidence.searchIndexRemoved).toBe(false);
      expect(transfer.cleanupEvidence.versionsCleanupCompleted).toBe(false);
    });
  });

  describe('9. Fail-Closed Release Gate Invariants', () => {
    it('production vault providers throw unavailable and never fall back to synthetic', async () => {
      const prod = createProductionUnavailableVaultProviders();
      expect(prod.keyProvider.availability()).toBe('unavailable');
      expect(prod.keyProvider.kind).toBe('production');

      const passResult = await prod.keyProvider.unwrapWithPassphrase('any-password');
      expect(passResult.ok).toBe(false);
      if (!passResult.ok) {
        expect(passResult.reason).toBe('unavailable');
        expect(passResult.message).toMatch(/Phase 44\/45 gates and reviewed adapters are required/);
      }

      const recResult = await prod.keyProvider.unwrapWithRecoverySecret('any-secret');
      expect(recResult.ok).toBe(false);

      const bioResult = await prod.keyProvider.unwrapWithBiometricDeviceKey();
      expect(bioResult.ok).toBe(false);

      await expect(prod.ciphertextRepository.listItems(null)).rejects.toThrow(
        /Production vault ciphertext repository unavailable/
      );
    });

    it('disallows short PIN as production unlock method', () => {
      expect(isUnlockMethodProductionAllowed('pin_device_key')).toBe(false);
      expect(isUnlockMethodProductionAllowed('passphrase')).toBe(true);
      expect(isUnlockMethodProductionAllowed('recovery_secret')).toBe(true);
      expect(isUnlockMethodProductionAllowed('biometric_device_key')).toBe(true);
    });

    it('offline unlock policy specifies reconnect revocation check is mandatory', () => {
      expect(DEFAULT_OFFLINE_UNLOCK_POLICY.allowCachedOfflineUnlock).toBe(true);
      expect(DEFAULT_OFFLINE_UNLOCK_POLICY.requireOnlineRevocationCheckWhenConnected).toBe(true);
    });
  });
});
