import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import type {
  ExportManifest,
  ImportPreviewResponse,
  ExecuteImportResponse,
  ImportDuplicateStrategy,
  ImportDuplicateItem,
} from '@daynori/contracts';
import { parseZipArchive } from './zipArchive.js';
import { getDefaultStorageProvider } from '../files/storageAdapter.js';
import { PRIVATE_ASSETS_BUCKET } from '../files/service.js';
import { insertChange, lockWorkspaceSyncState, updateWorkspaceSyncSeq } from '../sync/repository.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../plugins/errorHandler.js';

export interface StoredImportPreview {
  previewId: string;
  workspaceId: string;
  userId: string;
  archiveBuffer: Buffer;
  manifest: ExportManifest;
  parsedFiles: Map<string, Buffer>;
  detectedDuplicates: ImportDuplicateItem[];
  requiredBinaryBytes: number;
  availableStorageBytes: number;
  createdAt: number;
  expiresAt: number;
}

const ephemeralImportStore = new Map<string, StoredImportPreview>();
export const IMPORT_PREVIEW_TTL_SECONDS = 15 * 60; // 15 minutes

export function getEphemeralImportPreview(previewId: string): StoredImportPreview | undefined {
  const item = ephemeralImportStore.get(previewId);
  if (!item) return undefined;
  if (Date.now() > item.expiresAt) {
    ephemeralImportStore.delete(previewId);
    return undefined;
  }
  return item;
}

export function cleanupExpiredImportPreviews(): void {
  const now = Date.now();
  for (const [id, item] of ephemeralImportStore.entries()) {
    if (now > item.expiresAt) {
      ephemeralImportStore.delete(id);
    }
  }
}

/**
 * Validates and previews an uploaded workspace export archive without making
 * any changes to the canonical database.
 */
export async function validateAndPreviewImport(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  archiveBuffer: Buffer
): Promise<ImportPreviewResponse> {
  // 1. Check actor permissions
  const roleCheck = await client.query<{ role: string }>(
    `SELECT role FROM app.workspace_memberships WHERE workspace_id = $1 AND user_id = $2;`,
    [workspaceId, actorUserId]
  );
  if (!roleCheck.rows[0] || (roleCheck.rows[0].role !== 'owner' && roleCheck.rows[0].role !== 'editor')) {
    throw new ForbiddenError('You do not have editor permission to import into this workspace');
  }

  // 2. Parse and validate ZIP safety (zip bombs, traversal, size ceilings)
  let parsedFiles: Map<string, Buffer>;
  try {
    parsedFiles = parseZipArchive(archiveBuffer);
  } catch (err) {
    throw new ValidationError(err instanceof Error ? err.message : String(err));
  }

  // 3. Inspect manifest.json
  const manifestBuffer = parsedFiles.get('manifest.json');
  if (!manifestBuffer) {
    throw new ValidationError('MALFORMED_IMPORT_ARCHIVE: Missing manifest.json in archive');
  }

  let manifest: ExportManifest;
  try {
    manifest = JSON.parse(manifestBuffer.toString('utf8'));
  } catch {
    throw new ValidationError('MALFORMED_IMPORT_ARCHIVE: manifest.json is invalid JSON');
  }

  if (manifest.schemaVersion !== 1) {
    throw new ValidationError(
      `UNSUPPORTED_ARCHIVE_VERSION: Archive schema version ${manifest.schemaVersion} is not supported (expected 1)`
    );
  }

  if (manifest.format !== 'daynori-workspace-export-v1') {
    throw new ValidationError(
      `UNSUPPORTED_ARCHIVE_FORMAT: Format "${manifest.format}" is not recognized`
    );
  }

  const warnings: string[] = [];

  // Pass through manifest exclusions as informative warnings
  for (const excl of manifest.exclusions || []) {
    warnings.push(`${excl.category.toUpperCase()}: ${excl.reason}`);
  }

  // 4. Verify checksums of attachment binaries present in archive
  let requiredBinaryBytes = 0;
  for (const [relativePath, expectedChecksum] of Object.entries(manifest.checksums || {})) {
    const fileBytes = parsedFiles.get(relativePath);
    if (!fileBytes) {
      warnings.push(`ATTACHMENT_MISSING: Declared attachment "${relativePath}" is missing from archive`);
      continue;
    }
    const actualChecksum = crypto.createHash('sha256').update(fileBytes).digest('hex');
    if (actualChecksum !== expectedChecksum) {
      throw new ValidationError(
        `INTEGRITY_CHECK_FAILED: Checksum mismatch for binary "${relativePath}"`
      );
    }
    requiredBinaryBytes += fileBytes.length;
  }

  // 5. Check workspace storage quota
  const quotaRes = await client.query<{
    stored_bytes: string | number;
    reserved_bytes: string | number;
    max_storage_bytes: string | number;
  }>(
    `SELECT stored_bytes, reserved_bytes, max_storage_bytes
     FROM app.workspace_storage_usage
     WHERE workspace_id = $1;`,
    [workspaceId]
  );

  const storedBytes = quotaRes.rows[0] ? Number(quotaRes.rows[0].stored_bytes) : 0;
  const reservedBytes = quotaRes.rows[0] ? Number(quotaRes.rows[0].reserved_bytes) : 0;
  const maxStorageBytes = quotaRes.rows[0] ? Number(quotaRes.rows[0].max_storage_bytes) : 100 * 1024 * 1024;
  const availableStorageBytes = Math.max(0, maxStorageBytes - (storedBytes + reservedBytes));
  const isQuotaSufficient = requiredBinaryBytes <= availableStorageBytes;

  if (!isQuotaSufficient) {
    warnings.push(
      `STORAGE_QUOTA_EXCEEDED: Import requires ${requiredBinaryBytes} bytes, but only ${availableStorageBytes} bytes are available in workspace quota`
    );
  }

  // 6. Detect duplicates against existing target workspace items
  const detectedDuplicates: ImportDuplicateItem[] = [];

  // Existing notes
  const notesJson = parsedFiles.get('notes/notes.json');
  if (notesJson) {
    try {
      const importedNotes = JSON.parse(notesJson.toString('utf8')) as Array<{
        id: string;
        title: string;
        updatedAt?: string;
      }>;
      const existingNotes = await client.query<{ id: string; title: string; updated_at: Date }>(
        `SELECT n.id, n.title, n.updated_at
         FROM app.notes n
         JOIN app.items i ON i.id = n.id AND i.workspace_id = n.workspace_id
         WHERE n.workspace_id = $1 AND i.deleted_at IS NULL;`,
        [workspaceId]
      );
      const existingMap = new Map(existingNotes.rows.map((r) => [r.title.toLowerCase().trim(), r]));

      for (const inote of importedNotes) {
        const match = existingMap.get(inote.title.toLowerCase().trim());
        if (match) {
          detectedDuplicates.push({
            entityType: 'note',
            identifier: inote.title,
            title: inote.title,
            existingId: match.id,
            importedId: inote.id,
            existingUpdatedAt: match.updated_at.toISOString(),
            importedUpdatedAt: inote.updatedAt,
          });
        }
      }
    } catch {
      /* ignore parsing error if file is malformed */
    }
  }

  // Existing tasks
  const tasksJson = parsedFiles.get('tasks/tasks.json');
  if (tasksJson) {
    try {
      const importedTasks = JSON.parse(tasksJson.toString('utf8')) as Array<{
        id: string;
        title: string;
        updatedAt?: string;
      }>;
      const existingTasks = await client.query<{ id: string; title: string; updated_at: Date }>(
        `SELECT t.id, t.title, t.updated_at
         FROM app.tasks t
         JOIN app.items i ON i.id = t.id AND i.workspace_id = t.workspace_id
         WHERE t.workspace_id = $1 AND i.deleted_at IS NULL;`,
        [workspaceId]
      );
      const existingMap = new Map(existingTasks.rows.map((r) => [r.title.toLowerCase().trim(), r]));

      for (const itask of importedTasks) {
        const match = existingMap.get(itask.title.toLowerCase().trim());
        if (match) {
          detectedDuplicates.push({
            entityType: 'task',
            identifier: itask.title,
            title: itask.title,
            existingId: match.id,
            importedId: itask.id,
            existingUpdatedAt: match.updated_at.toISOString(),
            importedUpdatedAt: itask.updatedAt,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Existing journal
  const journalJson = parsedFiles.get('journal/journal.json');
  if (journalJson) {
    try {
      const importedJournal = JSON.parse(journalJson.toString('utf8')) as Array<{
        id: string;
        entryDate: string;
        title?: string;
        updatedAt?: string;
      }>;
      const existingJournal = await client.query<{
        id: string;
        entry_date: Date | string;
        title: string | null;
        updated_at: Date;
      }>(
        `SELECT j.id, j.entry_date, j.title, j.updated_at
         FROM app.journal_entries j
         JOIN app.items i ON i.id = j.id AND i.workspace_id = j.workspace_id
         WHERE j.workspace_id = $1 AND i.deleted_at IS NULL;`,
        [workspaceId]
      );
      const existingDateMap = new Map(
        existingJournal.rows.map((r) => {
          const d = r.entry_date instanceof Date ? r.entry_date.toISOString().split('T')[0] : String(r.entry_date);
          return [d, r];
        })
      );

      for (const ij of importedJournal) {
        const match = existingDateMap.get(ij.entryDate);
        if (match) {
          detectedDuplicates.push({
            entityType: 'journal',
            identifier: ij.entryDate,
            title: ij.title || `Journal ${ij.entryDate}`,
            existingId: match.id,
            importedId: ij.id,
            existingUpdatedAt: match.updated_at.toISOString(),
            importedUpdatedAt: ij.updatedAt,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 7. Store in ephemeral preview cache
  const previewId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + IMPORT_PREVIEW_TTL_SECONDS * 1000;

  cleanupExpiredImportPreviews();
  ephemeralImportStore.set(previewId, {
    previewId,
    workspaceId,
    userId: actorUserId,
    archiveBuffer,
    manifest,
    parsedFiles,
    detectedDuplicates,
    requiredBinaryBytes,
    availableStorageBytes,
    createdAt: now,
    expiresAt,
  });

  return {
    previewId,
    manifestSummary: manifest.summary,
    detectedDuplicates,
    availableDuplicateStrategies: ['skip', 'create_copy', 'overwrite_if_newer'],
    storageQuota: {
      requiredBytes: requiredBinaryBytes,
      availableBytes: availableStorageBytes,
      isQuotaSufficient,
    },
    warnings,
    isValid: true,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

/**
 * Executes a controlled, bounded import using the confirmed preview and
 * duplicate resolution strategy. All operations run transactionally.
 */
export async function executeConfirmedImport(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  previewId: string,
  duplicateStrategy: ImportDuplicateStrategy
): Promise<ExecuteImportResponse> {
  const preview = getEphemeralImportPreview(previewId);
  if (!preview) {
    throw new NotFoundError(
      'IMPORT_PREVIEW_EXPIRED: The import preview has expired or is invalid. Please upload the archive again to preview.'
    );
  }

  if (preview.workspaceId !== workspaceId) {
    throw new ForbiddenError('Import preview is bound to a different workspace');
  }

  if (preview.userId !== actorUserId) {
    throw new ForbiddenError('Import preview belongs to a different user identity');
  }

  // Check quota enforcement
  if (preview.requiredBinaryBytes > preview.availableStorageBytes) {
    throw new ValidationError(
      `STORAGE_QUOTA_EXCEEDED: Cannot execute import: required ${preview.requiredBinaryBytes} bytes exceeds available quota of ${preview.availableStorageBytes} bytes`
    );
  }

  const { parsedFiles, detectedDuplicates } = preview;
  const duplicateMap = new Map(detectedDuplicates.map((d) => [d.importedId, d]));

  // ID Remapping dictionary: maps original exported ID -> newly minted UUID
  const idMap = new Map<string, string>();
  const resolveId = (oldId: string | null | undefined): string | null => {
    if (!oldId) return null;
    let mapped = idMap.get(oldId);
    if (!mapped) {
      mapped = crypto.randomUUID();
      idMap.set(oldId, mapped);
    }
    return mapped;
  };

  const importedCounts = {
    folders: 0,
    notes: 0,
    tasks: 0,
    routines: 0,
    journal: 0,
    calendar: 0,
    files: 0,
  };
  let skippedCounts = 0;
  let copiedCounts = 0;
  let overwrittenCounts = 0;

  // 1. Folders
  const foldersJson = parsedFiles.get('metadata/folders.json');
  if (foldersJson) {
    const folders = JSON.parse(foldersJson.toString('utf8')) as Array<{
      id: string;
      parentId: string | null;
      name: string;
      color: string | null;
      icon: string | null;
    }>;

    // Pass 1: Insert all folder items without parents to prevent foreign-key ordering issues
    for (const f of folders) {
      const newFolderId = resolveId(f.id)!;

      // Create base item
      await client.query(
        `INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
         VALUES ($1, $2, NULL, 'folder', $3, $3, 'standard')
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [newFolderId, workspaceId, actorUserId]
      );

      // Create folder record
      await client.query(
        `INSERT INTO app.folders (id, workspace_id, parent_id, name, color, icon)
         VALUES ($1, $2, NULL, $3, $4, $5)
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [newFolderId, workspaceId, f.name, f.color, f.icon]
      );
      importedCounts.folders++;
    }

    // Pass 2: Connect parent folder hierarchies
    for (const f of folders) {
      if (f.parentId) {
        const newFolderId = resolveId(f.id)!;
        const newParentId = resolveId(f.parentId);
        await client.query(
          `UPDATE app.items SET folder_id = $1 WHERE workspace_id = $2 AND id = $3;`,
          [newParentId, workspaceId, newFolderId]
        );
        await client.query(
          `UPDATE app.folders SET parent_id = $1 WHERE workspace_id = $2 AND id = $3;`,
          [newParentId, workspaceId, newFolderId]
        );
      }
    }
  }

  // 2. Tags
  const tagsJson = parsedFiles.get('metadata/tags.json');
  if (tagsJson) {
    const tags = JSON.parse(tagsJson.toString('utf8')) as Array<{
      id: string;
      name: string;
      color: string | null;
    }>;
    for (const t of tags) {
      await client.query(
        `INSERT INTO app.tags (id, workspace_id, name, color, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING;`,
        [crypto.randomUUID(), workspaceId, t.name, t.color, actorUserId]
      );
    }
  }

  // 3. Notes
  const notesJson = parsedFiles.get('notes/notes.json');
  if (notesJson) {
    const notes = JSON.parse(notesJson.toString('utf8')) as Array<{
      id: string;
      folderId: string | null;
      title: string;
      document: unknown;
      plainText: string;
      wordCount?: number;
      charCount?: number;
      isPinned?: boolean;
      isArchived?: boolean;
      purpose?: string;
      updatedAt?: string;
    }>;

    for (const n of notes) {
      const isDup = duplicateMap.get(n.id);
      if (isDup) {
        if (duplicateStrategy === 'skip') {
          skippedCounts++;
          continue;
        } else if (duplicateStrategy === 'overwrite_if_newer') {
          const importedDate = n.updatedAt ? new Date(n.updatedAt).getTime() : 0;
          const existingDate = isDup.existingUpdatedAt ? new Date(isDup.existingUpdatedAt).getTime() : 0;
          if (importedDate > existingDate) {
            // Overwrite existing note
            await client.query(
              `UPDATE app.notes
               SET title = $1, document = $2, plain_text = $3, word_count = $4, char_count = $5, updated_at = now()
               WHERE id = $6 AND workspace_id = $7;`,
              [
                n.title,
                JSON.stringify(n.document || {}),
                n.plainText || '',
                n.wordCount || 0,
                n.charCount || 0,
                isDup.existingId,
                workspaceId,
              ]
            );
            overwrittenCounts++;
            continue;
          } else {
            skippedCounts++;
            continue;
          }
        } else if (duplicateStrategy === 'create_copy') {
          n.title = `${n.title} (Copy)`;
          copiedCounts++;
        }
      }

      const newNoteId = resolveId(n.id)!;
      const targetFolderId = n.folderId ? resolveId(n.folderId) : null;

      await client.query(
        `INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, is_pinned, is_archived, security_scope)
         VALUES ($1, $2, $3, 'note', $4, $4, $5, $6, 'standard')
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [newNoteId, workspaceId, targetFolderId, actorUserId, Boolean(n.isPinned), Boolean(n.isArchived)]
      );

      await client.query(
        `INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [
          newNoteId,
          workspaceId,
          n.title,
          JSON.stringify(n.document || {}),
          n.plainText || '',
          n.wordCount || 0,
          n.charCount || 0,
        ]
      );
      importedCounts.notes++;
    }
  }

  // 4. Tasks
  const tasksJson = parsedFiles.get('tasks/tasks.json');
  if (tasksJson) {
    const tasks = JSON.parse(tasksJson.toString('utf8')) as Array<{
      id: string;
      folderId: string | null;
      title: string;
      details: string | null;
      priority: string;
      status: string;
      deadlineType: string;
      deadlineDate: string | null;
      deadlineTime: string | null;
      deadlineZone: string | null;
      completedAt: string | null;
      parentId: string | null;
      tags: string[];
      updatedAt?: string;
    }>;

    for (const t of tasks) {
      const isDup = duplicateMap.get(t.id);
      if (isDup) {
        if (duplicateStrategy === 'skip') {
          skippedCounts++;
          continue;
        } else if (duplicateStrategy === 'overwrite_if_newer') {
          const importedDate = t.updatedAt ? new Date(t.updatedAt).getTime() : 0;
          const existingDate = isDup.existingUpdatedAt ? new Date(isDup.existingUpdatedAt).getTime() : 0;
          if (importedDate > existingDate) {
            await client.query(
              `UPDATE app.tasks
               SET title = $1, details = $2, priority = $3, status = $4, deadline_type = $5,
                   deadline_date = $6, deadline_time = $7, deadline_zone = $8, completed_at = $9, updated_at = now()
               WHERE id = $10 AND workspace_id = $11;`,
              [
                t.title,
                t.details,
                t.priority || 'normal',
                t.status || 'todo',
                t.deadlineType || 'none',
                t.deadlineDate,
                t.deadlineTime,
                t.deadlineZone,
                t.completedAt,
                isDup.existingId,
                workspaceId,
              ]
            );
            overwrittenCounts++;
            continue;
          } else {
            skippedCounts++;
            continue;
          }
        } else if (duplicateStrategy === 'create_copy') {
          t.title = `${t.title} (Copy)`;
          copiedCounts++;
        }
      }

      const newTaskId = resolveId(t.id)!;
      const targetFolderId = t.folderId ? resolveId(t.folderId) : null;

      await client.query(
        `INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
         VALUES ($1, $2, $3, 'todo', $4, $4, 'standard')
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [newTaskId, workspaceId, targetFolderId, actorUserId]
      );

      await client.query(
        `INSERT INTO app.tasks (id, workspace_id, title, details, priority, status, deadline_type, deadline_date, deadline_time, deadline_zone, completed_at, parent_id, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, $12)
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [
          newTaskId,
          workspaceId,
          t.title,
          t.details,
          t.priority || 'normal',
          t.status || 'todo',
          t.deadlineType || 'none',
          t.deadlineDate,
          t.deadlineTime,
          t.deadlineZone,
          t.completedAt,
          t.tags || [],
        ]
      );
      importedCounts.tasks++;
    }

    // Connect parent task hierarchies
    for (const t of tasks) {
      if (t.parentId) {
        const newTaskId = resolveId(t.id)!;
        const targetParentId = resolveId(t.parentId);
        await client.query(
          `UPDATE app.tasks SET parent_id = $1 WHERE workspace_id = $2 AND id = $3;`,
          [targetParentId, workspaceId, newTaskId]
        );
      }
    }
  }

  // 5. Routines
  const routinesJson = parsedFiles.get('routines/routines.json');
  if (routinesJson) {
    const routines = JSON.parse(routinesJson.toString('utf8')) as Array<{
      id: string;
      folderId: string | null;
      title: string;
      details: string | null;
      frequency: string;
      weekdays: number[];
      timezone: string;
      scheduledTime: string | null;
      activeFrom: string;
      activeTo: string | null;
      isPaused: boolean;
      isArchived: boolean;
    }>;

    for (const r of routines) {
      const newRoutineId = resolveId(r.id)!;
      const targetFolderId = r.folderId ? resolveId(r.folderId) : null;

      await client.query(
        `INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
         VALUES ($1, $2, $3, 'routine', $4, $4, 'standard')
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [newRoutineId, workspaceId, targetFolderId, actorUserId]
      );

      await client.query(
        `INSERT INTO app.routines (id, workspace_id, folder_id, title, details, frequency, weekdays, timezone, scheduled_time, active_from, active_to, is_paused, is_archived)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [
          newRoutineId,
          workspaceId,
          targetFolderId,
          r.title,
          r.details,
          r.frequency || 'daily',
          r.weekdays || [],
          r.timezone || 'UTC',
          r.scheduledTime ? r.scheduledTime.substring(0, 5) : null,
          r.activeFrom || new Date().toISOString().split('T')[0],
          r.activeTo,
          Boolean(r.isPaused),
          Boolean(r.isArchived),
        ]
      );
      importedCounts.routines++;
    }
  }

  // 6. Journal Entries
  const journalJson = parsedFiles.get('journal/journal.json');
  if (journalJson) {
    const journalEntries = JSON.parse(journalJson.toString('utf8')) as Array<{
      id: string;
      entryDate: string;
      title: string | null;
      timezone: string;
      document: unknown;
      plainText: string;
      mood: string | null;
      prompts: unknown;
      tags: string[];
      updatedAt?: string;
    }>;

    for (const j of journalEntries) {
      const isDup = duplicateMap.get(j.id);
      if (isDup) {
        if (duplicateStrategy === 'skip') {
          skippedCounts++;
          continue;
        } else if (duplicateStrategy === 'overwrite_if_newer') {
          const importedDate = j.updatedAt ? new Date(j.updatedAt).getTime() : 0;
          const existingDate = isDup.existingUpdatedAt ? new Date(isDup.existingUpdatedAt).getTime() : 0;
          if (importedDate > existingDate) {
            await client.query(
              `UPDATE app.journal_entries
               SET title = $1, timezone = $2, document = $3, plain_text = $4, mood = $5, prompts = $6, tags = $7, updated_at = now()
               WHERE id = $8 AND workspace_id = $9;`,
              [
                j.title,
                j.timezone || 'UTC',
                JSON.stringify(j.document || {}),
                j.plainText || '',
                j.mood,
                JSON.stringify(j.prompts || []),
                j.tags || [],
                isDup.existingId,
                workspaceId,
              ]
            );
            overwrittenCounts++;
            continue;
          } else {
            skippedCounts++;
            continue;
          }
        } else if (duplicateStrategy === 'create_copy') {
          j.title = `${j.title || `Journal ${j.entryDate}`} (Copy)`;
          copiedCounts++;
        }
      }

      const newJournalId = resolveId(j.id)!;

      await client.query(
        `INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, security_scope)
         VALUES ($1, $2, 'journal_entry', $3, $3, 'standard')
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [newJournalId, workspaceId, actorUserId]
      );

      await client.query(
        `INSERT INTO app.journal_entries (id, workspace_id, title, entry_date, timezone, document, plain_text, mood, prompts, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [
          newJournalId,
          workspaceId,
          j.title,
          j.entryDate,
          j.timezone || 'UTC',
          JSON.stringify(j.document || {}),
          j.plainText || '',
          j.mood,
          JSON.stringify(j.prompts || []),
          j.tags || [],
        ]
      );
      importedCounts.journal++;
    }
  }

  // 7. Calendar Events
  const calJson = parsedFiles.get('calendar/calendar.json');
  if (calJson) {
    const events = JSON.parse(calJson.toString('utf8')) as Array<{
      id: string;
      folderId: string | null;
      title: string;
      details: string | null;
      allDay: boolean;
      startDate: string | null;
      endDate: string | null;
      startAt: string | null;
      endAt: string | null;
      timezone: string;
    }>;

    for (const c of events) {
      const newCalId = resolveId(c.id)!;
      const targetFolderId = c.folderId ? resolveId(c.folderId) : null;

      await client.query(
        `INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
         VALUES ($1, $2, $3, 'calendar_event', $4, $4, 'standard')
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [newCalId, workspaceId, targetFolderId, actorUserId]
      );

      await client.query(
        `INSERT INTO app.calendar_events (id, workspace_id, folder_id, title, details, all_day, start_date, end_date, start_at, end_at, timezone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [
          newCalId,
          workspaceId,
          targetFolderId,
          c.title,
          c.details,
          Boolean(c.allDay),
          c.startDate,
          c.endDate,
          c.startAt,
          c.endAt,
          c.timezone || 'UTC',
        ]
      );
      importedCounts.calendar++;
    }
  }

  // 8. Attachments & Files
  const filesJson = parsedFiles.get('attachments/files.json');
  if (filesJson) {
    const files = JSON.parse(filesJson.toString('utf8')) as Array<{
      id: string;
      folderId: string | null;
      fileName: string;
      declaredMimeType: string;
      detectedMimeType: string;
      byteSize: number;
      sha256: string;
      binaryPath: string | null;
    }>;

    const storage = getDefaultStorageProvider();
    let importedBytes = 0;

    for (const f of files) {
      const newFileId = resolveId(f.id)!;
      const targetFolderId = f.folderId ? resolveId(f.folderId) : null;
      const newObjectPath = `workspaces/${workspaceId}/files/${newFileId}/${f.fileName}`;

      // Upload binary if present in archive
      if (f.binaryPath && parsedFiles.has(f.binaryPath)) {
        const fileBytes = parsedFiles.get(f.binaryPath)!;
        await storage.putObject(PRIVATE_ASSETS_BUCKET, newObjectPath, fileBytes, {
          contentType: f.detectedMimeType || 'application/octet-stream',
          upsert: true,
        });
        importedBytes += fileBytes.length;
      }

      await client.query(
        `INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
         VALUES ($1, $2, $3, 'file', $4, $4, 'standard')
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [newFileId, workspaceId, targetFolderId, actorUserId]
      );

      await client.query(
        `INSERT INTO app.file_items (id, workspace_id, folder_id, file_name, declared_mime_type, detected_mime_type, byte_size, sha256_checksum, object_path, quarantine_status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'verified', $10)
         ON CONFLICT (id) DO NOTHING;`,
        [
          newFileId,
          workspaceId,
          targetFolderId,
          f.fileName,
          f.declaredMimeType || 'application/octet-stream',
          f.detectedMimeType || 'application/octet-stream',
          f.byteSize || 0,
          f.sha256 || '',
          newObjectPath,
          actorUserId,
        ]
      );
      importedCounts.files++;
    }

    if (importedBytes > 0) {
      await client.query(
        `UPDATE app.workspace_storage_usage
         SET stored_bytes = stored_bytes + $1, updated_at = now()
         WHERE workspace_id = $2;`,
        [importedBytes, workspaceId]
      );
    }
  }

  // 9. Update workspace sync sequence and audit change feed
  const { nextChangeSeq } = await lockWorkspaceSyncState(client, workspaceId);
  await updateWorkspaceSyncSeq(client, workspaceId, nextChangeSeq + 1);
  await insertChange(client, {
    workspaceId,
    seq: nextChangeSeq,
    entityType: 'workspace',
    entityId: workspaceId,
    revision: 1,
    isTombstone: false,
    operationId: crypto.randomUUID(),
    changeData: { action: 'workspace_imported', previewId, duplicateStrategy, importedCounts },
  });

  // 10. Clean up preview
  ephemeralImportStore.delete(previewId);

  return {
    success: true,
    workspaceId,
    duplicateStrategy,
    importedCounts,
    skippedCounts,
    copiedCounts,
    overwrittenCounts,
    warnings: [],
    completedAt: new Date().toISOString(),
  };
}
