export type DomainSearchItemType =
  'all' | 'note' | 'task' | 'journal' | 'file' | 'knowledge' | 'folder';

export interface DomainSearchQuery {
  q?: string;
  types?: DomainSearchItemType[];
  folderId?: string;
  tagNames?: string[];
  startDate?: string;
  endDate?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface DomainSearchResultItem {
  id: string;
  kind: string;
  displayType: 'note' | 'task' | 'journal' | 'file' | 'knowledge' | 'folder';
  title: string;
  snippet: string;
  folderId?: string | null;
  folderPath: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface SearchDownloadedRecordsInput {
  workspaceId: string;
  query: DomainSearchQuery;
  items: {
    headers: Array<{
      id: string;
      workspaceId: string;
      kind: string;
      folderId: string | null;
      securityScope: 'standard' | 'vault';
      deletedAt: string | null;
      isArchived?: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
    notes?: Array<{
      id: string;
      workspaceId: string;
      title: string;
      plainText: string;
      purpose?: 'standard' | 'guide' | 'cheatsheet' | 'reference';
      tags?: string[];
      createdAt: string;
      updatedAt: string;
    }>;
    tasks?: Array<{
      id: string;
      workspaceId: string;
      title: string;
      details?: string | null;
      tags?: string[];
      createdAt: string;
      updatedAt: string;
    }>;
    journalEntries?: Array<{
      id: string;
      workspaceId: string;
      title?: string | null;
      entryDate: string;
      plainText: string;
      tags?: string[];
      createdAt: string;
      updatedAt: string;
    }>;
    files?: Array<{
      id: string;
      workspaceId: string;
      fileName: string;
      declaredMimeType: string;
      byteSize: number;
      createdAt: string;
      updatedAt: string;
    }>;
    folders?: Array<{
      id: string;
      workspaceId: string;
      name: string;
      parentId: string | null;
    }>;
  };
  preferences?: {
    journalPreviewHidden?: boolean;
    suppressBodySnippets?: boolean;
  };
}

/**
 * Shared journal privacy redaction policy across server and client local search.
 * By default, journal previews and body snippets are suppressed unless the user
 * explicitly configures both settings to false.
 */
export function shouldRedactJournalSnippet(preferences?: {
  journalPreviewHidden?: boolean;
  suppressBodySnippets?: boolean;
}): boolean {
  const hidePreview = preferences?.journalPreviewHidden ?? true;
  const suppressSnippets = preferences?.suppressBodySnippets ?? true;
  return hidePreview || suppressSnippets;
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Escapes regex special characters to prevent regex injection attacks.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits text into highlighted and non-highlighted segments safely.
 */
export function highlightMatch(text: string, query: string): HighlightSegment[] {
  if (!text) return [];
  if (text === '[Private journal entry]') {
    return [{ text, match: false }];
  }
  const trimmed = query.trim();
  if (!trimmed) {
    return [{ text, match: false }];
  }

  // Tokenize query into words (Bangla, English, Unicode alphanumeric)
  const tokens = trimmed
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return [{ text, match: false }];
  }

  const regexPattern = tokens.map(escapeRegex).join('|');
  const regex = new RegExp(`(${regexPattern})`, 'gi');

  const parts = text.split(regex);
  const segments: HighlightSegment[] = [];

  for (const part of parts) {
    if (!part) continue;
    const isMatch = tokens.some((token) => token.toLowerCase() === part.toLowerCase());
    segments.push({ text: part, match: isMatch });
  }

  return segments;
}

/**
 * Extracts a contextual snippet of text surrounding the search query match.
 */
export function extractSearchSnippet(text: string, query: string, maxLength = 140): string {
  if (!text) return '';
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (!query || !query.trim()) {
    return cleanText.length > maxLength ? `${cleanText.slice(0, maxLength)}...` : cleanText;
  }

  const trimmedQuery = query.trim();
  const lowerText = cleanText.toLowerCase();
  const lowerQuery = trimmedQuery.toLowerCase();

  // Look for exact query match first
  let index = lowerText.indexOf(lowerQuery);
  if (index === -1) {
    // Look for first token match
    const tokens = lowerQuery.split(/\s+/).filter(Boolean);
    for (const t of tokens) {
      const tokenIdx = lowerText.indexOf(t);
      if (tokenIdx !== -1) {
        index = tokenIdx;
        break;
      }
    }
  }

  if (index === -1) {
    return cleanText.length > maxLength ? `${cleanText.slice(0, maxLength)}...` : cleanText;
  }

  const half = Math.floor(maxLength / 2);
  let start = Math.max(0, index - half);
  let end = Math.min(cleanText.length, index + trimmedQuery.length + half);

  // Adjust start/end to word boundaries if possible
  if (start > 0) {
    const spaceIdx = cleanText.indexOf(' ', start);
    if (spaceIdx !== -1 && spaceIdx < start + 15) {
      start = spaceIdx + 1;
    }
  }
  if (end < cleanText.length) {
    const spaceIdx = cleanText.lastIndexOf(' ', end);
    if (spaceIdx !== -1 && spaceIdx > end - 15) {
      end = spaceIdx;
    }
  }

  let snippet = cleanText.slice(start, end).trim();
  if (start > 0) snippet = `...${snippet}`;
  if (end < cleanText.length) snippet = `${snippet}...`;

  return snippet;
}

/**
 * Resolves the full breadcrumb path of a folder.
 */
export function buildFolderPath(
  folderId: string | null,
  folderMap: Map<string, { id: string; name: string; parentId: string | null }>
): string {
  if (!folderId) return 'Inbox';
  const parts: string[] = [];
  let currentId: string | null = folderId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = folderMap.get(currentId);
    if (!folder) break;
    parts.unshift(folder.name);
    currentId = folder.parentId;
  }

  return parts.length > 0 ? parts.join(' > ') : 'Inbox';
}

type NoteItem = NonNullable<SearchDownloadedRecordsInput['items']['notes']>[number];
type TaskItem = NonNullable<SearchDownloadedRecordsInput['items']['tasks']>[number];
type JournalItem = NonNullable<SearchDownloadedRecordsInput['items']['journalEntries']>[number];
type FileItem = NonNullable<SearchDownloadedRecordsInput['items']['files']>[number];

/**
 * Executes an account/workspace-scoped search over downloaded records.
 * Invariant: Never searches or returns records with securityScope === 'vault'.
 */
export function searchDownloadedRecords(input: SearchDownloadedRecordsInput): {
  data: DomainSearchResultItem[];
  totalCount: number;
  coverage: 'offline_limited';
} {
  const { workspaceId, query, items, preferences } = input;
  const q = (query.q || '').trim();
  const lowerQ = q.toLowerCase();
  const tokens = lowerQ.split(/\s+/).filter(Boolean);

  const hasSpecificTypeFilter = Boolean(
    query.types && query.types.length > 0 && !query.types.includes('all')
  );
  if (
    !q &&
    !hasSpecificTypeFilter &&
    !query.folderId &&
    !query.tagNames?.length &&
    !query.startDate &&
    !query.endDate
  ) {
    return {
      data: [],
      totalCount: 0,
      coverage: 'offline_limited',
    };
  }

  const normStart = query.startDate
    ? /^\d{4}-\d{2}-\d{2}$/.test(query.startDate)
      ? `${query.startDate}T00:00:00.000Z`
      : query.startDate
    : undefined;
  const normEnd = query.endDate
    ? /^\d{4}-\d{2}-\d{2}$/.test(query.endDate)
      ? `${query.endDate}T23:59:59.999Z`
      : query.endDate
    : undefined;

  const folderMap = new Map<string, { id: string; name: string; parentId: string | null }>();
  for (const f of items.folders || []) {
    folderMap.set(f.id, f);
  }

  let allowedFolderIds: Set<string> | null = null;
  if (query.folderId) {
    allowedFolderIds = new Set<string>([query.folderId]);
    let added = true;
    while (added) {
      added = false;
      for (const f of items.folders || []) {
        if (f.parentId && allowedFolderIds.has(f.parentId) && !allowedFolderIds.has(f.id)) {
          allowedFolderIds.add(f.id);
          added = true;
        }
      }
    }
  }

  const notesMap = new Map<string, NoteItem>();
  for (const n of items.notes || []) {
    notesMap.set(n.id, n);
  }

  const tasksMap = new Map<string, TaskItem>();
  for (const t of items.tasks || []) {
    tasksMap.set(t.id, t);
  }

  const journalsMap = new Map<string, JournalItem>();
  for (const j of items.journalEntries || []) {
    journalsMap.set(j.id, j);
  }

  const filesMap = new Map<string, FileItem>();
  for (const f of items.files || []) {
    filesMap.set(f.id, f);
  }

  // Filter headers
  const matchingItems: Array<{
    item: DomainSearchResultItem;
    score: number;
  }> = [];

  for (const header of items.headers) {
    // Invariant: strict workspace boundary
    if (header.workspaceId !== workspaceId) continue;

    // Invariant: strict vault exclusion
    if (header.securityScope === 'vault') continue;

    // Trash is ALWAYS excluded from regular search
    if (header.deletedAt !== null) continue;

    // Archive filtering: exclude archived unless requested
    if (!query.includeArchived && header.isArchived) continue;

    // Filter by folder hierarchy (direct or descendants)
    if (
      allowedFolderIds &&
      (!header.folderId || !allowedFolderIds.has(header.folderId)) &&
      !allowedFolderIds.has(header.id)
    ) {
      continue;
    }

    // Filter by date range
    if (normStart && header.createdAt < normStart) continue;
    if (normEnd && header.createdAt > normEnd) continue;

    let displayType: DomainSearchResultItem['displayType'] = 'note';
    let title = '';
    let bodyText = '';
    let tags: string[] = [];
    let metadata: Record<string, unknown> | undefined;

    if (header.kind === 'note') {
      const note = notesMap.get(header.id);
      if (!note) continue;
      const isKnowledge = note.purpose && note.purpose !== 'standard';
      displayType = isKnowledge ? 'knowledge' : 'note';
      title = note.title;
      bodyText = note.plainText;
      tags = note.tags || [];
      metadata = { purpose: note.purpose || 'standard' };
    } else if (header.kind === 'todo' || header.kind === 'task') {
      const task = tasksMap.get(header.id);
      if (!task) continue;
      displayType = 'task';
      title = task.title;
      bodyText = task.details || '';
      tags = task.tags || [];
    } else if (header.kind === 'journal_entry' || header.kind === 'journal') {
      const journal = journalsMap.get(header.id);
      if (!journal) continue;
      displayType = 'journal';
      title = journal.title || `Reflection (${journal.entryDate})`;
      bodyText = journal.plainText;
      tags = journal.tags || [];
      metadata = { entryDate: journal.entryDate };
    } else if (header.kind === 'file_item' || header.kind === 'file') {
      const file = filesMap.get(header.id);
      if (!file) continue;
      displayType = 'file';
      title = file.fileName;
      bodyText = `${file.declaredMimeType} (${(file.byteSize / 1024).toFixed(1)} KB)`;
      metadata = { byteSize: file.byteSize, mimeType: file.declaredMimeType };
    } else if (header.kind === 'folder') {
      const folder = folderMap.get(header.id);
      if (!folder) continue;
      displayType = 'folder';
      title = folder.name;
      bodyText = 'Folder';
    } else {
      continue;
    }

    // Filter by requested types
    if (query.types && query.types.length > 0 && !query.types.includes('all')) {
      if (!query.types.includes(displayType)) continue;
    }

    // Filter by tagNames: all specified tags must match (case-insensitive)
    if (query.tagNames && query.tagNames.length > 0) {
      const uniqueQueryTags = Array.from(
        new Set(query.tagNames.map((t) => t.toLowerCase().trim()).filter(Boolean))
      );
      const itemTagLower = tags.map((t) => t.toLowerCase());
      const hasAllTags = uniqueQueryTags.every((t) => itemTagLower.includes(t));
      if (!hasAllTags) continue;
    }

    // Search query matching
    let score = 0;
    if (q) {
      const lowerTitle = title.toLowerCase();
      const lowerBody = bodyText.toLowerCase();
      const tagString = tags.join(' ').toLowerCase();

      // Exact phrase match in title
      if (lowerTitle.includes(lowerQ)) {
        score += 100;
        if (lowerTitle === lowerQ) score += 50;
      }
      // Exact phrase match in body
      if (lowerBody.includes(lowerQ)) {
        score += 40;
      }
      // Exact phrase match in tags
      if (tagString.includes(lowerQ)) {
        score += 30;
      }

      // Check token matches
      let matchesAllTokens = true;
      for (const token of tokens) {
        const inTitle = lowerTitle.includes(token);
        const inBody = lowerBody.includes(token);
        const inTags = tagString.includes(token);
        if (inTitle) score += 10;
        if (inBody) score += 5;
        if (inTags) score += 5;
        if (!inTitle && !inBody && !inTags) {
          matchesAllTokens = false;
        }
      }

      if (!matchesAllTokens && score === 0) {
        continue;
      }
    } else {
      score = 1;
    }

    const folderPath = buildFolderPath(header.folderId, folderMap);
    const isJournalRedacted =
      displayType === 'journal' && shouldRedactJournalSnippet(preferences);
    const snippet = isJournalRedacted
      ? '[Private journal entry]'
      : extractSearchSnippet(bodyText, q);

    matchingItems.push({
      item: {
        id: header.id,
        kind: header.kind,
        displayType,
        title,
        snippet,
        folderId: header.folderId,
        folderPath,
        tags,
        createdAt: header.createdAt,
        updatedAt: header.updatedAt,
        metadata,
      },
      score,
    });
  }

  // Stable sort: score DESC, updatedAt DESC, id ASC
  matchingItems.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const timeDiff = new Date(b.item.updatedAt).getTime() - new Date(a.item.updatedAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.item.id.localeCompare(b.item.id);
  });

  const totalCount = matchingItems.length;
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 20;
  const paginated = matchingItems.slice(offset, offset + limit).map((m) => m.item);

  return {
    data: paginated,
    totalCount,
    coverage: 'offline_limited',
  };
}
