/**
 * Account+room scoped durable chat drafts and pending sends for Android.
 */

export type RoomChatPendingSend = {
  clientMessageId: string;
  body: string;
  status: 'pending' | 'failed';
  error?: string;
  updatedAt: string;
};

export type RoomChatLocalSnapshot = {
  draft: string;
  pending: RoomChatPendingSend[];
  eventCursor: number;
  messagesCache: Array<{
    id: string;
    body: string;
    serverOrder: number;
    bodyRevision: number;
    deletedAt: string | null;
    senderId: string;
  }>;
};

type MemoryStore = Map<string, string>;

const memory: MemoryStore = new Map();

function key(userId: string, roomId: string): string {
  return `daynori.roomChat.v1:${userId}:${roomId}`;
}

export function loadRoomChatLocal(userId: string, roomId: string): RoomChatLocalSnapshot {
  const raw = memory.get(key(userId, roomId));
  if (!raw) {
    return { draft: '', pending: [], eventCursor: 0, messagesCache: [] };
  }
  try {
    return JSON.parse(raw) as RoomChatLocalSnapshot;
  } catch {
    return { draft: '', pending: [], eventCursor: 0, messagesCache: [] };
  }
}

export function saveRoomChatLocal(
  userId: string,
  roomId: string,
  snap: RoomChatLocalSnapshot
): void {
  memory.set(key(userId, roomId), JSON.stringify(snap));
}

export function clearRoomChatLocal(userId: string, roomId: string): void {
  memory.delete(key(userId, roomId));
}

export function clearAccountRoomChatLocal(userId: string): void {
  const prefix = `daynori.roomChat.v1:${userId}:`;
  for (const k of [...memory.keys()]) {
    if (k.startsWith(prefix)) memory.delete(k);
  }
}
