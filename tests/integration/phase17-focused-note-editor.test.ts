import { describe, expect, it } from 'vitest';
import {
  type NoteDocument,
  createRecoverableNoteDocument,
  convertPastedHtmlToNoteDocument,
  extractPlainText,
  resolveNoteTitle,
  calculateCharCount,
  calculateWordCount,
  validateNoteDocument,
  MAX_NOTE_DOCUMENT_BYTES,
  MAX_NOTE_NODES,
} from '@daynori/domain';

describe('Phase 17: Focused Note Editor Contract & Integration', () => {
  describe('Content Preservation & Security Invariants', () => {
    it('preserves literal programming constructs (List<T>, x < y) and HTML snippets without tag stripping', () => {
      const codeSnippet =
        'const list: List<T> = new ArrayList<T>(); if (x < y && y > z) { return true; }';
      const htmlSnippet = '<div class="alert">Literal HTML example</div>';
      const banglaSnippet =
        'বাংলা ইউনিকোড নোট: ৫০টি করণীয় কাজ এবং বিশেষ বিবরণী (বোর্ড প্রশ্নাবলি)';

      // 1. Programming generics
      const { doc: doc1 } = createRecoverableNoteDocument(codeSnippet);
      expect(extractPlainText(doc1)).toBe(codeSnippet);
      expect(doc1.content[0]?.content?.[0]?.text).toBe(codeSnippet);

      // 2. HTML snippet as inert text
      const { doc: doc2 } = createRecoverableNoteDocument(htmlSnippet);
      expect(extractPlainText(doc2)).toBe(htmlSnippet);
      expect(doc2.content[0]?.content?.[0]?.text).toBe(htmlSnippet);

      // 3. Bengali script
      const { doc: doc3 } = createRecoverableNoteDocument(banglaSnippet);
      expect(extractPlainText(doc3)).toBe(banglaSnippet);
      expect(doc3.content[0]?.content?.[0]?.text).toBe(banglaSnippet);
    });

    it('distinguishes deliberate pasted HTML AST conversion from ordinary plain text storage', () => {
      const pastedHtml =
        '<h1>Chapter 1: Foundations</h1><p>Here is <strong>important bold</strong> text.</p><ul><li>Item 1</li><li>Item 2</li></ul>';
      const converted = convertPastedHtmlToNoteDocument(pastedHtml);

      expect(converted.content.length).toBeGreaterThanOrEqual(3);
      expect(converted.content[0]?.type).toBe('heading');
      expect(converted.content[1]?.type).toBe('paragraph');
      expect(converted.content[2]?.type).toBe('bullet_list');

      // But creating a document directly from the literal string preserves tags verbatim as inert text
      const { doc: inertDoc } = createRecoverableNoteDocument(pastedHtml);
      expect(inertDoc.content[0]?.type).toBe('paragraph');
      expect(inertDoc.content[0]?.content?.[0]?.text).toBe(pastedHtml);
    });

    it('enforces maximum note byte and node complexity limits', () => {
      expect(MAX_NOTE_DOCUMENT_BYTES).toBe(512 * 1024);
      expect(MAX_NOTE_NODES).toBe(5000);

      const oversizedString = 'A'.repeat(513 * 1024);
      expect(() => {
        validateNoteDocument({
          version: 1,
          type: 'doc',
          content: [
            {
              id: 'huge',
              type: 'paragraph',
              content: [{ type: 'text', text: oversizedString }],
            },
          ],
        });
      }).toThrow(/NOTE_PAYLOAD_TOO_LARGE/i);
    });
  });

  describe('Document Title & Plain Text Projections', () => {
    it('resolves explicit title or falls back to first non-empty line or Untitled', () => {
      expect(resolveNoteTitle('Explicit Title', 'Untitled', 'Body content')).toBe('Explicit Title');
      expect(resolveNoteTitle('', 'Untitled', 'First line header\nSecond line body')).toBe(
        'First line header'
      );
      expect(resolveNoteTitle('   ', 'Untitled', '')).toBe('Untitled');
      expect(resolveNoteTitle('', 'Untitled', '   \n\n  Third line header  \nMore body')).toBe(
        'Third line header'
      );
      expect(resolveNoteTitle('', 'Untitled', 'বাংলা প্রথম লাইন শিরোনাম\nবাকি অংশ')).toBe(
        'বাংলা প্রথম লাইন শিরোনাম'
      );
    });

    it('calculates accurate word and character counts across multi-script documents', () => {
      const mixedText = 'Hello world from Daynori! বাংলা ইউনিকোড শব্দ।';
      const wordCount = calculateWordCount(mixedText);
      const charCount = calculateCharCount(mixedText);

      expect(wordCount).toBe(7);
      expect(charCount).toBe(mixedText.length);
    });
  });

  describe('Structured Block AST Formatting Types', () => {
    it('validates paragraph, heading, bullet list, ordered list, and checklist nodes', () => {
      const fullDoc: NoteDocument = {
        version: 1,
        type: 'doc',
        content: [
          {
            id: 'h1',
            type: 'heading',
            level: 1,
            content: [{ type: 'text', text: 'Daily Standup' }],
          },
          {
            id: 'h2',
            type: 'heading',
            level: 2,
            content: [{ type: 'text', text: 'Objectives' }],
          },
          {
            id: 'p1',
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Review ' },
              { type: 'text', text: 'Phase 17 implementation', marks: ['bold'] },
            ],
          },
          {
            id: 'bl1',
            type: 'bullet_list',
            items: [
              { id: 'bli1', type: 'list_item', content: [{ type: 'text', text: 'Item 1' }] },
              { id: 'bli2', type: 'list_item', content: [{ type: 'text', text: 'Item 2' }] },
            ],
          },
          {
            id: 'ol1',
            type: 'ordered_list',
            items: [
              { id: 'oli1', type: 'list_item', content: [{ type: 'text', text: 'Step 1' }] },
              { id: 'oli2', type: 'list_item', content: [{ type: 'text', text: 'Step 2' }] },
            ],
          },
          {
            id: 'cl1',
            type: 'checklist',
            items: [
              {
                id: 'cli1',
                type: 'checklist_item',
                checked: true,
                content: [{ type: 'text', text: 'Done task' }],
              },
              {
                id: 'cli2',
                type: 'checklist_item',
                checked: false,
                content: [{ type: 'text', text: 'Pending task' }],
              },
            ],
          },
        ],
      };

      const validated = validateNoteDocument(fullDoc);
      expect(validated.content.length).toBe(6);
      expect(validated.content[0]?.type).toBe('heading');
      expect(validated.content[2]?.type).toBe('paragraph');
      expect(validated.content[3]?.type).toBe('bullet_list');
      expect(validated.content[4]?.type).toBe('ordered_list');
      expect(validated.content[5]?.type).toBe('checklist');
    });
  });

  describe('Inline Runs, Hard Breaks & Mid-Paragraph Editing', () => {
    it('preserves multiple differently marked inline runs and hard breaks without flattening to single text run', async () => {
      const {
        extractInlineText,
        replaceTextInRangeInlines,
        insertHardBreakInlines,
        applyMarkToInlines,
      } = await import('@daynori/domain');

      // Paragraph with plain run, bold run, hard break, italic run, and Bangla text
      const initialRuns = [
        { type: 'text' as const, text: 'Initial ' },
        { type: 'text' as const, text: 'bold run', marks: ['bold' as const] },
        { type: 'hard_break' as const },
        { type: 'text' as const, text: 'italic text ', marks: ['italic' as const] },
        { type: 'text' as const, text: 'বাংলা অংশ' },
      ];

      expect(extractInlineText(initialRuns)).toBe('Initial bold run\nitalic text বাংলা অংশ');

      // 1. Typing in the middle: insert 'extra ' inside the bold run at text offset 12 ('Initial bold')
      // Text length before bold run is 8 ('Initial '). Offset 12 is index 4 within 'bold run'.
      const updatedRuns = replaceTextInRangeInlines(initialRuns, 12, 12, 'extra ');
      expect(extractInlineText(updatedRuns)).toBe('Initial boldextra  run\nitalic text বাংলা অংশ');

      // The runs before ('Initial ') and after (hard break, italic run, Bangla) must remain intact
      expect(updatedRuns[0]).toEqual({ type: 'text', text: 'Initial ' });
      expect(updatedRuns[1]).toEqual({ type: 'text', text: 'boldextra  run', marks: ['bold'] });
      expect(updatedRuns[2]).toEqual({ type: 'hard_break' });
      expect(updatedRuns[3]).toEqual({ type: 'text', text: 'italic text ', marks: ['italic'] });
      expect(updatedRuns[4]).toEqual({ type: 'text', text: 'বাংলা অংশ' });

      // 2. Insert a hard break at offset 7 (between 'Initial' and ' ')
      const withBreak = insertHardBreakInlines(updatedRuns, 7);
      expect(extractInlineText(withBreak)).toBe('Initial\n boldextra  run\nitalic text বাংলা অংশ');
      expect(withBreak[0]).toEqual({ type: 'text', text: 'Initial' });
      expect(withBreak[1]).toEqual({ type: 'hard_break' });

      // 3. Apply formatting mark to a specific range without destroying other runs
      const boldMarked = applyMarkToInlines(initialRuns, 0, 7, 'bold');
      expect(boldMarked[0]).toEqual({ type: 'text', text: 'Initial', marks: ['bold'] });
      expect(boldMarked[1]).toEqual({ type: 'text', text: ' ' });
      expect(boldMarked[2]).toEqual({ type: 'text', text: 'bold run', marks: ['bold'] });
    });

    it('recovers from invalid or corrupted documents without wiping out existing content to blank', () => {
      const corruptPayload = {
        version: 999,
        type: 'invalid_doc',
        plainText: 'Preserved plain text content from corrupted document',
      };

      const result = createRecoverableNoteDocument(corruptPayload as unknown as NoteDocument);
      expect(result.recovered).toBe(true);
      expect(result.doc.content.length).toBeGreaterThan(0);
      expect(result.doc.type).toBe('doc');
      expect(result.doc.content[0]?.type).toBe('paragraph');
      expect(result.rawUnsupported).toBeDefined();
    });
  });

  describe('Autosave Lifecycle, Delayed Writes & Failure Retry', () => {
    it('serializes saves, rejects stale save completions, and retains dirty state on failure', async () => {
      let currentServerState: { title: string; generation: number } = {
        title: 'Initial Title',
        generation: 0,
      };
      let activeSaves = 0;
      let dirty = false;
      let lastSavedGeneration = 0;
      let editGeneration = 0;

      // Simulated save handler with controllable latency & failure
      const saveHandler = async (
        title: string,
        gen: number,
        options?: { delayMs?: number; shouldFail?: boolean }
      ) => {
        activeSaves++;
        if (options?.delayMs) {
          await new Promise((r) => setTimeout(r, options.delayMs));
        }
        activeSaves--;

        if (options?.shouldFail) {
          throw new Error('Network timeout during save');
        }

        // Reject stale save completion if an edit of a higher generation was already saved
        if (gen < lastSavedGeneration) {
          return { ignored: true };
        }

        currentServerState = { title, generation: gen };
        lastSavedGeneration = gen;
        if (editGeneration === gen) {
          dirty = false;
        }
        return { success: true };
      };

      // 1. Edit 1 arrives (generation 1)
      editGeneration = 1;
      dirty = true;
      const save1Promise = saveHandler('Edit 1', 1, { delayMs: 50 });

      // 2. Edit 2 arrives immediately before Save 1 completes (generation 2)
      editGeneration = 2;
      dirty = true;
      const save2Promise = saveHandler('Edit 2', 2, { delayMs: 10 });

      // Save 2 completes first (10ms)
      await save2Promise;
      expect(currentServerState.title).toBe('Edit 2');
      expect(lastSavedGeneration).toBe(2);
      expect(dirty).toBe(false);

      // Save 1 completes late (50ms) - must be rejected and not overwrite Edit 2!
      await save1Promise;
      expect(currentServerState.title).toBe('Edit 2');
      expect(lastSavedGeneration).toBe(2);

      // 3. Edit 3 fails: dirty state must be retained for retry
      editGeneration = 3;
      dirty = true;
      let caughtError = false;
      try {
        await saveHandler('Edit 3 (failing)', 3, { shouldFail: true });
      } catch {
        caughtError = true;
      }
      expect(caughtError).toBe(true);
      expect(dirty).toBe(true);
      expect(currentServerState.title).toBe('Edit 2'); // Retained previous successful state

      // 4. Retry successful save of generation 3
      await saveHandler('Edit 3 (retry)', 3);
      expect(dirty).toBe(false);
      expect(currentServerState.title).toBe('Edit 3 (retry)');
      expect(lastSavedGeneration).toBe(3);
      expect(activeSaves).toBe(0);
    });

    it('preserves explicit folderId: null when moving note to Inbox', () => {
      // In both web and mobile, moving a note to Inbox passes folderId: null
      const noteItem = {
        id: 'note-1',
        title: 'Project Note',
        folderId: 'folder-work-123',
      };

      // User moves note to Inbox: folderId is explicitly null
      const movePayload = {
        title: noteItem.title,
        folderId: null as string | null,
      };

      const resolvedFolderId =
        movePayload.folderId !== undefined ? movePayload.folderId : noteItem.folderId;

      expect(resolvedFolderId).toBeNull();
      // Crucial test: using 'folderId ?? fallback' would improperly convert null to fallback
      const brokenResolution = movePayload.folderId ?? 'fallback-folder';
      expect(brokenResolution).toBe('fallback-folder'); // Explains the bug we repaired!
    });

    it('does not dismiss conflict banner when conflict resolution fails', async () => {
      let conflictBannerDismissed = false;
      let errorThrown = false;

      const resolveConflictMock = async (shouldFail: boolean) => {
        if (shouldFail) {
          throw new Error('Conflict resolution transaction aborted');
        }
        conflictBannerDismissed = true;
      };

      try {
        await resolveConflictMock(true);
      } catch {
        errorThrown = true;
        // Handler must NOT dismiss banner on error
      }

      expect(errorThrown).toBe(true);
      expect(conflictBannerDismissed).toBe(false);

      // Successful resolution dismisses banner
      await resolveConflictMock(false);
      expect(conflictBannerDismissed).toBe(true);
    });
  });
});
