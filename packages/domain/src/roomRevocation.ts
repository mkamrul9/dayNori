/**
 * Phase 52 repair — Room membership revocation classification.
 * Destructive purge requires structured loss-of-access codes only.
 * SYNC_RESET_REQUIRED is a cursor/epoch rebase signal, not revocation.
 */

/**
 * Typed reasons for room access revocation / role changes.
 * `role_downgraded` and `cursor_invalid` are non-destructive for readable membership.
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
  accessEpoch?: string;
}

/**
 * Codes that confirm loss of readable room access and require scoped purge.
 * Deliberately excludes SYNC_RESET_REQUIRED (authorized members rebase safely).
 */
export const CONFIRMED_REVOCATION_CODES = ['MEMBERSHIP_REVOKED', 'ROOM_ARCHIVED'] as const;

export type ConfirmedRevocationCode = (typeof CONFIRMED_REVOCATION_CODES)[number];

/**
 * Distinguishes confirmed loss-of-access (must purge) from:
 * - SYNC_RESET_REQUIRED / epoch rotation (rebase, preserve drafts)
 * - ROOM_ROLE_INSUFFICIENT / FORBIDDEN for write (reject writes, keep readable cache)
 * - network / generic errors (retry)
 */
export function isConfirmedRevocation(params: {
  code?: string;
  statusCode?: number;
  message?: string;
}): boolean {
  const { code, message } = params;

  if (code && (CONFIRMED_REVOCATION_CODES as readonly string[]).includes(code)) {
    return true;
  }

  // Structured message fallback only when paired with known revocation phrasing
  // that includes the protocol code tokens — avoid matching bare "archived".
  if (message) {
    if (/\bMEMBERSHIP_REVOKED\b/.test(message)) return true;
    if (/\bROOM_ARCHIVED\b/.test(message)) return true;
  }

  return false;
}

/**
 * True when the server requires a sync reset/rebase without revoking readable access.
 */
export function isSyncResetRequired(params: { code?: string; message?: string }): boolean {
  if (params.code === 'SYNC_RESET_REQUIRED') return true;
  if (params.message?.includes('SYNC_RESET_REQUIRED')) return true;
  return false;
}

/**
 * True when the actor remains a member but lacks write privilege (viewer).
 * Must not trigger destructive purge.
 */
export function isRoomRoleInsufficient(params: { code?: string; message?: string }): boolean {
  if (params.code === 'ROOM_ROLE_INSUFFICIENT') return true;
  if (params.code === 'FORBIDDEN' && params.message?.toLowerCase().includes('insufficient role')) {
    return true;
  }
  if (params.message?.includes('ROOM_ROLE_INSUFFICIENT')) return true;
  return false;
}

/**
 * Maps protocol errors to reasons. Prefer structured codes over message substrings.
 */
export function mapRevocationReason(params: {
  code?: string;
  message?: string;
}): RoomRevocationReason {
  const { code, message } = params;

  if (code === 'MEMBERSHIP_REVOKED') return 'membership_removed';
  if (code === 'ROOM_ARCHIVED') return 'room_archived';
  if (code === 'ROOM_ROLE_INSUFFICIENT') return 'role_downgraded';
  if (code === 'SYNC_RESET_REQUIRED') return 'cursor_invalid';

  if (message) {
    if (/\bMEMBERSHIP_REVOKED\b/.test(message) || /membership not found or revoked/i.test(message)) {
      return 'membership_removed';
    }
    if (/\bROOM_ARCHIVED\b/.test(message)) return 'room_archived';
    if (/\bROOM_ROLE_INSUFFICIENT\b/.test(message) || /insufficient role/i.test(message)) {
      return 'role_downgraded';
    }
    if (message.includes('SYNC_RESET_REQUIRED')) return 'cursor_invalid';
  }

  return 'membership_removed';
}

/**
 * Whether this reason requires destructive local room purge.
 */
export function requiresRoomContentPurge(reason: RoomRevocationReason): boolean {
  return reason === 'membership_removed' || reason === 'room_archived';
}
