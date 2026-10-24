/**
 * Phase 49 — Drive selected-file connector domain invariants.
 * Narrow `drive.file` only; vault excluded; disconnect fencing.
 */

import { DRIVE_FILE_SCOPE, validateGrantedDriveScopes, validateRequestedDriveScopes } from './driveScopes.js';

export type DriveConnectionStatus =
  | 'unconfigured'
  | 'pending_consent'
  | 'connected'
  | 'degraded'
  | 'disconnected'
  | 'revoked';

export type DriveLinkMode = 'link_reference' | 'import_copy' | 'upload_to_drive' | 'download_offline';

export type DriveAuthIntentStatus =
  | 'pending'
  | 'consumed'
  | 'cancelled'
  | 'denied'
  | 'expired'
  | 'failed';

export type DriveJobKind = 'import_copy' | 'upload_to_drive' | 'download_offline' | 'reconcile';

export type DriveDisconnectReason = 'local_disconnect' | 'provider_revocation' | 'invalid_grant';

export interface DriveConnectionSnapshot {
  id: string;
  workspaceId: string;
  accountId: string;
  status: DriveConnectionStatus;
  /** Monotonic generation; incremented on disconnect so late jobs cannot resurrect. */
  generation: number;
  providerAccountEmail: string | null;
  providerSubject: string | null;
  grantedScope: string | null;
}

export interface DriveSelectedObject {
  providerFileId: string;
  mimeType: string;
  name: string;
  /** True when Google reports a shortcut; shortcuts are not silently followed. */
  isShortcut: boolean;
  /** True when resource lives on a shared drive outside supported boundary. */
  isSharedDrive: boolean;
  md5Checksum: string | null;
  version: string | null;
}

export function assertDriveScopesForConnect(requested: string, granted: string): void {
  const req = validateRequestedDriveScopes(requested);
  if (!req.ok) throw new Error(req.message);
  const grant = validateGrantedDriveScopes(granted, { allowOpenIdExtras: true });
  if (!grant.ok) throw new Error(grant.message);
}

export function isVaultDriveTarget(itemKind: string | null | undefined): boolean {
  return itemKind === 'vault' || itemKind === 'vault_item' || itemKind === 'encrypted_vault';
}

/**
 * Application selection boundary: only explicitly selected or app-created provider IDs
 * may be used, even if Google's token could reach more.
 */
export function isProviderObjectAuthorized(
  authorizedProviderIds: ReadonlySet<string>,
  providerFileId: string
): boolean {
  return authorizedProviderIds.has(providerFileId);
}

export function evaluateSelectedObjectSupport(obj: DriveSelectedObject): {
  supported: boolean;
  reason: string | null;
} {
  if (obj.isShortcut) {
    return {
      supported: false,
      reason: 'shortcuts_unsupported_without_explicit_target_selection',
    };
  }
  if (obj.isSharedDrive) {
    return {
      supported: false,
      reason: 'shared_drive_outside_selected_file_boundary',
    };
  }
  return { supported: true, reason: null };
}

/** Auth intents expire and are single-use. */
export function isAuthIntentUsable(input: {
  status: DriveAuthIntentStatus;
  expiresAtMs: number;
  nowMs: number;
  boundAccountId: string;
  boundWorkspaceId: string;
  actorAccountId: string;
  actorWorkspaceId: string;
}): { ok: true } | { ok: false; reason: string } {
  if (input.boundAccountId !== input.actorAccountId) {
    return { ok: false, reason: 'account_mismatch' };
  }
  if (input.boundWorkspaceId !== input.actorWorkspaceId) {
    return { ok: false, reason: 'workspace_mismatch' };
  }
  if (input.status !== 'pending') {
    return { ok: false, reason: `intent_${input.status}` };
  }
  if (input.nowMs > input.expiresAtMs) {
    return { ok: false, reason: 'intent_expired' };
  }
  return { ok: true };
}

/**
 * Fence late refresh/job completions after disconnect.
 * Returning false means the completion must be discarded (no resurrection).
 */
export function mayCompleteDriveWork(input: {
  connectionStatus: DriveConnectionStatus;
  connectionGeneration: number;
  jobGeneration: number;
}): boolean {
  if (input.connectionStatus === 'disconnected' || input.connectionStatus === 'revoked') {
    return false;
  }
  if (input.connectionStatus === 'unconfigured') return false;
  return input.jobGeneration === input.connectionGeneration;
}

export function disconnectExplanation(reason: DriveDisconnectReason): {
  tokensRemoved: true;
  retainedImportedCopies: true;
  remoteOriginalDeleted: false;
  message: string;
} {
  const base = {
    tokensRemoved: true as const,
    retainedImportedCopies: true as const,
    remoteOriginalDeleted: false as const,
  };
  switch (reason) {
    case 'local_disconnect':
      return {
        ...base,
        message:
          'Local disconnect removed stored Google tokens and cancelled pending Drive jobs. Imported/offline copies remain in Daynori unless you delete them. The remote Drive originals were not trashed.',
      };
    case 'provider_revocation':
      return {
        ...base,
        message:
          'Google access was revoked. Daynori stopped Drive work and removed stored tokens. Retained imported/offline copies stay available locally.',
      };
    case 'invalid_grant':
      return {
        ...base,
        message:
          'Google rejected the refresh grant. Connection marked revoked; tokens removed; pending jobs cancelled. Retained copies stay local.',
      };
  }
}

export const DRIVE_CONNECTOR_REQUESTED_SCOPE = DRIVE_FILE_SCOPE;

/** Short-lived Picker access-token handoff constraints (never refresh tokens). */
export const PICKER_ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000;
