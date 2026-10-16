import type { PoolClient } from 'pg';
import crypto from 'node:crypto';
import type {
  JournalEntry,
  CreateJournalEntryRequest,
  UpdateJournalEntryRequest,
  JournalEntryListQuery,
  NoteDocument,
} from '@daynori/contracts';
import {
  validateJournalEntryDate,
  validateJournalTimezone,
  validateJournalTitle,
  validateJournalMood,
  validateJournalPrompts,
  validateJournalTags,
  validateNoteDocument,
  createEmptyNoteDocument,
  createNoteDocumentFromPlainText,
  extractPlainText,
  calculateWordCount,
  calculateCharCount,
  type JournalPromptItem,
} from '@daynori/domain';
import {
  lockWorkspaceSyncState,
  insertChange,
  insertOutboxIntent,
  updateWorkspaceSyncSeq,
} from '../sync/repository.js';
import { NotFoundError, ConflictError, ValidationError } from '../../plugins/errorHandler.js';

interface JournalEntryDbRow {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  kind: string;
  created_by: string;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  revision: string | number;
  rank: string;
  is_archived: boolean;
  is_pinned: boolean;
  security_scope: 'standard' | 'vault';
  title: string | null;
  entry_date: string | Date;
  timezone: string;
  document: NoteDocument;
  plain_text: string;
  word_count: number;
  char_count: number;
  mood: string | null;
  prompts: unknown;
  tags: string[];
  is_draft: boolean;
}

function normalizeDateString(d: string | Date): string {
  if (typeof d === 'string') {
    return d.slice(0, 10);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mapRowToJournalEntry(r: JournalEntryDbRow): JournalEntry {
  const prompts = Array.isArray(r.prompts)
    ? (r.prompts as JournalPromptItem[])
    : typeof r.prompts === 'string'
      ? (JSON.parse(r.prompts) as JournalPromptItem[])
      : [];

  return {
    id: r.id,
    workspaceId: r.workspace_id,
    folderId: r.folder_id,
    title: r.title,
    entryDate: normalizeDateString(r.entry_date),
    timezone: r.timezone,
    document: r.document,
    plainText: r.plain_text,
    wordCount: Number(r.word_count),
    charCount: Number(r.char_count),
    mood: r.mood,
    prompts,
    tags: Array.isArray(r.tags) ? r.tags : [],
    isDraft: Boolean(r.is_draft),
    isArchived: Boolean(r.is_archived),
    isPinned: Boolean(r.is_pinned),
    securityScope: r.security_scope,
    serverRevision: Number(r.revision),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
  };
}

export type JournalEntryWithSeq = JournalEntry & { seq: number };

async function assertPersonalWorkspace(client: PoolClient, workspaceId: string): Promise<void> {
  const wsRes = await client.query<{ kind: string }>(
    `SELECT kind FROM app.workspaces WHERE id = $1;`,
    [workspaceId]
  );
  if (wsRes.rows.length === 0) {
    throw new NotFoundError(`Workspace with ID ${workspaceId} was not found.`);
  }
  if (wsRes.rows[0]!.kind !== 'personal') {
    throw new ValidationError('Journal entries are strictly isolated to personal workspaces.');
  }
}

export async function createJournalEntry(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  input: CreateJournalEntryRequest,
  operationId?: string
): Promise<JournalEntryWithSeq> {
  await assertPersonalWorkspace(client, workspaceId);

  const entryId = input.id || crypto.randomUUID();
  const folderId = input.folderId || null;
  const securityScope = input.securityScope || 'standard';
  const entryDate = validateJournalEntryDate(input.entryDate);
  const timezone = validateJournalTimezone(input.timezone || 'UTC');
  const title = validateJournalTitle(input.title);
  const mood = validateJournalMood(input.mood);
  const prompts = validateJournalPrompts(input.prompts);
  const tags = validateJournalTags(input.tags);
  const isDraft = Boolean(input.isDraft);
  const isPinned = Boolean(input.isPinned);

  // 1. Verify folder exists and matches security scope if folderId is provided
  if (folderId) {
    const fRes = await client.query<{ id: string; security_scope: string }>(
      `SELECT id, security_scope FROM app.items
       WHERE workspace_id = $1 AND id = $2 AND kind = 'folder' AND deleted_at IS NULL;`,
      [workspaceId, folderId]
    );
    if (fRes.rows.length === 0) {
      throw new ValidationError(`Target folder ${folderId} does not exist or has been deleted.`);
    }
    if (fRes.rows[0]!.security_scope !== securityScope) {
      throw new ValidationError(
        `Target folder security scope '${fRes.rows[0]!.security_scope}' does not match entry scope '${securityScope}'.`
      );
    }
  }

  // 2. Resolve document AST, plain text, and stats
  let document: NoteDocument;
  let plainText: string;

  if (input.document) {
    document = validateNoteDocument(input.document);
    plainText = extractPlainText(document);
  } else if (input.plainText) {
    document = createNoteDocumentFromPlainText(input.plainText);
    plainText = input.plainText.trim();
  } else {
    document = createEmptyNoteDocument();
    plainText = '';
  }

  const wordCount = calculateWordCount(plainText);
  const charCount = calculateCharCount(plainText);

  // 3. Acquire workspace row-lock for atomic sequence & revision tracking
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  // 4. Insert into app.items
  await client.query(
    `INSERT INTO app.items (
      id, workspace_id, folder_id, kind, created_by, updated_by,
      revision, rank, is_archived, is_pinned, security_scope
    ) VALUES ($1, $2, $3, 'journal_entry', $4, $4, 1, '00001000', false, $5, $6);`,
    [entryId, workspaceId, folderId, actorUserId, isPinned, securityScope]
  );

  // 5. Insert into app.journal_entries
  const journalRes = await client.query<JournalEntryDbRow>(
    `INSERT INTO app.journal_entries (
      id, workspace_id, title, entry_date, timezone, document, plain_text,
      word_count, char_count, mood, prompts, tags, is_draft
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id, workspace_id, title, entry_date, timezone, document, plain_text,
              word_count, char_count, mood, prompts, tags, is_draft, created_at, updated_at;`,
    [
      entryId,
      workspaceId,
      title,
      entryDate,
      timezone,
      JSON.stringify(document),
      plainText,
      wordCount,
      charCount,
      mood,
      JSON.stringify(prompts),
      tags,
      isDraft,
    ]
  );

  const row = journalRes.rows[0]!;
  const seq = syncState.nextChangeSeq;

  // 6. Record change event and outbox intent
  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: entryId,
    revision: 1,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      kind: 'journal_entry',
      folderId,
      title,
      entryDate,
      timezone,
      document,
      plainText,
      wordCount,
      charCount,
      mood,
      prompts,
      tags,
      isDraft,
      isPinned,
      isArchived: false,
      securityScope,
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'journal_entry.created',
    payload: { entryId, revision: 1, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    id: entryId,
    workspaceId,
    folderId,
    title,
    entryDate,
    timezone,
    document,
    plainText,
    wordCount,
    charCount,
    mood,
    prompts,
    tags,
    isDraft,
    isArchived: false,
    isPinned,
    securityScope,
    serverRevision: 1,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: null,
    seq,
  };
}

export async function getJournalEntry(
  client: PoolClient,
  workspaceId: string,
  entryId: string
): Promise<JournalEntry> {
  await assertPersonalWorkspace(client, workspaceId);

  const res = await client.query<JournalEntryDbRow>(
    `SELECT i.id, i.workspace_id, i.folder_id, i.kind, i.created_by, i.updated_by,
            i.created_at, i.updated_at, i.deleted_at, i.revision, i.rank,
            i.is_archived, i.is_pinned, i.security_scope,
            j.title, j.entry_date::text as entry_date, j.timezone, j.document, j.plain_text,
            j.word_count, j.char_count, j.mood, j.prompts, j.tags, j.is_draft
     FROM app.items i
     JOIN app.journal_entries j ON j.workspace_id = i.workspace_id AND j.id = i.id
     WHERE i.workspace_id = $1 AND i.id = $2;`,
    [workspaceId, entryId]
  );

  if (res.rows.length === 0) {
    throw new NotFoundError(`Journal entry with ID ${entryId} was not found in this workspace.`);
  }

  const row = res.rows[0]!;
  if (row.deleted_at) {
    throw new NotFoundError(`Journal entry with ID ${entryId} is in trash.`);
  }

  return mapRowToJournalEntry(row);
}

export interface JournalEntryListResult {
  entries: JournalEntry[];
  nextCursor?: string;
  totalCount?: number;
}

export function encodeJournalCursor(data: {
  entryDate: string;
  createdAt: string;
  id: string;
}): string {
  return Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
}

export function decodeJournalCursor(
  cursorStr?: string
): { entryDate: string; createdAt: string; id: string } | null {
  if (!cursorStr) return null;
  try {
    const raw = Buffer.from(cursorStr, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.entryDate === 'string' &&
      typeof parsed.createdAt === 'string'
    ) {
      return {
        entryDate: String(parsed.entryDate),
        createdAt: String(parsed.createdAt),
        id: String(parsed.id),
      };
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
  }
  throw new ValidationError('MALFORMED_CURSOR: Invalid pagination cursor.');
}

export async function listJournalEntries(
  client: PoolClient,
  workspaceId: string,
  query: Partial<JournalEntryListQuery> = {}
): Promise<JournalEntryListResult> {
  await assertPersonalWorkspace(client, workspaceId);

  const params: unknown[] = [workspaceId];
  let whereClause = `WHERE i.workspace_id = $1 AND i.kind = 'journal_entry' AND i.deleted_at IS NULL`;

  if (query.folderId !== undefined) {
    if (query.folderId === null) {
      whereClause += ` AND i.folder_id IS NULL`;
    } else {
      params.push(query.folderId);
      whereClause += ` AND i.folder_id = $${params.length}`;
    }
  }

  if (query.date) {
    params.push(query.date);
    whereClause += ` AND j.entry_date = $${params.length}`;
  }

  if (query.startDate) {
    params.push(query.startDate);
    whereClause += ` AND j.entry_date >= $${params.length}`;
  }

  if (query.endDate) {
    params.push(query.endDate);
    whereClause += ` AND j.entry_date <= $${params.length}`;
  }

  if (query.isDraft !== undefined) {
    params.push(query.isDraft);
    whereClause += ` AND j.is_draft = $${params.length}`;
  }

  if (query.isArchived !== undefined) {
    params.push(query.isArchived);
    whereClause += ` AND i.is_archived = $${params.length}`;
  } else {
    whereClause += ` AND i.is_archived = false`;
  }

  if (query.tag) {
    params.push(query.tag.trim().toLowerCase());
    whereClause += ` AND $${params.length} = ANY(j.tags)`;
  }

  if (query.cursor) {
    const decoded = decodeJournalCursor(query.cursor);
    if (decoded) {
      params.push(decoded.entryDate, decoded.createdAt, decoded.id);
      const p1 = params.length - 2;
      const p2 = params.length - 1;
      const p3 = params.length;
      whereClause += ` AND (
        (j.entry_date < $${p1}) OR
        (j.entry_date = $${p1} AND i.created_at < $${p2}) OR
        (j.entry_date = $${p1} AND i.created_at = $${p2} AND i.id > $${p3})
      )`;
    }
  }

  const limit = query.limit || 50;
  params.push(limit + 1);

  const sql = `
    SELECT i.id, i.workspace_id, i.folder_id, i.kind, i.created_by, i.updated_by,
           i.created_at, i.updated_at, i.deleted_at, i.revision, i.rank,
           i.is_archived, i.is_pinned, i.security_scope,
           j.title, j.entry_date::text as entry_date, j.timezone, j.document, j.plain_text,
           j.word_count, j.char_count, j.mood, j.prompts, j.tags, j.is_draft
    FROM app.items i
    JOIN app.journal_entries j ON j.workspace_id = i.workspace_id AND j.id = i.id
    ${whereClause}
    ORDER BY j.entry_date DESC, i.created_at DESC, i.id ASC
    LIMIT $${params.length};
  `;

  const res = await client.query<JournalEntryDbRow>(sql, params);
  const rows = res.rows;
  let nextCursor: string | undefined = undefined;

  if (rows.length > limit) {
    rows.pop();
    const last = rows[rows.length - 1]!;
    nextCursor = encodeJournalCursor({
      entryDate: normalizeDateString(last.entry_date),
      createdAt: last.created_at.toISOString(),
      id: last.id,
    });
  }

  return {
    entries: rows.map(mapRowToJournalEntry),
    nextCursor,
  };
}

export async function updateJournalEntry(
  client: PoolClient,
  workspaceId: string,
  entryId: string,
  actorUserId: string,
  input: UpdateJournalEntryRequest,
  operationId?: string
): Promise<JournalEntryWithSeq> {
  await assertPersonalWorkspace(client, workspaceId);

  // 1. Acquire workspace sync lock first to protect against race conditions and stale revision checks
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  // 2. Fetch existing entry under lock
  const existingRes = await client.query<JournalEntryDbRow>(
    `SELECT i.id, i.workspace_id, i.folder_id, i.kind, i.created_by, i.updated_by,
            i.created_at, i.updated_at, i.deleted_at, i.revision, i.rank,
            i.is_archived, i.is_pinned, i.security_scope,
            j.title, j.entry_date::text as entry_date, j.timezone, j.document, j.plain_text,
            j.word_count, j.char_count, j.mood, j.prompts, j.tags, j.is_draft
     FROM app.items i
     JOIN app.journal_entries j ON j.workspace_id = i.workspace_id AND j.id = i.id
     WHERE i.workspace_id = $1 AND i.id = $2;`,
    [workspaceId, entryId]
  );

  if (existingRes.rows.length === 0) {
    throw new NotFoundError(`Journal entry with ID ${entryId} was not found in this workspace.`);
  }

  const existing = existingRes.rows[0]!;
  if (existing.deleted_at) {
    throw new NotFoundError(`Journal entry with ID ${entryId} has been moved to trash.`);
  }

  const currentRev = Number(existing.revision);
  if (input.baseRevision !== undefined && input.baseRevision !== currentRev) {
    throw new ConflictError(
      `Conflict updating journal entry: base revision ${input.baseRevision} does not match current server revision ${currentRev}.`
    );
  }

  // 3. Validate folder if changing
  const nextFolderId = input.folderId !== undefined ? input.folderId : existing.folder_id;
  if (nextFolderId && nextFolderId !== existing.folder_id) {
    const fRes = await client.query<{ id: string; security_scope: string }>(
      `SELECT id, security_scope FROM app.items
       WHERE workspace_id = $1 AND id = $2 AND kind = 'folder' AND deleted_at IS NULL;`,
      [workspaceId, nextFolderId]
    );
    if (fRes.rows.length === 0) {
      throw new ValidationError(
        `Target folder ${nextFolderId} does not exist or has been deleted.`
      );
    }
    if (fRes.rows[0]!.security_scope !== existing.security_scope) {
      throw new ValidationError(
        `Target folder security scope '${fRes.rows[0]!.security_scope}' does not match entry scope '${existing.security_scope}'.`
      );
    }
  }

  // 4. Resolve document, plainText, and title updates
  let document: NoteDocument = existing.document;
  let plainText: string = existing.plain_text;

  if (input.document !== undefined) {
    document = validateNoteDocument(input.document);
    plainText = extractPlainText(document);
  } else if (input.plainText !== undefined) {
    document = createNoteDocumentFromPlainText(input.plainText);
    plainText = input.plainText.trim();
  }

  const title = input.title !== undefined ? validateJournalTitle(input.title) : existing.title;
  const entryDate =
    input.entryDate !== undefined
      ? validateJournalEntryDate(input.entryDate)
      : normalizeDateString(existing.entry_date);
  const timezone =
    input.timezone !== undefined ? validateJournalTimezone(input.timezone) : existing.timezone;
  const mood = input.mood !== undefined ? validateJournalMood(input.mood) : existing.mood;
  const prompts =
    input.prompts !== undefined
      ? validateJournalPrompts(input.prompts)
      : Array.isArray(existing.prompts)
        ? (existing.prompts as JournalPromptItem[])
        : [];
  const tags = input.tags !== undefined ? validateJournalTags(input.tags) : existing.tags;
  const isDraft = input.isDraft !== undefined ? Boolean(input.isDraft) : Boolean(existing.is_draft);
  const isArchived =
    input.isArchived !== undefined ? Boolean(input.isArchived) : Boolean(existing.is_archived);
  const isPinned =
    input.isPinned !== undefined ? Boolean(input.isPinned) : Boolean(existing.is_pinned);

  const wordCount = calculateWordCount(plainText);
  const charCount = calculateCharCount(plainText);
  const nextRevision = currentRev + 1;

  await client.query(
    `UPDATE app.items
     SET folder_id = $1, is_archived = $2, is_pinned = $3, revision = $4,
         updated_by = $5, updated_at = now()
     WHERE workspace_id = $6 AND id = $7;`,
    [nextFolderId, isArchived, isPinned, nextRevision, actorUserId, workspaceId, entryId]
  );

  const updatedRes = await client.query<JournalEntryDbRow>(
    `UPDATE app.journal_entries
     SET title = $1, entry_date = $2, timezone = $3, document = $4, plain_text = $5,
         word_count = $6, char_count = $7, mood = $8, prompts = $9, tags = $10,
         is_draft = $11, updated_at = now()
     WHERE workspace_id = $12 AND id = $13
     RETURNING id, workspace_id, title, entry_date::text as entry_date, timezone, document, plain_text,
               word_count, char_count, mood, prompts, tags, is_draft, created_at, updated_at;`,
    [
      title,
      entryDate,
      timezone,
      JSON.stringify(document),
      plainText,
      wordCount,
      charCount,
      mood,
      JSON.stringify(prompts),
      tags,
      isDraft,
      workspaceId,
      entryId,
    ]
  );

  const updatedRow = updatedRes.rows[0]!;
  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: entryId,
    revision: nextRevision,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      kind: 'journal_entry',
      folderId: nextFolderId,
      title,
      entryDate,
      timezone,
      document,
      plainText,
      wordCount,
      charCount,
      mood,
      prompts,
      tags,
      isDraft,
      isArchived,
      isPinned,
      securityScope: existing.security_scope,
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'journal_entry.updated',
    payload: { entryId, revision: nextRevision, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    id: entryId,
    workspaceId,
    folderId: nextFolderId,
    title,
    entryDate,
    timezone,
    document,
    plainText,
    wordCount,
    charCount,
    mood,
    prompts,
    tags,
    isDraft,
    isArchived,
    isPinned,
    securityScope: existing.security_scope,
    serverRevision: nextRevision,
    createdAt: existing.created_at.toISOString(),
    updatedAt: updatedRow.updated_at.toISOString(),
    deletedAt: null,
    seq,
  };
}

export async function trashJournalEntry(
  client: PoolClient,
  workspaceId: string,
  entryId: string,
  actorUserId: string,
  baseRevision?: number,
  operationId?: string
): Promise<{ seq: number; revision: number }> {
  await assertPersonalWorkspace(client, workspaceId);

  // 1. Acquire lock first before checking revision and authoritative state
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const existingRes = await client.query<{ revision: number; deleted_at: Date | null }>(
    `SELECT revision, deleted_at FROM app.items WHERE workspace_id = $1 AND id = $2 AND kind = 'journal_entry';`,
    [workspaceId, entryId]
  );

  if (existingRes.rows.length === 0) {
    throw new NotFoundError(`Journal entry ${entryId} was not found.`);
  }

  const existing = existingRes.rows[0]!;
  if (existing.deleted_at) {
    return { seq: 0, revision: Number(existing.revision) };
  }

  const currentRev = Number(existing.revision);
  if (baseRevision !== undefined && baseRevision !== currentRev) {
    throw new ConflictError(
      `Conflict trashing journal entry: base revision ${baseRevision} does not match current server revision ${currentRev}.`
    );
  }

  const nextRevision = currentRev + 1;
  const seq = syncState.nextChangeSeq;

  await client.query(
    `UPDATE app.items
     SET deleted_at = now(), revision = $1, updated_by = $2, updated_at = now()
     WHERE workspace_id = $3 AND id = $4;`,
    [nextRevision, actorUserId, workspaceId, entryId]
  );

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: entryId,
    revision: nextRevision,
    isTombstone: true,
    operationId: operationId || crypto.randomUUID(),
    changeData: { kind: 'journal_entry', deleted: true },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'journal_entry.trashed',
    payload: { entryId, revision: nextRevision, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return { seq, revision: nextRevision };
}

export async function restoreJournalEntry(
  client: PoolClient,
  workspaceId: string,
  entryId: string,
  actorUserId: string,
  baseRevision?: number,
  operationId?: string
): Promise<{ seq: number; revision: number; entry: JournalEntry }> {
  await assertPersonalWorkspace(client, workspaceId);

  // 1. Acquire lock first before checking revision and authoritative state
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const existingRes = await client.query<JournalEntryDbRow>(
    `SELECT i.id, i.workspace_id, i.folder_id, i.kind, i.created_by, i.updated_by,
            i.created_at, i.updated_at, i.deleted_at, i.revision, i.rank,
            i.is_archived, i.is_pinned, i.security_scope,
            j.title, j.entry_date::text as entry_date, j.timezone, j.document, j.plain_text,
            j.word_count, j.char_count, j.mood, j.prompts, j.tags, j.is_draft
     FROM app.items i
     JOIN app.journal_entries j ON j.workspace_id = i.workspace_id AND j.id = i.id
     WHERE i.workspace_id = $1 AND i.id = $2;`,
    [workspaceId, entryId]
  );

  if (existingRes.rows.length === 0) {
    throw new NotFoundError(`Journal entry ${entryId} was not found.`);
  }

  const existing = existingRes.rows[0]!;
  if (!existing.deleted_at) {
    return { seq: 0, revision: Number(existing.revision), entry: mapRowToJournalEntry(existing) };
  }

  const currentRev = Number(existing.revision);
  if (baseRevision !== undefined && baseRevision !== currentRev) {
    throw new ConflictError(
      `Conflict restoring journal entry: base revision ${baseRevision} does not match current server revision ${currentRev}.`
    );
  }

  const nextRevision = currentRev + 1;
  const seq = syncState.nextChangeSeq;

  await client.query(
    `UPDATE app.items
     SET deleted_at = NULL, revision = $1, updated_by = $2, updated_at = now()
     WHERE workspace_id = $3 AND id = $4;`,
    [nextRevision, actorUserId, workspaceId, entryId]
  );

  const restoredEntry = mapRowToJournalEntry({
    ...existing,
    revision: nextRevision,
    deleted_at: null,
  });

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: entryId,
    revision: nextRevision,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      kind: 'journal_entry',
      restored: true,
      folderId: existing.folder_id,
      title: existing.title,
      entryDate: normalizeDateString(existing.entry_date),
      timezone: existing.timezone,
      document: existing.document,
      plainText: existing.plain_text,
      wordCount: Number(existing.word_count),
      charCount: Number(existing.char_count),
      mood: existing.mood,
      prompts: Array.isArray(existing.prompts)
        ? existing.prompts
        : typeof existing.prompts === 'string'
          ? JSON.parse(existing.prompts)
          : [],
      tags: Array.isArray(existing.tags) ? existing.tags : [],
      isDraft: Boolean(existing.is_draft),
      isArchived: Boolean(existing.is_archived),
      isPinned: Boolean(existing.is_pinned),
      securityScope: existing.security_scope,
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'journal_entry.restored',
    payload: { entryId, revision: nextRevision, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return { seq, revision: nextRevision, entry: restoredEntry };
}
