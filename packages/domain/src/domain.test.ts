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
        { id: 'a', rank: '00010000' },
        { id: 'b', rank: '00020000' },
        { id: 'c', rank: '00030000' },
      ]);
    });
  });

  describe('Typed Notes Domain Rules & Invariants', () => {
    it('resolves note titles with honest "Untitled" fallback and length limits', async () => {
      const { resolveNoteTitle } = await import('./notes.js');
      expect(resolveNoteTitle('')).toBe('Untitled');
      expect(resolveNoteTitle('   ')).toBe('Untitled');
      expect(resolveNoteTitle(null)).toBe('Untitled');
      expect(resolveNoteTitle(undefined)).toBe('Untitled');
      expect(resolveNoteTitle('Meeting Notes')).toBe('Meeting Notes');
      expect(resolveNoteTitle('  বাংলা নোট  ')).toBe('বাংলা নোট');
      // Truncates strings exceeding 255 chars
      const longTitle = 'A'.repeat(300);
      expect(resolveNoteTitle(longTitle).length).toBe(255);
    });

    it('creates note document AST from plain text and preserves Unicode / Bangla', async () => {
      const {
        createNoteDocumentFromPlainText,
        extractPlainText,
        calculateWordCount,
        calculateCharCount,
      } = await import('./notes.js');

      const plain = `# বাংলা টাইপড নোট\n\nএটি একটি পরীক্ষার প্যারাগ্রাফ।\n\n- প্রথম কাজ\n- দ্বিতীয় কাজ\n\n[ ] অসম্পূর্ণ চেকলিস্ট\n[x] সম্পন্ন চেকলিস্ট`;
      const doc = createNoteDocumentFromPlainText(plain);

      expect(doc.version).toBe(1);
      expect(doc.type).toBe('doc');
      expect(doc.content.length).toBe(4); // heading, paragraph, bullet_list, checklist

      // Verify AST extraction round-trip
      const extracted = extractPlainText(doc);
      expect(extracted).toContain('# বাংলা টাইপড নোট');
      expect(extracted).toContain('এটি একটি পরীক্ষার প্যারাগ্রাফ।');
      expect(extracted).toContain('- প্রথম কাজ');
      expect(extracted).toContain('[x] সম্পন্ন চেকলিস্ট');

      // Verify word count & character count
      const wordCount = calculateWordCount(extracted);
      const charCount = calculateCharCount(extracted);
      expect(wordCount).toBeGreaterThan(10);
      expect(charCount).toBe(Array.from(extracted).length);
    });

    it('sanitizes inert strings without executing or interpreting markup', async () => {
      const { validateNoteDocument, extractPlainText } = await import('./notes.js');

      const maliciousDoc = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '<script>alert("pwned")</script>\0NullByteTest',
              },
            ],
          },
        ],
      };

      const validated = validateNoteDocument(maliciousDoc);
      // Null byte and executable markup are stripped to guarantee inert text
      const plain = extractPlainText(validated);
      expect(plain).toBe('NullByteTest');
      expect(plain).not.toContain('\0');
      expect(plain).not.toContain('<script>');
    });

    it('rejects oversized documents exceeding 512KB payload limit', async () => {
      const { validateNoteDocument } = await import('./notes.js');

      const hugeText = 'X'.repeat(600 * 1024);
      const hugeDoc = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: hugeText }],
          },
        ],
      };

      expect(() => validateNoteDocument(hugeDoc)).toThrow(/NOTE_PAYLOAD_TOO_LARGE/);
    });
  });
});
