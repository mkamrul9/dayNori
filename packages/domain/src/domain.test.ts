import { describe, expect, it } from 'vitest';
import {
  parseWorkspaceId,
  isValidUuid,
  validateMinorUnitAmount,
  isValidDateOnly,
  parseDateOnly,
  type NoteTextInline,
  validateRoutineTitle,
  getIsoWeekday,
  validateWeekdays,
  isRoutineScheduledOnDate,
  generateOccurrencesForDateRange,
  completeOccurrence,
  skipOccurrence,
  reopenOccurrence,
  reconcileOccurrencesOnScheduleChange,
  explainWhyDueToday,
  calculateGentleProgress,
  explainScheduleChangeImpact,
  type RoutineTemplateRule,
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

    it('formats deadline explanations with explicit text and dates, not color alone', async () => {
      const { formatTaskDeadlineExplanation } = await import('./tasks.js');

      const refDate = new Date('2026-10-16T12:00:00.000Z');

      // 1. None
      const expNone = formatTaskDeadlineExplanation({ type: 'none' }, 'UTC', refDate);
      expect(expNone.isOverdue).toBe(false);
      expect(expNone.label).toBe('No deadline');

      // 2. Overdue by 2 days (Oct 14)
      const expOverdue = formatTaskDeadlineExplanation(
        { type: 'date', date: '2026-10-14' },
        'UTC',
        refDate
      );
      expect(expOverdue.isOverdue).toBe(true);
      expect(expOverdue.overdueText).toBe('Overdue by 2 days (Due 2026-10-14)');

      // 3. Due today
      const expToday = formatTaskDeadlineExplanation(
        { type: 'date', date: '2026-10-16' },
        'UTC',
        refDate
      );
      expect(expToday.isOverdue).toBe(false);
      expect(expToday.label).toContain('Today');

      // 4. Due tomorrow
      const expTomorrow = formatTaskDeadlineExplanation(
        { type: 'date', date: '2026-10-17' },
        'UTC',
        refDate
      );
      expect(expTomorrow.isOverdue).toBe(false);
      expect(expTomorrow.label).toContain('Tomorrow');

      // 5. Timed with timezone difference disclosure
      const expTimed = formatTaskDeadlineExplanation(
        {
          type: 'timed',
          timestamp: '2026-10-16T16:00:00.000Z',
          timezone: 'America/New_York',
        },
        'Asia/Dhaka',
        refDate
      );
      expect(expTimed.timezoneNote).toBe('Scheduled in America/New_York (viewing in Asia/Dhaka)');
    });

    it('detects nonexistent and ambiguous local times during daylight saving transitions', async () => {
      const { checkLocalTimeDisambiguation } = await import('./tasks.js');

      // In America/New_York, 2026-03-08 at 02:30 is nonexistent (spring forward 02:00 -> 03:00)
      const springForward = checkLocalTimeDisambiguation('2026-03-08', '02:30', 'America/New_York');
      expect(springForward.type).toBe('nonexistent');
      if (springForward.type === 'nonexistent') {
        expect(springForward.explanation).toContain('does not exist');
      }

      // In America/New_York, 2026-11-01 at 01:30 is ambiguous (fall back 02:00 -> 01:00)
      const fallBack = checkLocalTimeDisambiguation('2026-11-01', '01:30', 'America/New_York');
      expect(fallBack.type).toBe('ambiguous');
      if (fallBack.type === 'ambiguous') {
        expect(fallBack.explanation).toContain('occurs twice');
      }

      // Normal time (e.g. 10:00 AM on 2026-10-16 in UTC or Asia/Dhaka)
      const normalTime = checkLocalTimeDisambiguation('2026-10-16', '10:00', 'Asia/Dhaka');
      expect(normalTime.type).toBe('exact');
    });

    it('accurately resolves times in UTC+14, negative offsets, and half/quarter-hour zones', async () => {
      const { checkLocalTimeDisambiguation, addCalendarDays, getCalendarDateTimeParts } =
        await import('./tasks.js');

      // 1. Gregorian calendar day arithmetic
      expect(addCalendarDays('2026-02-28', 1)).toBe('2026-03-01'); // non-leap year
      expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29'); // leap year
      expect(addCalendarDays('2024-02-29', 1)).toBe('2024-03-01');
      expect(addCalendarDays('2026-01-01', -1)).toBe('2025-12-31');

      // 2. Synchronized date and time derivation from instant
      const testInstant = new Date('2026-10-16T18:30:00.000Z');
      const partsTokyo = getCalendarDateTimeParts(testInstant, 'Asia/Tokyo'); // UTC+9 -> Oct 17, 03:30
      expect(partsTokyo.date).toBe('2026-10-17');
      expect(partsTokyo.time).toBe('03:30');

      const partsNY = getCalendarDateTimeParts(testInstant, 'America/New_York'); // UTC-4 (EDT) -> Oct 16, 14:30
      expect(partsNY.date).toBe('2026-10-16');
      expect(partsNY.time).toBe('14:30');

      // 3. UTC+14 (Pacific/Kiritimati)
      // 08:30 in Kiritimati on 2026-10-16 corresponds to 2026-10-15 18:30:00.000Z
      const kiritimati = checkLocalTimeDisambiguation('2026-10-16', '08:30', 'Pacific/Kiritimati');
      expect(kiritimati.type).toBe('exact');
      if (kiritimati.type === 'exact') {
        expect(kiritimati.utcTimestamp).toBe('2026-10-15T18:30:00.000Z');
      }

      // Midnight in Kiritimati
      const kiritimatiMidnight = checkLocalTimeDisambiguation(
        '2026-10-16',
        '00:00',
        'Pacific/Kiritimati'
      );
      expect(kiritimatiMidnight.type).toBe('exact');
      if (kiritimatiMidnight.type === 'exact') {
        expect(kiritimatiMidnight.utcTimestamp).toBe('2026-10-15T10:00:00.000Z');
      }

      // 4. Negative offset (Pacific/Pago_Pago, UTC-11)
      // 23:30 in Pago Pago on 2026-10-16 corresponds to 2026-10-17 10:30:00.000Z
      const pagoPago = checkLocalTimeDisambiguation('2026-10-16', '23:30', 'Pacific/Pago_Pago');
      expect(pagoPago.type).toBe('exact');
      if (pagoPago.type === 'exact') {
        expect(pagoPago.utcTimestamp).toBe('2026-10-17T10:30:00.000Z');
      }

      // 5. Half-hour and quarter-hour zones (Asia/Kathmandu UTC+5:45, Asia/Kolkata UTC+5:30)
      const kathmandu = checkLocalTimeDisambiguation('2026-10-16', '12:00', 'Asia/Kathmandu');
      expect(kathmandu.type).toBe('exact');
      if (kathmandu.type === 'exact') {
        expect(kathmandu.utcTimestamp).toBe('2026-10-16T06:15:00.000Z');
      }

      const kolkata = checkLocalTimeDisambiguation('2026-10-16', '12:00', 'Asia/Kolkata');
      expect(kolkata.type).toBe('exact');
      if (kolkata.type === 'exact') {
        expect(kolkata.utcTimestamp).toBe('2026-10-16T06:30:00.000Z');
      }

      // 6. Validation of invalid clock values
      expect(() => checkLocalTimeDisambiguation('2026-10-16', '24:00', 'UTC')).toThrow(
        'INVALID_TIME_STRING'
      );
      expect(() => checkLocalTimeDisambiguation('2026-10-16', '12:60', 'UTC')).toThrow(
        'INVALID_TIME_STRING'
      );
      expect(() => checkLocalTimeDisambiguation('2026-10-16', '-1:30', 'UTC')).toThrow(
        'INVALID_TIME_STRING'
      );
      expect(() => checkLocalTimeDisambiguation('2026-10-16', 'invalid', 'UTC')).toThrow(
        'INVALID_TIME_STRING'
      );
    });
  });

  describe('Phase 20: Daily Routine Schedules and Occurrences', () => {
    it('validates routine titles with Unicode and Bangla script preservation', () => {
      expect(validateRoutineTitle('  Morning Exercise  ')).toBe('Morning Exercise');
      expect(validateRoutineTitle('  সকালের হাঁটা (Morning Walk) 🏃  ')).toBe(
        'সকালের হাঁটা (Morning Walk) 🏃'
      );
      expect(() => validateRoutineTitle('')).toThrow(RangeError);
      expect(() => validateRoutineTitle('   ')).toThrow(RangeError);
      expect(() => validateRoutineTitle('a'.repeat(256))).toThrow(RangeError);
    });

    it('calculates ISO weekdays accurately across leap years and months', () => {
      // 2024-02-29 was a Thursday (4)
      expect(getIsoWeekday('2024-02-29')).toBe(4);
      // 2026-10-12 was a Monday (1)
      expect(getIsoWeekday('2026-10-12')).toBe(1);
      // 2026-10-18 was a Sunday (7)
      expect(getIsoWeekday('2026-10-18')).toBe(7);
      // 2026-10-17 was a Saturday (6)
      expect(getIsoWeekday('2026-10-17')).toBe(6);
      // 2026-10-16 is a Friday (5)
      expect(getIsoWeekday('2026-10-16')).toBe(5);
    });

    it('validates selected weekdays array', () => {
      expect(validateWeekdays([5, 1, 3, 1])).toEqual([1, 3, 5]);
      expect(() => validateWeekdays([0])).toThrow(RangeError);
      expect(() => validateWeekdays([8])).toThrow(RangeError);
    });

    it('evaluates whether a routine is scheduled on a given calendar date', () => {
      const dailyRoutine: RoutineTemplateRule = {
        id: 'r-1',
        workspaceId: 'ws-1',
        folderId: null,
        title: 'Daily Meditation',
        details: null,
        frequency: 'daily',
        weekdays: [],
        timezone: 'Asia/Dhaka',
        scheduledTime: '07:00',
        activeFrom: '2026-10-01',
        activeTo: '2026-10-31',
        isPaused: false,
        isArchived: false,
        scheduleRevision: 1,
        effectiveDate: '2026-10-01',
      };

      // In window
      expect(isRoutineScheduledOnDate(dailyRoutine, '2026-10-15')).toBe(true);
      // Before activeFrom
      expect(isRoutineScheduledOnDate(dailyRoutine, '2026-09-30')).toBe(false);
      // After activeTo
      expect(isRoutineScheduledOnDate(dailyRoutine, '2026-11-01')).toBe(false);

      // Paused
      expect(isRoutineScheduledOnDate({ ...dailyRoutine, isPaused: true }, '2026-10-15')).toBe(
        false
      );
      // Archived
      expect(isRoutineScheduledOnDate({ ...dailyRoutine, isArchived: true }, '2026-10-15')).toBe(
        false
      );

      // Weekday routine: Monday (1), Wednesday (3), Friday (5)
      const mwfRoutine: RoutineTemplateRule = {
        ...dailyRoutine,
        frequency: 'weekdays',
        weekdays: [1, 3, 5],
      };
      // 2026-10-16 is Friday (5) -> true
      expect(isRoutineScheduledOnDate(mwfRoutine, '2026-10-16')).toBe(true);
      // 2026-10-17 is Saturday (6) -> false
      expect(isRoutineScheduledOnDate(mwfRoutine, '2026-10-17')).toBe(false);
      // 2026-10-18 is Sunday (7) -> false
      expect(isRoutineScheduledOnDate(mwfRoutine, '2026-10-18')).toBe(false);
      // 2026-10-19 is Monday (1) -> true
      expect(isRoutineScheduledOnDate(mwfRoutine, '2026-10-19')).toBe(true);
    });

    it('generates date-scoped occurrences idempotently without duplicates', () => {
      const mwfRoutine: RoutineTemplateRule = {
        id: 'r-mwf',
        workspaceId: 'ws-1',
        folderId: null,
        title: 'Gym Workout',
        details: 'Strength training',
        frequency: 'weekdays',
        weekdays: [1, 3, 5],
        timezone: 'Asia/Dhaka',
        scheduledTime: '06:30',
        activeFrom: '2026-10-12',
        activeTo: null,
        isPaused: false,
        isArchived: false,
        scheduleRevision: 1,
        effectiveDate: '2026-10-12',
      };

      // Generate for one week: Mon 2026-10-12 to Sun 2026-10-18
      const firstGen = generateOccurrencesForDateRange(mwfRoutine, '2026-10-12', '2026-10-18', []);
      expect(firstGen).toHaveLength(3);
      expect(firstGen.map((o) => o.scheduledDate)).toEqual([
        '2026-10-12',
        '2026-10-14',
        '2026-10-16',
      ]);
      expect(firstGen[0]!.status).toBe('pending');
      expect(firstGen[0]!.plannedInstant).toBe('2026-10-12T00:30:00.000Z'); // 06:30 Asia/Dhaka (UTC+6)

      // Repeated generation with existing occurrences returns empty array (idempotency!)
      const secondGen = generateOccurrencesForDateRange(
        mwfRoutine,
        '2026-10-12',
        '2026-10-18',
        firstGen
      );
      expect(secondGen).toHaveLength(0);

      // Expanding range to next week generates only new dates
      const expandedGen = generateOccurrencesForDateRange(
        mwfRoutine,
        '2026-10-12',
        '2026-10-25',
        firstGen
      );
      expect(expandedGen).toHaveLength(3);
      expect(expandedGen.map((o) => o.scheduledDate)).toEqual([
        '2026-10-19',
        '2026-10-21',
        '2026-10-23',
      ]);
    });

    it('enforces that completing today never completes tomorrow', () => {
      const routine: RoutineTemplateRule = {
        id: 'r-today-tomorrow',
        workspaceId: 'ws-1',
        folderId: null,
        title: 'Drink 2L Water',
        details: null,
        frequency: 'daily',
        weekdays: [],
        timezone: 'UTC',
        scheduledTime: null,
        activeFrom: '2026-10-16',
        activeTo: null,
        isPaused: false,
        isArchived: false,
        scheduleRevision: 1,
        effectiveDate: '2026-10-16',
      };

      const occurrences = generateOccurrencesForDateRange(routine, '2026-10-16', '2026-10-17', []);
      expect(occurrences).toHaveLength(2);
      const [todayOcc, tomorrowOcc] = occurrences;

      // Complete today
      const completedToday = completeOccurrence(todayOcc!, 'usr-1', '2026-10-16T12:00:00.000Z');
      expect(completedToday.status).toBe('done');
      expect(completedToday.completedAt).toBe('2026-10-16T12:00:00.000Z');
      expect(completedToday.history).toHaveLength(1);

      // Tomorrow remains strictly pending and untouched!
      expect(tomorrowOcc!.status).toBe('pending');
      expect(tomorrowOcc!.completedAt).toBeNull();
      expect(tomorrowOcc!.history).toHaveLength(0);

      // Skip tomorrow
      const skippedTomorrow = skipOccurrence(tomorrowOcc!, 'usr-1', '2026-10-17T09:00:00.000Z');
      expect(skippedTomorrow.status).toBe('skipped');
      expect(skippedTomorrow.completedAt).toBeNull();
      expect(skippedTomorrow.history).toHaveLength(1);

      // Reopening today resets status to pending without touching tomorrow
      const reopenedToday = reopenOccurrence(completedToday, 'usr-1', '2026-10-16T14:00:00.000Z');
      expect(reopenedToday.status).toBe('pending');
      expect(reopenedToday.completedAt).toBeNull();
      expect(reopenedToday.history).toHaveLength(2);
      expect(reopenedToday.history[1]!.previousStatus).toBe('done');
    });

    it('reconciles schedule edits while strictly preserving completed history', () => {
      const routine: RoutineTemplateRule = {
        id: 'r-edit',
        workspaceId: 'ws-1',
        folderId: null,
        title: 'Daily Reading',
        details: null,
        frequency: 'daily',
        weekdays: [],
        timezone: 'America/New_York',
        scheduledTime: '21:00',
        activeFrom: '2026-10-10',
        activeTo: null,
        isPaused: false,
        isArchived: false,
        scheduleRevision: 1,
        effectiveDate: '2026-10-10',
      };

      const occurrences = generateOccurrencesForDateRange(routine, '2026-10-10', '2026-10-18', []);
      // Mark Oct 10 done, Oct 11 skipped
      occurrences[0] = completeOccurrence(occurrences[0]!, 'usr-1', '2026-10-10T22:00:00.000Z');
      occurrences[1] = skipOccurrence(occurrences[1]!, 'usr-1', '2026-10-11T22:00:00.000Z');
      // Oct 12..18 remain pending

      // On Oct 14, user edits schedule: change from Daily to Weekdays Mon, Wed, Fri only, revision 2
      const updatedRule: RoutineTemplateRule = {
        ...routine,
        frequency: 'weekdays',
        weekdays: [1, 3, 5],
        scheduleRevision: 2,
        effectiveDate: '2026-10-14',
      };

      const { retained, cancelledOccurrenceIds } = reconcileOccurrencesOnScheduleChange(
        occurrences,
        updatedRule,
        '2026-10-14'
      );

      // Oct 10 (done) and Oct 11 (skipped) are historical: preserved!
      const oct10 = retained.find((o) => o.scheduledDate === '2026-10-10');
      expect(oct10?.status).toBe('done');
      expect(oct10?.scheduleRevision).toBe(1);

      const oct11 = retained.find((o) => o.scheduledDate === '2026-10-11');
      expect(oct11?.status).toBe('skipped');
      expect(oct11?.scheduleRevision).toBe(1);

      // Oct 12 and Oct 13 are prior to effectiveDate Oct 14: preserved with revision 1!
      const oct12 = retained.find((o) => o.scheduledDate === '2026-10-12');
      expect(oct12?.scheduleRevision).toBe(1);

      // Oct 15 (Thursday = 4) and Oct 17 (Saturday = 6) are no longer scheduled: cancelled!
      expect(cancelledOccurrenceIds).toContain(
        occurrences.find((o) => o.scheduledDate === '2026-10-15')?.id
      );
      expect(cancelledOccurrenceIds).toContain(
        occurrences.find((o) => o.scheduledDate === '2026-10-17')?.id
      );

      // Oct 14 (Wednesday = 3) and Oct 16 (Friday = 5) are still scheduled: updated to revision 2!
      const oct14 = retained.find((o) => o.scheduledDate === '2026-10-14');
      expect(oct14?.scheduleRevision).toBe(2);
      const oct16 = retained.find((o) => o.scheduledDate === '2026-10-16');
      expect(oct16?.scheduleRevision).toBe(2);
    });

    it('pins the scheduling timezone and is not altered by user travel', () => {
      // User creates routine in Dhaka (UTC+6) scheduled at 08:00
      const routine: RoutineTemplateRule = {
        id: 'r-dhaka',
        workspaceId: 'ws-1',
        folderId: null,
        title: 'Morning Standup Routine',
        details: null,
        frequency: 'daily',
        weekdays: [],
        timezone: 'Asia/Dhaka',
        scheduledTime: '08:00',
        activeFrom: '2026-10-16',
        activeTo: null,
        isPaused: false,
        isArchived: false,
        scheduleRevision: 1,
        effectiveDate: '2026-10-16',
      };

      const occurrences = generateOccurrencesForDateRange(routine, '2026-10-16', '2026-10-16', []);
      expect(occurrences).toHaveLength(1);
      // 08:00 Asia/Dhaka is always 02:00:00.000Z
      expect(occurrences[0]!.plannedInstant).toBe('2026-10-16T02:00:00.000Z');
      expect(occurrences[0]!.timezone).toBe('Asia/Dhaka');
    });

    it('explains why a routine is or is not due on a specific calendar date', () => {
      const dailyRoutine: RoutineTemplateRule = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        workspaceId: '123e4567-e89b-12d3-a456-426614174000',
        folderId: null,
        title: 'Morning Yoga',
        details: null,
        frequency: 'daily',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        timezone: 'UTC',
        scheduledTime: '07:00',
        activeFrom: '2026-10-01',
        activeTo: null,
        isPaused: false,
        isArchived: false,
        scheduleRevision: 1,
        effectiveDate: '2026-10-01',
      };

      const explanation = explainWhyDueToday(dailyRoutine, '2026-10-16');
      expect(explanation.isDue).toBe(true);
      expect(explanation.reason).toContain('Due today');
      expect(explanation.cadenceDescription).toBe('Repeats every day at 07:00');

      const pausedExplanation = explainWhyDueToday(
        { ...dailyRoutine, isPaused: true },
        '2026-10-16'
      );
      expect(pausedExplanation.isDue).toBe(false);
      expect(pausedExplanation.reason).toContain('Paused');
    });

    it('calculates gentle, non-punitive progress with encouraging messages and no streak pressure', () => {
      // 0 completed, 3 total
      const p1 = calculateGentleProgress([
        { status: 'pending' },
        { status: 'pending' },
        { status: 'pending' },
      ]);
      expect(p1.totalScheduled).toBe(3);
      expect(p1.completedCount).toBe(0);
      expect(p1.completionRate).toBe(0);
      expect(p1.message).toBe('3 routines ready for today.');

      // 2 completed, 1 skipped, 3 total
      const p2 = calculateGentleProgress([
        { status: 'done' },
        { status: 'done' },
        { status: 'skipped' },
      ]);
      expect(p2.completedCount).toBe(2);
      expect(p2.skippedCount).toBe(1);
      expect(p2.message).toBe('2 completed, 1 skipped today.');

      // All completed
      const p3 = calculateGentleProgress([{ status: 'done' }, { status: 'done' }]);
      expect(p3.isAllCompleted).toBe(true);
      expect(p3.completionRate).toBe(100);
      expect(p3.message).toContain('All routines completed');
    });

    it('explains schedule change impact cleanly distinguishing immediate vs future effective dates', () => {
      const immediate = explainScheduleChangeImpact('2026-10-16', '2026-10-16');
      expect(immediate).toContain('take effect immediately');
      expect(immediate).toContain('Past completed and skipped records remain intact');

      const future = explainScheduleChangeImpact('2026-10-20', '2026-10-16');
      expect(future).toContain('take effect on 2026-10-20');
      expect(future).toContain('Past completed and skipped history is preserved');
    });
  });

  describe('Journal Domain & Reflection Defaults', () => {
    it('validates calendar date format YYYY-MM-DD and rejects malformed strings', async () => {
      const { validateJournalEntryDate } = await import('./journal.js');

      expect(validateJournalEntryDate('2026-10-16')).toBe('2026-10-16');
      expect(validateJournalEntryDate('2025-01-01')).toBe('2025-01-01');

      expect(() => validateJournalEntryDate('16-10-2026')).toThrow(RangeError);
      expect(() => validateJournalEntryDate('2026/10/16')).toThrow(RangeError);
      expect(() => validateJournalEntryDate('not-a-date')).toThrow(RangeError);
    });

    it('validates IANA timezones strictly', async () => {
      const { validateJournalTimezone } = await import('./journal.js');

      expect(validateJournalTimezone('America/New_York')).toBe('America/New_York');
      expect(validateJournalTimezone('Asia/Dhaka')).toBe('Asia/Dhaka');
      expect(validateJournalTimezone('UTC')).toBe('UTC');

      expect(() => validateJournalTimezone('Fake/Zone')).toThrow(RangeError);
      expect(() => validateJournalTimezone('')).toThrow(RangeError);
    });

    it('preserves Unicode and non-Latin scripts (Bangla) in journal title and body', async () => {
      const { validateJournalTitle, resolveJournalTitle } = await import('./journal.js');

      const banglaTitle = 'আজকের বিশেষ অভিজ্ঞতা ও পর্যালোচনা';
      expect(validateJournalTitle(banglaTitle)).toBe(banglaTitle);

      // Title derived from first non-empty line of content
      const derived = resolveJournalTitle(
        null,
        '2026-10-16',
        '  ভোরের আলো ফুটতেই কাজ শুরু করলাম...\nপরবর্তী লাইন  '
      );
      expect(derived).toBe('ভোরের আলো ফুটতেই কাজ শুরু করলাম...');

      // Fallback when both title and content are missing
      const fallback = resolveJournalTitle(null, '2026-10-16', '');
      expect(fallback).toBe('Journal entry - 2026-10-16');
    });

    it('supports optional non-clinical mood without forced scoring', async () => {
      const { validateJournalMood } = await import('./journal.js');

      expect(validateJournalMood(null)).toBeNull();
      expect(validateJournalMood(undefined)).toBeNull();
      expect(validateJournalMood('thoughtful & energized')).toBe('thoughtful & energized');
      expect(validateJournalMood('calm')).toBe('calm');
      expect(validateJournalMood('peaceful')).toBe('peaceful');

      expect(() => validateJournalMood('a'.repeat(60))).toThrow(RangeError);
    });

    it('provides structured non-clinical reflection templates with dismissal and blank defaults', async () => {
      const { getReflectionTemplates, getReflectionTemplateById, instantiateReflectionTemplate } =
        await import('./journal.js');

      const templates = getReflectionTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(4);

      const blank = getReflectionTemplateById('blank');
      expect(blank).toBeDefined();
      expect(blank?.prompts).toEqual([]);

      const daily = getReflectionTemplateById('daily_reflection');
      expect(daily).toBeDefined();
      expect(daily?.prompts.length).toBeGreaterThan(0);

      const instantiated = instantiateReflectionTemplate('daily_reflection');
      expect(instantiated.length).toBe(daily!.prompts.length);
      expect(instantiated[0]!.prompt).toBe(daily!.prompts[0]);
      expect(instantiated[0]!.response).toBe('');
    });

    it('correctly evaluates intentional backdating relative to creation instant', async () => {
      const { isEntryBackdated } = await import('./journal.js');

      // Creation instant: 2026-10-16T12:00:00Z in America/New_York (calendar date 2026-10-16)
      const creationInstant = '2026-10-16T12:00:00.000Z';
      const timezone = 'America/New_York';

      // Past entry date: backdated
      expect(isEntryBackdated('2026-10-10', creationInstant, timezone)).toBe(true);
      // Same day entry date: not backdated
      expect(isEntryBackdated('2026-10-16', creationInstant, timezone)).toBe(false);
      // Future entry date: not backdated
      expect(isEntryBackdated('2026-10-20', creationInstant, timezone)).toBe(false);
    });

    it('redacts sensitive preview content and body snippets by default', async () => {
      const { redactJournalPreview } = await import('./journal.js');

      const entry = {
        id: 'j-1',
        title: 'Deep Private Reflection',
        plainText: 'This is my deeply confidential thought that should never leak.',
        prompts: [{ prompt: 'What happened?', response: 'Very personal answer.' }],
        mood: 'pensive',
      };

      // Default privacy: suppressBodySnippets is true
      const redacted = redactJournalPreview(entry);
      expect(redacted.plainText).toBe('[Private journal entry]');
      expect(redacted.prompts?.[0]?.response).toBe('[Redacted response]');
      expect(redacted.title).toBe('Deep Private Reflection');

      // When suppressBodySnippets is explicitly false
      const unredacted = redactJournalPreview(entry, { suppressBodySnippets: false });
      expect(unredacted.plainText).toBe(
        'This is my deeply confidential thought that should never leak.'
      );
      expect(unredacted.prompts?.[0]?.response).toBe('Very personal answer.');
    });
  });

  describe('Phase 25: Files and Previews Domain Logic', () => {
    it('determines correct preview kind for supported MIME types', async () => {
      const { getFilePreviewKind } = await import('./files.js');

      expect(getFilePreviewKind('image/jpeg')).toBe('image');
      expect(getFilePreviewKind('image/png')).toBe('image');
      expect(getFilePreviewKind('image/webp')).toBe('image');
      expect(getFilePreviewKind('image/gif')).toBe('image');
      expect(getFilePreviewKind('application/pdf')).toBe('pdf');
      expect(
        getFilePreviewKind(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
      ).toBe('office');
      expect(getFilePreviewKind('application/msword')).toBe('office');
      expect(
        getFilePreviewKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      ).toBe('office');
      expect(getFilePreviewKind('text/plain')).toBe('text');
      expect(getFilePreviewKind('text/markdown')).toBe('text');
      expect(getFilePreviewKind('audio/mpeg')).toBe('audio');
      expect(getFilePreviewKind('application/octet-stream')).toBe('unsupported');
      expect(getFilePreviewKind('application/x-msdownload')).toBe('unsupported');
    });

    it('enforces that only verified files can be safely previewed', async () => {
      const { isSafeToPreview } = await import('./files.js');

      // Only 'verified' status allows safe preview
      expect(isSafeToPreview('verified', 'image/png')).toBe(true);
      expect(isSafeToPreview('verified', 'application/pdf')).toBe(true);
      expect(isSafeToPreview('verified', 'application/msword')).toBe(true);

      // Quarantined, rejected, or deleted files MUST NOT be rendered
      expect(isSafeToPreview('quarantined', 'image/png')).toBe(false);
      expect(isSafeToPreview('rejected', 'image/png')).toBe(false);
      expect(isSafeToPreview('deleted', 'image/png')).toBe(false);

      // Missing MIME or unsupported MIME
      expect(isSafeToPreview('verified', undefined)).toBe(false);
      expect(isSafeToPreview('verified', 'application/octet-stream')).toBe(false);
    });

    it('formats byte sizes cleanly', async () => {
      const { formatByteSize } = await import('./files.js');

      expect(formatByteSize(0)).toBe('0 B');
      expect(formatByteSize(512)).toBe('512 B');
      expect(formatByteSize(1024)).toBe('1 KB');
      expect(formatByteSize(1536)).toBe('1.5 KB');
      expect(formatByteSize(1024 * 1024)).toBe('1 MB');
      expect(formatByteSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
      expect(formatByteSize(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('computes storage quota usage accurately', async () => {
      const { computeStorageUsage } = await import('./files.js');

      const usage = computeStorageUsage(20 * 1024 * 1024, 10 * 1024 * 1024, 100 * 1024 * 1024);
      expect(usage.percentUsed).toBe(30);
      expect(usage.isNearLimit).toBe(false);
      expect(usage.isExceeded).toBe(false);
      expect(usage.formattedStored).toBe('20 MB');
      expect(usage.formattedReserved).toBe('10 MB');
      expect(usage.formattedTotal).toBe('30 MB');
      expect(usage.formattedMax).toBe('100 MB');

      // Near limit (>= 80%)
      const near = computeStorageUsage(75 * 1024 * 1024, 10 * 1024 * 1024, 100 * 1024 * 1024);
      expect(near.percentUsed).toBe(85);
      expect(near.isNearLimit).toBe(true);
      expect(near.isExceeded).toBe(false);

      // Exceeded (>= 100%)
      const exceeded = computeStorageUsage(95 * 1024 * 1024, 10 * 1024 * 1024, 100 * 1024 * 1024);
      expect(exceeded.percentUsed).toBe(100);
      expect(exceeded.isNearLimit).toBe(true);
      expect(exceeded.isExceeded).toBe(true);
    });

    it('creates and parses namespaced offline binary cache keys', async () => {
      const { getOfflineBinaryCacheKey, parseOfflineBinaryCacheKey } = await import('./files.js');

      const key = getOfflineBinaryCacheKey('acc-1', 'ws-1', 'file-42', 2);
      expect(key).toBe('acc-1:ws-1:file-42:v2');

      const parsed = parseOfflineBinaryCacheKey(key);
      expect(parsed).toEqual({
        accountId: 'acc-1',
        workspaceId: 'ws-1',
        fileId: 'file-42',
        version: 2,
      });

      expect(parseOfflineBinaryCacheKey('invalid-key')).toBeNull();
      expect(parseOfflineBinaryCacheKey('acc:ws:file:notnumber')).toBeNull();
    });
  });
});
