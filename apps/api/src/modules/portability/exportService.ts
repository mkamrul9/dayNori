import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import type {
  ExportManifest,
  ExportManifestSummary,
  ExportManifestExclusion,
  CreateExportResponse,
} from '@daynori/contracts';
import { createZipArchive, type ZipEntry } from './zipArchive.js';
import { getDefaultStorageProvider } from '../files/storageAdapter.js';
import { PRIVATE_ASSETS_BUCKET } from '../files/service.js';
import { NotFoundError, ForbiddenError } from '../../plugins/errorHandler.js';

export interface StoredExport {
  exportId: string;
  workspaceId: string;
  userId: string;
  archiveBuffer: Buffer;
  manifest: ExportManifest;
  createdAt: number;
  expiresAt: number;
}

// In-memory ephemeral storage for generated exports (15 minutes TTL)
const ephemeralExportStore = new Map<string, StoredExport>();

export const EXPORT_TTL_SECONDS = 15 * 60; // 15 minutes

export function getEphemeralExport(exportId: string): StoredExport | undefined {
  const item = ephemeralExportStore.get(exportId);
  if (!item) return undefined;
  if (Date.now() > item.expiresAt) {
    ephemeralExportStore.delete(exportId);
    return undefined;
  }
  return item;
}

export function cleanupExpiredExports(): void {
  const now = Date.now();
  for (const [id, item] of ephemeralExportStore.entries()) {
    if (now > item.expiresAt) {
      ephemeralExportStore.delete(id);
    }
  }
}

/**
 * Escapes values into a CSV row.
 */
function toCsvRow(values: unknown[]): string {
  return values
    .map((v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(',');
}

/**
 * Sanitizes a title for safe filename slug generation.
 */
function toSafeSlug(title: string | null | undefined, fallback: string): string {
  if (!title) return fallback;
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40);
  return slug || fallback;
}

export async function generateWorkspaceExport(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  includeAttachments = true
): Promise<CreateExportResponse> {
  // 1. Authorize actor (editor or owner)
  const roleCheck = await client.query<{ role: string }>(
    `SELECT role FROM app.workspace_memberships WHERE workspace_id = $1 AND user_id = $2;`,
    [workspaceId, actorUserId]
  );
  if (!roleCheck.rows[0] || (roleCheck.rows[0].role !== 'owner' && roleCheck.rows[0].role !== 'editor')) {
    throw new ForbiddenError('You do not have editor permission to export this workspace');
  }

  // 2. Fetch workspace metadata
  const wsRes = await client.query<{
    id: string;
    name: string;
    kind: string;
    time_zone?: string;
    preferred_locale?: string;
  }>(`SELECT id, name, kind FROM app.workspaces WHERE id = $1;`, [workspaceId]);

  if (!wsRes.rows[0]) {
    throw new NotFoundError('Workspace not found');
  }
  const ws = wsRes.rows[0];

  // 3. Exclusions documentation
  const exclusions: ExportManifestExclusion[] = [
    {
      category: 'vault',
      reason:
        'Vault data requires separate end-to-end encrypted export or local unlock; excluded from server workspace export',
    },
    {
      category: 'external_drive',
      reason:
        'External Google Drive mirrors require separate provider re-authorization and are not stored in core export',
    },
  ];

  const zipEntries: ZipEntry[] = [];
  const checksums: Record<string, string> = {};

  // 4. Folders
  const foldersRes = await client.query<{
    id: string;
    parent_id: string | null;
    name: string;
    color: string | null;
    icon: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT f.id, f.parent_id, f.name, f.color, f.icon, f.created_at, f.updated_at
     FROM app.folders f
     JOIN app.items i ON i.id = f.id AND i.workspace_id = f.workspace_id
     WHERE f.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope != 'vault'
     ORDER BY f.name ASC;`,
    [workspaceId]
  );
  const folders = foldersRes.rows.map((f, i) => ({
    id: f.id,
    parentId: f.parent_id,
    name: f.name,
    color: f.color,
    icon: f.icon,
    sortOrder: i,
    createdAt: f.created_at.toISOString(),
    updatedAt: f.updated_at.toISOString(),
  }));

  zipEntries.push({
    path: 'metadata/folders.json',
    data: JSON.stringify(folders, null, 2),
  });

  const folderCsvRows = [
    'id,parentId,name,color,icon,sortOrder,createdAt,updatedAt',
    ...folders.map((f) =>
      toCsvRow([f.id, f.parentId, f.name, f.color, f.icon, f.sortOrder, f.createdAt, f.updatedAt])
    ),
  ];
  zipEntries.push({
    path: 'metadata/folders.csv',
    data: folderCsvRows.join('\n'),
  });

  // 5. Tags
  const tagsRes = await client.query<{
    id: string;
    name: string;
    color: string | null;
    created_at: Date;
  }>(`SELECT id, name, color, created_at FROM app.tags WHERE workspace_id = $1;`, [workspaceId]);
  const tags = tagsRes.rows.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    createdAt: t.created_at.toISOString(),
  }));
  zipEntries.push({
    path: 'metadata/tags.json',
    data: JSON.stringify(tags, null, 2),
  });

  // 6. Saved Views
  const viewsRes = await client.query<{
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    entity_type: string;
    filter: unknown;
    rank: string;
    is_pinned: boolean;
    created_at: Date;
  }>(
    `SELECT id, name, icon, color, entity_type, filter, rank, is_pinned, created_at
     FROM app.saved_views
     WHERE workspace_id = $1
     ORDER BY rank ASC;`,
    [workspaceId]
  );
  const savedViews = viewsRes.rows.map((v) => ({
    id: v.id,
    name: v.name,
    icon: v.icon,
    color: v.color,
    entityType: v.entity_type,
    filter: v.filter,
    rank: v.rank,
    isPinned: v.is_pinned,
    createdAt: v.created_at.toISOString(),
  }));
  zipEntries.push({
    path: 'metadata/saved_views.json',
    data: JSON.stringify(savedViews, null, 2),
  });

  // 7. Notes
  const notesRes = await client.query<{
    id: string;
    folder_id: string | null;
    title: string;
    document: unknown;
    plain_text: string;
    word_count: number;
    char_count: number;
    is_pinned: boolean;
    is_archived: boolean;
    purpose?: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT i.id, i.folder_id, n.title, n.document, n.plain_text, n.word_count, n.char_count,
            i.is_pinned, i.is_archived, n.created_at, n.updated_at
     FROM app.notes n
     JOIN app.items i ON i.id = n.id AND i.workspace_id = n.workspace_id
     WHERE n.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope != 'vault'
     ORDER BY n.updated_at DESC;`,
    [workspaceId]
  );

  const notesList = notesRes.rows.map((n) => ({
    id: n.id,
    folderId: n.folder_id,
    title: n.title,
    document: n.document,
    plainText: n.plain_text,
    wordCount: n.word_count,
    charCount: n.char_count,
    isPinned: Boolean(n.is_pinned),
    isArchived: Boolean(n.is_archived),
    purpose: n.purpose || 'standard',
    createdAt: n.created_at.toISOString(),
    updatedAt: n.updated_at.toISOString(),
  }));

  zipEntries.push({
    path: 'notes/notes.json',
    data: JSON.stringify(notesList, null, 2),
  });

  for (const note of notesList) {
    const slug = toSafeSlug(note.title, 'note');
    const mdContent = `---
id: "${note.id}"
title: ${JSON.stringify(note.title)}
folderId: ${note.folderId ? `"${note.folderId}"` : 'null'}
purpose: "${note.purpose}"
isPinned: ${note.isPinned}
isArchived: ${note.isArchived}
createdAt: "${note.createdAt}"
updatedAt: "${note.updatedAt}"
---

${note.plainText || ''}
`;
    zipEntries.push({
      path: `notes/markdown/${note.id}_${slug}.md`,
      data: mdContent,
    });
  }

  // 8. Tasks
  const tasksRes = await client.query<{
    id: string;
    folder_id: string | null;
    title: string;
    details: string | null;
    priority: string;
    status: string;
    deadline_type: string;
    deadline_date: string | null;
    deadline_time: Date | null;
    deadline_zone: string | null;
    completed_at: Date | null;
    parent_id: string | null;
    tags: string[];
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT t.id, i.folder_id, t.title, t.details, t.priority, t.status, t.deadline_type,
            t.deadline_date, t.deadline_time, t.deadline_zone, t.completed_at, t.parent_id,
            t.tags, t.created_at, t.updated_at
     FROM app.tasks t
     JOIN app.items i ON i.id = t.id AND i.workspace_id = t.workspace_id
     WHERE t.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope != 'vault'
     ORDER BY t.created_at ASC;`,
    [workspaceId]
  );

  const tasksList = tasksRes.rows.map((t) => ({
    id: t.id,
    folderId: t.folder_id,
    title: t.title,
    details: t.details,
    priority: t.priority,
    status: t.status,
    deadlineType: t.deadline_type,
    deadlineDate: t.deadline_date,
    deadlineTime: t.deadline_time ? t.deadline_time.toISOString() : null,
    deadlineZone: t.deadline_zone,
    completedAt: t.completed_at ? t.completed_at.toISOString() : null,
    parentId: t.parent_id,
    tags: t.tags || [],
    createdAt: t.created_at.toISOString(),
    updatedAt: t.updated_at.toISOString(),
  }));

  zipEntries.push({
    path: 'tasks/tasks.json',
    data: JSON.stringify(tasksList, null, 2),
  });

  const taskCsvRows = [
    'id,folderId,title,priority,status,deadlineType,deadlineDate,deadlineTime,completedAt,createdAt,updatedAt',
    ...tasksList.map((t) =>
      toCsvRow([
        t.id,
        t.folderId,
        t.title,
        t.priority,
        t.status,
        t.deadlineType,
        t.deadlineDate,
        t.deadlineTime,
        t.completedAt,
        t.createdAt,
        t.updatedAt,
      ])
    ),
  ];
  zipEntries.push({
    path: 'tasks/tasks.csv',
    data: taskCsvRows.join('\n'),
  });

  // 9. Routines
  const routinesRes = await client.query<{
    id: string;
    folder_id: string | null;
    title: string;
    details: string | null;
    frequency: string;
    weekdays: number[];
    timezone: string;
    scheduled_time: string | null;
    active_from: Date;
    active_to: Date | null;
    is_paused: boolean;
    is_archived: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT r.id, r.folder_id, r.title, r.details, r.frequency, r.weekdays, r.timezone,
            r.scheduled_time, r.active_from, r.active_to, r.is_paused, r.is_archived,
            r.created_at, r.updated_at
     FROM app.routines r
     JOIN app.items i ON i.id = r.id AND i.workspace_id = r.workspace_id
     WHERE r.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope != 'vault'
     ORDER BY r.title ASC;`,
    [workspaceId]
  );

  const routinesList = routinesRes.rows.map((r) => ({
    id: r.id,
    folderId: r.folder_id,
    title: r.title,
    details: r.details,
    frequency: r.frequency,
    weekdays: r.weekdays,
    timezone: r.timezone,
    scheduledTime: r.scheduled_time,
    activeFrom: r.active_from.toISOString().split('T')[0],
    activeTo: r.active_to ? r.active_to.toISOString().split('T')[0] : null,
    isPaused: Boolean(r.is_paused),
    isArchived: Boolean(r.is_archived),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));

  zipEntries.push({
    path: 'routines/routines.json',
    data: JSON.stringify(routinesList, null, 2),
  });

  // 10. Journal Entries
  const journalRes = await client.query<{
    id: string;
    title: string | null;
    entry_date: string | Date;
    timezone: string;
    document: unknown;
    plain_text: string;
    mood: string | null;
    prompts: unknown;
    tags: string[];
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT j.id, j.title, j.entry_date::text as entry_date, j.timezone, j.document, j.plain_text,
            j.mood, j.prompts, j.tags, j.created_at, j.updated_at
     FROM app.journal_entries j
     JOIN app.items i ON i.id = j.id AND i.workspace_id = j.workspace_id
     WHERE j.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope != 'vault'
     ORDER BY j.entry_date DESC;`,
    [workspaceId]
  );

  const journalList = journalRes.rows.map((j) => {
    const rawDate = typeof j.entry_date === 'string' ? j.entry_date : (j.entry_date as Date).toISOString().split('T')[0];
    return {
      id: j.id,
      title: j.title,
      entryDate: rawDate,
      timezone: j.timezone,
      document: j.document,
      plainText: j.plain_text,
      mood: j.mood,
      prompts: j.prompts,
      tags: j.tags || [],
      createdAt: j.created_at.toISOString(),
      updatedAt: j.updated_at.toISOString(),
    };
  });

  zipEntries.push({
    path: 'journal/journal.json',
    data: JSON.stringify(journalList, null, 2),
  });

  const journalCsvRows = [
    'id,entryDate,title,mood,timezone,createdAt,updatedAt',
    ...journalList.map((j) =>
      toCsvRow([j.id, j.entryDate, j.title, j.mood, j.timezone, j.createdAt, j.updatedAt])
    ),
  ];
  zipEntries.push({
    path: 'journal/journal.csv',
    data: journalCsvRows.join('\n'),
  });

  for (const j of journalList) {
    const mdContent = `---
id: "${j.id}"
entryDate: "${j.entryDate}"
title: ${JSON.stringify(j.title || '')}
mood: "${j.mood || ''}"
timezone: "${j.timezone}"
tags: ${JSON.stringify(j.tags)}
createdAt: "${j.createdAt}"
updatedAt: "${j.updatedAt}"
---

${j.plainText || ''}
`;
    zipEntries.push({
      path: `journal/markdown/${j.entryDate}_${j.id}.md`,
      data: mdContent,
    });
  }

  // 11. Calendar Events
  const calRes = await client.query<{
    id: string;
    folder_id: string | null;
    title: string;
    details: string | null;
    all_day: boolean;
    start_date: Date | null;
    end_date: Date | null;
    start_at: Date | null;
    end_at: Date | null;
    timezone: string;
    is_archived: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT c.id, c.folder_id, c.title, c.details, c.all_day, c.start_date, c.end_date,
            c.start_at, c.end_at, c.timezone, c.is_archived, c.created_at, c.updated_at
     FROM app.calendar_events c
     JOIN app.items i ON i.id = c.id AND i.workspace_id = c.workspace_id
     WHERE c.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope != 'vault'
     ORDER BY c.created_at ASC;`,
    [workspaceId]
  );

  const calList = calRes.rows.map((c) => ({
    id: c.id,
    folderId: c.folder_id,
    title: c.title,
    details: c.details,
    allDay: Boolean(c.all_day),
    startDate: c.start_date ? c.start_date.toISOString().split('T')[0] : null,
    endDate: c.end_date ? c.end_date.toISOString().split('T')[0] : null,
    startAt: c.start_at ? c.start_at.toISOString() : null,
    endAt: c.end_at ? c.end_at.toISOString() : null,
    timezone: c.timezone,
    isArchived: Boolean(c.is_archived),
    createdAt: c.created_at.toISOString(),
    updatedAt: c.updated_at.toISOString(),
  }));

  zipEntries.push({
    path: 'calendar/calendar.json',
    data: JSON.stringify(calList, null, 2),
  });

  // 12. Attachments & File Binaries
  const filesRes = await client.query<{
    id: string;
    folder_id: string | null;
    file_name: string;
    declared_mime_type: string;
    detected_mime_type: string;
    byte_size: string | number;
    sha256_checksum: string;
    object_path: string;
    quarantine_status: string;
    created_at: Date;
  }>(
    `SELECT f.id, f.folder_id, f.file_name, f.declared_mime_type, f.detected_mime_type,
            f.byte_size, f.sha256_checksum, f.object_path, f.quarantine_status, f.created_at
     FROM app.file_items f
     JOIN app.items i ON i.id = f.id AND i.workspace_id = f.workspace_id
     WHERE f.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope != 'vault'
     ORDER BY f.created_at ASC;`,
    [workspaceId]
  );

  const storage = getDefaultStorageProvider();
  let totalBinaryBytes = 0;
  const exportedFiles = [];

  for (const f of filesRes.rows) {
    const isClean = f.quarantine_status === 'verified';
    const binaryFilename = `${f.id}_${f.file_name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    let binaryExported = false;

    if (includeAttachments && isClean) {
      try {
        const bytes = await storage.getObject(PRIVATE_ASSETS_BUCKET, f.object_path);
        if (bytes) {
          const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
          const archiveRelativePath = `attachments/binaries/${binaryFilename}`;
          zipEntries.push({
            path: archiveRelativePath,
            data: bytes,
          });
          checksums[archiveRelativePath] = actualSha256;
          totalBinaryBytes += bytes.length;
          binaryExported = true;
        }
      } catch {
        /* attachment binary not locally in storage; recorded as metadata-only */
      }
    }

    exportedFiles.push({
      id: f.id,
      folderId: f.folder_id,
      fileName: f.file_name,
      declaredMimeType: f.declared_mime_type,
      detectedMimeType: f.detected_mime_type,
      byteSize: Number(f.byte_size),
      sha256: f.sha256_checksum,
      quarantineStatus: f.quarantine_status,
      binaryExported,
      binaryPath: binaryExported ? `attachments/binaries/${binaryFilename}` : null,
      createdAt: f.created_at.toISOString(),
    });
  }

  zipEntries.push({
    path: 'attachments/files.json',
    data: JSON.stringify(exportedFiles, null, 2),
  });

  // 13. Manifest
  const summary: ExportManifestSummary = {
    foldersCount: folders.length,
    notesCount: notesList.length,
    tasksCount: tasksList.length,
    routinesCount: routinesList.length,
    journalCount: journalList.length,
    calendarCount: calList.length,
    filesCount: exportedFiles.length,
    totalBinaryBytes,
  };

  const manifest: ExportManifest = {
    schemaVersion: 1,
    exportVersion: '1.0.0',
    createdAt: new Date().toISOString(),
    workspace: {
      id: ws.id,
      name: ws.name,
      kind: ws.kind,
      timeZone: ws.time_zone || 'UTC',
      preferredLocale: ws.preferred_locale || 'en',
    },
    exportedBy: {
      userId: actorUserId,
    },
    format: 'daynori-workspace-export-v1',
    summary,
    checksums,
    exclusions,
  };

  zipEntries.push({
    path: 'manifest.json',
    data: JSON.stringify(manifest, null, 2),
  });

  // 14. Build ZIP Archive Buffer
  const archiveBuffer = createZipArchive(zipEntries);

  // 15. Store in ephemeral export cache
  const exportId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + EXPORT_TTL_SECONDS * 1000;

  cleanupExpiredExports();
  ephemeralExportStore.set(exportId, {
    exportId,
    workspaceId,
    userId: actorUserId,
    archiveBuffer,
    manifest,
    createdAt: now,
    expiresAt,
  });

  // Generate signed ephemeral download token
  const downloadToken = crypto
    .createHmac('sha256', process.env['REAUTH_SIGNING_SECRET'] || 'daynori-reauth-fallback-secret-2026')
    .update(`${exportId}:${workspaceId}:${actorUserId}:${expiresAt}`)
    .digest('hex');

  const downloadUrl = `/v1/workspaces/${workspaceId}/export/download/${exportId}?token=${downloadToken}&expires=${expiresAt}`;

  return {
    exportId,
    status: 'completed',
    downloadUrl,
    expiresAt: new Date(expiresAt).toISOString(),
    manifestSummary: summary,
    exclusions,
  };
}
