/**
 * Account+room scoped durable chat drafts and pending sends for web.
 * Cleared on confirmed room revocation; survives restarts within the same account.
 */

export type RoomChatPendingSend = {
  clientMessageId: string;
  body: string;
  attachmentFileId?: string | null;
  status: 'pending' | 'failed';
  error?: string;
  updatedAt: string;
};

export type RoomChatLocalSnapshot = {
  draft: string;
  pending: RoomChatPendingSend[];
  eventCursor: number;
  /** Generation token — ignore stale async writes from prior room/account. */
  generation: number;
};

const PREFIX = 'daynori.roomChat.v1';

function key(userId: string, roomId: string): string {
  return `${PREFIX}:${userId}:${roomId}`;
}

function accountPrefix(userId: string): string {
  return `${PREFIX}:${userId}:`;
}

function readRaw(userId: string, roomId: string): RoomChatLocalSnapshot | null {
  try {
    const raw = localStorage.getItem(key(userId, roomId));
    if (!raw) return null;
    return JSON.parse(raw) as RoomChatLocalSnapshot;
  } catch {
    return null;
  }
}

function writeRaw(userId: string, roomId: string, snap: RoomChatLocalSnapshot): void {
  try {
    localStorage.setItem(key(userId, roomId), JSON.stringify(snap));
  } catch {
    /* quota / private mode */
  }
}

export function loadRoomChatLocal(
  userId: string,
  roomId: string
): RoomChatLocalSnapshot {
  const existing = readRaw(userId, roomId);
  if (existing) return existing;
  return { draft: '', pending: [], eventCursor: 0, generation: 1 };
}

export function saveRoomChatDraft(userId: string, roomId: string, draft: string): void {
  const snap = loadRoomChatLocal(userId, roomId);
  writeRaw(userId, roomId, { ...snap, draft });
}

export function saveRoomChatPending(
  userId: string,
  roomId: string,
  pending: RoomChatPendingSend[]
): void {
  const snap = loadRoomChatLocal(userId, roomId);
  writeRaw(userId, roomId, { ...snap, pending });
}

export function saveRoomChatEventCursor(
  userId: string,
  roomId: string,
  eventCursor: number
): void {
  const snap = loadRoomChatLocal(userId, roomId);
  writeRaw(userId, roomId, { ...snap, eventCursor: Math.max(0, eventCursor) });
}

/** Clears one room's chat local state after confirmed revocation. */
export function clearRoomChatLocal(userId: string, roomId: string): void {
  try {
    localStorage.removeItem(key(userId, roomId));
  } catch {
    /* ignore */
  }
}

/** Clears all room chat local state for an account (logout / switch). */
export function clearAccountRoomChatLocal(userId: string): void {
  try {
    const prefix = accountPrefix(userId);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function bumpRoomChatGeneration(userId: string, roomId: string): number {
  const snap = loadRoomChatLocal(userId, roomId);
  const generation = (snap.generation || 1) + 1;
  writeRaw(userId, roomId, { ...snap, generation });
  return generation;
}
