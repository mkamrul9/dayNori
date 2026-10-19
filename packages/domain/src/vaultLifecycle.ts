/**
 * Phase 46 — vault lock/unlock lifecycle (pure domain).
 * Does not encrypt, persist, or authorize network access.
 * Production unlock still requires Phase 44/45 gates + reviewed key providers.
 */

export type VaultLockState =
  | 'locked'
  | 'unlock_pending'
  | 'unlocked'
  | 'unavailable'
  | 'session_expired'
  | 'revoked';

export type VaultUnlockMethod = 'passphrase' | 'recovery_secret' | 'biometric_device_key' | 'pin_device_key';

export type VaultFailureReason =
  | 'wrong_credentials'
  | 'cancelled'
  | 'provider_unavailable'
  | 'rate_limited'
  | 'biometric_invalidated'
  | 'device_revoked'
  | 'stale_operation'
  | 'account_changed'
  | 'locked_during_operation'
  | 'cooldown_active'
  | 'admission_denied';

export type UnlockAdmissionDenial =
  | 'cooldown_active'
  | 'revoked'
  | 'unavailable'
  | 'method_not_allowed'
  | 'already_pending'
  | 'already_unlocked';

export interface UnlockAdmissionResult {
  admit: boolean;
  reason?: UnlockAdmissionDenial;
  message?: string;
}

export interface VaultRetryPolicy {
  /** Max consecutive failed passphrase/recovery attempts before cooldown. */
  maxFailedAttempts: number;
  /** Cooldown after max failures (ms). */
  cooldownMs: number;
  /** Failed attempts never destroy recoverable ciphertext or recovery material. */
  destroyDataOnFailure: false;
}

export const DEFAULT_VAULT_RETRY_POLICY: VaultRetryPolicy = {
  maxFailedAttempts: 5,
  cooldownMs: 60_000,
  destroyDataOnFailure: false,
};

/** Reviewed offline unlock policy (documented limit). */
export type OfflineUnlockPolicy = {
  /**
   * Cached offline unlock may succeed using local wraps while disconnected.
   * Revocation learned after reconnect must lock on next online sync check.
   * Does not claim immediate remote revocation on a disconnected device.
   */
  allowCachedOfflineUnlock: boolean;
  requireOnlineRevocationCheckWhenConnected: boolean;
};

export const DEFAULT_OFFLINE_UNLOCK_POLICY: OfflineUnlockPolicy = {
  allowCachedOfflineUnlock: true,
  requireOnlineRevocationCheckWhenConnected: true,
};

export interface VaultSessionSnapshot {
  state: VaultLockState;
  unlockedAt: string | null;
  lastActivityAt: string | null;
  unlockMethod: VaultUnlockMethod | null;
  failedAttempts: number;
  cooldownUntil: string | null;
  deviceEnrollmentStatus: 'unknown' | 'enrolled' | 'revoked' | 'unavailable';
  biometricCapability: 'available' | 'unavailable' | 'invalidated' | 'unknown';
  /** Generation bumps on every lock / account change; stale unlock ops must fail. */
  generation: number;
  /** Active unlock operation id, if any. */
  pendingOperationId: string | null;
  workspaceId: string | null;
  accountId: string | null;
  /** True only when using an explicitly labeled synthetic harness provider. */
  syntheticHarnessActive: boolean;
}

export function createLockedVaultSession(opts?: {
  workspaceId?: string | null;
  accountId?: string | null;
  syntheticHarnessActive?: boolean;
}): VaultSessionSnapshot {
  return {
    state: 'locked',
    unlockedAt: null,
    lastActivityAt: null,
    unlockMethod: null,
    failedAttempts: 0,
    cooldownUntil: null,
    deviceEnrollmentStatus: 'unknown',
    biometricCapability: 'unknown',
    generation: 1,
    pendingOperationId: null,
    workspaceId: opts?.workspaceId ?? null,
    accountId: opts?.accountId ?? null,
    syntheticHarnessActive: opts?.syntheticHarnessActive === true,
  };
}

export type VaultLifecycleEvent =
  | { type: 'unlock_started'; operationId: string; method: VaultUnlockMethod; at: string }
  | {
      type: 'unlock_succeeded';
      operationId: string;
      method: VaultUnlockMethod;
      at: string;
      generationAtStart: number;
    }
  | {
      type: 'unlock_failed';
      operationId: string;
      reason: VaultFailureReason;
      at: string;
      generationAtStart: number;
    }
  | { type: 'unlock_cancelled'; operationId: string; at: string; generationAtStart: number }
  | { type: 'lock_requested'; at: string; reason: string }
  | { type: 'activity'; at: string }
  | { type: 'backgrounded'; at: string }
  | { type: 'resumed'; at: string }
  | { type: 'session_expired'; at: string }
  | { type: 'device_revoked_observed'; at: string }
  | { type: 'biometric_invalidated'; at: string }
  | {
      type: 'account_or_workspace_changed';
      at: string;
      accountId: string | null;
      workspaceId: string | null;
    }
  | { type: 'provider_unavailable'; at: string }
  | {
      type: 'capabilities_updated';
      biometricCapability: VaultSessionSnapshot['biometricCapability'];
      deviceEnrollmentStatus: VaultSessionSnapshot['deviceEnrollmentStatus'];
    };

function bumpGeneration(session: VaultSessionSnapshot): VaultSessionSnapshot {
  return {
    ...session,
    generation: session.generation + 1,
    pendingOperationId: null,
  };
}

function toLocked(
  session: VaultSessionSnapshot,
  extras: Partial<VaultSessionSnapshot> = {}
): VaultSessionSnapshot {
  return bumpGeneration({
    ...session,
    state: 'locked',
    unlockedAt: null,
    lastActivityAt: null,
    unlockMethod: null,
    ...extras,
  });
}

export function isUnlockMethodProductionAllowed(method: VaultUnlockMethod): boolean {
  // Short PIN / device-key unlock remains unavailable until reviewed scheme lands.
  if (method === 'pin_device_key') return false;
  return true;
}

export function assertNotSolePinSecret(method: VaultUnlockMethod): void {
  if (method === 'pin_device_key') {
    throw new Error(
      'Short PIN must never be the sole secret protecting a synchronized vault envelope. PIN/device-key unlock is unavailable until the reviewed scheme is accepted.'
    );
  }
}

/** Explicit unlock admission — controllers must call this before invoking key providers. */
export function admitUnlockAttempt(
  session: VaultSessionSnapshot,
  method: VaultUnlockMethod,
  at: string
): UnlockAdmissionResult {
  if (session.state === 'revoked') {
    return { admit: false, reason: 'revoked', message: 'Device enrollment revoked.' };
  }
  if (session.state === 'unavailable') {
    return { admit: false, reason: 'unavailable', message: 'Vault provider unavailable.' };
  }
  if (session.state === 'unlock_pending') {
    return { admit: false, reason: 'already_pending', message: 'An unlock operation is already pending.' };
  }
  if (session.state === 'unlocked') {
    return { admit: false, reason: 'already_unlocked', message: 'Vault is already unlocked.' };
  }
  if (session.cooldownUntil && Date.parse(at) < Date.parse(session.cooldownUntil)) {
    return {
      admit: false,
      reason: 'cooldown_active',
      message: 'Unlock attempts are in cooldown. Recoverable vault data was not deleted.',
    };
  }
  if (!isUnlockMethodProductionAllowed(method) && !session.syntheticHarnessActive) {
    return {
      admit: false,
      reason: 'method_not_allowed',
      message: 'Unlock method is not permitted for production vault sessions.',
    };
  }
  return { admit: true };
}

/** Completion may apply only to the exact pending operation in unlock_pending. */
export function canAcceptUnlockCompletion(
  session: VaultSessionSnapshot,
  opts: {
    operationId: string;
    generationAtStart: number;
    accountId: string | null;
    workspaceId: string | null;
  }
): boolean {
  if (session.state !== 'unlock_pending') return false;
  if (session.pendingOperationId !== opts.operationId) return false;
  if (session.generation !== opts.generationAtStart) return false;
  if (session.accountId !== opts.accountId) return false;
  if (session.workspaceId !== opts.workspaceId) return false;
  return true;
}

export function reduceVaultSession(
  session: VaultSessionSnapshot,
  event: VaultLifecycleEvent,
  policy: VaultRetryPolicy = DEFAULT_VAULT_RETRY_POLICY
): VaultSessionSnapshot {
  switch (event.type) {
    case 'capabilities_updated':
      return {
        ...session,
        biometricCapability: event.biometricCapability,
        deviceEnrollmentStatus: event.deviceEnrollmentStatus,
      };

    case 'provider_unavailable':
      return toLocked(session, { state: 'unavailable' });

    case 'unlock_started': {
      const admission = admitUnlockAttempt(session, event.method, event.at);
      if (!admission.admit) {
        if (admission.reason === 'method_not_allowed') {
          return { ...session, state: 'unavailable' };
        }
        // Cooldown / already pending / revoked: leave session unchanged (no pending op).
        return session;
      }
      return {
        ...session,
        state: 'unlock_pending',
        pendingOperationId: event.operationId,
      };
    }

    case 'unlock_succeeded': {
      if (
        !canAcceptUnlockCompletion(session, {
          operationId: event.operationId,
          generationAtStart: event.generationAtStart,
          accountId: session.accountId,
          workspaceId: session.workspaceId,
        })
      ) {
        // Stale or non-pending success must not open the vault.
        return session.state === 'unlocked' ? session : session;
      }
      return {
        ...session,
        state: 'unlocked',
        unlockedAt: event.at,
        lastActivityAt: event.at,
        unlockMethod: event.method,
        failedAttempts: 0,
        cooldownUntil: null,
        pendingOperationId: null,
      };
    }

    case 'unlock_failed': {
      if (
        !canAcceptUnlockCompletion(session, {
          operationId: event.operationId,
          generationAtStart: event.generationAtStart,
          accountId: session.accountId,
          workspaceId: session.workspaceId,
        })
      ) {
        return session;
      }
      if (event.reason === 'device_revoked') {
        return toLocked(session, {
          state: 'revoked',
          deviceEnrollmentStatus: 'revoked',
        });
      }
      if (event.reason === 'biometric_invalidated') {
        return toLocked(session, { biometricCapability: 'invalidated' });
      }
      if (event.reason === 'provider_unavailable') {
        return toLocked(session, { state: 'unavailable' });
      }
      if (event.reason === 'wrong_credentials' || event.reason === 'rate_limited') {
        const failedAttempts = session.failedAttempts + 1;
        const cooldownUntil =
          failedAttempts >= policy.maxFailedAttempts
            ? new Date(Date.parse(event.at) + policy.cooldownMs).toISOString()
            : session.cooldownUntil;
        return {
          ...toLocked(session),
          failedAttempts,
          cooldownUntil,
        };
      }
      // cancelled / stale / locked_during_operation / cooldown — lock without destroying data
      return toLocked(session, { failedAttempts: session.failedAttempts });
    }

    case 'unlock_cancelled': {
      if (
        !canAcceptUnlockCompletion(session, {
          operationId: event.operationId,
          generationAtStart: event.generationAtStart,
          accountId: session.accountId,
          workspaceId: session.workspaceId,
        })
      ) {
        return session;
      }
      return toLocked(session, { failedAttempts: session.failedAttempts });
    }

    case 'lock_requested':
    case 'backgrounded':
      if (session.state === 'unlocked' || session.state === 'unlock_pending') {
        return toLocked(session, { failedAttempts: session.failedAttempts });
      }
      return session;

    case 'resumed':
      // Resume does not unlock; remain locked unless already unlocked (foreground idle handled elsewhere).
      if (session.state === 'unlocked') {
        return { ...session, lastActivityAt: event.at };
      }
      return session;

    case 'activity':
      if (session.state === 'unlocked') {
        return { ...session, lastActivityAt: event.at };
      }
      return session;

    case 'session_expired':
      return toLocked(session, { state: 'session_expired', failedAttempts: session.failedAttempts });

    case 'device_revoked_observed':
      return toLocked(session, {
        state: 'revoked',
        deviceEnrollmentStatus: 'revoked',
      });

    case 'biometric_invalidated':
      return toLocked(session, { biometricCapability: 'invalidated' });

    case 'account_or_workspace_changed':
      return toLocked(session, {
        accountId: event.accountId,
        workspaceId: event.workspaceId,
        failedAttempts: 0,
        cooldownUntil: null,
      });

    default:
      return session;
  }
}

/** Foreground idle lock: unlocked sessions past idleMs since lastActivity must lock. */
export function shouldIdleLock(
  session: VaultSessionSnapshot,
  nowIso: string,
  idleMs: number
): boolean {
  if (session.state !== 'unlocked' || !session.lastActivityAt) return false;
  return Date.parse(nowIso) - Date.parse(session.lastActivityAt) >= idleMs;
}

export interface ProtectedNavigationDecision {
  allow: boolean;
  reason: string;
}

/** Deep links / navigation into vault content while locked must be denied. */
export function evaluateProtectedVaultNavigation(
  session: VaultSessionSnapshot,
  destination: 'vault_list' | 'vault_detail' | 'vault_edit' | 'vault_transfer'
): ProtectedNavigationDecision {
  if (session.state === 'unlocked') {
    return { allow: true, reason: 'Vault unlocked.' };
  }
  if (session.state === 'unavailable') {
    return { allow: false, reason: 'Vault provider unavailable; protected content not accessible.' };
  }
  if (session.state === 'revoked') {
    return { allow: false, reason: 'Device enrollment revoked; re-enroll after unlock with passphrase.' };
  }
  return {
    allow: false,
    reason: `Vault is ${session.state}; destination "${destination}" requires unlock.`,
  };
}

export type TransferUiPhase =
  | 'preview'
  | 'pending_verification'
  | 'pending_cleanup'
  | 'retained_ordinary_copy'
  | 'failed'
  | 'complete';

export interface TransferUiStatus {
  phase: TransferUiPhase;
  message: string;
  preservesRecoverableCopy: boolean;
}

export function describeTransferUiStatus(phase: TransferUiPhase): TransferUiStatus {
  switch (phase) {
    case 'preview':
      return {
        phase,
        message: 'Review source and reference consequences before encrypting into the vault.',
        preservesRecoverableCopy: true,
      };
    case 'pending_verification':
      return {
        phase,
        message: 'Ciphertext uploaded; verification pending. Ordinary source retained.',
        preservesRecoverableCopy: true,
      };
    case 'pending_cleanup':
      return {
        phase,
        message: 'Vault copy accepted; ordinary cleanup still pending. Not a finished move.',
        preservesRecoverableCopy: true,
      };
    case 'retained_ordinary_copy':
      return {
        phase,
        message: 'An ordinary copy remains by explicit disclosure; do not claim full secrecy.',
        preservesRecoverableCopy: true,
      };
    case 'failed':
      return {
        phase,
        message: 'Transfer failed. At least one recoverable copy is retained for retry.',
        preservesRecoverableCopy: true,
      };
    case 'complete':
      return {
        phase,
        message: 'Transfer complete only after verified acceptance and observable cleanup.',
        preservesRecoverableCopy: true,
      };
  }
}
