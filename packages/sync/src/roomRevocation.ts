/**
 * Phase 52 repair — Room revocation classification and durable workspace purge.
 */

import type { LocalRepositoryPort } from './ports.js';
import { classifySyncError, type ClassifiedSyncError } from './transport.js';
import {
  isConfirmedRevocation,
  isRoomRoleInsufficient,
  isSyncResetRequired,
  mapRevocationReason,
  requiresRoomContentPurge,
  type RoomRevocationReason,
} from '@daynori/domain';

export interface ClassifiedRoomSyncFailure extends ClassifiedSyncError {
  /** Confirmed loss of readable room access — purge required. */
  isMembershipRevoked: boolean;
  /** Authorized member needs cursor/epoch rebase — preserve drafts. */
  isSyncResetRequired: boolean;
  /** Still a member but cannot write (viewer) — do not purge. */
  isRoleInsufficient: boolean;
  revocationReason?: RoomRevocationReason;
}

export function classifyRoomSyncFailure(error: unknown): ClassifiedRoomSyncFailure {
  const base = classifySyncError(error);
  const code = base.code;
  const message = base.message;

  const syncReset = isSyncResetRequired({ code, message }) || base.isResetRequired;
  const roleInsufficient = isRoomRoleInsufficient({ code, message });
  const membershipRevoked =
    !syncReset &&
    !roleInsufficient &&
    isConfirmedRevocation({
      code,
      statusCode: base.statusCode,
      message,
    });

  const revocationReason =
    membershipRevoked || roleInsufficient || syncReset
      ? mapRevocationReason({ code, message })
      : undefined;

  return {
    ...base,
    isResetRequired: syncReset,
    isMembershipRevoked: membershipRevoked,
    isSyncResetRequired: syncReset,
    isRoleInsufficient: roleInsufficient,
    revocationReason,
  };
}

export interface RoomRevocationPurgeScope {
  workspaceId: string;
  userId: string;
  reason: RoomRevocationReason;
  /** When false, callers must not invoke applyRoomRevocationPurge. */
  shouldPurge: boolean;
}

export function planRoomRevocationPurge(params: {
  workspaceId: string;
  userId: string;
  reason: RoomRevocationReason;
}): RoomRevocationPurgeScope {
  return {
    workspaceId: params.workspaceId,
    userId: params.userId,
    reason: params.reason,
    shouldPurge: requiresRoomContentPurge(params.reason),
  };
}

export class RoomRevocationPurgeError extends Error {
  constructor(
    message: string,
    readonly workspaceId: string,
    override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'RoomRevocationPurgeError';
  }
}

/**
 * Clears all local readable state for one room workspace via the typed
 * `clearWorkspaceData` adapter (headers, drafts, mutations, conflicts, cursors, content).
 *
 * Does not touch other workspaces or account preferences.
 * Offline byte caches outside the repository remain an application-level limit.
 */
export async function applyRoomRevocationPurge(
  repo: LocalRepositoryPort,
  scope: RoomRevocationPurgeScope,
  abortController?: AbortController
): Promise<void> {
  if (!scope.shouldPurge) {
    return;
  }

  if (abortController) {
    abortController.abort();
  }

  try {
    await repo.clearWorkspaceData(scope.workspaceId);
  } catch (err) {
    throw new RoomRevocationPurgeError(
      `Failed to purge revoked room workspace ${scope.workspaceId}`,
      scope.workspaceId,
      err
    );
  }
}
