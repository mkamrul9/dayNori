/**
 * Phase 52 — Room membership revocation and access control foundations.
 */

/**
 * Typed reasons for room access revocation.
 */
export type RoomRevocationReason =
  | 'membership_removed'
  | 'role_downgraded'
  | 'room_archived'
  | 'access_epoch_changed'
  | 'cursor_invalid';

/**
 * Event describing a room access revocation that may require local purge.
 */
export interface RoomRevocationEvent {
  workspaceId: string;
  userId: string;
  reason: RoomRevocationReason;
  timestamp: string;
  /**
   * Optional access epoch token for detecting stale access grants.
   */
  accessEpoch?: string;
}

/**
 * Protocol error codes indicating confirmed revocation requiring local purge.
 */
export const CONFIRMED_REVOCATION_CODES = [
  'MEMBERSHIP_REVOKED',
  'ROOM_ARCHIVED',
  'SYNC_RESET_REQUIRED',
] as const;

export type ConfirmedRevocationCode = (typeof CONFIRMED_REVOCATION_CODES)[number];

/**
 * Distinguishes confirmed revocations (must purge) from transient failures (retry allowed).
 * Confirmed revocations signal server-side membership removal or access epoch change.
 * Transient failures may be network issues that should not trigger purge.
 */
export function isConfirmedRevocation(params: {
  code?: string;
  statusCode?: number;
  message?: string;
  accessEpoch?: string;
}): boolean {
  const { code, statusCode, message, accessEpoch } = params;

  // Check for explicit revocation codes
  if (code && (CONFIRMED_REVOCATION_CODES as readonly string[]).includes(code)) {
    return true;
  }

  // Check for access epoch mismatch signaling stale grants
  if (accessEpoch && message?.includes('access_epoch')) {
    return true;
  }

  // Message patterns indicating revocation
  if (message) {
    const msgLower = message.toLowerCase();
    if (msgLower.includes('access revoked') || msgLower.includes('membership revoked')) {
      return true;
    }
    if (msgLower.includes('archived')) {
      return true;
    }
  }

  // 403 with SYNC_RESET_REQUIRED is confirmed
  if (statusCode === 403 && code === 'SYNC_RESET_REQUIRED') {
    return true;
  }

  return false;
}

/**
 * Maps protocol errors to revocation reasons.
 */
export function mapRevocationReason(params: {
  code?: string;
  message?: string;
}): RoomRevocationReason {
  const { code, message } = params;
  
  if (code === 'MEMBERSHIP_REVOKED' || message?.includes('membership')) {
    return 'membership_removed';
  }
  
  if (code === 'ROOM_ARCHIVED' || message?.includes('archived')) {
    return 'room_archived';
  }
  
  if (message?.includes('access_epoch') || message?.includes('epoch')) {
    return 'access_epoch_changed';
  }
  
  if (code === 'SYNC_RESET_REQUIRED' || message?.includes('cursor')) {
    return 'cursor_invalid';
  }

  return 'membership_removed';
}
