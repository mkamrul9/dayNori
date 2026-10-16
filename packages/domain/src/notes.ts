import { generateUuid } from './ids.js';

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
  id?: string;
  type: 'paragraph';
  content?: NoteInlineNode[];
}

export interface NoteHeadingBlock {
  id?: string;
  type: 'heading';
  level: 1 | 2 | 3;
  content?: NoteInlineNode[];
}

export interface NoteListItemNode {
  id?: string;
  type: 'list_item';
  content: NoteInlineNode[];
}

export interface NoteBulletListBlock {
  id?: string;
  type: 'bullet_list';
  items: NoteListItemNode[];
}

export interface NoteOrderedListBlock {
  id?: string;
  type: 'ordered_list';
  items: NoteListItemNode[];
}

export interface NoteChecklistItemNode {
  id?: string;
  type: 'checklist_item';
  checked: boolean;
  content: NoteInlineNode[];
}

export interface NoteChecklistBlock {
  id?: string;
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
 * Preserves literal Unicode strings without stripping angle brackets or comparison characters.
 * Derives from the first non-empty line of content text if title is missing,
 * defaulting to fallback (e.g. "Untitled") when completely empty.
 */
export function resolveNoteTitle(
  title?: string | null,
  fallback = 'Untitled',
  contentText?: string
): string {
  if (title && title.trim().length > 0) {
    const cleaned = sanitizeInertString(title.trim());
    if (cleaned.length > 0) {
      return cleaned.slice(0, MAX_NOTE_TITLE_LENGTH);
    }
  }
  if (contentText && contentText.trim().length > 0) {
    const firstLine = contentText.trim().split(/\r?\n/)[0]!.trim();
    const cleaned = sanitizeInertString(firstLine);
    if (cleaned.length > 0) {
      return cleaned.slice(0, MAX_NOTE_TITLE_LENGTH);
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

export interface PlainTextConversionOptions {
  /**
   * If true, markdown markers (#, -, 1., [ ]) are parsed into headings and lists.
   * If false or omitted, text is parsed cleanly into paragraphs without mutating literal content.
   */
  parseMarkdownShortcuts?: boolean;
}

/**
 * Creates a valid NoteDocument AST from a plain text string.
 * Preserves paragraphs, blank lines, whitespace, and Unicode content honestly.
 * Ordinary text round-trips through plain text without unintended conversion.
 */
export function createNoteDocumentFromPlainText(
  text: string,
  options: PlainTextConversionOptions = {}
): NoteDocument {
  if (!text || text.length === 0) {
    return createEmptyNoteDocument();
  }

  // Preserve blank lines cleanly: split on double newlines
  const rawParagraphs = text.split(/\r?\n\r?\n/);
  const blocks: NoteBlockNode[] = [];

  for (const rawPara of rawParagraphs) {
    // If the paragraph is completely blank, represent it as an empty paragraph block
    if (rawPara.length === 0) {
      blocks.push({
        id: generateUuid(),
        type: 'paragraph',
        content: [],
      });
      continue;
    }

    const lines = rawPara.split(/\r?\n/);

    if (options.parseMarkdownShortcuts) {
      const isChecklist = lines.every((line) => /^\[([ xX])\]\s+/.test(line.trim()));
      const isBulletList = lines.every((line) => /^[-*]\s+/.test(line.trim()));
      const isNumberedList = lines.every((line) => /^\d+\.\s+/.test(line.trim()));

      if (isChecklist) {
        blocks.push({
          id: generateUuid(),
          type: 'checklist',
          items: lines.map((line): NoteChecklistItemNode => {
            const match = line.trim().match(/^\[([ xX])\]\s+(.*)$/);
            const checked = match ? match[1]!.toLowerCase() === 'x' : false;
            const contentText = match ? match[2]! : line;
            return {
              id: generateUuid(),
              type: 'checklist_item',
              checked,
              content: [{ type: 'text', text: sanitizeInertString(contentText) }],
            };
          }),
        });
        continue;
      }

      if (isBulletList) {
        blocks.push({
          id: generateUuid(),
          type: 'bullet_list',
          items: lines.map((line): NoteListItemNode => {
            const contentText = line.trim().replace(/^[-*]\s+/, '');
            return {
              id: generateUuid(),
              type: 'list_item',
              content: [{ type: 'text', text: sanitizeInertString(contentText) }],
            };
          }),
        });
        continue;
      }

      if (isNumberedList) {
        blocks.push({
          id: generateUuid(),
          type: 'ordered_list',
          items: lines.map((line): NoteListItemNode => {
            const contentText = line.trim().replace(/^\d+\.\s+/, '');
            return {
              id: generateUuid(),
              type: 'list_item',
              content: [{ type: 'text', text: sanitizeInertString(contentText) }],
            };
          }),
        });
        continue;
      }

      const hMatch = rawPara.trim().match(/^(#{1,3})\s+(.*)$/);
      if (hMatch && !rawPara.includes('\n')) {
        const level = hMatch[1]!.length as 1 | 2 | 3;
        blocks.push({
          id: generateUuid(),
          type: 'heading',
          level,
          content: [{ type: 'text', text: sanitizeInertString(hMatch[2]!) }],
        });
        continue;
      }
    }

    // Default honest projection: paragraph preserving internal line breaks as hard breaks
    const inlineContent: NoteInlineNode[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        inlineContent.push({ type: 'hard_break' });
      }
      const lineText = lines[i]!;
      if (lineText.length > 0) {
        inlineContent.push({
          type: 'text',
          text: sanitizeInertString(lineText),
        });
      }
    }

    blocks.push({
      id: generateUuid(),
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

export interface ExtractPlainTextOptions {
  /**
   * Whether to include markdown formatting indicators (#, -, 1., [ ]) in projection.
   * Default is true for rich representation, false for pure indexing text.
   */
  includeMarkers?: boolean;
}

/**
 * Extracts a deterministic plain text representation from a NoteDocument.
 * Suitable for full-text search, previews, screen readers, and exports.
 */
export function extractPlainText(
  doc: NoteDocument,
  options: ExtractPlainTextOptions = { includeMarkers: true }
): string {
  if (!doc || !Array.isArray(doc.content)) return '';

  const includeMarkers = options.includeMarkers ?? true;
  const parts: string[] = [];

  for (const block of doc.content) {
    switch (block.type) {
      case 'paragraph': {
        const text = extractInlineText(block.content);
        parts.push(text);
        break;
      }
      case 'heading': {
        const text = extractInlineText(block.content);
        if (includeMarkers) {
          const prefix = '#'.repeat(block.level);
          parts.push(`${prefix} ${text}`);
        } else {
          parts.push(text);
        }
        break;
      }
      case 'bullet_list': {
        const itemTexts = block.items
          .map((item: NoteListItemNode) =>
            includeMarkers
              ? `- ${extractInlineText(item.content)}`
              : extractInlineText(item.content)
          )
          .join('\n');
        parts.push(itemTexts);
        break;
      }
      case 'ordered_list': {
        const itemTexts = block.items
          .map((item: NoteListItemNode, idx: number) =>
            includeMarkers
              ? `${idx + 1}. ${extractInlineText(item.content)}`
              : extractInlineText(item.content)
          )
          .join('\n');
        parts.push(itemTexts);
        break;
      }
      case 'checklist': {
        const itemTexts = block.items
          .map((item: NoteChecklistItemNode) =>
            includeMarkers
              ? `[${item.checked ? 'x' : ' '}] ${extractInlineText(item.content)}`
              : extractInlineText(item.content)
          )
          .join('\n');
        parts.push(itemTexts);
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
 * User content is preserved literally as inert plain text:
 * - Programming examples (e.g. List<T>, if (a < b && c > d)) are preserved.
 * - HTML examples (e.g. <div>, <span>) are preserved as literal text.
 * - Whitespace, blank lines, and Unicode (Bangla, emoji, Arabic, CJK) are preserved.
 * - Angle brackets are NOT removed; text nodes are rendered safely as text by definition.
 */
export function sanitizeInertString(str: string): string {
  if (!str) return '';
  let clean = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Allow tab (9), newline (10), carriage return (13), and printable characters (>= 32, not 127)
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      clean += str[i];
    }
  }
  return clean;
}

/**
 * Converts deliberate pasted HTML markup into canonical NoteDocument blocks.
 * Safely strips executable <script> and <style> elements while converting
 * approved formatting tags (<h1>-<h3>, <p>, <ul>, <ol>, <li>, <b>, <strong>, <i>, <em>, <br>).
 */
export function convertPastedHtmlToNoteDocument(html: string): NoteDocument {
  if (!html || html.trim().length === 0) {
    return createEmptyNoteDocument();
  }

  // 1. Remove dangerous script and style tags and content
  const cleanHtml = html
    .replace(/<\s*(?:script|style)[^>]*>[\s\S]*?<\s*\/\s*(?:script|style)\s*>/gi, '')
    .trim();

  // 2. Simple block-level segmentation
  const blockRegex = /<(p|h1|h2|h3|ul|ol|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  const blocks: NoteBlockNode[] = [];
  let match: RegExpExecArray | null;
  let hasMatches = false;

  while ((match = blockRegex.exec(cleanHtml)) !== null) {
    hasMatches = true;
    const tag = match[1]!.toLowerCase();
    const innerHtml = match[2]!;

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const level = Number(tag.slice(1)) as 1 | 2 | 3;
      blocks.push({
        id: generateUuid(),
        type: 'heading',
        level,
        content: parseInlineHtml(innerHtml),
      });
    } else if (tag === 'ul') {
      const items = parseListItems(innerHtml);
      if (items.length > 0) {
        blocks.push({
          id: generateUuid(),
          type: 'bullet_list',
          items,
        });
      }
    } else if (tag === 'ol') {
      const items = parseListItems(innerHtml);
      if (items.length > 0) {
        blocks.push({
          id: generateUuid(),
          type: 'ordered_list',
          items,
        });
      }
    } else {
      // Paragraph or standalone li
      blocks.push({
        id: generateUuid(),
        type: 'paragraph',
        content: parseInlineHtml(innerHtml),
      });
    }
  }

  if (!hasMatches) {
    // If no block tags matched, treat as plain text
    return createNoteDocumentFromPlainText(cleanHtml.replace(/<[^>]+>/g, ''));
  }

  return {
    version: 1,
    type: 'doc',
    content: blocks,
  };
}

function parseListItems(ulHtml: string): NoteListItemNode[] {
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  const items: NoteListItemNode[] = [];
  let match: RegExpExecArray | null;
  while ((match = liRegex.exec(ulHtml)) !== null) {
    items.push({
      id: generateUuid(),
      type: 'list_item',
      content: parseInlineHtml(match[1]!),
    });
  }
  return items;
}

function parseInlineHtml(html: string): NoteInlineNode[] {
  const textWithoutTags = html.replace(/<br\s*\/?>/gi, '\n');
  const tokens = textWithoutTags.split(/(<[^>]+>|\n)/g);
  const inlines: NoteInlineNode[] = [];
  let currentMarks: NoteMark[] = [];

  for (const token of tokens) {
    if (!token) continue;
    if (token === '\n') {
      inlines.push({ type: 'hard_break' });
    } else if (/^<(b|strong)[^>]*>$/i.test(token)) {
      if (!currentMarks.includes('bold')) currentMarks.push('bold');
    } else if (/^<\/(b|strong)>$/i.test(token)) {
      currentMarks = currentMarks.filter((m) => m !== 'bold');
    } else if (/^<(i|em)[^>]*>$/i.test(token)) {
      if (!currentMarks.includes('italic')) currentMarks.push('italic');
    } else if (/^<\/(i|em)>$/i.test(token)) {
      currentMarks = currentMarks.filter((m) => m !== 'italic');
    } else if (/^<[^>]+>$/.test(token)) {
      // Ignore other tags
    } else {
      const sanitized = sanitizeInertString(token);
      if (sanitized.length > 0) {
        inlines.push({
          type: 'text',
          text: sanitized,
          marks: currentMarks.length > 0 ? [...currentMarks] : undefined,
        });
      }
    }
  }

  return inlines;
}

/**
 * Validates a NoteDocument against structural constraints, size limits, and node bounds.
 * Enforces strict typing for blocks, inline nodes, heading levels, and marks.
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

  // 3. Strict structural validation across all blocks and inline nodes
  const validatedBlocks: NoteBlockNode[] = [];

  for (const block of doc.content) {
    if (!block || typeof block !== 'object' || typeof (block as { type?: unknown }).type !== 'string') {
      throw new Error('NOTE_BLOCK_INVALID: Block must be a valid object with a string type.');
    }

    const blockType = (block as { type: string }).type;
    const blockId =
      'id' in block && typeof (block as { id?: unknown }).id === 'string'
        ? (block as { id: string }).id.slice(0, 128)
        : undefined;

    switch (blockType) {
      case 'paragraph': {
        const para = block as Partial<NoteParagraphBlock>;
        validatedBlocks.push({
          ...(blockId ? { id: blockId } : {}),
          type: 'paragraph',
          content: validateInlines(para.content),
        });
        break;
      }
      case 'heading': {
        const heading = block as Partial<NoteHeadingBlock>;
        if (heading.level !== 1 && heading.level !== 2 && heading.level !== 3) {
          throw new Error(
            `NOTE_HEADING_LEVEL_INVALID: Heading level must be 1, 2, or 3. Received: ${heading.level}`
          );
        }
        validatedBlocks.push({
          ...(blockId ? { id: blockId } : {}),
          type: 'heading',
          level: heading.level,
          content: validateInlines(heading.content),
        });
        break;
      }
      case 'bullet_list': {
        const bList = block as Partial<NoteBulletListBlock>;
        if (!Array.isArray(bList.items)) {
          throw new Error('NOTE_LIST_ITEMS_INVALID: Bullet list items must be an array.');
        }
        validatedBlocks.push({
          ...(blockId ? { id: blockId } : {}),
          type: 'bullet_list',
          items: bList.items.map((item) => validateListItem(item)),
        });
        break;
      }
      case 'ordered_list': {
        const oList = block as Partial<NoteOrderedListBlock>;
        if (!Array.isArray(oList.items)) {
          throw new Error('NOTE_LIST_ITEMS_INVALID: Ordered list items must be an array.');
        }
        validatedBlocks.push({
          ...(blockId ? { id: blockId } : {}),
          type: 'ordered_list',
          items: oList.items.map((item) => validateListItem(item)),
        });
        break;
      }
      case 'checklist': {
        const cList = block as Partial<NoteChecklistBlock>;
        if (!Array.isArray(cList.items)) {
          throw new Error('NOTE_CHECKLIST_ITEMS_INVALID: Checklist items must be an array.');
        }
        validatedBlocks.push({
          ...(blockId ? { id: blockId } : {}),
          type: 'checklist',
          items: cList.items.map((item) => validateChecklistItem(item)),
        });
        break;
      }
      default:
        throw new Error(
          `NOTE_BLOCK_UNSUPPORTED: Unsupported block type "${blockType}". Valid types are: paragraph, heading, bullet_list, ordered_list, checklist.`
        );
    }
  }

  return {
    version: 1,
    type: 'doc',
    content: validatedBlocks,
  };
}

function validateInlines(inlines?: unknown): NoteInlineNode[] {
  if (!inlines) return [];
  if (!Array.isArray(inlines)) {
    throw new Error('NOTE_INLINES_INVALID: Inline content must be an array.');
  }

  return inlines.map((node: unknown) => {
    if (!node || typeof node !== 'object') {
      throw new Error('NOTE_INLINE_INVALID: Inline node must be an object.');
    }
    const n = node as Partial<NoteInlineNode>;
    if (n.type === 'hard_break') {
      return { type: 'hard_break' };
    }
    if (n.type === 'text') {
      if (typeof (n as Partial<NoteTextInline>).text !== 'string') {
        throw new Error('NOTE_TEXT_INVALID: Text inline node must have a string text property.');
      }
      const rawText = (n as Partial<NoteTextInline>).text!;
      const sanitized = sanitizeInertString(rawText);

      let marks: NoteMark[] | undefined;
      if ((n as Partial<NoteTextInline>).marks !== undefined) {
        if (!Array.isArray((n as Partial<NoteTextInline>).marks)) {
          throw new Error('NOTE_MARKS_INVALID: Inline marks must be an array.');
        }
        marks = [];
        for (const m of (n as Partial<NoteTextInline>).marks!) {
          if (m !== 'bold' && m !== 'italic') {
            throw new Error(`NOTE_MARK_UNSUPPORTED: Unsupported mark "${m}". Allowed marks: bold, italic.`);
          }
          if (!marks.includes(m)) marks.push(m);
        }
        if (marks.length === 0) marks = undefined;
      }

      return {
        type: 'text',
        text: sanitized,
        marks,
      };
    }

    throw new Error(
      `NOTE_INLINE_UNSUPPORTED: Unsupported inline node type "${(n as { type?: unknown }).type}". Allowed types: text, hard_break.`
    );
  });
}

function validateListItem(item: unknown): NoteListItemNode {
  if (!item || typeof item !== 'object') {
    throw new Error('NOTE_LIST_ITEM_INVALID: List item must be an object.');
  }
  const it = item as Partial<NoteListItemNode>;
  if (it.type !== 'list_item') {
    throw new Error(`NOTE_LIST_ITEM_INVALID: List item must have type="list_item". Received: ${it.type}`);
  }
  const itemId = typeof it.id === 'string' ? it.id.slice(0, 128) : undefined;
  return {
    ...(itemId ? { id: itemId } : {}),
    type: 'list_item',
    content: validateInlines(it.content),
  };
}

function validateChecklistItem(item: unknown): NoteChecklistItemNode {
  if (!item || typeof item !== 'object') {
    throw new Error('NOTE_CHECKLIST_ITEM_INVALID: Checklist item must be an object.');
  }
  const it = item as Partial<NoteChecklistItemNode>;
  if (it.type !== 'checklist_item') {
    throw new Error(
      `NOTE_CHECKLIST_ITEM_INVALID: Checklist item must have type="checklist_item". Received: ${it.type}`
    );
  }
  const itemId = typeof it.id === 'string' ? it.id.slice(0, 128) : undefined;
  return {
    ...(itemId ? { id: itemId } : {}),
    type: 'checklist_item',
    checked: Boolean(it.checked),
    content: validateInlines(it.content),
  };
}

/**
 * Recovers an unsupported or corrupted note document gracefully.
 * If the input is a valid NoteDocument, it is validated and returned.
 * If invalid or from an unsupported schema, converts fallbackText or the raw string
 * into a valid paragraph document while preserving the raw unsupported structure for audit.
 */
export function createRecoverableNoteDocument(
  raw: unknown,
  fallbackText = ''
): { doc: NoteDocument; rawUnsupported?: unknown } {
  try {
    const doc = validateNoteDocument(raw);
    return { doc };
  } catch {
    const text =
      typeof raw === 'string'
        ? raw
        : raw && typeof raw === 'object' && 'plainText' in raw && typeof (raw as { plainText: unknown }).plainText === 'string'
          ? (raw as { plainText: string }).plainText
          : fallbackText;

    return {
      doc: createNoteDocumentFromPlainText(text),
      rawUnsupported: raw,
    };
  }
}
