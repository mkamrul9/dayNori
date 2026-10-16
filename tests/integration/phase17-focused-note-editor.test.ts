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
});
