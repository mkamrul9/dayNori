/**
 * Phase 46 vault session controller — coordinates providers + domain reducer.
 */

import {
  createLockedVaultSession,
  DEFAULT_OFFLINE_UNLOCK_POLICY,
  DEFAULT_VAULT_RETRY_POLICY,
  evaluateProtectedVaultNavigation,
  reduceVaultSession,
  shouldIdleLock,
  type OfflineUnlockPolicy,
  type VaultFailureReason,
  type VaultRetryPolicy,
  type VaultSessionSnapshot,
  type VaultUnlockMethod,
} from '@daynori/domain';
import type { VaultProviderBundle } from './providers.js';

export interface VaultControllerConfig {
  idleLockMs: number;
  /** Immediate lock on background (documented default). */
  lockOnBackground: boolean;
  retryPolicy?: VaultRetryPolicy;
  offlinePolicy?: OfflineUnlockPolicy;
  now?: () => string;
  generateOperationId?: () => string;
}

const DEFAULT_CONFIG: VaultControllerConfig = {
  idleLockMs: 120_000,
  lockOnBackground: true,
};

export class VaultLifecycleController {
  private session: VaultSessionSnapshot;
  private keyHandleId: string | null = null;
  private readonly config: VaultControllerConfig;
  private readonly now: () => string;
  private readonly generateOperationId: () => string;
  private listeners = new Set<(s: VaultSessionSnapshot) => void>();

  constructor(
    private providers: VaultProviderBundle,
    opts?: {
      workspaceId?: string | null;
      accountId?: string | null;
      syntheticHarnessActive?: boolean;
      config?: Partial<VaultControllerConfig>;
    }
  ) {
    this.config = { ...DEFAULT_CONFIG, ...opts?.config };
    this.now = this.config.now ?? (() => new Date().toISOString());
    this.generateOperationId =
      this.config.generateOperationId ?? (() => `op-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    this.session = createLockedVaultSession({
      workspaceId: opts?.workspaceId ?? null,
      accountId: opts?.accountId ?? null,
      syntheticHarnessActive: opts?.syntheticHarnessActive === true,
    });
  }

  getSnapshot(): VaultSessionSnapshot {
    return this.session;
  }

  getKeyHandleId(): string | null {
    return this.session.state === 'unlocked' ? this.keyHandleId : null;
  }

  subscribe(listener: (s: VaultSessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l(this.session);
  }

  private apply(
    event: Parameters<typeof reduceVaultSession>[1],
    policy = this.config.retryPolicy ?? DEFAULT_VAULT_RETRY_POLICY
  ) {
    this.session = reduceVaultSession(this.session, event, policy);
    this.emit();
  }

  async refreshCapabilities(): Promise<void> {
    if (this.providers.keyProvider.availability() === 'unavailable') {
      this.apply({ type: 'provider_unavailable', at: this.now() });
      return;
    }
    const biometricCapability = await this.providers.biometric.probe();
    const deviceEnrollmentStatus = await this.providers.enrollment.status();
    this.apply({ type: 'capabilities_updated', biometricCapability, deviceEnrollmentStatus });
    if (deviceEnrollmentStatus === 'revoked') {
      await this.lock('device_revoked');
    }
  }

  /**
   * Online path: check revocation when connected.
   * Offline cached unlock remains possible per policy; revocation is learned after reconnect.
   */
  async checkRevocationIfConnected(isOnline: boolean): Promise<void> {
    const policy = this.config.offlinePolicy ?? DEFAULT_OFFLINE_UNLOCK_POLICY;
    if (!isOnline) return;
    if (!policy.requireOnlineRevocationCheckWhenConnected) return;
    const revoked = await this.providers.enrollment.observeRevocationSignal();
    if (revoked) {
      await this.lock('device_revoked_observed');
      this.apply({ type: 'device_revoked_observed', at: this.now() });
    }
  }

  async beginUnlock(method: VaultUnlockMethod): Promise<string> {
    const operationId = this.generateOperationId();
    const generationAtStart = this.session.generation;
    this.apply({ type: 'unlock_started', operationId, method, at: this.now() });
    // stash generation on the operation id string for callers — return both via closure in unlock methods
    void generationAtStart;
    return operationId;
  }

  private async completeUnlock(
    operationId: string,
    generationAtStart: number,
    method: VaultUnlockMethod,
    outcome: Awaited<ReturnType<VaultProviderBundle['keyProvider']['unwrapWithPassphrase']>>
  ): Promise<{ ok: true } | { ok: false; reason: VaultFailureReason; message: string }> {
    // Newer lock / generation invalidates this unlock.
    if (this.session.generation !== generationAtStart) {
      if (outcome.ok) await this.providers.keyProvider.releaseKeyHandle(outcome.keyHandleId);
      this.apply({
        type: 'unlock_failed',
        operationId,
        reason: 'stale_operation',
        at: this.now(),
        generationAtStart,
      });
      return { ok: false, reason: 'stale_operation', message: 'Unlock discarded after lock or account change.' };
    }

    if (!outcome.ok) {
      const reason: VaultFailureReason =
        outcome.reason === 'wrong_credentials'
          ? 'wrong_credentials'
          : outcome.reason === 'cancelled'
            ? 'cancelled'
            : outcome.reason === 'biometric_invalidated'
              ? 'biometric_invalidated'
              : outcome.reason === 'rate_limited'
                ? 'rate_limited'
                : 'provider_unavailable';
      this.apply({
        type: 'unlock_failed',
        operationId,
        reason,
        at: this.now(),
        generationAtStart,
      });
      return { ok: false, reason, message: outcome.message };
    }

    this.keyHandleId = outcome.keyHandleId;
    this.apply({
      type: 'unlock_succeeded',
      operationId,
      method,
      at: this.now(),
      generationAtStart,
    });
    if (this.session.state !== 'unlocked') {
      await this.providers.keyProvider.releaseKeyHandle(outcome.keyHandleId);
      this.keyHandleId = null;
      return { ok: false, reason: 'stale_operation', message: 'Unlock did not take effect.' };
    }
    return { ok: true };
  }

  async unlockWithPassphrase(passphrase: string) {
    const generationAtStart = this.session.generation;
    const operationId = await this.beginUnlock('passphrase');
    const outcome = await this.providers.keyProvider.unwrapWithPassphrase(passphrase);
    return this.completeUnlock(operationId, generationAtStart, 'passphrase', outcome);
  }

  async unlockWithRecoverySecret(secret: string) {
    const generationAtStart = this.session.generation;
    const operationId = await this.beginUnlock('recovery_secret');
    const outcome = await this.providers.keyProvider.unwrapWithRecoverySecret(secret);
    return this.completeUnlock(operationId, generationAtStart, 'recovery_secret', outcome);
  }

  async unlockWithBiometric() {
    const generationAtStart = this.session.generation;
    const operationId = await this.beginUnlock('biometric_device_key');
    const outcome = await this.providers.keyProvider.unwrapWithBiometricDeviceKey();
    return this.completeUnlock(operationId, generationAtStart, 'biometric_device_key', outcome);
  }

  async cancelUnlock(): Promise<void> {
    if (this.session.state !== 'unlock_pending' || !this.session.pendingOperationId) return;
    this.apply({
      type: 'unlock_cancelled',
      operationId: this.session.pendingOperationId,
      at: this.now(),
      generationAtStart: this.session.generation,
    });
  }

  async lock(reason = 'explicit'): Promise<void> {
    if (this.keyHandleId) {
      await this.providers.keyProvider.releaseKeyHandle(this.keyHandleId);
      this.keyHandleId = null;
    }
    await this.providers.ciphertextRepository.clearPlaintextCaches();
    this.apply({ type: 'lock_requested', at: this.now(), reason });
  }

  async onBackground(): Promise<void> {
    if (this.config.lockOnBackground) {
      await this.lock('background');
    } else {
      this.apply({ type: 'backgrounded', at: this.now() });
    }
  }

  async onResume(): Promise<void> {
    this.apply({ type: 'resumed', at: this.now() });
    await this.refreshCapabilities();
  }

  noteActivity(): void {
    this.apply({ type: 'activity', at: this.now() });
  }

  async tickIdleLock(): Promise<boolean> {
    if (shouldIdleLock(this.session, this.now(), this.config.idleLockMs)) {
      await this.lock('idle');
      return true;
    }
    return false;
  }

  async onAccountOrWorkspaceChanged(accountId: string | null, workspaceId: string | null) {
    await this.lock('account_or_workspace_changed');
    this.apply({
      type: 'account_or_workspace_changed',
      at: this.now(),
      accountId,
      workspaceId,
    });
  }

  async onSessionExpired() {
    await this.lock('session_expired');
    this.apply({ type: 'session_expired', at: this.now() });
  }

  canNavigate(
    destination: 'vault_list' | 'vault_detail' | 'vault_edit' | 'vault_transfer'
  ) {
    return evaluateProtectedVaultNavigation(this.session, destination);
  }

  getRepository() {
    return this.providers.ciphertextRepository;
  }
}
