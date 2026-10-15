/**
 * Organization domain rules, folder tree invariants, rank management, and Inbox semantics.
 */

export const MAX_FOLDER_DEPTH = 5;

/**
 * Returns true if an item belongs to the Inbox (null primary folder).
 */
export function isInboxItem(folderId: string | null | undefined): boolean {
  return folderId === null || folderId === undefined;
}

/**
 * Validates that folder depth does not exceed maximum allowable depth (5).
 */
export function validateFolderDepth(depth: number): void {
  if (!Number.isInteger(depth) || depth < 1 || depth > MAX_FOLDER_DEPTH) {
    throw new Error(
      `DEPTH_LIMIT_EXCEEDED: Folder depth ${depth} violates bounds [1, ${MAX_FOLDER_DEPTH}].`
    );
  }
}

/**
 * Stable rank comparator with deterministic ID tie-breaker.
 * Compares ranks numerically when possible, lexicographically otherwise,
 * and falls back to comparing UUIDs for stable tie-breaking.
 */
export function compareRanks(rankA: string, idA: string, rankB: string, idB: string): number {
  const numA = Number(rankA);
  const numB = Number(rankB);

  let rankComparison = 0;
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
    rankComparison = numA - numB;
  } else {
    rankComparison = rankA.localeCompare(rankB);
  }

  if (rankComparison !== 0) {
    return rankComparison;
  }

  return idA.localeCompare(idB);
}

/**
 * Generates an initial rank for an item at index in a sequence.
 */
export function generateInitialRank(index: number, step = 1000): string {
  return String((index + 1) * step);
}

/**
 * Generates a sparse fractional rank between two existing sibling ranks.
 */
export function generateBetweenRanks(prevRank: string | null, nextRank: string | null): string {
  if (prevRank === null && nextRank === null) {
    return '1000';
  }
  if (prevRank === null && nextRank !== null) {
    const nextNum = Number(nextRank);
    if (!Number.isNaN(nextNum)) {
      return String(Math.floor(nextNum / 2) || nextNum - 1);
    }
    return '500';
  }
  if (prevRank !== null && nextRank === null) {
    const prevNum = Number(prevRank);
    if (!Number.isNaN(prevNum)) {
      return String(prevNum + 1000);
    }
    return `${prevRank}z`;
  }

  const prevNum = Number(prevRank);
  const nextNum = Number(nextRank);
  if (!Number.isNaN(prevNum) && !Number.isNaN(nextNum)) {
    const mid = (prevNum + nextNum) / 2;
    if (mid !== prevNum && mid !== nextNum) {
      return String(mid);
    }
  }

  // Fractional / fallback string midpoint
  return `${prevRank}.5`;
}

/**
 * Rebalances sibling ranks in a collection to clean, evenly spaced values.
 * Returns the list of updated sibling ranks.
 */
export function rebalanceRanks<T extends { id: string }>(
  items: T[],
  step = 10000
): Array<{ id: string; rank: string }> {
  return items.map((item, index) => ({
    id: item.id,
    rank: String((index + 1) * step),
  }));
}

/**
 * Detects whether moving folderId to targetParentId would produce a cycle.
 */
export function detectCycle(
  folderId: string,
  targetParentId: string | null,
  folderMap: Map<string, { parentId: string | null }>
): boolean {
  if (targetParentId === null) {
    return false;
  }
  if (targetParentId === folderId) {
    return true;
  }

  let curr: string | null = targetParentId;
  const visited = new Set<string>();

  while (curr !== null) {
    if (curr === folderId) {
      return true; // Cycle detected: target parent is inside folder's subtree
    }
    if (visited.has(curr)) {
      return true; // Already malformed cycle in existing data
    }
    visited.add(curr);

    const parent = folderMap.get(curr);
    curr = parent ? parent.parentId : null;
  }

  return false;
}

/**
 * Calculates the maximum depth of a folder's subtree (including the folder itself as depth 1).
 */
export function calculateSubtreeDepth(
  folderId: string,
  childrenMap: Map<string, string[]>
): number {
  const children = childrenMap.get(folderId) || [];
  if (children.length === 0) {
    return 1;
  }

  let maxChildDepth = 0;
  for (const childId of children) {
    const depth = calculateSubtreeDepth(childId, childrenMap);
    if (depth > maxChildDepth) {
      maxChildDepth = depth;
    }
  }

  return 1 + maxChildDepth;
}

/**
 * Calculates the depth of a folder from the workspace root (root folder is depth 1).
 */
export function calculateFolderDepth(
  folderId: string | null,
  folderMap: Map<string, { parentId: string | null }>
): number {
  if (folderId === null) {
    return 0; // Root container has depth 0
  }

  let depth = 0;
  let curr: string | null = folderId;
  const visited = new Set<string>();

  while (curr !== null) {
    depth++;
    if (visited.has(curr)) {
      throw new Error(`CYCLE_DETECTED: Cycle found in folder map at ${curr}`);
    }
    visited.add(curr);

    const folder = folderMap.get(curr);
    curr = folder ? folder.parentId : null;
  }

  return depth;
}
