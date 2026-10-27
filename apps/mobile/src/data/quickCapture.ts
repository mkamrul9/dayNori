import {
  CreateTaskRequestSchema,
  CreateNoteRequestSchema,
  CreateRoutineRequestSchema,
  CreateJournalEntryRequestSchema,
  type SyncCommandType,
} from '@daynori/contracts';
import {
  generateUuid,
  createNoteDocumentFromPlainText,
  getCalendarDateInTimezone,
} from '@daynori/domain';
import type { SyncEngine, ItemHeaderRecord } from '@daynori/sync';
import type { CreateDraft } from '../navigation/types.js';

/** Success means the typed record and retryable operation have committed to local storage. */
export async function saveQuickCapture(
  engine: Pick<SyncEngine, 'saveItem'> | null,
  workspaceId: string | null,
  draft: CreateDraft,
  timezone: string,
  options?: { id?: string }
): Promise<void> {
  if (!engine || !workspaceId)
    throw new Error('Sign in and open your workspace before saving. Your draft is kept.');
  if (draft.type === 'file')
    throw new Error('Choose a file in Library to upload its contents. Your draft is kept.');
  const now = new Date();
  const id = options?.id?.trim() || generateUuid();
  const common = { id, title: draft.title.trim(), folderId: null };
  let command: SyncCommandType;
  let payload: Record<string, unknown>;
  switch (draft.type) {
    case 'task':
      command = 'createTask';
      payload = CreateTaskRequestSchema.parse({ ...common, details: draft.details || null });
      break;
    case 'routine':
      command = 'createRoutine';
      payload = CreateRoutineRequestSchema.parse({
        ...common,
        details: draft.details || null,
        timezone,
      });
      break;
    case 'note':
      command = 'createNote';
      payload = CreateNoteRequestSchema.parse({
        ...common,
        document: createNoteDocumentFromPlainText(draft.details),
        plainText: draft.details,
      });
      break;
    case 'journal':
      command = 'createJournalEntry';
      payload = CreateJournalEntryRequestSchema.parse({
        ...common,
        document: createNoteDocumentFromPlainText(draft.details),
        plainText: draft.details,
        entryDate: getCalendarDateInTimezone(now, timezone),
        timezone,
      });
      break;
  }
  const header: ItemHeaderRecord = {
    id,
    workspaceId,
    kind: draft.type === 'journal' ? 'journal_entry' : draft.type,
    name: common.title,
    title: common.title,
    folderId: null,
    rank: '00001000',
    securityScope: 'standard',
    isArchived: false,
    isPinned: false,
    serverRevision: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    deletedAt: null,
  };
  await engine.saveItem(header, undefined, command, { payload });
}
