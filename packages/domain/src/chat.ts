/**
 * Phase 53 — Room chat domain rules (bounds, roles, attachment policy).
 * Provisional local only; production rooms/chat remain release-gated.
 */

import type { RoomRole } from './rooms.js';
import { roomPermissionsFor } from './rooms.js';

/** Maximum UTF-16 code units accepted for a message body. */
export const ROOM_CHAT_MAX_BODY_LENGTH = 4000;

/** Default and maximum history page sizes. */
export const ROOM_CHAT_DEFAULT_PAGE_SIZE = 50;
export const ROOM_CHAT_MAX_PAGE_SIZE = 100;

/** Soft retention horizon for message bodies (days). */
export const ROOM_CHAT_RETENTION_DAYS = 365;

/** Per-sender rate: max messages in a sliding window. */
export const ROOM_CHAT_RATE_LIMIT_COUNT = 30;
export const ROOM_CHAT_RATE_LIMIT_WINDOW_MS = 60_000;

/** Roles that may send / edit / delete their own messages. */
export function canSendRoomChat(role: RoomRole | null | undefined): boolean {
  return roomPermissionsFor(role).editContent;
}

export function canReadRoomChat(role: RoomRole | null | undefined): boolean {
  return roomPermissionsFor(role).readContent;
}

/** Authors may edit/delete their own non-deleted messages; owners may moderate-delete. */
export function canEditRoomMessage(params: {
  actorRole: RoomRole | null | undefined;
  actorId: string;
  senderId: string;
}): boolean {
  if (!canSendRoomChat(params.actorRole)) return false;
  return params.actorId === params.senderId;
}

export function canDeleteRoomMessage(params: {
  actorRole: RoomRole | null | undefined;
  actorId: string;
  senderId: string;
}): boolean {
  if (params.actorRole === 'owner') return true;
  return canEditRoomMessage(params);
}

export function validateRoomChatBody(body: string): { ok: true; body: string } | { ok: false; message: string } {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: 'Message body is required' };
  }
  if (trimmed.length > ROOM_CHAT_MAX_BODY_LENGTH) {
    return { ok: false, message: `Message exceeds ${ROOM_CHAT_MAX_BODY_LENGTH} characters` };
  }
  return { ok: true, body: trimmed };
}

export function clampRoomChatPageSize(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return ROOM_CHAT_DEFAULT_PAGE_SIZE;
  const n = Math.floor(limit);
  if (n < 1) return 1;
  if (n > ROOM_CHAT_MAX_PAGE_SIZE) return ROOM_CHAT_MAX_PAGE_SIZE;
  return n;
}

/**
 * Attachments must already be room-owned shareable file items.
 * Personal/vault/journal references are rejected.
 */
export function isAllowedRoomChatAttachmentKind(kind: string, securityScope?: string | null): boolean {
  if (securityScope && /vault/i.test(securityScope)) return false;
  const lower = kind.toLowerCase();
  if (/vault|journal/i.test(lower)) return false;
  return lower === 'file' || lower === 'file_item';
}

/** Whether a mute row currently suppresses notifications. */
export function isRoomMuteActive(params: {
  muted: boolean;
  mutedUntil: string | Date | null | undefined;
  now?: Date;
}): boolean {
  if (!params.muted) return false;
  if (!params.mutedUntil) return true;
  const until =
    params.mutedUntil instanceof Date ? params.mutedUntil : new Date(params.mutedUntil);
  const now = params.now ?? new Date();
  return until.getTime() > now.getTime();
}

/** Multi-device unread: devices share server read cursor per (room, user). */
export type RoomChatUnreadPolicy = 'shared_per_user_cursor';

export const ROOM_CHAT_UNREAD_POLICY: RoomChatUnreadPolicy = 'shared_per_user_cursor';
