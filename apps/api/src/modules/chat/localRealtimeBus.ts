/**
 * Process-local provisional realtime fan-out for room chat.
 * Distinct from a production provider — single-process synthetic clients only.
 */

export type RoomChatBusEvent = {
  roomId: string;
  serverOrder: number;
  eventType: 'room_message.created' | 'room_message.edited' | 'room_message.deleted';
  messageId: string;
  at: string;
};

type Listener = (event: RoomChatBusEvent) => void;

const roomListeners = new Map<string, Set<Listener>>();
const globalListeners = new Set<Listener>();

export function publishRoomChatEvent(event: RoomChatBusEvent): void {
  for (const listener of globalListeners) {
    try {
      listener(event);
    } catch {
      /* isolate listener failures */
    }
  }
  const set = roomListeners.get(event.roomId);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch {
      /* isolate listener failures */
    }
  }
}

export function subscribeRoomChat(
  roomId: string,
  listener: Listener
): () => void {
  let set = roomListeners.get(roomId);
  if (!set) {
    set = new Set();
    roomListeners.set(roomId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) roomListeners.delete(roomId);
  };
}

export function subscribeAllRoomChat(listener: Listener): () => void {
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
}

/** Test helper — clear all subscriptions. */
export function resetLocalRoomChatBus(): void {
  roomListeners.clear();
  globalListeners.clear();
}
