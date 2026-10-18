import { generateUuid } from './ids.js';
import {
  type NoteDocument,
  type NoteBlockNode,
  type NoteInlineNode,
  type NoteChecklistItemNode,
  sanitizeInertString,
} from './notes.js';

export type KnowledgePresetKind = 'guide' | 'cheatsheet' | 'reference';

export interface KnowledgePresetMetadata {
  id: KnowledgePresetKind;
  title: string;
  description: string;
  icon: string;
  defaultTags: string[];
}

export const KNOWLEDGE_PRESETS: Record<KnowledgePresetKind, KnowledgePresetMetadata> = {
  guide: {
    id: 'guide',
    title: 'How-to Guide',
    description:
      'Structured procedural documentation with goals, steps, and verification checklists.',
    icon: 'book',
    defaultTags: ['guide', 'documentation'],
  },
  cheatsheet: {
    id: 'cheatsheet',
    title: 'Reference Cheatsheet',
    description: 'Dense, copy-ready syntax, commands, shortcuts, and key-value tables.',
    icon: 'code',
    defaultTags: ['cheatsheet', 'reference'],
  },
  reference: {
    id: 'reference',
    title: 'Quick Reference',
    description: 'Topic notes with categorized reference sections, links, and code snippets.',
    icon: 'bookmark',
    defaultTags: ['reference'],
  },
};

/**
 * Creates a canonical NoteDocument formatted as a procedural How-to Guide.
 * Preserves the canonical Note document format (version 1) without requiring a separate body store.
 */
export function createGuideDocument(params: {
  title: string;
  summary?: string;
  steps?: string[];
  checklist?: string[];
}): NoteDocument {
  const content: NoteBlockNode[] = [];

  // Title heading (Level 1)
  content.push({
    id: generateUuid(),
    type: 'heading',
    level: 1,
    content: [{ type: 'text', text: sanitizeInertString(params.title || 'Untitled Guide') }],
  });

  // Overview / summary paragraph
  if (params.summary && params.summary.trim().length > 0) {
    content.push({
      id: generateUuid(),
      type: 'paragraph',
      content: [{ type: 'text', text: sanitizeInertString(params.summary.trim()) }],
    });
  } else {
    content.push({
      id: generateUuid(),
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Overview and objective of this guide. Document context, prerequisites, and expected outcomes here.',
        },
      ],
    });
  }

  // Section: Steps
  content.push({
    id: generateUuid(),
    type: 'heading',
    level: 2,
    content: [{ type: 'text', text: 'Step-by-step Instructions' }],
  });

  const stepList =
    params.steps && params.steps.length > 0
      ? params.steps
      : [
          'Prerequisites: Confirm required access and tools are installed.',
          'Execution: Execute the primary procedure following project guidelines.',
          'Verification: Validate outputs and check for errors or regressions.',
        ];

  const orderedItems = stepList.map((step) => ({
    id: generateUuid(),
    type: 'list_item' as const,
    content: [{ type: 'text' as const, text: sanitizeInertString(step) }],
  }));

  content.push({
    id: generateUuid(),
    type: 'ordered_list',
    items: orderedItems,
  });

  // Section: Verification Checklist
  content.push({
    id: generateUuid(),
    type: 'heading',
    level: 2,
    content: [{ type: 'text', text: 'Verification Checklist' }],
  });

  const checklistEntries =
    params.checklist && params.checklist.length > 0
      ? params.checklist
      : [
          'Configuration tested and verified',
          'Tests executed and passing',
          'Documentation and links updated',
        ];

  const checklistItems: NoteChecklistItemNode[] = checklistEntries.map((item) => ({
    id: generateUuid(),
    type: 'checklist_item',
    checked: false,
    content: [{ type: 'text', text: sanitizeInertString(item) }],
  }));

  content.push({
    id: generateUuid(),
    type: 'checklist',
    items: checklistItems,
  });

  return {
    version: 1,
    type: 'doc',
    content,
  };
}

/**
 * Creates a canonical NoteDocument formatted as a Command / Syntax Cheatsheet.
 */
export function createCheatsheetDocument(params: {
  title: string;
  summary?: string;
  sections?: Array<{
    title: string;
    entries: Array<{ label: string; codeOrValue: string; description?: string }>;
  }>;
}): NoteDocument {
  const content: NoteBlockNode[] = [];

  // Title heading (Level 1)
  content.push({
    id: generateUuid(),
    type: 'heading',
    level: 1,
    content: [{ type: 'text', text: sanitizeInertString(params.title || 'Untitled Cheatsheet') }],
  });

  // Overview / summary paragraph
  if (params.summary && params.summary.trim().length > 0) {
    content.push({
      id: generateUuid(),
      type: 'paragraph',
      content: [{ type: 'text', text: sanitizeInertString(params.summary.trim()) }],
    });
  } else {
    content.push({
      id: generateUuid(),
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Quick reference reference guide. Click copy to grab commands or syntax directly to your clipboard.',
        },
      ],
    });
  }

  const sections =
    params.sections && params.sections.length > 0
      ? params.sections
      : [
          {
            title: 'Essential Commands',
            entries: [
              {
                label: 'Check status',
                codeOrValue: 'git status -s',
                description: 'Show condensed status',
              },
              {
                label: 'Branch switch',
                codeOrValue: 'git switch -c feature/new-work',
                description: 'Create and switch to branch',
              },
              {
                label: 'Verify diff',
                codeOrValue: 'git diff --stat',
                description: 'Inspect diff stats before staging',
              },
            ],
          },
          {
            title: 'Advanced & Diagnostics',
            entries: [
              {
                label: 'Log graph',
                codeOrValue: 'git log --oneline --graph -n 10',
                description: 'Recent commit history',
              },
              {
                label: 'Undo unstaged',
                codeOrValue: 'git restore .',
                description: 'Discard working-tree changes',
              },
            ],
          },
        ];

  for (const sec of sections) {
    content.push({
      id: generateUuid(),
      type: 'heading',
      level: 2,
      content: [{ type: 'text', text: sanitizeInertString(sec.title) }],
    });

    const items = sec.entries.map((entry) => {
      const inlines: NoteInlineNode[] = [
        { type: 'text', text: `${sanitizeInertString(entry.label)}: `, marks: ['bold'] },
        { type: 'text', text: sanitizeInertString(entry.codeOrValue) },
      ];
      if (entry.description) {
        inlines.push({
          type: 'text',
          text: ` (${sanitizeInertString(entry.description)})`,
        });
      }
      return {
        id: generateUuid(),
        type: 'list_item' as const,
        content: inlines,
      };
    });

    content.push({
      id: generateUuid(),
      type: 'bullet_list',
      items,
    });
  }

  return {
    version: 1,
    type: 'doc',
    content,
  };
}

// --- Quick Reference Extraction ---

export interface QuickReferenceEntry {
  id: string;
  label: string;
  codeOrValue: string;
  description?: string;
  copyableText: string;
}

export interface QuickReferenceSection {
  id: string;
  title: string;
  level: number;
  entries: QuickReferenceEntry[];
  checklistItems: Array<{ id: string; text: string; checked: boolean }>;
}

/**
 * Extracts structured quick-reference sections and copyable text/code blocks
 * from a canonical NoteDocument.
 */
export function extractQuickReferenceSections(doc: NoteDocument): QuickReferenceSection[] {
  const sections: QuickReferenceSection[] = [];
  let currentSection: QuickReferenceSection = {
    id: 'sec-overview',
    title: 'Overview',
    level: 1,
    entries: [],
    checklistItems: [],
  };

  const finalizeCurrentSection = () => {
    if (currentSection.entries.length > 0 || currentSection.checklistItems.length > 0) {
      sections.push({ ...currentSection });
    }
  };

  for (const block of doc.content) {
    if (block.type === 'heading') {
      finalizeCurrentSection();
      const headingText =
        block.content?.map((c) => ('text' in c ? c.text : '')).join('') || 'Untitled Section';
      currentSection = {
        id: block.id || generateUuid(),
        title: headingText.trim(),
        level: block.level,
        entries: [],
        checklistItems: [],
      };
    } else if (block.type === 'bullet_list' || block.type === 'ordered_list') {
      for (const item of block.items) {
        const fullText = item.content
          .map((c) => ('text' in c ? c.text : ''))
          .join('')
          .trim();
        if (!fullText) continue;

        // Try extracting "Label: Code (Description)" format
        const colonIdx = fullText.indexOf(':');
        if (colonIdx > 0 && colonIdx < fullText.length - 1) {
          const label = fullText.slice(0, colonIdx).trim();
          let rest = fullText.slice(colonIdx + 1).trim();
          let description: string | undefined;

          // Check for trailing parentheses
          const parenMatch = rest.match(/\(([^)]+)\)$/);
          if (parenMatch && parenMatch.index !== undefined) {
            description = parenMatch[1]?.trim();
            rest = rest.slice(0, parenMatch.index).trim();
          }

          const copyableText = cleanTextForClipboard(rest);
          currentSection.entries.push({
            id: item.id || generateUuid(),
            label,
            codeOrValue: rest,
            description,
            copyableText,
          });
        } else {
          // Plain list item without colon
          currentSection.entries.push({
            id: item.id || generateUuid(),
            label: fullText,
            codeOrValue: fullText,
            copyableText: cleanTextForClipboard(fullText),
          });
        }
      }
    } else if (block.type === 'checklist') {
      for (const item of block.items) {
        const itemText = item.content
          .map((c) => ('text' in c ? c.text : ''))
          .join('')
          .trim();
        if (itemText) {
          currentSection.checklistItems.push({
            id: item.id || generateUuid(),
            text: itemText,
            checked: item.checked,
          });
        }
      }
    } else if (block.type === 'paragraph') {
      const pText =
        block.content
          ?.map((c) => ('text' in c ? c.text : ''))
          .join('')
          .trim() || '';
      // If paragraph contains backticked code or colon pattern
      if (pText.includes(':')) {
        const colonIdx = pText.indexOf(':');
        const label = pText.slice(0, colonIdx).trim();
        const value = pText.slice(colonIdx + 1).trim();
        if (label.length > 0 && value.length > 0 && label.length <= 40) {
          currentSection.entries.push({
            id: block.id || generateUuid(),
            label,
            codeOrValue: value,
            copyableText: cleanTextForClipboard(value),
          });
        }
      }
    }
  }

  finalizeCurrentSection();
  return sections;
}

/**
 * Cleans extracted text for clipboard copying:
 * - Strips leading/trailing markdown code fences or backticks
 * - Normalizes Unicode line endings and strips control characters
 * - Ensures clean, pure text-only capture without unintended formatting
 */
export function cleanTextForClipboard(rawText: string): string {
  let cleaned = rawText.trim();
  // Strip code block fences with optional language tag
  const fenceMatch = cleaned.match(/^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n?```$/);
  if (fenceMatch && fenceMatch[1] !== undefined) {
    cleaned = fenceMatch[1].trim();
  } else if (cleaned.startsWith('```') && cleaned.endsWith('```') && cleaned.length >= 6) {
    cleaned = cleaned.slice(3, -3).trim();
  } else if (cleaned.startsWith('`') && cleaned.endsWith('`') && cleaned.length >= 2) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  // Remove ASCII control codes except standard tab and newline
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned;
}

// --- Saved Views & Saved Filters ---

export interface KnowledgeSavedViewFilter {
  presetKind?: 'guide' | 'cheatsheet' | 'reference' | 'all';
  folderId?: string | null;
  tagNames?: string[];
  isPinned?: boolean;
  isArchived?: boolean;
  searchQuery?: string;
  sortBy?: 'title' | 'updatedAt' | 'createdAt' | 'rank';
  sortOrder?: 'asc' | 'desc';
}

export interface SavedView {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  entityType: 'knowledge' | 'notes' | 'all';
  filter: KnowledgeSavedViewFilter;
  rank: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export function validateKnowledgeSavedViewFilter(input: unknown): KnowledgeSavedViewFilter {
  if (!input || typeof input !== 'object') {
    return { isArchived: false, sortBy: 'updatedAt', sortOrder: 'desc' };
  }
  const obj = input as Record<string, unknown>;

  const filter: KnowledgeSavedViewFilter = {};

  if (
    typeof obj['presetKind'] === 'string' &&
    ['guide', 'cheatsheet', 'reference', 'all'].includes(obj['presetKind'])
  ) {
    filter.presetKind = obj['presetKind'] as 'guide' | 'cheatsheet' | 'reference' | 'all';
  }

  if (
    obj['folderId'] === null ||
    (typeof obj['folderId'] === 'string' && obj['folderId'].length <= 64)
  ) {
    filter.folderId = obj['folderId'];
  }

  if (Array.isArray(obj['tagNames'])) {
    filter.tagNames = obj['tagNames']
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0 && t.length <= 64)
      .map((t) => t.trim().toLowerCase())
      .slice(0, 10);
  }

  if (typeof obj['isPinned'] === 'boolean') {
    filter.isPinned = obj['isPinned'];
  }

  if (typeof obj['isArchived'] === 'boolean') {
    filter.isArchived = obj['isArchived'];
  } else {
    filter.isArchived = false;
  }

  if (typeof obj['searchQuery'] === 'string') {
    filter.searchQuery = sanitizeInertString(obj['searchQuery'].slice(0, 100));
  }

  if (
    typeof obj['sortBy'] === 'string' &&
    ['title', 'updatedAt', 'createdAt', 'rank'].includes(obj['sortBy'])
  ) {
    filter.sortBy = obj['sortBy'] as 'title' | 'updatedAt' | 'createdAt' | 'rank';
  } else {
    filter.sortBy = 'updatedAt';
  }

  if (typeof obj['sortOrder'] === 'string' && ['asc', 'desc'].includes(obj['sortOrder'])) {
    filter.sortOrder = obj['sortOrder'] as 'asc' | 'desc';
  } else {
    filter.sortOrder = 'desc';
  }

  return filter;
}

/**
 * Pure predicate testing whether an item matches a KnowledgeSavedViewFilter.
 * Ensures an item can appear across multiple views without duplicating note bodies.
 */
export function matchesKnowledgeFilter(
  item: {
    title: string;
    kind?: string;
    plainText?: string;
    folderId: string | null;
    isPinned?: boolean;
    isArchived?: boolean;
    tags?: string[];
  },
  filter: KnowledgeSavedViewFilter
): boolean {
  // 1. Archive check
  if (filter.isArchived !== undefined && Boolean(item.isArchived) !== filter.isArchived) {
    return false;
  }

  // 2. Pin check
  if (filter.isPinned !== undefined && Boolean(item.isPinned) !== filter.isPinned) {
    return false;
  }

  // 3. Topic folder check
  if (filter.folderId !== undefined && item.folderId !== filter.folderId) {
    return false;
  }

  // 4. Tags check (must include all filter tagNames if specified)
  if (filter.tagNames && filter.tagNames.length > 0) {
    const itemTags = new Set((item.tags || []).map((t) => t.toLowerCase()));
    const allMatch = filter.tagNames.every((t) => itemTags.has(t));
    if (!allMatch) {
      return false;
    }
  }

  // 5. Preset kind check (checks tags or title convention for 'guide'/'cheatsheet')
  if (filter.presetKind && filter.presetKind !== 'all') {
    const itemTags = new Set((item.tags || []).map((t) => t.toLowerCase()));
    const titleLower = item.title.toLowerCase();
    const matchesPreset = itemTags.has(filter.presetKind) || titleLower.includes(filter.presetKind);
    if (!matchesPreset) {
      return false;
    }
  }

  // 6. Search query
  if (filter.searchQuery && filter.searchQuery.trim().length > 0) {
    const q = filter.searchQuery.trim().toLowerCase();
    const titleMatch = item.title.toLowerCase().includes(q);
    const bodyMatch = item.plainText ? item.plainText.toLowerCase().includes(q) : false;
    if (!titleMatch && !bodyMatch) {
      return false;
    }
  }

  return true;
}

// --- Item Links & Backlinks ---

export interface ResolvedItemLinkTarget {
  id: string;
  title: string;
  kind: string;
  folderId: string | null;
  isAvailable: boolean;
  unavailableReason?: 'deleted' | 'not_found' | 'unauthorized';
}

export interface ResolvedItemLink {
  id: string;
  workspaceId: string;
  sourceItemId: string;
  targetItemId: string;
  linkType: string;
  direction: 'outgoing' | 'incoming';
  targetId: string;
  targetTitle: string | null;
  isAvailable: boolean;
  unavailableReason?: 'deleted' | 'not_found' | 'unauthorized';
  createdAt: string;
  target: ResolvedItemLinkTarget;
}

/**
 * Explains why an internal link is unavailable in a user-facing, accessible format.
 * Supports both formatUnavailableLinkNotice(reason) and formatUnavailableLinkNotice(title, reason).
 */
export function formatUnavailableLinkNotice(
  arg1?: string,
  arg2?: 'deleted' | 'not_found' | 'unauthorized'
): string {
  let title: string | undefined;
  let reason: 'deleted' | 'not_found' | 'unauthorized' | undefined;

  if (arg2 !== undefined) {
    title = arg1;
    reason = arg2;
  } else if (arg1 === 'deleted' || arg1 === 'not_found' || arg1 === 'unauthorized') {
    reason = arg1;
  } else {
    title = arg1;
  }

  const prefix = title ? `"${title}" ` : 'Referenced item ';
  switch (reason) {
    case 'deleted':
      return `${prefix}has been moved to trash or deleted`;
    case 'not_found':
      return `${prefix}does not exist or could not be found`;
    case 'unauthorized':
      return `You do not have permission to view ${title ? `"${title}"` : 'the referenced item'} in this workspace`;
    default:
      return `${prefix}is unavailable`;
  }
}

/**
 * Validates that an item link strictly connects items within the exact same workspace.
 * Rejects cross-tenant link injection.
 */
export function validateItemLinkWorkspace(
  sourceWorkspaceId: string,
  targetWorkspaceId: string
): boolean {
  return (
    typeof sourceWorkspaceId === 'string' &&
    typeof targetWorkspaceId === 'string' &&
    sourceWorkspaceId.length > 0 &&
    sourceWorkspaceId === targetWorkspaceId
  );
}
