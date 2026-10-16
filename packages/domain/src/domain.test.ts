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

  describe('Task Domain & Deadline Semantics', () => {
    it('validates task titles enforcing non-empty and length limits with Unicode & Bangla support', async () => {
      const { validateTaskTitle } = await import('./tasks.js');

      expect(validateTaskTitle('  Learn TypeScript  ')).toBe('Learn TypeScript');
      expect(validateTaskTitle('বাংলা কাজের শিরোনাম')).toBe('বাংলা কাজের শিরোনাম');
      expect(validateTaskTitle('🎯 Project milestone 1')).toBe('🎯 Project milestone 1');

      expect(() => validateTaskTitle('')).toThrow(/TASK_TITLE_REQUIRED/);
      expect(() => validateTaskTitle('   ')).toThrow(/TASK_TITLE_REQUIRED/);

      const tooLong = 'A'.repeat(256);
      expect(() => validateTaskTitle(tooLong)).toThrow(/TASK_TITLE_TOO_LONG/);
    });

    it('validates calendar dates, leap days, and IANA timezones accurately', async () => {
      const { isValidCalendarDateString, isValidIanaTimezone, isLeapYear } =
        await import('./tasks.js');

      // Leap years
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear(2000)).toBe(true);
      expect(isLeapYear(2025)).toBe(false);
      expect(isLeapYear(1900)).toBe(false);

      // Leap day boundary
      expect(isValidCalendarDateString('2024-02-29')).toBe(true);
      expect(isValidCalendarDateString('2025-02-29')).toBe(false);
      expect(isValidCalendarDateString('2026-02-30')).toBe(false);
      expect(isValidCalendarDateString('2026-04-31')).toBe(false); // April has 30 days
      expect(isValidCalendarDateString('2026-12-31')).toBe(true);
      expect(isValidCalendarDateString('not-a-date')).toBe(false);

      // IANA timezones
      expect(isValidIanaTimezone('Asia/Dhaka')).toBe(true);
      expect(isValidIanaTimezone('America/New_York')).toBe(true);
      expect(isValidIanaTimezone('UTC')).toBe(true);
      expect(isValidIanaTimezone('Mars/Phobos')).toBe(false);
      expect(isValidIanaTimezone('')).toBe(false);
    });

    it('determines exact overdue boundaries for date-only and timed deadlines across timezones', async () => {
      const { isTaskOverdue, isTaskDueToday } = await import('./tasks.js');

      // Reference instant: 2026-10-16 12:00:00 UTC
      // In Asia/Dhaka (UTC+6): 2026-10-16 18:00:00 (Today is 2026-10-16)
      // In America/New_York (UTC-4): 2026-10-16 08:00:00 (Today is 2026-10-16)
      // In Pacific/Auckland (UTC+13): 2026-10-17 01:00:00 (Today is 2026-10-17)
      const now = new Date('2026-10-16T12:00:00.000Z');

      const taskDateOnly = {
        status: 'todo' as const,
        deadline: { type: 'date' as const, date: '2026-10-16' },
      };

      // In Asia/Dhaka and America/New_York, 2026-10-16 is Today (not overdue yet!)
      expect(isTaskOverdue(taskDateOnly, now, 'Asia/Dhaka')).toBe(false);
      expect(isTaskDueToday(taskDateOnly, now, 'Asia/Dhaka')).toBe(true);
      expect(isTaskOverdue(taskDateOnly, now, 'America/New_York')).toBe(false);

      // In Pacific/Auckland, it is already 2026-10-17, so 2026-10-16 is Overdue!
      expect(isTaskOverdue(taskDateOnly, now, 'Pacific/Auckland')).toBe(true);
      expect(isTaskDueToday(taskDateOnly, now, 'Pacific/Auckland')).toBe(false);

      // Timed deadline: due at 2026-10-16 11:00:00 UTC
      const taskTimedPast = {
        status: 'todo' as const,
        deadline: {
          type: 'timed' as const,
          timestamp: '2026-10-16T11:00:00.000Z',
          timezone: 'Asia/Dhaka',
        },
      };
      // At 12:00:00 UTC, timed task due at 11:00:00 UTC is overdue everywhere
      expect(isTaskOverdue(taskTimedPast, now, 'Asia/Dhaka')).toBe(true);
      expect(isTaskOverdue(taskTimedPast, now, 'America/New_York')).toBe(true);

      // Timed deadline: due at 2026-10-16 15:00:00 UTC (future)
      const taskTimedFuture = {
        status: 'todo' as const,
        deadline: {
          type: 'timed' as const,
          timestamp: '2026-10-16T15:00:00.000Z',
          timezone: 'Asia/Dhaka',
        },
      };
      expect(isTaskOverdue(taskTimedFuture, now, 'Asia/Dhaka')).toBe(false);

      // Completed or cancelled tasks are NEVER overdue
      const completedTask = {
        status: 'completed' as const,
        deadline: {
          type: 'timed' as const,
          timestamp: '2026-10-16T11:00:00.000Z',
          timezone: 'Asia/Dhaka',
        },
      };
      expect(isTaskOverdue(completedTask, now, 'Asia/Dhaka')).toBe(false);

      // Clearing deadline removes task from overdue
      const clearedDeadlineTask = {
        status: 'todo' as const,
        deadline: { type: 'none' as const },
      };
      expect(isTaskOverdue(clearedDeadlineTask, now, 'Asia/Dhaka')).toBe(false);
    });

    it('manages task completion idempotency and retains reopening history', async () => {
      const { completeTask, reopenTask } = await import('./tasks.js');

      const initialTask = {
        id: 'task-1',
        workspaceId: 'ws-1',
        folderId: null,
        title: 'Complete Phase 18',
        priority: 'high' as const,
        status: 'todo' as const,
        deadline: { type: 'none' as const },
        completedAt: null,
        reopenedAt: null,
        completionHistory: [],
        parentId: null,
        subtaskOrder: 0,
        tags: [],
        rank: '00001000',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard' as const,
        revision: 1,
        createdAt: '2026-10-16T10:00:00.000Z',
        updatedAt: '2026-10-16T10:00:00.000Z',
        deletedAt: null,
      };

      // 1. First completion
      const completed = completeTask(initialTask, '2026-10-16T11:00:00.000Z');
      expect(completed.changed).toBe(true);
      expect(completed.task.status).toBe('completed');
      expect(completed.task.completedAt).toBe('2026-10-16T11:00:00.000Z');
      expect(completed.task.completionHistory).toHaveLength(1);

      // 2. Duplicate completion retry: must be a no-op and preserve original completedAt
      const duplicate = completeTask(completed.task, '2026-10-16T12:00:00.000Z');
      expect(duplicate.changed).toBe(false);
      expect(duplicate.task.completedAt).toBe('2026-10-16T11:00:00.000Z');
      expect(duplicate.task.completionHistory).toHaveLength(1);

      // 3. Reopen task
      const reopened = reopenTask(completed.task, '2026-10-16T13:00:00.000Z');
      expect(reopened.changed).toBe(true);
      expect(reopened.task.status).toBe('todo');
      expect(reopened.task.completedAt).toBeNull();
      expect(reopened.task.reopenedAt).toBe('2026-10-16T13:00:00.000Z');
      expect(reopened.task.completionHistory[0]?.reopenedAt).toBe('2026-10-16T13:00:00.000Z');
    });

    it('enforces subtask hierarchy invariants, rejects self-parenting and cycles, and bounds depth', async () => {
      const { validateSubtaskHierarchy, MAX_SUBTASK_DEPTH } = await import('./tasks.js');

      expect(MAX_SUBTASK_DEPTH).toBe(3);

      const taskGraph: Record<string, string | null> = {
        'root-1': null,
        'sub-1': 'root-1',
        'sub-2': 'sub-1',
        'sub-3': 'sub-2', // depth 4 (exceeds max 3)
      };
      const lookup = (id: string) => taskGraph[id];

      // Self-parenting
      const selfParent = validateSubtaskHierarchy('task-x', 'task-x', lookup);
      expect(selfParent.isValid).toBe(false);
      expect(selfParent.error).toContain('TASK_SELF_PARENTING');

      // Valid depth 2 (child of root)
      const validChild = validateSubtaskHierarchy('task-new', 'root-1', lookup);
      expect(validChild.isValid).toBe(true);
      expect(validChild.depth).toBe(2);

      // Valid depth 3 (grandchild of root)
      const validGrandchild = validateSubtaskHierarchy('task-new', 'sub-1', lookup);
      expect(validGrandchild.isValid).toBe(true);
      expect(validGrandchild.depth).toBe(3);

      // Depth limit exceeded (depth 4)
      const tooDeep = validateSubtaskHierarchy('task-new', 'sub-2', lookup);
      expect(tooDeep.isValid).toBe(false);
      expect(tooDeep.error).toContain('TASK_MAX_SUBTASK_DEPTH_EXCEEDED');

      // Cyclic reference: root-1 -> sub-1 -> sub-2 -> root-1
      const cyclicGraph: Record<string, string | null> = {
        'task-a': 'task-c',
        'task-b': 'task-a',
        'task-c': 'task-b',
      };
      const cycle = validateSubtaskHierarchy('task-a', 'task-c', (id) => cyclicGraph[id]);
      expect(cycle.isValid).toBe(false);
      expect(cycle.error).toContain('TASK_SUBTASK_CYCLE');
    });

    it('orders upcoming tasks deterministically by due date, priority, createdAt, and ID', async () => {
      const { compareTasksUpcoming } = await import('./tasks.js');

      const tasks = [
        {
          id: 'task-undated',
          priority: 'urgent' as const,
          deadline: { type: 'none' as const },
          createdAt: '2026-10-16T08:00:00.000Z',
        },
        {
          id: 'task-due-tomorrow-high',
          priority: 'high' as const,
          deadline: { type: 'date' as const, date: '2026-10-17' },
          createdAt: '2026-10-16T08:00:00.000Z',
        },
        {
          id: 'task-due-today-normal',
          priority: 'normal' as const,
          deadline: { type: 'date' as const, date: '2026-10-16' },
          createdAt: '2026-10-16T09:00:00.000Z',
        },
        {
          id: 'task-due-today-urgent',
          priority: 'urgent' as const,
          deadline: { type: 'date' as const, date: '2026-10-16' },
          createdAt: '2026-10-16T09:00:00.000Z',
        },
      ];

      const sorted = [...tasks].sort((a, b) => compareTasksUpcoming(a, b, 'UTC'));

      // Due today urgent should come first, then due today normal, then due tomorrow, then undated
      expect(sorted[0]?.id).toBe('task-due-today-urgent');
      expect(sorted[1]?.id).toBe('task-due-today-normal');
      expect(sorted[2]?.id).toBe('task-due-tomorrow-high');
      expect(sorted[3]?.id).toBe('task-undated');
    });

    it('reconciles task/todo aliases into canonical task kind', async () => {
      const { reconcileTaskKind } = await import('./tasks.js');

      expect(reconcileTaskKind('task')).toBe('task');
      expect(reconcileTaskKind('todo')).toBe('task');
      expect(() => reconcileTaskKind('note')).toThrow(/INVALID_ITEM_KIND/);
    });

    it('rejects invalid or malformed timezones explicitly across domain functions', async () => {
      const { isTaskOverdue, isTaskDueToday, compareTasksUpcoming, getTaskDeadlineSortKey } =
        await import('./tasks.js');

      const task = {
        id: 't-1',
        priority: 'normal' as const,
        status: 'todo' as const,
        deadline: { type: 'date' as const, date: '2026-10-16' },
        createdAt: '2026-10-16T08:00:00.000Z',
      };

      expect(() => isTaskOverdue(task, new Date(), 'Invalid/Timezone_XYZ')).toThrow(
        /INVALID_TIMEZONE/
      );
      expect(() => isTaskDueToday(task, new Date(), 'Invalid/Timezone_XYZ')).toThrow(
        /INVALID_TIMEZONE/
      );
      expect(() => compareTasksUpcoming(task, task, 'Invalid/Timezone_XYZ')).toThrow(
        /INVALID_TIMEZONE/
      );
      expect(() => getTaskDeadlineSortKey(task.deadline, 'Invalid/Timezone_XYZ')).toThrow(
        /INVALID_TIMEZONE/
      );
    });

    it('orders mixed date-only and timed deadlines accurately according to viewing timezone', async () => {
      const { compareTasksUpcoming, getTaskDeadlineSortKey } = await import('./tasks.js');

      // Date-only deadline on 2026-10-16
      const dateOnlyTask = {
        id: 'date-only',
        priority: 'normal' as const,
        deadline: { type: 'date' as const, date: '2026-10-16' },
        createdAt: '2026-10-16T00:00:00.000Z',
      };

      // Timed task on 2026-10-16 at 20:00:00+06:00 (14:00 UTC)
      const timedEarlierDhaka = {
        id: 'timed-earlier',
        priority: 'normal' as const,
        deadline: {
          type: 'timed' as const,
          timestamp: '2026-10-16T14:00:00.000Z',
          timezone: 'Asia/Dhaka',
        },
        createdAt: '2026-10-16T00:00:00.000Z',
      };

      // In Asia/Dhaka (+06:00), end of day 2026-10-16 is 23:59:59.999 Dhaka time = 17:59:59.999Z.
      // Therefore, 14:00Z (8:00 PM Dhaka) is BEFORE 17:59:59.999Z (11:59 PM Dhaka).
      const dhakaKeyDateOnly = getTaskDeadlineSortKey(dateOnlyTask.deadline, 'Asia/Dhaka');
      expect(dhakaKeyDateOnly).toBe('2026-10-16T17:59:59.999Z');

      const dhakaComp = compareTasksUpcoming(timedEarlierDhaka, dateOnlyTask, 'Asia/Dhaka');
      expect(dhakaComp).toBeLessThan(0); // timedEarlier sorts BEFORE dateOnly

      // In America/New_York (-04:00 EDT), end of day 2026-10-16 is 23:59:59.999 NY time = 2026-10-17T03:59:59.999Z.
      const nyKeyDateOnly = getTaskDeadlineSortKey(dateOnlyTask.deadline, 'America/New_York');
      expect(nyKeyDateOnly).toBe('2026-10-17T03:59:59.999Z');
    });
  });
});
