/**
 * Phase 51 — Shared room collaboration rules (permissions, invitations, share boundaries).
 * Release enablement remains gated; this module encodes local invariants only.
 */

export type RoomRole = 'owner' | 'editor' | 'viewer';
export type RoomInviteRole = 'editor' | 'viewer';

/** Explicit bearer-link vs targeted-recipient invitation policy. */
export type RoomInvitationDeliveryPolicy = 'bearer_link' | 'targeted_recipient';

export const ROOM_INVITE_MAX_PENDING_PER_ROOM = 25;
export const ROOM_INVITE_DEFAULT_TTL_HOURS = 72;
export const ROOM_INVITE_MAX_TTL_HOURS = 168; // 7 days
export const ROOM_INVITE_TOKEN_BYTES = 32;

/** Item kinds that may be explicitly copied into a room (never journals/vault). */
/** Phase 51 minimal share set — notes and tasks only; files/folders deferred. */
export const ROOM_SHAREABLE_ITEM_KINDS = ['note', 'task', 'todo'] as const;
export type RoomShareableItemKind = (typeof ROOM_SHAREABLE_ITEM_KINDS)[number];

export const ROOM_BLOCKED_SHARE_KINDS = [
  'journal_entry',
  'journal',
  'vault_item',
  'vault',
] as const;

export interface RoomPermissionMatrix {
  manageInvitations: boolean;
  manageMembers: boolean;
  transferOwnership: boolean;
  archiveOrDeleteRoom: boolean;
  editContent: boolean;
  readContent: boolean;
}

export function roomPermissionsFor(role: RoomRole | null | undefined): RoomPermissionMatrix {
  if (!role) {
    return {
      manageInvitations: false,
      manageMembers: false,
      transferOwnership: false,
      archiveOrDeleteRoom: false,
      editContent: false,
      readContent: false,
    };
  }
  const isOwner = role === 'owner';
  const isEditor = role === 'editor' || isOwner;
  const isViewer = role === 'viewer' || isEditor;
  return {
    manageInvitations: isOwner,
    manageMembers: isOwner,
    transferOwnership: isOwner,
    archiveOrDeleteRoom: isOwner,
    editContent: isEditor,
    readContent: isViewer,
  };
}

export function canInviteWithRole(actorRole: RoomRole, inviteRole: RoomInviteRole): boolean {
  return roomPermissionsFor(actorRole).manageInvitations && inviteRole !== ('owner' as string);
}

export function isShareableItemKind(kind: string): kind is RoomShareableItemKind {
  return (ROOM_SHAREABLE_ITEM_KINDS as readonly string[]).includes(kind);
}

export function isBlockedShareKind(kind: string, securityScope?: string | null): boolean {
  const lower = kind.toLowerCase();
  if ((ROOM_BLOCKED_SHARE_KINDS as readonly string[]).includes(lower)) return true;
  if (securityScope && /vault/i.test(securityScope)) return true;
  if (/vault/i.test(lower)) return true;
  if (/journal/i.test(lower)) return true;
  return false;
}

export function validateInvitationTtlHours(hours: number): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(hours) || hours < 1) {
    return { ok: false, message: 'Invitation TTL must be at least 1 hour' };
  }
  if (hours > ROOM_INVITE_MAX_TTL_HOURS) {
    return { ok: false, message: `Invitation TTL cannot exceed ${ROOM_INVITE_MAX_TTL_HOURS} hours` };
  }
  return { ok: true };
}

/**
 * Generic client-facing invitation failure codes — avoid leaking existence details.
 */
export type RoomInviteClientError =
  | 'ROOM_INVITE_INVALID'
  | 'ROOM_INVITE_EXPIRED'
  | 'ROOM_INVITE_REVOKED'
  | 'ROOM_INVITE_USED'
  | 'ROOM_INVITE_UNAVAILABLE'
  | 'ROOM_INVITE_RECIPIENT_MISMATCH';

export function mapInviteExceptionMessage(message: string): RoomInviteClientError {
  const m = message.toUpperCase();
  if (m.includes('ROOM_INVITE_REVOKED')) return 'ROOM_INVITE_REVOKED';
  if (m.includes('ROOM_INVITE_USED')) return 'ROOM_INVITE_USED';
  if (m.includes('ROOM_INVITE_EXPIRED')) return 'ROOM_INVITE_EXPIRED';
  if (m.includes('ROOM_INVITE_UNAVAILABLE')) return 'ROOM_INVITE_UNAVAILABLE';
  if (m.includes('ROOM_INVITE_RECIPIENT_MISMATCH')) return 'ROOM_INVITE_RECIPIENT_MISMATCH';
  return 'ROOM_INVITE_INVALID';
}

export function invitationPreviewSafe(input: {
  roomName: string;
  role: RoomInviteRole;
  expiresAt: string;
  status: string;
}): { roomName: string; role: RoomInviteRole; expiresAt: string; status: string } {
  return {
    roomName: input.roomName.slice(0, 100),
    role: input.role,
    expiresAt: input.expiresAt,
    status: input.status,
  };
}

export function assertNotSelfPromotion(params: {
  actorId: string;
  targetUserId: string;
  currentRole: RoomRole;
  nextRole: RoomRole;
}): void {
  if (params.actorId === params.targetUserId && params.nextRole === 'owner' && params.currentRole !== 'owner') {
    throw new Error('ROOM_SELF_PROMOTION_FORBIDDEN');
  }
}
