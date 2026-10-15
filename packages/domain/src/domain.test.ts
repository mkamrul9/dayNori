import { describe, expect, it } from 'vitest';
import {
  parseWorkspaceId,
  isValidUuid,
  validateMinorUnitAmount,
  isValidDateOnly,
  parseDateOnly,
} from './index.js';

describe('Domain Rules and Invariants', () => {
  it('validates UUID branded identifiers', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    expect(isValidUuid(validUuid)).toBe(true);
    const workspaceId = parseWorkspaceId(validUuid);
    expect(workspaceId).toBe(validUuid);

    expect(() => parseWorkspaceId('invalid-uuid')).toThrowError(/Invalid WorkspaceId/);
  });

  it('validates integer minor unit amounts', () => {
    expect(() => validateMinorUnitAmount(1050)).not.toThrow();
    expect(() => validateMinorUnitAmount(10.5)).toThrowError(/must be a safe integer/);
    expect(() => validateMinorUnitAmount(NaN)).toThrowError(/must be a safe integer/);
  });

  it('validates calendar date-only strings', () => {
    expect(isValidDateOnly('2026-10-13')).toBe(true);
    expect(isValidDateOnly('2026-02-29')).toBe(false); // 2026 is not a leap year
    expect(isValidDateOnly('invalid-date')).toBe(false);
    expect(parseDateOnly('2026-10-13')).toBe('2026-10-13');
  });

  describe('Organization Rules & Invariants', () => {
    it('validates folder depth bounds (1 to 5)', async () => {
      const { validateFolderDepth } = await import('./organization.js');
      expect(() => validateFolderDepth(1)).not.toThrow();
      expect(() => validateFolderDepth(5)).not.toThrow();
      expect(() => validateFolderDepth(0)).toThrow(/DEPTH_LIMIT_EXCEEDED/);
      expect(() => validateFolderDepth(6)).toThrow(/DEPTH_LIMIT_EXCEEDED/);
    });

    it('detects cycles in folder hierarchy', async () => {
      const { detectCycle } = await import('./organization.js');
      const folderMap = new Map<string, { parentId: string | null }>([
        ['folder-A', { parentId: null }],
        ['folder-B', { parentId: 'folder-A' }],
        ['folder-C', { parentId: 'folder-B' }],
      ]);

      // Self-parent is a cycle
      expect(detectCycle('folder-A', 'folder-A', folderMap)).toBe(true);

      // Moving A under C creates a cycle (C -> B -> A)
      expect(detectCycle('folder-A', 'folder-C', folderMap)).toBe(true);

      // Moving C to root or under A does not create a cycle
      expect(detectCycle('folder-C', null, folderMap)).toBe(false);
      expect(detectCycle('folder-C', 'folder-A', folderMap)).toBe(false);
    });

    it('calculates subtree depth and detects deep hierarchy violations', async () => {
      const { calculateSubtreeDepth, calculateFolderDepth } = await import('./organization.js');
      const folderMap = new Map<string, { parentId: string | null }>([
        ['folder-1', { parentId: null }],
        ['folder-2', { parentId: 'folder-1' }],
        ['folder-3', { parentId: 'folder-2' }],
      ]);
      const childrenMap = new Map<string, string[]>([
        ['folder-1', ['folder-2']],
        ['folder-2', ['folder-3']],
        ['folder-3', []],
      ]);

      expect(calculateFolderDepth('folder-1', folderMap)).toBe(1);
      expect(calculateFolderDepth('folder-3', folderMap)).toBe(3);
      expect(calculateSubtreeDepth('folder-1', childrenMap)).toBe(3);
      expect(calculateSubtreeDepth('folder-3', childrenMap)).toBe(1);
    });

    it('sorts stably with ID tie-breakers', async () => {
      const { compareRanks } = await import('./organization.js');
      expect(compareRanks('100', 'uuid-a', '200', 'uuid-b')).toBeLessThan(0);
      expect(compareRanks('200', 'uuid-a', '100', 'uuid-b')).toBeGreaterThan(0);
      // Same rank: tie-break on id
      expect(compareRanks('100', 'uuid-a', '100', 'uuid-b')).toBeLessThan(0);
      expect(compareRanks('100', 'uuid-b', '100', 'uuid-a')).toBeGreaterThan(0);
    });

    it('rebalances ranks into sparse intervals', async () => {
      const { rebalanceRanks } = await import('./organization.js');
      const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const rebalanced = rebalanceRanks(items, 10000);
      expect(rebalanced).toEqual([
        { id: 'a', rank: '10000' },
        { id: 'b', rank: '20000' },
        { id: 'c', rank: '30000' },
      ]);
    });
  });
});
