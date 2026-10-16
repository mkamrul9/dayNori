import type { PoolClient } from 'pg';
import crypto from 'node:crypto';
import type {
  Note,
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteListQuery,
  NoteDocument,
} from '@daynori/contracts';
import {
  resolveNoteTitle,
  extractPlainText,
  calculateWordCount,
  calculateCharCount,
  validateNoteDocument,
  createEmptyNoteDocument,
  createNoteDocumentFromPlainText,
} from '@daynori/domain';
import {
  lockWorkspaceSyncState,
  insertChange,
  insertOutboxIntent,
  updateWorkspaceSyncSeq,
} from '../sync/repository.js';
import { NotFoundError, ConflictError, ValidationError } from '../../plugins/errorHandler.js';

interface NoteDbRow {
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
  title: string;
  document: NoteDocument;
  plain_text: string;
  word_count: number;
  char_count: number;
}

function mapRowToNote(r: NoteDbRow): Note {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    folderId: r.folder_id,
    title: r.title,
    document: r.document,
    plainText: r.plain_text,
    wordCount: Number(r.word_count),
    charCount: Number(r.char_count),
    rank: r.rank,
    isArchived: r.is_archived,
    isPinned: r.is_pinned,
    securityScope: r.security_scope,
    revision: Number(r.revision),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
  };
}

export type NoteWithSeq = Note & { seq: number };

export async function createNote(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  input: CreateNoteRequest,
  operationId?: string
): Promise<NoteWithSeq> {
  const noteId = input.id || crypto.randomUUID();
  const folderId = input.folderId || null;
  const rank = input.rank || '00001000';
  const isPinned = Boolean(input.isPinned);
  const securityScope = input.securityScope || 'standard';

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
        `Target folder security scope '${fRes.rows[0]!.security_scope}' does not match note scope '${securityScope}'.`
      );
    }
  }

  // 2. Resolve document AST, plain text, title, and counts
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

  const title = resolveNoteTitle(input.title, 'Untitled', plainText);
  const wordCount = calculateWordCount(plainText);
  const charCount = calculateCharCount(plainText);

  // 3. Acquire workspace row-lock
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  // 4. Insert into app.items
  await client.query(
    `INSERT INTO app.items (
      id, workspace_id, folder_id, kind, created_by, updated_by,
      revision, rank, is_archived, is_pinned, security_scope
    ) VALUES ($1, $2, $3, 'note', $4, $4, 1, $5, false, $6, $7);`,
    [noteId, workspaceId, folderId, actorUserId, rank, isPinned, securityScope]
  );

  // 5. Insert into app.notes
  const noteRes = await client.query<NoteDbRow>(
    `INSERT INTO app.notes (
      id, workspace_id, title, document, plain_text, word_count, char_count
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, workspace_id, title, document, plain_text, word_count, char_count, created_at, updated_at;`,
    [noteId, workspaceId, title, JSON.stringify(document), plainText, wordCount, charCount]
  );

  const noteRow = noteRes.rows[0]!;
  const seq = syncState.nextChangeSeq;

  // 6. Record change event and outbox intent
  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: noteId,
    revision: 1,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      kind: 'note',
      title,
      document,
      plainText,
      wordCount,
      charCount,
      folderId,
      rank,
      isPinned,
      isArchived: false,
      securityScope,
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'note.created',
    payload: { noteId, revision: 1, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    id: noteId,
    workspaceId,
    folderId,
    title,
    document,
    plainText,
    wordCount,
    charCount,
    rank,
    isArchived: false,
    isPinned,
    securityScope,
    revision: 1,
    createdAt: noteRow.created_at.toISOString(),
    updatedAt: noteRow.updated_at.toISOString(),
    deletedAt: null,
    seq,
  };
}

export async function getNote(
  client: PoolClient,
  workspaceId: string,
  noteId: string
): Promise<Note> {
  const res = await client.query<NoteDbRow>(
    `SELECT i.id, i.workspace_id, i.folder_id, i.kind, i.created_by, i.updated_by,
            i.created_at, i.updated_at, i.deleted_at, i.revision, i.rank,
            i.is_archived, i.is_pinned, i.security_scope,
            n.title, n.document, n.plain_text, n.word_count, n.char_count
     FROM app.items i
     JOIN app.notes n ON n.workspace_id = i.workspace_id AND n.id = i.id
     WHERE i.workspace_id = $1 AND i.id = $2;`,
    [workspaceId, noteId]
  );

  if (res.rows.length === 0) {
    throw new NotFoundError(`Note with ID ${noteId} was not found in this workspace.`);
  }

  const row = res.rows[0]!;
  if (row.deleted_at) {
    throw new NotFoundError(`Note with ID ${noteId} is in trash.`);
  }

  return mapRowToNote(row);
}

export interface NoteListResult {
  notes: Note[];
  nextCursor?: string;
}

export function encodeNoteCursor(data: {
  isPinned: boolean;
  rank: string;
  updatedAt: string;
  id: string;
}): string {
  return Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
}

export function decodeNoteCursor(
  cursorStr?: string
): { isPinned: boolean; rank: string; updatedAt: string; id: string } | null {
  if (!cursorStr) return null;
  try {
    const raw = Buffer.from(cursorStr, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.updatedAt === 'string'
    ) {
      return {
        isPinned: Boolean(parsed.isPinned),
        rank: String(parsed.rank || '00001000'),
        updatedAt: String(parsed.updatedAt),
        id: String(parsed.id),
      };
    }
  } catch {
    /* ignore invalid cursor */
  }
  return null;
}

export async function listNotes(
  client: PoolClient,
  workspaceId: string,
  query: Partial<NoteListQuery> = {}
): Promise<NoteListResult> {
  const params: unknown[] = [workspaceId];
  let whereClause = `WHERE i.workspace_id = $1 AND i.kind = 'note' AND i.deleted_at IS NULL`;

  if (query.folderId !== undefined) {
    if (query.folderId === null) {
      whereClause += ` AND i.folder_id IS NULL`;
    } else {
      params.push(query.folderId);
      whereClause += ` AND i.folder_id = $${params.length}`;
    }
  }

  if (query.isArchived !== undefined) {
    params.push(query.isArchived);
    whereClause += ` AND i.is_archived = $${params.length}`;
  } else {
    whereClause += ` AND i.is_archived = false`;
  }

  if (query.search && query.search.trim()) {
    params.push(`%${query.search.trim()}%`);
    whereClause += ` AND (n.title ILIKE $${params.length} OR n.plain_text ILIKE $${params.length})`;
  }

  if (query.cursor) {
    const decoded = decodeNoteCursor(query.cursor);
    if (decoded) {
      params.push(decoded.isPinned, decoded.rank, decoded.updatedAt, decoded.id);
      const p1 = params.length - 3;
      const p2 = params.length - 2;
      const p3 = params.length - 1;
      const p4 = params.length;
      whereClause += ` AND (
        (i.is_pinned < $${p1}) OR
        (i.is_pinned = $${p1} AND i.rank > $${p2}) OR
        (i.is_pinned = $${p1} AND i.rank = $${p2} AND i.updated_at < $${p3}) OR
        (i.is_pinned = $${p1} AND i.rank = $${p2} AND i.updated_at = $${p3} AND i.id > $${p4})
      )`;
    }
  }

  const limit = query.limit || 50;
  params.push(limit + 1);

  const sql = `
    SELECT i.id, i.workspace_id, i.folder_id, i.kind, i.created_by, i.updated_by,
           i.created_at, i.updated_at, i.deleted_at, i.revision, i.rank,
           i.is_archived, i.is_pinned, i.security_scope,
           n.title, n.document, n.plain_text, n.word_count, n.char_count
    FROM app.items i
    JOIN app.notes n ON n.workspace_id = i.workspace_id AND n.id = i.id
    ${whereClause}
    ORDER BY i.is_pinned DESC, i.rank ASC, i.updated_at DESC, i.id ASC
    LIMIT $${params.length};
  `;

  const res = await client.query<NoteDbRow>(sql, params);
  const rows = res.rows;
  let nextCursor: string | undefined = undefined;

  if (rows.length > limit) {
    rows.pop();
    const last = rows[rows.length - 1]!;
    nextCursor = encodeNoteCursor({
      isPinned: last.is_pinned,
      rank: last.rank,
      updatedAt: last.updated_at.toISOString(),
      id: last.id,
    });
  }

  return {
    notes: rows.map(mapRowToNote),
    nextCursor,
  };
}

export async function updateNote(
  client: PoolClient,
  workspaceId: string,
  noteId: string,
  actorUserId: string,
  input: UpdateNoteRequest,
  operationId?: string
): Promise<NoteWithSeq> {
  // 1. Acquire workspace sync state row-lock
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  // 2. Fetch existing note with row-level lock
  const res = await client.query<NoteDbRow>(
    `SELECT i.id, i.workspace_id, i.folder_id, i.kind, i.created_by, i.updated_by,
            i.created_at, i.updated_at, i.deleted_at, i.revision, i.rank,
            i.is_archived, i.is_pinned, i.security_scope,
            n.title, n.document, n.plain_text, n.word_count, n.char_count
     FROM app.items i
     JOIN app.notes n ON n.workspace_id = i.workspace_id AND n.id = i.id
     WHERE i.workspace_id = $1 AND i.id = $2
     FOR UPDATE OF i, n;`,
    [workspaceId, noteId]
  );

  if (res.rows.length === 0) {
    throw new NotFoundError(`Note with ID ${noteId} was not found.`);
  }

  const current = res.rows[0]!;
  if (current.deleted_at) {
    throw new NotFoundError(`Note with ID ${noteId} has been deleted.`);
  }

  // 3. Precondition revision check
  const currentRevision = Number(current.revision);
  if (input.baseRevision !== currentRevision) {
    throw new ConflictError(
      `REVISION_CONFLICT: Expected baseRevision ${currentRevision}, but received ${input.baseRevision}.`
    );
  }

  // 4. Verify new folder if folderId was changed
  let newFolderId = current.folder_id;
  if (input.folderId !== undefined) {
    newFolderId = input.folderId;
    if (newFolderId) {
      const fRes = await client.query<{ id: string; security_scope: string }>(
        `SELECT id, security_scope FROM app.items
         WHERE workspace_id = $1 AND id = $2 AND kind = 'folder' AND deleted_at IS NULL;`,
        [workspaceId, newFolderId]
      );
      if (fRes.rows.length === 0) {
        throw new ValidationError(
          `Target folder ${newFolderId} does not exist or has been deleted.`
        );
      }
      if (fRes.rows[0]!.security_scope !== current.security_scope) {
        throw new ValidationError(
          `Target folder security scope '${fRes.rows[0]!.security_scope}' does not match note scope '${current.security_scope}'.`
        );
      }
    }
  }

  // 5. Compute document, plainText, title, and counts
  let newDocument = current.document;
  let newPlainText = current.plain_text;

  if (input.document !== undefined) {
    newDocument = validateNoteDocument(input.document);
    newPlainText = extractPlainText(newDocument);
  } else if (input.plainText !== undefined) {
    newDocument = createNoteDocumentFromPlainText(input.plainText);
    newPlainText = input.plainText.trim();
  }

  const newTitle =
    input.title !== undefined
      ? resolveNoteTitle(input.title, 'Untitled', newPlainText)
      : current.title;
  const newWordCount = calculateWordCount(newPlainText);
  const newCharCount = calculateCharCount(newPlainText);
  const newRank = input.rank !== undefined ? input.rank : current.rank;
  const newIsPinned = input.isPinned !== undefined ? input.isPinned : current.is_pinned;
  const newIsArchived = input.isArchived !== undefined ? input.isArchived : current.is_archived;
  const nextRevision = currentRevision + 1;

  // 6. Update app.items
  await client.query(
    `UPDATE app.items
     SET folder_id = $3,
         rank = $4,
         is_pinned = $5,
         is_archived = $6,
         revision = $7,
         updated_by = $8,
         updated_at = now()
     WHERE workspace_id = $1 AND id = $2;`,
    [
      workspaceId,
      noteId,
      newFolderId,
      newRank,
      newIsPinned,
      newIsArchived,
      nextRevision,
      actorUserId,
    ]
  );

  // 7. Update app.notes
  const updateRes = await client.query<{ updated_at: Date }>(
    `UPDATE app.notes
     SET title = $3,
         document = $4,
         plain_text = $5,
         word_count = $6,
         char_count = $7,
         updated_at = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING updated_at;`,
    [
      workspaceId,
      noteId,
      newTitle,
      JSON.stringify(newDocument),
      newPlainText,
      newWordCount,
      newCharCount,
    ]
  );

  const updatedAt = updateRes.rows[0]!.updated_at.toISOString();
  const seq = syncState.nextChangeSeq;

  // 8. Record change in feed
  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: noteId,
    revision: nextRevision,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      kind: 'note',
      title: newTitle,
      document: newDocument,
      plainText: newPlainText,
      wordCount: newWordCount,
      charCount: newCharCount,
      folderId: newFolderId,
      rank: newRank,
      isPinned: newIsPinned,
      isArchived: newIsArchived,
      securityScope: current.security_scope,
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'note.updated',
    payload: { noteId, revision: nextRevision, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    id: noteId,
    workspaceId,
    folderId: newFolderId,
    title: newTitle,
    document: newDocument,
    plainText: newPlainText,
    wordCount: newWordCount,
    charCount: newCharCount,
    rank: newRank,
    isArchived: newIsArchived,
    isPinned: newIsPinned,
    securityScope: current.security_scope,
    revision: nextRevision,
    createdAt: current.created_at.toISOString(),
    updatedAt,
    deletedAt: null,
    seq,
  };
}

export async function trashNote(
  client: PoolClient,
  workspaceId: string,
  noteId: string,
  actorUserId: string,
  operationId?: string,
  expectedRevision?: number
): Promise<{ id: string; revision: number; seq: number | null }> {
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const res = await client.query<{ revision: string; deleted_at: Date | null }>(
    `SELECT revision, deleted_at FROM app.items
     WHERE workspace_id = $1 AND id = $2 AND kind = 'note'
     FOR UPDATE;`,
    [workspaceId, noteId]
  );

  if (res.rows.length === 0) {
    throw new NotFoundError(`Note with ID ${noteId} was not found.`);
  }

  const current = res.rows[0]!;
  const currentRevision = Number(current.revision);
  if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
    throw new ConflictError(
      `REVISION_CONFLICT: Expected revision ${expectedRevision}, but note is at revision ${currentRevision}.`
    );
  }

  if (current.deleted_at) {
    return { id: noteId, revision: currentRevision, seq: null };
  }

  const nextRevision = currentRevision + 1;
  const seq = syncState.nextChangeSeq;

  await client.query(
    `UPDATE app.items
     SET deleted_at = now(),
         revision = $3,
         updated_by = $4,
         updated_at = now()
     WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, noteId, nextRevision, actorUserId]
  );

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: noteId,
    revision: nextRevision,
    isTombstone: true,
    operationId: operationId || crypto.randomUUID(),
    changeData: { deleted: true },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'note.trashed',
    payload: { noteId, revision: nextRevision, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return { id: noteId, revision: nextRevision, seq };
}

export async function restoreNote(
  client: PoolClient,
  workspaceId: string,
  noteId: string,
  actorUserId: string,
  operationId?: string,
  expectedRevision?: number
): Promise<NoteWithSeq> {
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const res = await client.query<NoteDbRow>(
    `SELECT i.id, i.workspace_id, i.folder_id, i.kind, i.created_by, i.updated_by,
            i.created_at, i.updated_at, i.deleted_at, i.revision, i.rank,
            i.is_archived, i.is_pinned, i.security_scope,
            n.title, n.document, n.plain_text, n.word_count, n.char_count
     FROM app.items i
     JOIN app.notes n ON n.workspace_id = i.workspace_id AND n.id = i.id
     WHERE i.workspace_id = $1 AND i.id = $2
     FOR UPDATE OF i, n;`,
    [workspaceId, noteId]
  );

  if (res.rows.length === 0) {
    throw new NotFoundError(`Note with ID ${noteId} was not found.`);
  }

  const current = res.rows[0]!;
  const currentRevision = Number(current.revision);
  if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
    throw new ConflictError(
      `REVISION_CONFLICT: Expected revision ${expectedRevision}, but note is at revision ${currentRevision}.`
    );
  }

  if (!current.deleted_at) {
    return { ...mapRowToNote(current), seq: 0 };
  }

  const nextRevision = currentRevision + 1;
  const seq = syncState.nextChangeSeq;

  await client.query(
    `UPDATE app.items
     SET deleted_at = NULL,
         revision = $3,
         updated_by = $4,
         updated_at = now()
     WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, noteId, nextRevision, actorUserId]
  );

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: noteId,
    revision: nextRevision,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      kind: 'note',
      title: current.title,
      document: current.document,
      plainText: current.plain_text,
      wordCount: current.word_count,
      charCount: current.char_count,
      folderId: current.folder_id,
      rank: current.rank,
      isPinned: current.is_pinned,
      isArchived: current.is_archived,
      securityScope: current.security_scope,
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'note.restored',
    payload: { noteId, revision: nextRevision, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    ...mapRowToNote(current),
    revision: nextRevision,
    deletedAt: null,
    seq,
  };
}
