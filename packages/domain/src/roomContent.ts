/**
 * Phase 52 — Room content sync foundations: syncable item kinds and content blocking rules.
 */

/**
 * Item kinds eligible for room sync.
 * Excludes journal entries and vault-scoped items by design.
 */
export const ROOM_SYNC_ITEM_KINDS = ['note', 'task', 'todo', 'file_item'] as const;
export type RoomSyncItemKind = (typeof ROOM_SYNC_ITEM_KINDS)[number];

/**
 * Checks if an item kind is eligible for room synchronization.
 */
export function isRoomSyncableItemKind(kind: string): kind is RoomSyncItemKind {
  return (ROOM_SYNC_ITEM_KINDS as readonly string[]).includes(kind);
}

/**
 * Determines if content should be blocked from room sync based on kind, type, or security scope.
 * Returns true for journal entries, vault items, or any content marked with vault security scope.
 */
export function isRoomContentBlocked(params: {
  kind?: string | null;
  type?: string | null;
  securityScope?: string | null;
}): boolean {
  const { kind, type, securityScope } = params;
  
  // Block vault-scoped content
  if (securityScope && /vault/i.test(securityScope)) {
    return true;
  }

  // Block journal entries
  const kindLower = (kind || '').toLowerCase();
  const typeLower = (type || '').toLowerCase();
  
  if (kindLower.includes('journal') || typeLower.includes('journal')) {
    return true;
  }

  // Block vault items
  if (kindLower.includes('vault') || typeLower.includes('vault')) {
    return true;
  }

  return false;
}
