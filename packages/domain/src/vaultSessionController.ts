/**
 * Framework-neutral vault session controller (Phases 46–47).
 * Admits unlock before key-provider calls; locks immediately then cleans up asynchronously.
 */

import {
  admitUnlockAttempt,
  canAcceptUnlockCompletion,
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
} from './vaultLifecycle.js';
import type { VaultKeyUnwrapOutcome, VaultProviderBundle } from './vaultProviders.js';

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

export type VaultUnlockResult =
  | { ok: true }
  | { ok: false; reason: VaultFailureReason; message: string };

export interface VaultLockResult {
  /** Session is locked and key handle detached regardless of cleanup outcome. */
  locked: true;
  cleanupFailed: boolean;
  /** Redacted diagnostic; never includes secrets or plaintext. */
  diagnostic: string | null;
}

interface ActiveUnlockOp {
  operationId: string;
  generationAtStart: number;
  method: VaultUnlockMethod;
  accountId: string | null;
  workspaceId: string | null;
}

export class VaultLifecycleController {
  private session: VaultSessionSnapshot;
  /** Detached from callers as soon as lock begins; may still be released asynchronously. */
  private keyHandleId: string | null = null;
  private activeUnlock: ActiveUnlockOp | null = null;
  private readonly config: VaultControllerConfig;
  private readonly now: () => string;
  private readonly generateOperationId: () => string;
  private listeners = new Set<(s: VaultSessionSnapshot) => void>();
  private lastCleanupDiagnostic: string | null = null;

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
      this.config.generateOperationId ??
      (() => `op-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    this.session = createLockedVaultSession({
      workspaceId: opts?.workspaceId ?? null,
      accountId: opts?.accountId ?? null,
      syntheticHarnessActive: opts?.syntheticHarnessActive === true,
    });
  }

  getSnapshot(): VaultSessionSnapshot {
    return this.session;
  }

  /** Key handle is only exposed while unlocked; lock detaches immediately. */
  getKeyHandleId(): string | null {
    return this.session.state === 'unlocked' ? this.keyHandleId : null;
  }

  getLastCleanupDiagnostic(): string | null {
    return this.lastCleanupDiagnostic;
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
    if (biometricCapability === 'invalidated' && this.session.state === 'unlocked') {
      await this.lock('biometric_invalidated');
      this.apply({ type: 'biometric_invalidated', at: this.now() });
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

  /**
   * Admit and mark unlock_pending. Does not invoke the key provider.
   * Callers that need a full unlock should use unlockWith*.
   */
  beginUnlock(
    method: VaultUnlockMethod
  ):
    | { ok: true; operationId: string; generationAtStart: number }
    | { ok: false; reason: VaultFailureReason; message: string } {
    const at = this.now();
    const admission = admitUnlockAttempt(this.session, method, at);
    if (!admission.admit) {
      const reason: VaultFailureReason =
        admission.reason === 'cooldown_active'
          ? 'cooldown_active'
          : admission.reason === 'revoked'
            ? 'device_revoked'
            : admission.reason === 'unavailable'
              ? 'provider_unavailable'
              : 'admission_denied';
      return {
        ok: false,
        reason,
        message: admission.message ?? 'Unlock attempt not admitted.',
      };
    }
    const operationId = this.generateOperationId();
    const generationAtStart = this.session.generation;
    const accountId = this.session.accountId;
    const workspaceId = this.session.workspaceId;
    this.apply({ type: 'unlock_started', operationId, method, at });
    if (this.session.state !== 'unlock_pending' || this.session.pendingOperationId !== operationId) {
      return {
        ok: false,
        reason: 'admission_denied',
        message: 'Unlock was not admitted into pending state.',
      };
    }
    this.activeUnlock = {
      operationId,
      generationAtStart,
      method,
      accountId,
      workspaceId,
    };
    return { ok: true, operationId, generationAtStart };
  }

  private async releaseDiscardedHandle(keyHandleId: string): Promise<void> {
    try {
      await this.providers.keyProvider.releaseKeyHandle(keyHandleId);
    } catch {
      // Best-effort; discarded handles must not reopen the session.
    }
  }

  private async completeUnlock(
    op: ActiveUnlockOp,
    outcome: VaultKeyUnwrapOutcome
  ): Promise<VaultUnlockResult> {
    const stillActive =
      this.activeUnlock?.operationId === op.operationId &&
      canAcceptUnlockCompletion(this.session, {
        operationId: op.operationId,
        generationAtStart: op.generationAtStart,
        accountId: op.accountId,
        workspaceId: op.workspaceId,
      });

    if (!stillActive) {
      if (outcome.ok) await this.releaseDiscardedHandle(outcome.keyHandleId);
      this.clearActiveIf(op.operationId);
      return {
        ok: false,
        reason: 'stale_operation',
        message: 'Unlock discarded after lock, cancellation, or account change.',
      };
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
        operationId: op.operationId,
        reason,
        at: this.now(),
        generationAtStart: op.generationAtStart,
      });
      this.clearActiveIf(op.operationId);
      return { ok: false, reason, message: outcome.message };
    }

    // Accept only if still the active pending op; then attach handle.
    if (
      !canAcceptUnlockCompletion(this.session, {
        operationId: op.operationId,
        generationAtStart: op.generationAtStart,
        accountId: op.accountId,
        workspaceId: op.workspaceId,
      })
    ) {
      await this.releaseDiscardedHandle(outcome.keyHandleId);
      this.clearActiveIf(op.operationId);
      return {
        ok: false,
        reason: 'stale_operation',
        message: 'Unlock discarded before key handle attach.',
      };
    }

    // Prevent overlapping attach: only the active op may set the handle.
    if (this.activeUnlock?.operationId !== op.operationId) {
      await this.releaseDiscardedHandle(outcome.keyHandleId);
      return {
        ok: false,
        reason: 'stale_operation',
        message: 'Overlapping unlock discarded; active key handle preserved for winner only.',
      };
    }

    this.keyHandleId = outcome.keyHandleId;
    this.apply({
      type: 'unlock_succeeded',
      operationId: op.operationId,
      method: op.method,
      at: this.now(),
      generationAtStart: op.generationAtStart,
    });
    this.clearActiveIf(op.operationId);

    if (this.session.state !== 'unlocked' || this.keyHandleId !== outcome.keyHandleId) {
      await this.releaseDiscardedHandle(outcome.keyHandleId);
      if (this.keyHandleId === outcome.keyHandleId) this.keyHandleId = null;
      return { ok: false, reason: 'stale_operation', message: 'Unlock did not take effect.' };
    }
    return { ok: true };
  }

  private clearActiveIf(operationId: string) {
    if (this.activeUnlock?.operationId === operationId) {
      this.activeUnlock = null;
    }
  }

  private async runUnlock(
    method: VaultUnlockMethod,
    invoke: () => Promise<VaultKeyUnwrapOutcome>
  ): Promise<VaultUnlockResult> {
    const started = this.beginUnlock(method);
    if (!started.ok) {
      return started;
    }
    const op = this.activeUnlock;
    if (!op || op.operationId !== started.operationId) {
      return {
        ok: false,
        reason: 'admission_denied',
        message: 'Unlock provider not invoked; no active operation.',
      };
    }
    // Re-check admission boundary: provider must not run if we are no longer pending this op.
    if (
      !canAcceptUnlockCompletion(this.session, {
        operationId: op.operationId,
        generationAtStart: op.generationAtStart,
        accountId: op.accountId,
        workspaceId: op.workspaceId,
      })
    ) {
      this.clearActiveIf(op.operationId);
      return {
        ok: false,
        reason: 'admission_denied',
        message: 'Unlock provider not invoked; admission lost.',
      };
    }

    let outcome: VaultKeyUnwrapOutcome;
    try {
      outcome = await invoke();
    } catch {
      if (
        canAcceptUnlockCompletion(this.session, {
          operationId: op.operationId,
          generationAtStart: op.generationAtStart,
          accountId: op.accountId,
          workspaceId: op.workspaceId,
        })
      ) {
        this.apply({
          type: 'unlock_failed',
          operationId: op.operationId,
          reason: 'provider_unavailable',
          at: this.now(),
          generationAtStart: op.generationAtStart,
        });
      }
      this.clearActiveIf(op.operationId);
      return {
        ok: false,
        reason: 'provider_unavailable',
        message: 'Key provider failed without revealing details.',
      };
    }
    return this.completeUnlock(op, outcome);
  }

  async unlockWithPassphrase(passphrase: string): Promise<VaultUnlockResult> {
    return this.runUnlock('passphrase', () =>
      this.providers.keyProvider.unwrapWithPassphrase(passphrase)
    );
  }

  async unlockWithRecoverySecret(secret: string): Promise<VaultUnlockResult> {
    return this.runUnlock('recovery_secret', () =>
      this.providers.keyProvider.unwrapWithRecoverySecret(secret)
    );
  }

  async unlockWithBiometric(): Promise<VaultUnlockResult> {
    return this.runUnlock('biometric_device_key', () =>
      this.providers.keyProvider.unwrapWithBiometricDeviceKey()
    );
  }

  async cancelUnlock(): Promise<void> {
    const op = this.activeUnlock;
    if (!op || this.session.state !== 'unlock_pending') return;
    this.activeUnlock = null;
    this.apply({
      type: 'unlock_cancelled',
      operationId: op.operationId,
      at: this.now(),
      generationAtStart: op.generationAtStart,
    });
  }

  /**
   * Lock immediately: invalidate pending ops, detach key handle from callers, close protected nav.
   * Cleanup (release handle, clear caches) runs after; failures leave session locked with diagnostic.
   */
  async lock(reason = 'explicit'): Promise<VaultLockResult> {
    const handleToRelease = this.keyHandleId;
    this.activeUnlock = null;
    this.keyHandleId = null;
    this.apply({ type: 'lock_requested', at: this.now(), reason });

    const errors: string[] = [];
    if (handleToRelease) {
      try {
        await this.providers.keyProvider.releaseKeyHandle(handleToRelease);
      } catch {
        errors.push('key_release_failed');
      }
    }
    try {
      await this.providers.ciphertextRepository.clearPlaintextCaches();
    } catch {
      errors.push('cache_cleanup_failed');
    }

    const cleanupFailed = errors.length > 0;
    this.lastCleanupDiagnostic = cleanupFailed
      ? `lock_cleanup_partial:${errors.join(',')}`
      : null;
    return {
      locked: true,
      cleanupFailed,
      diagnostic: this.lastCleanupDiagnostic,
    };
  }

  async onBackground(): Promise<VaultLockResult | void> {
    if (this.config.lockOnBackground) {
      return this.lock('background');
    }
    this.apply({ type: 'backgrounded', at: this.now() });
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

  canNavigate(destination: 'vault_list' | 'vault_detail' | 'vault_edit' | 'vault_transfer') {
    return evaluateProtectedVaultNavigation(this.session, destination);
  }

  getRepository() {
    return this.providers.ciphertextRepository;
  }
}

/** @deprecated Prefer VaultLifecycleController from @daynori/domain */
export { VaultLifecycleController as VaultSessionController };
