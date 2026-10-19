import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import type {
  ExportManifest,
  ExportManifestSummary,
  ExportManifestExclusion,
  CreateExportResponse,
} from '@daynori/contracts';
import { createZipArchive, type ZipEntry } from './zipArchive.js';
import { getDefaultStorageProvider, type StorageProviderContract } from '../files/storageAdapter.js';
import { PRIVATE_ASSETS_BUCKET } from '../files/service.js';
import { NotFoundError, ForbiddenError } from '../../plugins/errorHandler.js';
import { getReauthSecret } from './reauth.js';
import { formatMinorUnitsToDecimal } from '@daynori/domain';

export const EXPORT_TTL_SECONDS = 15 * 60; // 15 minutes

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

export function generateDownloadToken(
  exportId: string,
  workspaceId: string,
  userId: string,
  expiresAtMs: number
): string {
  return crypto
    .createHmac('sha256', getReauthSecret())
    .update(`${exportId}:${workspaceId}:${userId}:${expiresAtMs}`)
    .digest('hex');
}

export function verifyDownloadToken(
  token: string,
  exportId: string,
  workspaceId: string,
  userId: string,
  expiresAtMs: number
): boolean {
  const expected = generateDownloadToken(exportId, workspaceId, userId, expiresAtMs);
  const tokenBuf = Buffer.from(token, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (tokenBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(tokenBuf, expectedBuf);
}

/**
 * Creates and persists a durable workspace export record, captures metadata snapshot,
 * builds the ZIP archive, and stores it in private artifact storage.
 */
export async function generateWorkspaceExport(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  includeAttachments = true,
  sessionToken?: string,
  storageProvider: StorageProviderContract = getDefaultStorageProvider()
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
  const folders = foldersRes.rows.map((f) => ({
    id: f.id,
    parentId: f.parent_id,
    name: f.name,
    color: f.color,
    icon: f.icon,
    createdAt: f.created_at.toISOString(),
    updatedAt: f.updated_at.toISOString(),
  }));
  zipEntries.push({
    path: 'metadata/folders.json',
    data: JSON.stringify(folders, null, 2),
  });

  const foldersCsvRows = [
    'id,parentId,name,color,icon,createdAt,updatedAt',
    ...folders.map((f) =>
      toCsvRow([f.id, f.parentId, f.name, f.color, f.icon, f.createdAt, f.updatedAt])
    ),
  ];
  zipEntries.push({
    path: 'metadata/folders.csv',
    data: foldersCsvRows.join('\n'),
  });

  // 5. Tags
  const tagsRes = await client.query<{
    id: string;
    name: string;
    color: string | null;
    created_at: Date;
  }>(
    `SELECT id, name, color, created_at
     FROM app.tags
     WHERE workspace_id = $1
     ORDER BY name ASC;`,
    [workspaceId]
  );
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

  // 6. Saved views
  const viewsRes = await client.query<{
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    entity_type: string;
    filter: unknown;
    rank: number;
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

  // 6b. Item Tags & Item Links
  const itemTagsRes = await client.query<{ item_id: string; tag_id: string }>(
    `SELECT it.item_id, it.tag_id
     FROM app.item_tags it
     JOIN app.items i ON i.id = it.item_id AND i.workspace_id = $1
     WHERE i.deleted_at IS NULL AND i.security_scope != 'vault';`,
    [workspaceId]
  );
  zipEntries.push({
    path: 'metadata/item_tags.json',
    data: JSON.stringify(
      itemTagsRes.rows.map((r) => ({ itemId: r.item_id, tagId: r.tag_id })),
      null,
      2
    ),
  });

  const itemLinksRes = await client.query<{
    source_item_id: string;
    target_item_id: string;
    link_type: string;
  }>(
    `SELECT il.source_item_id, il.target_item_id, il.link_type
     FROM app.item_links il
     JOIN app.items s ON s.id = il.source_item_id AND s.workspace_id = $1
     WHERE s.deleted_at IS NULL AND s.security_scope != 'vault';`,
    [workspaceId]
  );
  zipEntries.push({
    path: 'metadata/item_links.json',
    data: JSON.stringify(
      itemLinksRes.rows.map((r) => ({
        sourceItemId: r.source_item_id,
        targetItemId: r.target_item_id,
        relationshipKind: r.link_type,
      })),
      null,
      2
    ),
  });

  // 7. Notes (Preserving purpose for knowledge classification round trip!)
  const notesRes = await client.query<{
    id: string;
    folder_id: string | null;
    title: string;
    document: unknown;
    plain_text: string;
    word_count: number;
    char_count: number;
    purpose?: string | null;
    is_pinned: boolean;
    is_archived: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT i.id, i.folder_id, n.title, n.document, n.plain_text, n.word_count, n.char_count, n.purpose,
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
    purpose: n.purpose || 'general',
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

# ${note.title}

${note.plainText}
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
    deadline_date: string | Date | null;
    deadline_time: string | null;
    deadline_zone: string | null;
    completed_at: Date | null;
    parent_id: string | null;
    tags: string[];
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT t.id, i.folder_id, t.title, t.details, t.priority, t.status,
            t.deadline_type, t.deadline_date::text as deadline_date, t.deadline_time, t.deadline_zone,
            t.completed_at, t.parent_id, t.tags, t.created_at, t.updated_at
     FROM app.tasks t
     JOIN app.items i ON i.id = t.id AND i.workspace_id = t.workspace_id
     WHERE t.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope != 'vault'
     ORDER BY t.created_at DESC;`,
    [workspaceId]
  );

  const tasksList = tasksRes.rows.map((t) => {
    const rawDate = typeof t.deadline_date === 'string' ? t.deadline_date : t.deadline_date ? (t.deadline_date as Date).toISOString().split('T')[0] : null;
    return {
      id: t.id,
      folderId: t.folder_id,
      title: t.title,
      details: t.details,
      priority: t.priority,
      status: t.status,
      deadlineType: t.deadline_type,
      deadlineDate: rawDate,
      deadlineTime: t.deadline_time,
      deadlineZone: t.deadline_zone,
      completedAt: t.completed_at ? t.completed_at.toISOString() : null,
      parentId: t.parent_id,
      tags: t.tags || [],
      createdAt: t.created_at.toISOString(),
      updatedAt: t.updated_at.toISOString(),
    };
  });

  zipEntries.push({
    path: 'tasks/tasks.json',
    data: JSON.stringify(tasksList, null, 2),
  });

  const tasksCsvRows = [
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
    data: tasksCsvRows.join('\n'),
  });

  // 9. Routines & Occurrence History
  const routinesRes = await client.query<{
    id: string;
    title: string;
    frequency: string;
    scheduled_time: string;
    timezone: string;
    weekdays: number[];
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT r.id, r.title, r.frequency, r.scheduled_time, r.timezone, r.weekdays, r.created_at, r.updated_at
     FROM app.routines r
     JOIN app.items i ON i.id = r.id AND i.workspace_id = r.workspace_id
     WHERE r.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope != 'vault'
     ORDER BY r.created_at DESC;`,
    [workspaceId]
  );
  const routinesList = routinesRes.rows.map((r) => ({
    id: r.id,
    title: r.title,
    frequency: r.frequency,
    scheduledTime: r.scheduled_time,
    timezone: r.timezone,
    weekdays: r.weekdays,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
  zipEntries.push({
    path: 'routines/routines.json',
    data: JSON.stringify(routinesList, null, 2),
  });

  const occRes = await client.query<{
    id: string;
    routine_id: string;
    occurrence_date: string | Date;
    status: string;
    completed_at: Date | null;
  }>(
    `SELECT ro.id, ro.routine_id, ro.scheduled_date::text as occurrence_date, ro.status, ro.completed_at
     FROM app.routine_occurrences ro
     WHERE ro.workspace_id = $1
     ORDER BY ro.scheduled_date DESC;`,
    [workspaceId]
  );
  zipEntries.push({
    path: 'routines/occurrences.json',
    data: JSON.stringify(
      occRes.rows.map((o) => ({
        id: o.id,
        routineId: o.routine_id,
        occurrenceDate: typeof o.occurrence_date === 'string' ? o.occurrence_date : (o.occurrence_date as Date).toISOString().split('T')[0],
        status: o.status,
        completedAt: o.completed_at ? o.completed_at.toISOString() : null,
      })),
      null,
      2
    ),
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
createdAt: "${j.createdAt}"
updatedAt: "${j.updatedAt}"
---

# ${j.title || `Journal: ${j.entryDate}`}

${j.plainText}
`;
    zipEntries.push({
      path: `journal/markdown/${j.entryDate}_${j.id}.md`,
      data: mdContent,
    });
  }

  // 11. Calendar Events
  const calRes = await client.query<{
    id: string;
    title: string;
    details: string | null;
    start_date: string | Date;
    end_date: string | Date | null;
    all_day: boolean;
    start_at: Date | null;
    end_at: Date | null;
    timezone: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT c.id, c.title, c.details, c.start_date::text as start_date, c.end_date::text as end_date,
            c.all_day, c.start_at, c.end_at, c.timezone, c.created_at, c.updated_at
     FROM app.calendar_events c
     JOIN app.items i ON i.id = c.id AND i.workspace_id = c.workspace_id
     WHERE c.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope != 'vault'
     ORDER BY c.start_date DESC;`,
    [workspaceId]
  );
  const calList = calRes.rows.map((c) => {
    const rawStart = typeof c.start_date === 'string' ? c.start_date : (c.start_date as Date).toISOString().split('T')[0];
    const rawEnd = c.end_date ? (typeof c.end_date === 'string' ? c.end_date : (c.end_date as Date).toISOString().split('T')[0]) : null;
    return {
      id: c.id,
      title: c.title,
      details: c.details,
      startDate: rawStart,
      endDate: rawEnd,
      isAllDay: Boolean(c.all_day),
      startAt: c.start_at ? c.start_at.toISOString() : null,
      endAt: c.end_at ? c.end_at.toISOString() : null,
      timezone: c.timezone,
      createdAt: c.created_at.toISOString(),
      updatedAt: c.updated_at.toISOString(),
    };
  });
  zipEntries.push({
    path: 'calendar/calendar.json',
    data: JSON.stringify(calList, null, 2),
  });

  // 12. File Items and Attachments
  const filesRes = await client.query<{
    id: string;
    folder_id: string | null;
    file_name: string;
    declared_mime_type: string;
    detected_mime_type: string;
    byte_size: string | number;
    sha256_checksum: string;
    quarantine_status: string;
    storage_path: string;
    created_at: Date;
  }>(
    `SELECT fi.id, i.folder_id, fi.file_name, fi.declared_mime_type, fi.detected_mime_type,
            fi.byte_size, fi.sha256_checksum, fi.quarantine_status, fi.object_path as storage_path, fi.created_at
     FROM app.file_items fi
     JOIN app.items i ON i.id = fi.id AND i.workspace_id = fi.workspace_id
     WHERE fi.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope != 'vault'
     ORDER BY fi.created_at DESC;`,
    [workspaceId]
  );

  const exportedFiles: unknown[] = [];
  let totalBinaryBytes = 0;

  for (const f of filesRes.rows) {
    let binaryExported = false;
    const binaryFilename = `${f.id}_${f.file_name}`;

    if (includeAttachments && f.storage_path) {
      try {
        const binaryBytes = await storageProvider.getObject(PRIVATE_ASSETS_BUCKET, f.storage_path);
        if (binaryBytes) {
          zipEntries.push({
            path: `attachments/binaries/${binaryFilename}`,
            data: binaryBytes,
          });
          const sha = crypto.createHash('sha256').update(binaryBytes).digest('hex');
          checksums[`attachments/binaries/${binaryFilename}`] = sha;
          totalBinaryBytes += binaryBytes.length;
          binaryExported = true;
        }
      } catch {
        // Log or note missing binary without stranding export
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

  // 12b. Expenses & Financial Records
  const expCategoriesRes = await client.query<{
    id: string;
    name: string;
    color: string | null;
    icon: string | null;
    display_order: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, name, color, icon, display_order, created_at, updated_at
     FROM app.expense_categories
     WHERE workspace_id = $1 AND deleted_at IS NULL
     ORDER BY display_order ASC, name ASC;`,
    [workspaceId]
  );
  const expenseCategories = expCategoriesRes.rows.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    icon: c.icon,
    displayOrder: c.display_order,
    createdAt: c.created_at.toISOString(),
    updatedAt: c.updated_at.toISOString(),
  }));
  zipEntries.push({
    path: 'expenses/categories.json',
    data: JSON.stringify(expenseCategories, null, 2),
  });

  const expRecurringRes = await client.query<{
    id: string;
    title: string;
    kind: string;
    amount_minor_units: string;
    currency: string;
    category_id: string | null;
    payment_label: string | null;
    note: string | null;
    schedule: unknown;
    timezone: string;
    start_date: string | Date;
    end_date: string | Date | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, title, kind, amount_minor_units::text as amount_minor_units, currency,
            category_id, payment_label, note, schedule, timezone,
            start_date::text as start_date, end_date::text as end_date,
            is_active, created_at, updated_at
     FROM app.expense_recurring_templates
     WHERE workspace_id = $1
     ORDER BY created_at ASC;`,
    [workspaceId]
  );
  const expenseRecurringTemplates = expRecurringRes.rows.map((t) => ({
    id: t.id,
    title: t.title,
    kind: t.kind,
    amountMinor: t.amount_minor_units,
    amount: formatMinorUnitsToDecimal(t.amount_minor_units, t.currency),
    currency: t.currency,
    categoryId: t.category_id,
    paymentLabel: t.payment_label,
    note: t.note,
    schedule: t.schedule,
    timezone: t.timezone,
    startDate:
      typeof t.start_date === 'string'
        ? t.start_date
        : (t.start_date as Date).toISOString().split('T')[0],
    endDate: t.end_date
      ? typeof t.end_date === 'string'
        ? t.end_date
        : (t.end_date as Date).toISOString().split('T')[0]
      : null,
    isActive: t.is_active,
    createdAt: t.created_at.toISOString(),
    updatedAt: t.updated_at.toISOString(),
  }));
  zipEntries.push({
    path: 'expenses/recurring_templates.json',
    data: JSON.stringify(expenseRecurringTemplates, null, 2),
  });

  const expensesRes = await client.query<{
    id: string;
    folder_id: string | null;
    category_id: string | null;
    receipt_file_id: string | null;
    original_expense_id: string | null;
    transaction_date: string | Date;
    currency: string;
    amount_minor_units: string;
    kind: string;
    payment_label: string | null;
    note: string | null;
    timezone: string;
    cumulative_refund_minor_units: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT e.id, i.folder_id, e.category_id, e.receipt_file_id, e.original_expense_id,
            e.transaction_date::text as transaction_date, e.currency,
            e.amount_minor_units::text as amount_minor_units,
            e.kind, e.payment_label, e.note, e.timezone,
            e.cumulative_refund_minor_units::text as cumulative_refund_minor_units,
            e.created_at, e.updated_at
     FROM app.expense_items e
     JOIN app.items i ON i.id = e.id AND i.workspace_id = e.workspace_id
     WHERE e.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope != 'vault'
     ORDER BY e.transaction_date DESC, e.id DESC;`,
    [workspaceId]
  );
  const expensesList = expensesRes.rows.map((e) => ({
    id: e.id,
    folderId: e.folder_id,
    categoryId: e.category_id,
    receiptFileId: e.receipt_file_id,
    originalExpenseId: e.original_expense_id,
    transactionDate:
      typeof e.transaction_date === 'string'
        ? e.transaction_date
        : (e.transaction_date as Date).toISOString().split('T')[0],
    currency: e.currency,
    amountMinor: e.amount_minor_units,
    amount: formatMinorUnitsToDecimal(e.amount_minor_units, e.currency),
    kind: e.kind,
    paymentLabel: e.payment_label,
    note: e.note,
    timezone: e.timezone,
    cumulativeRefundMinorUnits: e.cumulative_refund_minor_units,
    createdAt: e.created_at.toISOString(),
    updatedAt: e.updated_at.toISOString(),
  }));
  zipEntries.push({
    path: 'expenses/expenses.json',
    data: JSON.stringify(expensesList, null, 2),
  });

  const expensesCsvRows = [
    'id,folderId,categoryId,receiptFileId,originalExpenseId,transactionDate,currency,amount,amountMinor,kind,paymentLabel,note,timezone,cumulativeRefundMinorUnits,createdAt,updatedAt',
    ...expensesList.map((e) =>
      toCsvRow([
        e.id,
        e.folderId,
        e.categoryId,
        e.receiptFileId,
        e.originalExpenseId,
        e.transactionDate,
        e.currency,
        e.amount,
        e.amountMinor,
        e.kind,
        e.paymentLabel,
        e.note,
        e.timezone,
        e.cumulativeRefundMinorUnits,
        e.createdAt,
        e.updatedAt,
      ])
    ),
  ];
  zipEntries.push({
    path: 'expenses/expenses.csv',
    data: expensesCsvRows.join('\n'),
  });

  const budgetsRes = await client.query<{
    id: string;
    category_id: string | null;
    period: string;
    currency: string;
    amount_minor_units: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, category_id, period, currency, amount_minor_units::text as amount_minor_units,
            created_at, updated_at
     FROM app.expense_budgets
     WHERE workspace_id = $1 AND deleted_at IS NULL
     ORDER BY period ASC, category_id NULLS FIRST;`,
    [workspaceId]
  );
  const budgetsList = budgetsRes.rows.map((b) => ({
    id: b.id,
    categoryId: b.category_id,
    period: b.period,
    periodMonth: b.period,
    currency: b.currency,
    amountMinor: b.amount_minor_units,
    amount: formatMinorUnitsToDecimal(b.amount_minor_units, b.currency),
    createdAt: b.created_at.toISOString(),
    updatedAt: b.updated_at.toISOString(),
  }));
  zipEntries.push({
    path: 'expenses/budgets.json',
    data: JSON.stringify(budgetsList, null, 2),
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
    expensesCount: expensesList.length,
    expenseCategoriesCount: expenseCategories.length,
    expenseRecurringTemplatesCount: expenseRecurringTemplates.length,
    expenseBudgetsCount: budgetsList.length,
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
  const archiveSha256 = crypto.createHash('sha256').update(archiveBuffer).digest('hex');

  // 15. Store in private object storage & persist durable export record
  const exportId = crypto.randomUUID();
  const now = Date.now();
  const expiresAtMs = now + EXPORT_TTL_SECONDS * 1000;
  const storagePath = `exports/${workspaceId}/${exportId}.zip`;

  await storageProvider.putObject(PRIVATE_ASSETS_BUCKET, storagePath, archiveBuffer, {
    contentType: 'application/zip',
  });

  const sessionHash = sessionToken
    ? crypto.createHash('sha256').update(sessionToken).digest('hex').substring(0, 32)
    : 'unspecified_session';

  await client.query(
    `INSERT INTO app.workspace_exports
      (id, workspace_id, user_id, session_hash, status, storage_path, manifest, file_size_bytes, checksum_sha256, include_attachments, expires_at, completed_at)
     VALUES
      ($1, $2, $3, $4, 'completed', $5, $6, $7, $8, $9, $10, now());`,
    [
      exportId,
      workspaceId,
      actorUserId,
      sessionHash,
      storagePath,
      JSON.stringify(manifest),
      archiveBuffer.length,
      archiveSha256,
      includeAttachments,
      new Date(expiresAtMs).toISOString(),
    ]
  );

  // Generate signed ephemeral download token using verified secret
  const downloadToken = generateDownloadToken(exportId, workspaceId, actorUserId, expiresAtMs);
  const downloadUrl = `/v1/workspaces/${workspaceId}/export/download/${exportId}?token=${downloadToken}&expires=${expiresAtMs}`;

  return {
    exportId,
    status: 'completed',
    downloadUrl,
    expiresAt: new Date(expiresAtMs).toISOString(),
    manifestSummary: summary,
    exclusions,
  };
}

/**
 * Redeems and streams a durable export archive.
 * Re-authenticates and verifies workspace membership, account status, token validity,
 * and artifact ownership at download time.
 */
export async function getDurableExportArchive(
  client: PoolClient,
  exportId: string,
  actorUserId: string,
  downloadToken?: string,
  expiresParam?: string,
  sessionToken?: string,
  storageProvider: StorageProviderContract = getDefaultStorageProvider()
): Promise<{
  archiveBuffer: Buffer;
  manifest: ExportManifest;
  workspaceId: string;
  fileSizeBytes: number;
}> {
  // 1. Fetch export record
  const res = await client.query<{
    id: string;
    workspace_id: string;
    user_id: string;
    session_hash: string;
    status: string;
    storage_path: string;
    manifest: ExportManifest;
    file_size_bytes: string | number;
    expires_at: Date;
  }>(
    `SELECT id, workspace_id, user_id, session_hash, status, storage_path, manifest, file_size_bytes, expires_at
     FROM app.workspace_exports
     WHERE id = $1;`,
    [exportId]
  );

  if (!res.rows[0]) {
    throw new NotFoundError('Export artifact not found');
  }

  const exportRecord = res.rows[0];

  // 2. Status and Expiry Check
  if (exportRecord.status !== 'completed' || !exportRecord.storage_path) {
    throw new NotFoundError('Export is not in a completed downloadable state');
  }

  if (Date.now() > exportRecord.expires_at.getTime()) {
    throw new NotFoundError('Export archive has expired');
  }

  // 3. Ownership and Workspace Membership
  if (exportRecord.user_id !== actorUserId) {
    throw new ForbiddenError('You do not have permission to download this export');
  }

  const roleCheck = await client.query<{ role: string }>(
    `SELECT role FROM app.workspace_memberships WHERE workspace_id = $1 AND user_id = $2;`,
    [exportRecord.workspace_id, actorUserId]
  );
  if (!roleCheck.rows[0]) {
    throw new ForbiddenError('You are no longer an active member of this workspace');
  }

  // 4. Token / Signature Verification
  if (downloadToken && expiresParam) {
    const expiresMs = Number(expiresParam);
    if (isNaN(expiresMs) || Date.now() > expiresMs) {
      throw new ForbiddenError('Download link has expired');
    }
    const isValid = verifyDownloadToken(
      downloadToken,
      exportId,
      exportRecord.workspace_id,
      actorUserId,
      expiresMs
    );
    if (!isValid) {
      throw new ForbiddenError('Invalid download signature token');
    }
  } else if (sessionToken) {
    const currentHash = crypto.createHash('sha256').update(sessionToken).digest('hex').substring(0, 32);
    if (exportRecord.session_hash !== 'unspecified_session' && exportRecord.session_hash !== currentHash) {
      throw new ForbiddenError('Export was created under a different active session');
    }
  } else {
    throw new ForbiddenError('Download token or active session is required');
  }

  // 5. Fetch from private storage
  const archiveBuffer = await storageProvider.getObject(PRIVATE_ASSETS_BUCKET, exportRecord.storage_path);
  if (!archiveBuffer) {
    throw new NotFoundError('Export archive object missing from storage');
  }

  // Increment download count
  await client.query(
    `UPDATE app.workspace_exports SET download_count = download_count + 1, updated_at = now() WHERE id = $1;`,
    [exportId]
  );

  return {
    archiveBuffer,
    manifest: exportRecord.manifest,
    workspaceId: exportRecord.workspace_id,
    fileSizeBytes: Number(exportRecord.file_size_bytes),
  };
}
