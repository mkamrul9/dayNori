import { describe, expect, it } from 'vitest';
import {
  parseWorkspaceId,
  isValidUuid,
  validateMinorUnitAmount,
  isValidDateOnly,
  parseDateOnly,
  type NoteTextInline,
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

    it('preserves literal programming examples, comparison operators, and HTML examples while stripping null bytes', async () => {
      const { validateNoteDocument, extractPlainText, sanitizeInertString } =
        await import('./notes.js');

      // Verify sanitizeInertString keeps angle brackets and comparison operators
      expect(sanitizeInertString('List<T> items = new List<T>();')).toBe(
        'List<T> items = new List<T>();'
      );
      expect(sanitizeInertString('if (1 < 2 && 3 > 2)')).toBe('if (1 < 2 && 3 > 2)');
      expect(sanitizeInertString('Test\0NullByte')).toBe('TestNullByte');

      const codeDoc = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'List<T> items = new List<T>(); function test<T>() { return "<script>alert(1)</script>\0"; }',
              },
            ],
          },
        ],
      };

      const validated = validateNoteDocument(codeDoc);
      const plain = extractPlainText(validated);
      // Literal angle brackets and code syntax are preserved; null byte is removed
      expect(plain).toBe(
        'List<T> items = new List<T>(); function test<T>() { return "<script>alert(1)</script>"; }'
      );
      expect(plain).not.toContain('\0');
      expect(plain).toContain('List<T>');
      expect(plain).toContain('<script>alert(1)</script>');
    });

    it('rejects unsupported blocks, invalid heading levels, and invalid marks explicitly', async () => {
      const { validateNoteDocument } = await import('./notes.js');

      expect(() =>
        validateNoteDocument({
          version: 1,
          type: 'doc',
          content: [{ type: 'unsupported_table', rows: [] }],
        })
      ).toThrow(/NOTE_BLOCK_UNSUPPORTED/);

      expect(() =>
        validateNoteDocument({
          version: 1,
          type: 'doc',
          content: [{ type: 'heading', level: 5, content: [] }],
        })
      ).toThrow(/NOTE_HEADING_LEVEL_INVALID/);

      expect(() =>
        validateNoteDocument({
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Hello', marks: ['underline'] }],
            },
          ],
        })
      ).toThrow(/NOTE_MARK_UNSUPPORTED/);
    });

    it('preserves blank lines and honest plain text conversion without auto-mutating text', async () => {
      const { createNoteDocumentFromPlainText, extractPlainText } = await import('./notes.js');

      const multilineText = 'First Paragraph\n\nSecond Paragraph with - hyphen item\n\n';
      const doc = createNoteDocumentFromPlainText(multilineText);
      expect(doc.content).toHaveLength(3); // 2 content paras + 1 trailing empty para
      expect(doc.content[1]!.type).toBe('paragraph'); // NOT converted to a bullet list!

      const extracted = extractPlainText(doc);
      expect(extracted).toContain('First Paragraph');
      expect(extracted).toContain('Second Paragraph with - hyphen item');
    });

    it('recovers unsupported or raw documents gracefully without data loss', async () => {
      const { createRecoverableNoteDocument } = await import('./notes.js');

      const unsupportedRaw = {
        version: 99,
        type: 'future_note',
        plainText: 'Preserved user notes content from future schema',
      };

      const recovery = createRecoverableNoteDocument(unsupportedRaw);
      expect(recovery.doc.version).toBe(1);
      expect(recovery.doc.content[0]!.type).toBe('paragraph');
      expect(recovery.rawUnsupported).toBe(unsupportedRaw);
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

    it('preserves multiple inline runs, marks, and hard breaks during text editing', async () => {
      const {
        extractInlineText,
        splitInlinesAtOffset,
        applyMarkToInlines,
        replaceTextInRangeInlines,
        insertHardBreakInlines,
      } = await import('./notes.js');

      const inlines = [
        { type: 'text' as const, text: 'Hello ' },
        { type: 'text' as const, text: 'bold world', marks: ['bold' as const] },
        { type: 'hard_break' as const },
        { type: 'text' as const, text: 'Bangla বাংলা' },
      ];

      expect(extractInlineText(inlines)).toBe('Hello bold world\nBangla বাংলা');

      // 1. Split at offset 8 (inside "bold world" -> "bo" and "ld world")
      const [left, right] = splitInlinesAtOffset(inlines, 8);
      expect(extractInlineText(left)).toBe('Hello bo');
      expect(extractInlineText(right)).toBe('ld world\nBangla বাংলা');
      expect(left[1]).toEqual({ type: 'text', text: 'bo', marks: ['bold'] });
      expect(right[0]).toEqual({ type: 'text', text: 'ld world', marks: ['bold'] });

      // 2. Type in the middle (insert "wonderful " between "bold " and "world")
      // Plain text: "Hello bold world\nBangla বাংলা"
      // "Hello bold " length = 11.
      const edited = replaceTextInRangeInlines(inlines, 11, 11, 'wonderful ');
      expect(extractInlineText(edited)).toBe('Hello bold wonderful world\nBangla বাংলা');
      // Untouched content before and after is preserved
      expect(edited[0]).toEqual({ type: 'text', text: 'Hello ' });
      expect(edited[edited.length - 1]).toEqual({ type: 'text', text: 'Bangla বাংলা' });
      expect(edited.some((n) => n.type === 'hard_break')).toBe(true);

      // 3. Apply mark to selection without destroying surrounding text
      // Select "Bangla" (offset: "Hello bold world\n" = 17 to 23)
      const boldBangla = applyMarkToInlines(inlines, 17, 23, 'bold');
      expect(extractInlineText(boldBangla)).toBe('Hello bold world\nBangla বাংলা');
      const banglaNode = boldBangla.find(
        (n): n is NoteTextInline => n.type === 'text' && n.text.includes('Bangla')
      );
      expect(banglaNode?.marks).toContain('bold');

      // 4. Insert hard break at offset 6
      const broken = insertHardBreakInlines(inlines, 6);
      expect(extractInlineText(broken)).toBe('Hello \nbold world\nBangla বাংলা');
    });
  });
});
