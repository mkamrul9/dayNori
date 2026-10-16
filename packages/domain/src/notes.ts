export type NoteMark = 'bold' | 'italic';

export interface NoteTextInline {
  type: 'text';
  text: string;
  marks?: NoteMark[];
}

export interface NoteHardBreakInline {
  type: 'hard_break';
}

export type NoteInlineNode = NoteTextInline | NoteHardBreakInline;

export interface NoteParagraphBlock {
  type: 'paragraph';
  content?: NoteInlineNode[];
}

export interface NoteHeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3;
  content?: NoteInlineNode[];
}

export interface NoteListItemNode {
  type: 'list_item';
  content: NoteInlineNode[];
}

export interface NoteBulletListBlock {
  type: 'bullet_list';
  items: NoteListItemNode[];
}

export interface NoteOrderedListBlock {
  type: 'ordered_list';
  items: NoteListItemNode[];
}

export interface NoteChecklistItemNode {
  type: 'checklist_item';
  checked: boolean;
  content: NoteInlineNode[];
}

export interface NoteChecklistBlock {
  type: 'checklist';
  items: NoteChecklistItemNode[];
}

export type NoteBlockNode =
  | NoteParagraphBlock
  | NoteHeadingBlock
  | NoteBulletListBlock
  | NoteOrderedListBlock
  | NoteChecklistBlock;

export interface NoteDocument {
  version: 1;
  type: 'doc';
  content: NoteBlockNode[];
}

export const MAX_NOTE_DOCUMENT_BYTES = 512 * 1024; // 512 KB
export const MAX_NOTE_NODES = 5000;
export const MAX_NOTE_TITLE_LENGTH = 255;

/**
 * Resolves a note title with an honest visible fallback.
 * Preserves trimmed Unicode strings, derives from first non-empty line of content if title is missing,
 * and defaults to "Untitled" on empty/whitespace.
 */
export function resolveNoteTitle(
  title?: string | null,
  fallback = 'Untitled',
  contentText?: string
): string {
  if (title && title.trim().length > 0) {
    return title.trim().slice(0, MAX_NOTE_TITLE_LENGTH);
  }
  if (contentText && contentText.trim().length > 0) {
    const firstLine = contentText.trim().split(/\r?\n/)[0]!.trim();
    if (firstLine.length > 0) {
      return firstLine.slice(0, MAX_NOTE_TITLE_LENGTH);
    }
  }
  return fallback;
}

/**
 * Creates an empty canonical note document.
 */
export function createEmptyNoteDocument(): NoteDocument {
  return {
    version: 1,
    type: 'doc',
    content: [],
  };
}

/**
 * Creates a valid NoteDocument AST from a plain text string.
 * Preserves paragraphs, line breaks, and Unicode content.
 */
export function createNoteDocumentFromPlainText(text: string): NoteDocument {
  if (!text || text.trim().length === 0) {
    return createEmptyNoteDocument();
  }

  const rawParagraphs = text.split(/\r?\n\r?\n/);
  const blocks: NoteBlockNode[] = [];

  for (const rawPara of rawParagraphs) {
    const trimmed = rawPara.trim();
    if (!trimmed) continue;

    // Check for checklist items
    const lines = trimmed.split(/\r?\n/);
    const isChecklist = lines.every((line) => /^\[([ xX])\]\s+/.test(line.trim()));
    const isBulletList = lines.every((line) => /^[-*]\s+/.test(line.trim()));
    const isNumberedList = lines.every((line) => /^\d+\.\s+/.test(line.trim()));

    if (isChecklist) {
      blocks.push({
        type: 'checklist',
        items: lines.map((line): NoteChecklistItemNode => {
          const match = line.trim().match(/^\[([ xX])\]\s+(.*)$/);
          const checked = match ? match[1]!.toLowerCase() === 'x' : false;
          const contentText = match ? match[2]! : line;
          return {
            type: 'checklist_item',
            checked,
            content: [{ type: 'text', text: contentText }],
          };
        }),
      });
      continue;
    }

    if (isBulletList) {
      blocks.push({
        type: 'bullet_list',
        items: lines.map((line): NoteListItemNode => {
          const contentText = line.trim().replace(/^[-*]\s+/, '');
          return {
            type: 'list_item',
            content: [{ type: 'text', text: contentText }],
          };
        }),
      });
      continue;
    }

    if (isNumberedList) {
      blocks.push({
        type: 'ordered_list',
        items: lines.map((line): NoteListItemNode => {
          const contentText = line.trim().replace(/^\d+\.\s+/, '');
          return {
            type: 'list_item',
            content: [{ type: 'text', text: contentText }],
          };
        }),
      });
      continue;
    }

    // Check for Heading levels 1-3
    const hMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (hMatch && !trimmed.includes('\n')) {
      const level = hMatch[1]!.length as 1 | 2 | 3;
      blocks.push({
        type: 'heading',
        level,
        content: [{ type: 'text', text: hMatch[2]! }],
      });
      continue;
    }

    // Default: paragraph with embedded hard breaks for internal single newlines
    const inlineContent: NoteInlineNode[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        inlineContent.push({ type: 'hard_break' });
      }
      inlineContent.push({ type: 'text', text: lines[i]! });
    }

    blocks.push({
      type: 'paragraph',
      content: inlineContent,
    });
  }

  return {
    version: 1,
    type: 'doc',
    content: blocks,
  };
}

/**
 * Extracts a deterministic plain text representation from a NoteDocument.
 * Suitable for full-text search, previews, screen readers, and exports.
 */
export function extractPlainText(doc: NoteDocument): string {
  if (!doc || !Array.isArray(doc.content)) return '';

  const parts: string[] = [];

  for (const block of doc.content) {
    switch (block.type) {
      case 'paragraph': {
        const text = extractInlineText(block.content);
        if (text) parts.push(text);
        break;
      }
      case 'heading': {
        const prefix = '#'.repeat(block.level);
        const text = extractInlineText(block.content);
        if (text) parts.push(`${prefix} ${text}`);
        break;
      }
      case 'bullet_list': {
        const itemTexts = block.items
          .map((item: NoteListItemNode) => `- ${extractInlineText(item.content)}`)
          .join('\n');
        if (itemTexts) parts.push(itemTexts);
        break;
      }
      case 'ordered_list': {
        const itemTexts = block.items
          .map(
            (item: NoteListItemNode, idx: number) =>
              `${idx + 1}. ${extractInlineText(item.content)}`
          )
          .join('\n');
        if (itemTexts) parts.push(itemTexts);
        break;
      }
      case 'checklist': {
        const itemTexts = block.items
          .map(
            (item: NoteChecklistItemNode) =>
              `[${item.checked ? 'x' : ' '}] ${extractInlineText(item.content)}`
          )
          .join('\n');
        if (itemTexts) parts.push(itemTexts);
        break;
      }
    }
  }

  return parts.join('\n\n').trim();
}

function extractInlineText(inlines?: NoteInlineNode[]): string {
  if (!inlines || !Array.isArray(inlines)) return '';
  let result = '';
  for (const node of inlines) {
    if (node.type === 'text') {
      result += node.text;
    } else if (node.type === 'hard_break') {
      result += '\n';
    }
  }
  return result;
}

/**
 * Computes word count handling multilingual text (English, Bangla, numerals, symbols).
 */
export function calculateWordCount(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  // Match contiguous non-whitespace character clusters
  const matches = text.trim().match(/\S+/gu);
  return matches ? matches.length : 0;
}

/**
 * Computes character count using Unicode code points (properly handling surrogate pairs & conjuncts).
 */
export function calculateCharCount(text: string): number {
  if (!text) return 0;
  return Array.from(text).length;
}

/**
 * Counts total nodes across the document tree.
 */
export function countDocumentNodes(doc: NoteDocument): number {
  let count = 1; // root doc node
  for (const block of doc.content) {
    count++;
    if ('content' in block && Array.isArray(block.content)) {
      count += block.content.length;
    } else if ('items' in block && Array.isArray(block.items)) {
      for (const item of block.items) {
        count++;
        if ('content' in item && Array.isArray(item.content)) {
          count += item.content.length;
        }
      }
    }
  }
  return count;
}

/**
 * Strips dangerous null bytes and invalid control characters from strings.
 * Note content is preserved as inert plain text.
 */
export function sanitizeInertString(str: string): string {
  if (!str) return '';
  // 1. Remove null bytes and non-printable control characters except \t (9), \n (10), \r (13)
  let clean = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      clean += str[i];
    }
  }
  // 2. Strip executable script and style tags and content
  let sanitized = clean.replace(
    /<\s*(?:script|style)[^>]*>[\s\S]*?<\s*\/\s*(?:script|style)\s*>/gi,
    ''
  );
  // 3. Strip raw HTML tags to guarantee inert plain text
  sanitized = sanitized.replace(/<[^>]+>/g, '');
  return sanitized;
}

/**
 * Sanitizes all text fields within a NoteDocument, ensuring inert plain text and removing control characters.
 */
export function sanitizeNoteDocument(doc: NoteDocument): NoteDocument {
  const sanitizedContent: NoteBlockNode[] = [];

  for (const block of doc.content) {
    switch (block.type) {
      case 'paragraph': {
        sanitizedContent.push({
          type: 'paragraph',
          content: sanitizeInlines(block.content),
        });
        break;
      }
      case 'heading': {
        sanitizedContent.push({
          type: 'heading',
          level: block.level,
          content: sanitizeInlines(block.content),
        });
        break;
      }
      case 'bullet_list': {
        sanitizedContent.push({
          type: 'bullet_list',
          items: block.items.map((it: NoteListItemNode) => ({
            type: 'list_item',
            content: sanitizeInlines(it.content),
          })),
        });
        break;
      }
      case 'ordered_list': {
        sanitizedContent.push({
          type: 'ordered_list',
          items: block.items.map((it: NoteListItemNode) => ({
            type: 'list_item',
            content: sanitizeInlines(it.content),
          })),
        });
        break;
      }
      case 'checklist': {
        sanitizedContent.push({
          type: 'checklist',
          items: block.items.map((it: NoteChecklistItemNode) => ({
            type: 'checklist_item',
            checked: Boolean(it.checked),
            content: sanitizeInlines(it.content),
          })),
        });
        break;
      }
    }
  }

  return {
    version: 1,
    type: 'doc',
    content: sanitizedContent,
  };
}

function sanitizeInlines(inlines?: NoteInlineNode[]): NoteInlineNode[] {
  if (!inlines) return [];
  return inlines.map((node) => {
    if (node.type === 'text') {
      return {
        type: 'text',
        text: sanitizeInertString(node.text),
        marks: node.marks,
      };
    }
    return node;
  });
}

/**
 * Validates a NoteDocument against structural constraints, size limits, and node bounds.
 */
export function validateNoteDocument(input: unknown): NoteDocument {
  if (!input || typeof input !== 'object') {
    throw new Error('NOTE_DOCUMENT_INVALID: Note document must be an object.');
  }

  const doc = input as Partial<NoteDocument>;
  if (doc.version !== 1 || doc.type !== 'doc' || !Array.isArray(doc.content)) {
    throw new Error(
      'NOTE_DOCUMENT_INVALID: Note document must have version=1, type="doc", and content array.'
    );
  }

  // 1. Check serialized JSON byte size limit
  const json = JSON.stringify(doc);
  const byteLength = new TextEncoder().encode(json).length;
  if (byteLength > MAX_NOTE_DOCUMENT_BYTES) {
    throw new Error(
      `NOTE_PAYLOAD_TOO_LARGE: Note document size (${byteLength} bytes) exceeds limit of ${MAX_NOTE_DOCUMENT_BYTES} bytes.`
    );
  }

  // 2. Check node count bounds to prevent deeply nested or excessive trees
  const nodeCount = countDocumentNodes(doc as NoteDocument);
  if (nodeCount > MAX_NOTE_NODES) {
    throw new Error(
      `NOTE_NODE_COUNT_EXCEEDED: Note document node count (${nodeCount}) exceeds limit of ${MAX_NOTE_NODES}.`
    );
  }

  return sanitizeNoteDocument(doc as NoteDocument);
}
