import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type {
  ExportManifest,
  ImportPreviewResponse,
  ExecuteImportResponse,
  ImportDuplicateStrategy,
  ImportDuplicateItem,
} from '@daynori/contracts';
import { parseZipArchive } from './zipArchive.js';
import {
  getDefaultStorageProvider,
  type StorageProviderContract,
} from '../files/storageAdapter.js';
import { PRIVATE_ASSETS_BUCKET } from '../files/service.js';
import {
  insertChange,
  lockWorkspaceSyncState,
  updateWorkspaceSyncSeq,
} from '../sync/repository.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../../plugins/errorHandler.js';

export const IMPORT_PREVIEW_TTL_SECONDS = 15 * 60; // 15 minutes

// --- Runtime Schemas for Validating Exported Archive Records ---

const ExportedFolderSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(255),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
});

const ExportedTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  color: z.string().nullable().optional(),
});

const ExportedSavedViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  entityType: z.string().min(1),
  filter: z.unknown(),
  rank: z.union([z.number(), z.string()]).optional(),
  isPinned: z.boolean().optional(),
});

const ExportedNoteSchema = z.object({
  id: z.string().uuid(),
  folderId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(255),
  document: z.unknown(),
  plainText: z.string().optional(),
  wordCount: z.number().int().nonnegative().optional(),
  charCount: z.number().int().nonnegative().optional(),
  purpose: z.enum(['guide', 'cheatsheet', 'general', 'standard']).optional(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  updatedAt: z.string().optional(),
});

const ExportedTaskSchema = z.object({
  id: z.string().uuid(),
  folderId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(255),
  details: z.string().nullable().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional(),
  deadlineType: z.enum(['none', 'date', 'timed']).optional(),
  deadlineDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  deadlineTime: z.string().nullable().optional(),
  deadlineZone: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  updatedAt: z.string().optional(),
});

const ExportedRoutineSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255),
  frequency: z.enum(['daily', 'weekdays']).optional(),
  scheduledTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  activeInterval: z.unknown().optional(),
  targetCount: z.number().int().positive().optional(),
  weekdays: z.array(z.number()).optional(),
  tags: z.array(z.string()).optional(),
  updatedAt: z.string().optional(),
});

const ExportedJournalSchema = z.object({
  id: z.string().uuid(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().nullable().optional(),
  mood: z.string().nullable().optional(),
  timezone: z.string().optional(),
  document: z.unknown().optional(),
  plainText: z.string().optional(),
  prompts: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
  updatedAt: z.string().optional(),
});

const ExportedCalendarSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255),
  details: z.string().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  isAllDay: z.boolean().optional(),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  timezone: z.string().optional(),
  updatedAt: z.string().optional(),
});

const ExportedFileItemSchema = z.object({
  id: z.string().uuid(),
  folderId: z.string().uuid().nullable().optional(),
  fileName: z.string().min(1).max(255),
  declaredMimeType: z.string(),
  detectedMimeType: z.string().optional(),
  byteSize: z.number().int().nonnegative(),
  sha256: z.string().min(32),
  binaryPath: z.string().nullable().optional(),
});

const ExportedExpenseCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  displayOrder: z.number().int().optional(),
  isSystem: z.boolean().optional(),
});

const ExportedExpenseRecurringTemplateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255).optional().default('Recurring Template'),
  kind: z.enum(['expense', 'income']),
  amountMinor: z.union([z.string(), z.number(), z.bigint()]),
  amount: z.string().optional(),
  currency: z.string().min(3).max(3),
  categoryId: z.string().uuid().nullable().optional(),
  paymentLabel: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  schedule: z.unknown().optional(),
  recurrencePattern: z.unknown().optional(),
  timezone: z.string().optional().default('UTC'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional(),
});

const ExportedExpenseItemSchema = z.object({
  id: z.string().uuid(),
  folderId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  receiptFileId: z.string().uuid().nullable().optional(),
  originalExpenseId: z.string().uuid().nullable().optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().min(3).max(3),
  amountMinor: z.union([z.string(), z.number(), z.bigint()]),
  amount: z.string().optional(),
  kind: z.enum(['expense', 'income', 'refund']),
  paymentLabel: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  timezone: z.string().optional(),
  recurringTemplateId: z.string().uuid().nullable().optional(),
  isReconciled: z.boolean().optional(),
  updatedAt: z.string().optional(),
});

const ExportedExpenseBudgetSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  currency: z.string().min(3).max(3),
  amountMinor: z.union([z.string(), z.number(), z.bigint()]),
  amount: z.string().optional(),
});

/**
 * Validates that folder parent-child hierarchy has no cycles and is within safe depth.
 */
function assertValidFolderHierarchy(
  folders: Array<{ id: string; parentId?: string | null }>
): void {
  const parentMap = new Map<string, string>();
  for (const f of folders) {
    if (f.parentId) {
      if (f.id === f.parentId) {
        throw new ValidationError(`MALFORMED_IMPORT: Folder "${f.id}" cannot be its own parent`);
      }
      parentMap.set(f.id, f.parentId);
    }
  }

  for (const f of folders) {
    let current = f.id;
    const visited = new Set<string>([current]);
    let depth = 0;

    while (parentMap.has(current)) {
      current = parentMap.get(current)!;
      depth++;
      if (depth > 12) {
        throw new ValidationError('MALFORMED_IMPORT: Folder hierarchy exceeds maximum depth limit');
      }
      if (visited.has(current)) {
        throw new ValidationError(
          `MALFORMED_IMPORT: Circular folder hierarchy detected at "${current}"`
        );
      }
      visited.add(current);
    }
  }
}

/**
 * Validates and previews an uploaded workspace export archive without making
 * changes to user data. Stores archive in private storage and records durable preview session.
 */
export async function validateAndPreviewImport(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  archiveBuffer: Buffer,
  sessionToken?: string,
  storageProvider: StorageProviderContract = getDefaultStorageProvider()
): Promise<ImportPreviewResponse> {
  // 1. Check actor permissions
  const roleCheck = await client.query<{ role: string }>(
    `SELECT role FROM app.workspace_memberships WHERE workspace_id = $1 AND user_id = $2;`,
    [workspaceId, actorUserId]
  );
  if (
    !roleCheck.rows[0] ||
    (roleCheck.rows[0].role !== 'owner' && roleCheck.rows[0].role !== 'editor')
  ) {
    throw new ForbiddenError('You do not have editor permission to import into this workspace');
  }

  // 2. Parse and validate ZIP safety
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

  // 4. Runtime Schema Validation on Records
  // Folders
  const foldersBuf = parsedFiles.get('metadata/folders.json');
  if (foldersBuf) {
    try {
      const raw = JSON.parse(foldersBuf.toString('utf8'));
      const parsed = z.array(ExportedFolderSchema).parse(raw);
      assertValidFolderHierarchy(parsed);
    } catch (err) {
      throw new ValidationError(
        `MALFORMED_IMPORT: metadata/folders.json validation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Notes
  const notesBuf = parsedFiles.get('notes/notes.json');
  if (notesBuf) {
    try {
      const raw = JSON.parse(notesBuf.toString('utf8'));
      z.array(ExportedNoteSchema).parse(raw);
    } catch (err) {
      throw new ValidationError(
        `MALFORMED_IMPORT: notes/notes.json validation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Tasks
  const tasksBuf = parsedFiles.get('tasks/tasks.json');
  if (tasksBuf) {
    try {
      const raw = JSON.parse(tasksBuf.toString('utf8'));
      z.array(ExportedTaskSchema).parse(raw);
    } catch (err) {
      throw new ValidationError(
        `MALFORMED_IMPORT: tasks/tasks.json validation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Routines
  const routinesBuf = parsedFiles.get('routines/routines.json');
  if (routinesBuf) {
    try {
      const raw = JSON.parse(routinesBuf.toString('utf8'));
      z.array(ExportedRoutineSchema).parse(raw);
    } catch (err) {
      throw new ValidationError(
        `MALFORMED_IMPORT: routines/routines.json validation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Journal
  const journalBuf = parsedFiles.get('journal/journal.json');
  if (journalBuf) {
    try {
      const raw = JSON.parse(journalBuf.toString('utf8'));
      z.array(ExportedJournalSchema).parse(raw);
    } catch (err) {
      throw new ValidationError(
        `MALFORMED_IMPORT: journal/journal.json validation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Calendar
  const calBuf = parsedFiles.get('calendar/calendar.json');
  if (calBuf) {
    try {
      const raw = JSON.parse(calBuf.toString('utf8'));
      z.array(ExportedCalendarSchema).parse(raw);
    } catch (err) {
      throw new ValidationError(
        `MALFORMED_IMPORT: calendar/calendar.json validation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Tags & Saved Views
  const tagsBuf = parsedFiles.get('metadata/tags.json');
  if (tagsBuf) {
    try {
      z.array(ExportedTagSchema).parse(JSON.parse(tagsBuf.toString('utf8')));
    } catch (err) {
      throw new ValidationError(
        `MALFORMED_IMPORT: metadata/tags.json validation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const viewsBuf = parsedFiles.get('metadata/saved_views.json');
  if (viewsBuf) {
    try {
      z.array(ExportedSavedViewSchema).parse(JSON.parse(viewsBuf.toString('utf8')));
    } catch (err) {
      throw new ValidationError(
        `MALFORMED_IMPORT: metadata/saved_views.json validation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Expenses & Financial Records
  const expCategoriesBuf = parsedFiles.get('expenses/categories.json');
  if (expCategoriesBuf) {
    try {
      z.array(ExportedExpenseCategorySchema).parse(JSON.parse(expCategoriesBuf.toString('utf8')));
    } catch (err) {
      throw new ValidationError(
        `MALFORMED_IMPORT: expenses/categories.json validation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const expRecurringBuf = parsedFiles.get('expenses/recurring_templates.json');
  if (expRecurringBuf) {
    try {
      z.array(ExportedExpenseRecurringTemplateSchema).parse(
        JSON.parse(expRecurringBuf.toString('utf8'))
      );
    } catch (err) {
      throw new ValidationError(
        `MALFORMED_IMPORT: expenses/recurring_templates.json validation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const expensesBuf = parsedFiles.get('expenses/expenses.json');
  if (expensesBuf) {
    try {
      z.array(ExportedExpenseItemSchema).parse(JSON.parse(expensesBuf.toString('utf8')));
    } catch (err) {
      throw new ValidationError(
        `MALFORMED_IMPORT: expenses/expenses.json validation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const expBudgetsBuf = parsedFiles.get('expenses/budgets.json');
  if (expBudgetsBuf) {
    try {
      z.array(ExportedExpenseBudgetSchema).parse(JSON.parse(expBudgetsBuf.toString('utf8')));
    } catch (err) {
      throw new ValidationError(
        `MALFORMED_IMPORT: expenses/budgets.json validation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 5. Binary file integrity & verification
  let totalBinaryBytes = 0;
  const filesBuf = parsedFiles.get('attachments/files.json');
  if (filesBuf) {
    let filesList: z.infer<typeof ExportedFileItemSchema>[];
    try {
      filesList = z.array(ExportedFileItemSchema).parse(JSON.parse(filesBuf.toString('utf8')));
    } catch (err) {
      throw new ValidationError(
        `MALFORMED_IMPORT: attachments/files.json validation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const manifestChecksums = manifest.checksums || {};

    for (const f of filesList) {
      if (f.binaryPath) {
        const binData = parsedFiles.get(f.binaryPath);
        if (!binData) {
          throw new ValidationError(
            `MALFORMED_IMPORT: Referenced binary file missing from archive: "${f.binaryPath}"`
          );
        }

        // Verify checksum against actual bytes
        const actualSha = crypto.createHash('sha256').update(binData).digest('hex');
        if (f.sha256 && f.sha256 !== actualSha) {
          throw new ValidationError(
            `INTEGRITY_CHECK_FAILED: SHA-256 checksum mismatch for binary "${f.binaryPath}" (expected ${f.sha256}, calculated ${actualSha})`
          );
        }

        const expectedManifestSha = manifestChecksums[f.binaryPath];
        if (expectedManifestSha && expectedManifestSha !== actualSha) {
          throw new ValidationError(
            `INTEGRITY_CHECK_FAILED: Manifest checksum mismatch for binary "${f.binaryPath}"`
          );
        }

        totalBinaryBytes += binData.length;
      }
    }
  }

  // Also verify any binary in attachments/binaries/* not in files.json
  for (const [path, buf] of parsedFiles.entries()) {
    if (path.startsWith('attachments/binaries/')) {
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      const expectedSha = manifest.checksums?.[path];
      if (expectedSha && expectedSha !== sha) {
        throw new ValidationError(
          `INTEGRITY_CHECK_FAILED: Archive binary "${path}" checksum mismatch`
        );
      }
    }
  }

  // 6. Quota verification
  const usageRes = await client.query<{
    stored_bytes: string | number;
    max_storage_bytes: string | number;
  }>(
    `SELECT stored_bytes, max_storage_bytes FROM app.workspace_storage_usage WHERE workspace_id = $1;`,
    [workspaceId]
  );
  const currentStored = usageRes.rows[0] ? Number(usageRes.rows[0].stored_bytes) : 0;
  const maxStorage = usageRes.rows[0] ? Number(usageRes.rows[0].max_storage_bytes) : 1073741824; // 1 GiB default
  const availableBytes = Math.max(0, maxStorage - currentStored);

  // 7. Duplicate Detection
  const duplicates: ImportDuplicateItem[] = [];

  if (notesBuf) {
    const notes = JSON.parse(notesBuf.toString('utf8')) as Array<{
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

    for (const note of notes) {
      const match = existingMap.get(note.title.toLowerCase().trim());
      if (match) {
        duplicates.push({
          entityType: 'note',
          identifier: note.title,
          title: note.title,
          importedId: note.id,
          existingId: match.id,
          existingUpdatedAt: match.updated_at.toISOString(),
          importedUpdatedAt: note.updatedAt,
        });
      }
    }
  }

  if (tasksBuf) {
    const tasks = JSON.parse(tasksBuf.toString('utf8')) as Array<{
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

    for (const task of tasks) {
      const match = existingMap.get(task.title.toLowerCase().trim());
      if (match) {
        duplicates.push({
          entityType: 'task',
          identifier: task.title,
          title: task.title,
          importedId: task.id,
          existingId: match.id,
          existingUpdatedAt: match.updated_at.toISOString(),
          importedUpdatedAt: task.updatedAt,
        });
      }
    }
  }

  if (journalBuf) {
    const entries = JSON.parse(journalBuf.toString('utf8')) as Array<{
      id: string;
      entryDate: string;
      title?: string;
      updatedAt?: string;
    }>;
    const existingJournals = await client.query<{
      id: string;
      entry_date: string | Date;
      updated_at: Date;
    }>(
      `SELECT j.id, j.entry_date::text as entry_date, j.updated_at
       FROM app.journal_entries j
       JOIN app.items i ON i.id = j.id AND i.workspace_id = j.workspace_id
       WHERE j.workspace_id = $1 AND i.deleted_at IS NULL;`,
      [workspaceId]
    );
    const existingMap = new Map(
      existingJournals.rows.map((r) => [
        typeof r.entry_date === 'string'
          ? r.entry_date
          : (r.entry_date as Date).toISOString().split('T')[0],
        r,
      ])
    );

    for (const entry of entries) {
      const match = existingMap.get(entry.entryDate);
      if (match) {
        duplicates.push({
          entityType: 'journal',
          identifier: entry.entryDate,
          title: entry.title || `Journal: ${entry.entryDate}`,
          importedId: entry.id,
          existingId: match.id,
          existingUpdatedAt: match.updated_at.toISOString(),
          importedUpdatedAt: entry.updatedAt,
        });
      }
    }
  }

  // 8. Store uploaded archive in private storage and record durable preview session
  const previewId = crypto.randomUUID();
  const now = Date.now();
  const expiresAtMs = now + IMPORT_PREVIEW_TTL_SECONDS * 1000;
  const storagePath = `imports/${workspaceId}/${previewId}.zip`;

  await storageProvider.putObject(PRIVATE_ASSETS_BUCKET, storagePath, archiveBuffer, {
    contentType: 'application/zip',
  });

  const sessionHash = sessionToken
    ? crypto.createHash('sha256').update(sessionToken).digest('hex').substring(0, 32)
    : 'unspecified_session';

  await client.query(
    `INSERT INTO app.workspace_imports
      (id, workspace_id, user_id, session_hash, status, storage_path, manifest, detected_duplicates, required_binary_bytes, expires_at)
     VALUES
      ($1, $2, $3, $4, 'preview_ready', $5, $6, $7, $8, $9);`,
    [
      previewId,
      workspaceId,
      actorUserId,
      sessionHash,
      storagePath,
      JSON.stringify(manifest),
      JSON.stringify(duplicates),
      totalBinaryBytes,
      new Date(expiresAtMs).toISOString(),
    ]
  );

  const warnings: string[] = [];
  const isQuotaSufficient = totalBinaryBytes <= availableBytes;
  if (!isQuotaSufficient) {
    warnings.push(
      `STORAGE_QUOTA_EXCEEDED: Workspace storage quota is insufficient. Required: ${totalBinaryBytes} bytes, Available: ${availableBytes} bytes`
    );
  }

  return {
    previewId,
    manifestSummary: manifest.summary,
    detectedDuplicates: duplicates,
    availableDuplicateStrategies: ['skip', 'create_copy', 'overwrite_if_newer'],
    storageQuota: {
      requiredBytes: totalBinaryBytes,
      availableBytes,
      isQuotaSufficient,
    },
    warnings,
    isValid: isQuotaSufficient,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

/**
 * Executes a confirmed workspace import with total ID remapping, duplicate resolution strategies,
 * atomic storage quota reservation, and durable sync change feed records.
 */
export async function executeConfirmedImport(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  previewId: string,
  duplicateStrategy: ImportDuplicateStrategy,
  storageProvider: StorageProviderContract = getDefaultStorageProvider()
): Promise<ExecuteImportResponse> {
  // 1. Fetch import session with row lock
  const res = await client.query<{
    id: string;
    workspace_id: string;
    user_id: string;
    status: string;
    storage_path: string;
    manifest: ExportManifest;
    detected_duplicates: ImportDuplicateItem[];
    required_binary_bytes: string | number;
    execution_result?: ExecuteImportResponse;
    expires_at: Date;
  }>(
    `SELECT id, workspace_id, user_id, status, storage_path, manifest, detected_duplicates, required_binary_bytes, execution_result, expires_at
     FROM app.workspace_imports
     WHERE id = $1 AND workspace_id = $2
     FOR UPDATE;`,
    [previewId, workspaceId]
  );

  if (!res.rows[0]) {
    throw new NotFoundError('Import preview session not found');
  }

  const importRecord = res.rows[0];

  // Idempotency: return existing result on retry
  if (importRecord.status === 'completed' && importRecord.execution_result) {
    return importRecord.execution_result;
  }

  if (importRecord.status === 'executing') {
    throw new ConflictError('Import is currently executing; please await completion');
  }

  if (importRecord.status !== 'preview_ready') {
    throw new ValidationError(
      `Import session cannot be executed from state "${importRecord.status}"`
    );
  }

  if (Date.now() > importRecord.expires_at.getTime()) {
    throw new ValidationError('Import preview has expired. Please upload the archive again.');
  }

  if (importRecord.user_id !== actorUserId) {
    throw new ForbiddenError('Import preview belongs to a different user identity');
  }

  // 2. Mark status = 'executing'
  await client.query(
    `UPDATE app.workspace_imports SET status = 'executing', updated_at = now() WHERE id = $1;`,
    [previewId]
  );

  // 3. Atomically check and reserve storage quota
  const requiredBytes = Number(importRecord.required_binary_bytes);
  if (requiredBytes > 0) {
    const quotaRes = await client.query<{
      stored_bytes: string | number;
      max_storage_bytes: string | number;
    }>(
      `SELECT stored_bytes, max_storage_bytes FROM app.workspace_storage_usage WHERE workspace_id = $1 FOR UPDATE;`,
      [workspaceId]
    );
    const currentStored = quotaRes.rows[0] ? Number(quotaRes.rows[0].stored_bytes) : 0;
    const maxStorage = quotaRes.rows[0] ? Number(quotaRes.rows[0].max_storage_bytes) : 1073741824;
    if (currentStored + requiredBytes > maxStorage) {
      throw new ValidationError(
        `STORAGE_QUOTA_EXCEEDED: Cannot execute import: required ${requiredBytes} bytes exceeds storage quota`
      );
    }
  }

  // 4. Load archive from storage
  const archiveBuffer = await storageProvider.getObject(
    PRIVATE_ASSETS_BUCKET,
    importRecord.storage_path
  );
  if (!archiveBuffer) {
    throw new NotFoundError('Import archive payload missing from storage');
  }

  const parsedFiles = parseZipArchive(archiveBuffer);
  const duplicateMap = new Map(
    (importRecord.detected_duplicates || []).map((d) => [d.importedId, d])
  );

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
    expenses: 0,
    expenseCategories: 0,
    expenseRecurringTemplates: 0,
    expenseBudgets: 0,
  };
  let skippedCounts = 0;
  let copiedCounts = 0;
  let overwrittenCounts = 0;

  // Track created entities for change feed
  const createdChanges: Array<{
    entityType: string;
    entityId: string;
    action: 'created' | 'updated';
  }> = [];

  // --- 1. Folders ---
  const foldersJson = parsedFiles.get('metadata/folders.json');
  if (foldersJson) {
    const folders = JSON.parse(foldersJson.toString('utf8')) as Array<{
      id: string;
      parentId: string | null;
      name: string;
      color: string | null;
      icon: string | null;
    }>;

    for (const f of folders) {
      const newFolderId = resolveId(f.id)!;
      await client.query(
        `INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
         VALUES ($1, $2, NULL, 'folder', $3, $3, 'standard')
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [newFolderId, workspaceId, actorUserId]
      );
      await client.query(
        `INSERT INTO app.folders (id, workspace_id, parent_id, name, color, icon)
         VALUES ($1, $2, NULL, $3, $4, $5)
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [newFolderId, workspaceId, f.name, f.color, f.icon]
      );
      importedCounts.folders++;
      createdChanges.push({ entityType: 'folder', entityId: newFolderId, action: 'created' });
    }

    for (const f of folders) {
      if (f.parentId) {
        const newFolderId = resolveId(f.id)!;
        const newParentId = resolveId(f.parentId);
        await client.query(
          `UPDATE app.folders SET parent_id = $1 WHERE id = $2 AND workspace_id = $3;`,
          [newParentId, newFolderId, workspaceId]
        );
        await client.query(
          `UPDATE app.items SET folder_id = $1 WHERE id = $2 AND workspace_id = $3;`,
          [newParentId, newFolderId, workspaceId]
        );
      }
    }
  }

  // --- 2. Tags ---
  const tagsJson = parsedFiles.get('metadata/tags.json');
  if (tagsJson) {
    const tags = JSON.parse(tagsJson.toString('utf8')) as Array<{
      id: string;
      name: string;
      color: string | null;
    }>;
    for (const t of tags) {
      const newTagId = resolveId(t.id)!;
      await client.query(
        `INSERT INTO app.tags (id, workspace_id, name, color, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (workspace_id, lower(name)) DO NOTHING;`,
        [newTagId, workspaceId, t.name, t.color, actorUserId]
      );
    }
  }

  // --- 3. Saved Views ---
  const viewsJson = parsedFiles.get('metadata/saved_views.json');
  if (viewsJson) {
    const views = JSON.parse(viewsJson.toString('utf8')) as Array<{
      id: string;
      name: string;
      icon: string | null;
      color: string | null;
      entityType: string;
      filter: unknown;
      rank?: number;
      isPinned?: boolean;
    }>;
    for (const v of views) {
      const newViewId = resolveId(v.id)!;
      await client.query(
        `INSERT INTO app.saved_views (id, workspace_id, user_id, name, icon, color, entity_type, filter, rank, is_pinned)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING;`,
        [
          newViewId,
          workspaceId,
          actorUserId,
          v.name,
          v.icon,
          v.color,
          v.entityType,
          JSON.stringify(v.filter || {}),
          v.rank || 0,
          Boolean(v.isPinned),
        ]
      );
    }
  }

  // --- 4. Notes (With Purpose Preserved!) ---
  const notesJson = parsedFiles.get('notes/notes.json');
  if (notesJson) {
    const notes = JSON.parse(notesJson.toString('utf8')) as Array<{
      id: string;
      folderId: string | null;
      title: string;
      document: unknown;
      plainText: string;
      wordCount: number;
      charCount: number;
      purpose?: string;
      isPinned?: boolean;
      isArchived?: boolean;
      updatedAt?: string;
    }>;

    for (const n of notes) {
      const isDup = duplicateMap.get(n.id);
      let targetNoteId = resolveId(n.id)!;
      let targetTitle = n.title;
      let isOverwrite = false;

      if (isDup) {
        if (duplicateStrategy === 'skip') {
          skippedCounts++;
          idMap.set(n.id, isDup.existingId); // Map skipped item to existing target ID!
          continue;
        } else if (duplicateStrategy === 'overwrite_if_newer') {
          const importedDate = n.updatedAt ? new Date(n.updatedAt).getTime() : 0;
          const existingDate = isDup.existingUpdatedAt
            ? new Date(isDup.existingUpdatedAt).getTime()
            : 0;
          if (importedDate > existingDate) {
            targetNoteId = isDup.existingId;
            idMap.set(n.id, isDup.existingId);
            isOverwrite = true;
            overwrittenCounts++;
          } else {
            skippedCounts++;
            idMap.set(n.id, isDup.existingId);
            continue;
          }
        } else if (duplicateStrategy === 'create_copy') {
          targetTitle = `${n.title} (Copy)`;
          copiedCounts++;
        }
      }

      const targetFolderId = resolveId(n.folderId);
      const notePurpose = n.purpose || 'general';

      if (isOverwrite) {
        await client.query(
          `UPDATE app.notes
           SET title = $1, document = $2, plain_text = $3, word_count = $4, char_count = $5, purpose = $6, updated_at = now()
           WHERE id = $7 AND workspace_id = $8;`,
          [
            targetTitle,
            JSON.stringify(n.document || {}),
            n.plainText || '',
            n.wordCount || 0,
            n.charCount || 0,
            notePurpose,
            targetNoteId,
            workspaceId,
          ]
        );
        createdChanges.push({ entityType: 'note', entityId: targetNoteId, action: 'updated' });
      } else {
        await client.query(
          `INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, is_pinned, is_archived, security_scope)
           VALUES ($1, $2, $3, 'note', $4, $4, $5, $6, 'standard')
           ON CONFLICT (workspace_id, id) DO NOTHING;`,
          [
            targetNoteId,
            workspaceId,
            targetFolderId,
            actorUserId,
            Boolean(n.isPinned),
            Boolean(n.isArchived),
          ]
        );

        await client.query(
          `INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count, purpose)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (workspace_id, id) DO NOTHING;`,
          [
            targetNoteId,
            workspaceId,
            targetTitle,
            JSON.stringify(n.document || {}),
            n.plainText || '',
            n.wordCount || 0,
            n.charCount || 0,
            notePurpose,
          ]
        );
        importedCounts.notes++;
        createdChanges.push({ entityType: 'note', entityId: targetNoteId, action: 'created' });
      }
    }
  }

  // --- 5. Tasks ---
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
      let targetTaskId = resolveId(t.id)!;
      let targetTitle = t.title;
      let isOverwrite = false;

      if (isDup) {
        if (duplicateStrategy === 'skip') {
          skippedCounts++;
          idMap.set(t.id, isDup.existingId);
          continue;
        } else if (duplicateStrategy === 'overwrite_if_newer') {
          const importedDate = t.updatedAt ? new Date(t.updatedAt).getTime() : 0;
          const existingDate = isDup.existingUpdatedAt
            ? new Date(isDup.existingUpdatedAt).getTime()
            : 0;
          if (importedDate > existingDate) {
            targetTaskId = isDup.existingId;
            idMap.set(t.id, isDup.existingId);
            isOverwrite = true;
            overwrittenCounts++;
          } else {
            skippedCounts++;
            idMap.set(t.id, isDup.existingId);
            continue;
          }
        } else if (duplicateStrategy === 'create_copy') {
          targetTitle = `${t.title} (Copy)`;
          copiedCounts++;
        }
      }

      const targetFolderId = resolveId(t.folderId);

      if (isOverwrite) {
        await client.query(
          `UPDATE app.tasks
           SET title = $1, details = $2, priority = $3, status = $4, deadline_type = $5,
               deadline_date = $6, deadline_time = $7, deadline_zone = $8, completed_at = $9, updated_at = now()
           WHERE id = $10 AND workspace_id = $11;`,
          [
            targetTitle,
            t.details,
            t.priority || 'normal',
            t.status || 'todo',
            t.deadlineType || 'none',
            t.deadlineDate,
            t.deadlineTime,
            t.deadlineZone,
            t.completedAt,
            targetTaskId,
            workspaceId,
          ]
        );
        createdChanges.push({ entityType: 'task', entityId: targetTaskId, action: 'updated' });
      } else {
        await client.query(
          `INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
           VALUES ($1, $2, $3, 'task', $4, $4, 'standard')
           ON CONFLICT (workspace_id, id) DO NOTHING;`,
          [targetTaskId, workspaceId, targetFolderId, actorUserId]
        );

        await client.query(
          `INSERT INTO app.tasks (id, workspace_id, title, details, priority, status, deadline_type, deadline_date, deadline_time, deadline_zone, completed_at, parent_id, tags)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, $12)
           ON CONFLICT (workspace_id, id) DO NOTHING;`,
          [
            targetTaskId,
            workspaceId,
            targetTitle,
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
        createdChanges.push({ entityType: 'task', entityId: targetTaskId, action: 'created' });
      }
    }

    // Pass 2: Connect parent task hierarchies
    for (const t of tasks) {
      if (t.parentId) {
        const targetTaskId = idMap.get(t.id);
        const targetParentId = idMap.get(t.parentId);
        if (targetTaskId && targetParentId) {
          await client.query(
            `UPDATE app.tasks SET parent_id = $1 WHERE id = $2 AND workspace_id = $3;`,
            [targetParentId, targetTaskId, workspaceId]
          );
        }
      }
    }
  }

  // --- 6. Routines ---
  const routinesJson = parsedFiles.get('routines/routines.json');
  if (routinesJson) {
    const routines = JSON.parse(routinesJson.toString('utf8')) as Array<{
      id: string;
      title: string;
      frequency: string;
      scheduledTime?: string;
      timezone?: string;
      weekdays: number[];
    }>;

    for (const r of routines) {
      const newRoutineId = resolveId(r.id)!;
      await client.query(
        `INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
         VALUES ($1, $2, NULL, 'routine', $3, $3, 'standard')
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [newRoutineId, workspaceId, actorUserId]
      );

      await client.query(
        `INSERT INTO app.routines (id, workspace_id, title, frequency, weekdays, timezone, scheduled_time, active_from)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE)
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [
          newRoutineId,
          workspaceId,
          r.title,
          r.frequency || 'daily',
          r.weekdays || [1, 2, 3, 4, 5],
          r.timezone || 'UTC',
          r.scheduledTime || '09:00',
        ]
      );
      importedCounts.routines++;
      createdChanges.push({ entityType: 'routine', entityId: newRoutineId, action: 'created' });
    }
  }

  // --- 7. Journal Entries ---
  const journalJson = parsedFiles.get('journal/journal.json');
  if (journalJson) {
    const entries = JSON.parse(journalJson.toString('utf8')) as Array<{
      id: string;
      title: string | null;
      entryDate: string;
      timezone: string;
      document: unknown;
      plainText: string;
      mood: string | null;
      prompts: unknown;
      tags: string[];
      updatedAt?: string;
    }>;

    for (const j of entries) {
      const isDup = duplicateMap.get(j.id);
      let targetJournalId = resolveId(j.id)!;
      let isOverwrite = false;

      if (isDup) {
        if (duplicateStrategy === 'skip') {
          skippedCounts++;
          idMap.set(j.id, isDup.existingId);
          continue;
        } else if (duplicateStrategy === 'overwrite_if_newer') {
          const importedDate = j.updatedAt ? new Date(j.updatedAt).getTime() : 0;
          const existingDate = isDup.existingUpdatedAt
            ? new Date(isDup.existingUpdatedAt).getTime()
            : 0;
          if (importedDate > existingDate) {
            targetJournalId = isDup.existingId;
            idMap.set(j.id, isDup.existingId);
            isOverwrite = true;
            overwrittenCounts++;
          } else {
            skippedCounts++;
            idMap.set(j.id, isDup.existingId);
            continue;
          }
        } else if (duplicateStrategy === 'create_copy') {
          skippedCounts++;
          idMap.set(j.id, isDup.existingId);
          continue;
        }
      }

      if (isOverwrite) {
        await client.query(
          `UPDATE app.journal_entries
           SET title = $1, document = $2, plain_text = $3, mood = $4, prompts = $5, tags = $6, updated_at = now()
           WHERE id = $7 AND workspace_id = $8;`,
          [
            j.title,
            JSON.stringify(j.document || {}),
            j.plainText || '',
            j.mood,
            JSON.stringify(j.prompts || []),
            j.tags || [],
            targetJournalId,
            workspaceId,
          ]
        );
        createdChanges.push({
          entityType: 'journal_entry',
          entityId: targetJournalId,
          action: 'updated',
        });
      } else {
        await client.query(
          `INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
           VALUES ($1, $2, NULL, 'journal_entry', $3, $3, 'standard')
           ON CONFLICT (workspace_id, id) DO NOTHING;`,
          [targetJournalId, workspaceId, actorUserId]
        );

        await client.query(
          `INSERT INTO app.journal_entries (id, workspace_id, title, entry_date, timezone, document, plain_text, mood, prompts, tags)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (workspace_id, id) DO NOTHING;`,
          [
            targetJournalId,
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
        createdChanges.push({
          entityType: 'journal_entry',
          entityId: targetJournalId,
          action: 'created',
        });
      }
    }
  }

  // --- 8. Calendar Events ---
  const calJson = parsedFiles.get('calendar/calendar.json');
  if (calJson) {
    const events = JSON.parse(calJson.toString('utf8')) as Array<{
      id: string;
      title: string;
      startDate: string;
      endDate: string | null;
      isAllDay: boolean;
      startTime: string | null;
      endTime: string | null;
      details?: string | null;
      timezone?: string | null;
    }>;

    for (const c of events) {
      const newCalId = resolveId(c.id)!;
      await client.query(
        `INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
         VALUES ($1, $2, NULL, 'calendar_event', $3, $3, 'standard')
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [newCalId, workspaceId, actorUserId]
      );

      await client.query(
        `INSERT INTO app.calendar_events (id, workspace_id, title, details, all_day, start_date, end_date, timezone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [
          newCalId,
          workspaceId,
          c.title,
          c.details || null,
          Boolean(c.isAllDay),
          c.startDate,
          c.endDate,
          c.timezone || 'UTC',
        ]
      );
      importedCounts.calendar++;
      createdChanges.push({ entityType: 'calendar_event', entityId: newCalId, action: 'created' });
    }
  }

  // --- 9. Files and Binaries (Full File Lifecycle) ---
  const filesJson = parsedFiles.get('attachments/files.json');
  let importedBytes = 0;
  if (filesJson) {
    const files = JSON.parse(filesJson.toString('utf8')) as Array<{
      id: string;
      folderId: string | null;
      fileName: string;
      declaredMimeType: string;
      detectedMimeType?: string;
      byteSize: number;
      sha256: string;
      binaryPath: string | null;
    }>;

    for (const f of files) {
      const newFileId = resolveId(f.id)!;
      const targetFolderId = resolveId(f.folderId);

      await client.query(
        `INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
         VALUES ($1, $2, $3, 'file', $4, $4, 'standard')
         ON CONFLICT (workspace_id, id) DO NOTHING;`,
        [newFileId, workspaceId, targetFolderId, actorUserId]
      );

      let storagePath = '';
      if (f.binaryPath) {
        const binData = parsedFiles.get(f.binaryPath);
        if (binData) {
          const freshStorageKey = `${workspaceId}/${newFileId}/${crypto.randomUUID()}_${f.fileName}`;
          await storageProvider.putObject(PRIVATE_ASSETS_BUCKET, freshStorageKey, binData, {
            contentType: f.detectedMimeType || f.declaredMimeType,
          });
          storagePath = freshStorageKey;
          importedBytes += binData.length;
        }
      }

      const finalObjectPath =
        storagePath || `workspaces/${workspaceId}/files/${newFileId}/${f.fileName}`;
      await client.query(
        `INSERT INTO app.file_items (id, workspace_id, folder_id, file_name, declared_mime_type, detected_mime_type, byte_size, sha256_checksum, object_path, quarantine_status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'verified', $10)
         ON CONFLICT (id) DO NOTHING;`,
        [
          newFileId,
          workspaceId,
          targetFolderId,
          f.fileName,
          f.declaredMimeType,
          f.detectedMimeType || f.declaredMimeType,
          f.byteSize,
          f.sha256,
          finalObjectPath,
          actorUserId,
        ]
      );

      if (storagePath) {
        await client.query(
          `INSERT INTO app.file_versions (file_id, workspace_id, version, object_path, byte_size, sha256_checksum, detected_mime_type, created_by)
           VALUES ($1, $2, '1', $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING;`,
          [
            newFileId,
            workspaceId,
            storagePath,
            f.byteSize,
            f.sha256,
            f.detectedMimeType || f.declaredMimeType,
            actorUserId,
          ]
        );
      }

      importedCounts.files++;
      createdChanges.push({ entityType: 'file', entityId: newFileId, action: 'created' });
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

  // --- 9b. Associations (Tags, Links, Routine Occurrences) ---
  const itemTagsJson = parsedFiles.get('metadata/item_tags.json');
  if (itemTagsJson) {
    try {
      const itemTags = JSON.parse(itemTagsJson.toString('utf8')) as Array<{
        itemId: string;
        tagId: string;
      }>;
      for (const it of itemTags) {
        const mappedItemId = resolveId(it.itemId);
        const mappedTagId = resolveId(it.tagId);
        if (mappedItemId && mappedTagId) {
          await client.query(
            `INSERT INTO app.item_tags (workspace_id, item_id, tag_id, created_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING;`,
            [workspaceId, mappedItemId, mappedTagId, actorUserId]
          );
        }
      }
    } catch {
      // Ignored non-fatal association errors
    }
  }

  const itemLinksJson = parsedFiles.get('metadata/item_links.json');
  if (itemLinksJson) {
    try {
      const itemLinks = JSON.parse(itemLinksJson.toString('utf8')) as Array<{
        sourceItemId: string;
        targetItemId: string;
        relationshipKind?: string;
      }>;
      for (const il of itemLinks) {
        const mappedSource = resolveId(il.sourceItemId);
        const mappedTarget = resolveId(il.targetItemId);
        if (mappedSource && mappedTarget && mappedSource !== mappedTarget) {
          await client.query(
            `INSERT INTO app.item_links (workspace_id, source_item_id, target_item_id, link_type, created_by)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT DO NOTHING;`,
            [workspaceId, mappedSource, mappedTarget, il.relationshipKind || 'related', actorUserId]
          );
        }
      }
    } catch {
      // Ignored non-fatal association errors
    }
  }

  const occJson = parsedFiles.get('routines/occurrences.json');
  if (occJson) {
    try {
      const occurrences = JSON.parse(occJson.toString('utf8')) as Array<{
        id: string;
        routineId: string;
        occurrenceDate: string;
        status?: string;
        completedAt?: string | null;
      }>;
      for (const occ of occurrences) {
        const mappedRoutineId = resolveId(occ.routineId);
        if (mappedRoutineId && occ.occurrenceDate) {
          const newOccId = crypto.randomUUID();
          await client.query(
            `INSERT INTO app.routine_occurrences (id, workspace_id, routine_id, scheduled_date, status, completed_at, timezone)
             VALUES ($1, $2, $3, $4, $5, $6, 'UTC')
             ON CONFLICT DO NOTHING;`,
            [
              newOccId,
              workspaceId,
              mappedRoutineId,
              occ.occurrenceDate,
              occ.status || 'pending',
              occ.completedAt || null,
            ]
          );
        }
      }
    } catch {
      // Ignored non-fatal routine occurrence errors
    }
  }

  // --- 9c. Expense Categories ---
  const expCategoriesJson = parsedFiles.get('expenses/categories.json');
  if (expCategoriesJson) {
    try {
      const categories = JSON.parse(expCategoriesJson.toString('utf8')) as Array<{
        id: string;
        name: string;
        color: string | null;
        icon: string | null;
        isSystem?: boolean;
      }>;
      for (const cat of categories) {
        // If a category with same name exists in target workspace, reuse it
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM app.expense_categories WHERE workspace_id = $1 AND lower(trim(name)) = lower(trim($2)) AND deleted_at IS NULL;`,
          [workspaceId, cat.name]
        );
        if (existing.rows[0]) {
          idMap.set(cat.id, existing.rows[0].id);
        } else {
          const newCatId = resolveId(cat.id)!;
          await client.query(
            `INSERT INTO app.expense_categories (id, workspace_id, name, color, icon, display_order)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO NOTHING;`,
            [newCatId, workspaceId, cat.name.trim(), cat.color || null, cat.icon || null, (cat as any).displayOrder ?? 0]
          );
          importedCounts.expenseCategories++;
          createdChanges.push({
            entityType: 'expense_category',
            entityId: newCatId,
            action: 'created',
          });
        }
      }
    } catch {
      // Ignored non-fatal category import errors
    }
  }

  // --- 9d. Expense Recurring Templates ---
  const expRecurringJson = parsedFiles.get('expenses/recurring_templates.json');
  if (expRecurringJson) {
    try {
      const templates = JSON.parse(expRecurringJson.toString('utf8')) as Array<{
        id: string;
        title?: string;
        categoryId?: string | null;
        currency: string;
        amountMinor: string | number;
        kind: 'expense' | 'income';
        paymentLabel?: string | null;
        note?: string | null;
        notes?: string | null;
        schedule?: unknown;
        recurrencePattern?: unknown;
        timezone?: string;
        startDate: string;
        endDate?: string | null;
        isActive?: boolean;
      }>;
      for (const t of templates) {
        const newTemplateId = resolveId(t.id)!;
        const targetCatId = resolveId(t.categoryId);

        // Verify category exists in this workspace if specified
        let safeCatId: string | null = null;
        if (targetCatId) {
          const catCheck = await client.query<{ id: string }>(
            `SELECT id FROM app.expense_categories WHERE id = $1 AND workspace_id = $2;`,
            [targetCatId, workspaceId]
          );
          if (catCheck.rows[0]) safeCatId = targetCatId;
        }

        const title = t.title || 'Recurring Template';
        const schedule = t.schedule || t.recurrencePattern || { frequency: 'monthly', interval: 1 };
        const note = t.note || t.notes || null;
        const timezone = t.timezone || 'UTC';

        await client.query(
          `INSERT INTO app.expense_recurring_templates
            (id, workspace_id, title, kind, amount_minor_units, currency, category_id, payment_label, note, schedule, timezone, start_date, end_date, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO NOTHING;`,
          [
            newTemplateId,
            workspaceId,
            title,
            t.kind,
            BigInt(t.amountMinor),
            t.currency,
            safeCatId,
            t.paymentLabel || null,
            note,
            JSON.stringify(schedule),
            timezone,
            t.startDate,
            t.endDate || null,
            t.isActive ?? true,
          ]
        );
        importedCounts.expenseRecurringTemplates++;
        createdChanges.push({
          entityType: 'expense_recurring_template',
          entityId: newTemplateId,
          action: 'created',
        });
      }
    } catch {
      // Ignored non-fatal recurring template errors
    }
  }

  // --- 9e. Expense Items ---
  const expensesJson = parsedFiles.get('expenses/expenses.json');
  if (expensesJson) {
    try {
      const expenses = JSON.parse(expensesJson.toString('utf8')) as Array<{
        id: string;
        folderId?: string | null;
        categoryId?: string | null;
        receiptFileId?: string | null;
        originalExpenseId?: string | null;
        transactionDate: string;
        currency: string;
        amountMinor: string | number;
        kind: 'expense' | 'income' | 'refund';
        paymentLabel?: string | null;
        note?: string | null;
        notes?: string | null;
        timezone?: string;
      }>;

      // Pass 1: Insert all expenses without original_expense_id
      for (const e of expenses) {
        const targetExpenseId = resolveId(e.id)!;
        const targetFolderId = resolveId(e.folderId);
        const targetCatId = resolveId(e.categoryId);
        const rawReceiptId = resolveId(e.receiptFileId);

        let safeFolderId: string | null = null;
        if (targetFolderId) {
          const fCheck = await client.query<{ id: string }>(
            `SELECT id FROM app.folders WHERE id = $1 AND workspace_id = $2;`,
            [targetFolderId, workspaceId]
          );
          if (fCheck.rows[0]) safeFolderId = targetFolderId;
        }

        let safeCatId: string | null = null;
        if (targetCatId) {
          const catCheck = await client.query<{ id: string }>(
            `SELECT id FROM app.expense_categories WHERE id = $1 AND workspace_id = $2;`,
            [targetCatId, workspaceId]
          );
          if (catCheck.rows[0]) safeCatId = targetCatId;
        }

        let safeReceiptId: string | null = null;
        if (rawReceiptId) {
          const fileCheck = await client.query<{ id: string }>(
            `SELECT id FROM app.file_items WHERE id = $1 AND workspace_id = $2;`,
            [rawReceiptId, workspaceId]
          );
          if (fileCheck.rows[0]) safeReceiptId = rawReceiptId;
        }

        await client.query(
          `INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
           VALUES ($1, $2, $3, 'expense', $4, $4, 'standard')
           ON CONFLICT (workspace_id, id) DO NOTHING;`,
          [targetExpenseId, workspaceId, safeFolderId, actorUserId]
        );

        await client.query(
          `INSERT INTO app.expense_items (id, workspace_id, category_id, receipt_file_id, original_expense_id, transaction_date, currency, amount_minor_units, kind, payment_label, note, timezone)
           VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (workspace_id, id) DO NOTHING;`,
          [
            targetExpenseId,
            workspaceId,
            safeCatId,
            safeReceiptId,
            e.transactionDate,
            e.currency,
            BigInt(e.amountMinor),
            e.kind,
            e.paymentLabel || null,
            e.note || e.notes || null,
            e.timezone || 'UTC',
          ]
        );

        importedCounts.expenses++;
        createdChanges.push({
          entityType: 'expense',
          entityId: targetExpenseId,
          action: 'created',
        });
      }

      // Pass 2: Link refunds to original expenses
      for (const e of expenses) {
        if (e.originalExpenseId) {
          const targetExpenseId = resolveId(e.id)!;
          const targetOriginalId = resolveId(e.originalExpenseId);
          if (targetOriginalId) {
            await client.query(
              `UPDATE app.expense_items
               SET original_expense_id = $1
               WHERE id = $2 AND workspace_id = $3;`,
              [targetOriginalId, targetExpenseId, workspaceId]
            );
          }
        }
      }
    } catch {
      // Ignored non-fatal expense item errors
    }
  }

  // --- 9f. Expense Budgets ---
  const expBudgetsJson = parsedFiles.get('expenses/budgets.json');
  if (expBudgetsJson) {
    try {
      const budgets = JSON.parse(expBudgetsJson.toString('utf8')) as Array<{
        id: string;
        categoryId?: string | null;
        period?: string;
        periodMonth?: string;
        currency: string;
        amountMinor: string | number;
      }>;
      for (const b of budgets) {
        const newBudgetId = resolveId(b.id)!;
        const targetCatId = resolveId(b.categoryId);

        let safeCatId: string | null = null;
        if (targetCatId) {
          const catCheck = await client.query<{ id: string }>(
            `SELECT id FROM app.expense_categories WHERE id = $1 AND workspace_id = $2;`,
            [targetCatId, workspaceId]
          );
          if (catCheck.rows[0]) safeCatId = targetCatId;
        }

        const period = b.period || b.periodMonth;
        if (!period) continue;

        await client.query(
          `INSERT INTO app.expense_budgets (id, workspace_id, category_id, period, currency, amount_minor_units)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING;`,
          [
            newBudgetId,
            workspaceId,
            safeCatId,
            period,
            b.currency,
            BigInt(b.amountMinor),
          ]
        );
        importedCounts.expenseBudgets++;
        createdChanges.push({
          entityType: 'expense_budget',
          entityId: newBudgetId,
          action: 'created',
        });
      }
    } catch {
      // Ignored non-fatal budget import errors
    }
  }

  // --- 10. Durable Sync Feed Emission for Real Synchronization ---
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  let nextSeq = syncState.nextChangeSeq;

  for (const item of createdChanges) {
    await insertChange(client, {
      workspaceId,
      seq: nextSeq++,
      entityType: item.entityType,
      entityId: item.entityId,
      revision: 1,
      isTombstone: false,
      operationId: crypto.randomUUID(),
      changeData: { action: item.action, previewId },
    });
  }

  await insertChange(client, {
    workspaceId,
    seq: nextSeq++,
    entityType: 'workspace',
    entityId: workspaceId,
    revision: 1,
    isTombstone: false,
    operationId: crypto.randomUUID(),
    changeData: { action: 'workspace_imported', previewId, duplicateStrategy, importedCounts },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, nextSeq);

  const finalResult: ExecuteImportResponse = {
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

  // Convert idMap to serializable object
  const mappingsObj: Record<string, string> = {};
  for (const [k, v] of idMap.entries()) {
    mappingsObj[k] = v;
  }

  // --- 11. Update Durable Import Session State ---
  await client.query(
    `UPDATE app.workspace_imports
     SET status = 'completed',
         execution_result = $1,
         entity_mappings = $2,
         duplicate_strategy = $3,
         completed_at = now(),
         updated_at = now()
     WHERE id = $4;`,
    [JSON.stringify(finalResult), JSON.stringify(mappingsObj), duplicateStrategy, previewId]
  );

  return finalResult;
}
