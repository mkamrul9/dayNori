import type {
  ItemHeaderRecord,
  DraftRecord,
  PendingMutationRecord,
  SyncCursorRecord,
  PreferenceSnapshotRecord,
  AccountNamespace,
  ConflictRecord,
  NoteRecord,
  TaskRecord,
  RoutineRecord,
  RoutineOccurrenceRecord,
  JournalEntryRecord,
  FileRecord,
  CalendarEventRecord,
} from './models.js';
import type { ClientMutation } from './types.js';
import type { WorkspaceId } from '@daynori/domain';

/**
 * Common port for local data persistence across platforms (IndexedDB on Web,
 * SQLCipher encrypted SQLite on Android).
 *
 * Implements atomic writes, account/workspace namespaces, draft quarantine,
 * and explicit error propagation.
 */
export interface LocalRepositoryPort {
  /**
   * Initializes or unlocks the database namespace for the given user and workspace.
   */
  initialize(namespace: AccountNamespace): Promise<void>;

  /**
   * Closes the active database connection.
   */
  close(): Promise<void>;

  // --- 1. Item Headers ---
  getItemHeader(workspaceId: string, id: string): Promise<ItemHeaderRecord | null>;
  listItemHeaders(workspaceId: string): Promise<ItemHeaderRecord[]>;
  upsertItemHeader(header: ItemHeaderRecord): Promise<void>;
  deleteItemHeader(workspaceId: string, id: string): Promise<void>;

  // --- 2. Drafts & Quarantine ---
  getDraft(workspaceId: string, userId: string, id: string): Promise<DraftRecord | null>;
  listDrafts(workspaceId: string, userId: string): Promise<DraftRecord[]>;
  saveDraft(draft: DraftRecord): Promise<void>;
  deleteDraft(workspaceId: string, userId: string, id: string): Promise<void>;
  quarantineUserDrafts(userId: string): Promise<void>;
  listQuarantinedDrafts(userId: string): Promise<DraftRecord[]>;
  restoreQuarantinedDraft(userId: string, id: string): Promise<void>;
  purgeQuarantinedDrafts(userId: string): Promise<void>;

  // --- 3. Pending Operations / Mutations ---
  enqueueMutation(mutation: PendingMutationRecord): Promise<void>;
  getPendingMutations(workspaceId: string, userId: string): Promise<PendingMutationRecord[]>;
  removePendingMutation(operationId: string): Promise<void>;

  // --- 4. Atomic Multi-Store Writes & Transactions ---
  saveDraftAndMutation(draft: DraftRecord, mutation: PendingMutationRecord): Promise<void>;
  saveItemTransaction(
    item: ItemHeaderRecord,
    mutation: PendingMutationRecord,
    draft?: DraftRecord,
    note?: NoteRecord,
    task?: TaskRecord,
    routine?: RoutineRecord,
    occurrence?: RoutineOccurrenceRecord,
    journalEntry?: JournalEntryRecord,
    calendarEvent?: CalendarEventRecord
  ): Promise<void>;
  applyAcknowledgment(
    header: ItemHeaderRecord,
    operationId: string,
    note?: NoteRecord,
    task?: TaskRecord,
    routine?: RoutineRecord,
    occurrence?: RoutineOccurrenceRecord,
    journalEntry?: JournalEntryRecord,
    calendarEvent?: CalendarEventRecord
  ): Promise<void>;
  applyPullPage(
    changes: ItemHeaderRecord[],
    newCursor: SyncCursorRecord,
    notes?: NoteRecord[],
    tasks?: TaskRecord[],
    routines?: RoutineRecord[],
    occurrences?: RoutineOccurrenceRecord[],
    journalEntries?: JournalEntryRecord[],
    files?: FileRecord[],
    calendarEvents?: CalendarEventRecord[]
  ): Promise<void>;
  installBootstrapGeneration(
    items: ItemHeaderRecord[],
    watermarkCursor: SyncCursorRecord,
    preserveLocalItemIds: Set<string>,
    notes?: NoteRecord[],
    tasks?: TaskRecord[],
    routines?: RoutineRecord[],
    occurrences?: RoutineOccurrenceRecord[],
    journalEntries?: JournalEntryRecord[],
    files?: FileRecord[],
    calendarEvents?: CalendarEventRecord[]
  ): Promise<void>;

  // --- 5. Conflicts ---
  getConflict(workspaceId: string, conflictId: string): Promise<ConflictRecord | null>;
  listConflicts(workspaceId: string): Promise<ConflictRecord[]>;
  saveConflict(conflict: ConflictRecord, updatedMutation?: PendingMutationRecord): Promise<void>;
  resolveConflictTransaction(
    conflictId: string,
    resolution: 'keep_server' | 'keep_local' | 'custom' | 'save_copy' | 'merge',
    updatedHeader?: ItemHeaderRecord,
    newMutation?: PendingMutationRecord,
    removeOperationId?: string,
    updatedNote?: NoteRecord,
    recoveryDraft?: DraftRecord,
    updatedTask?: TaskRecord,
    updatedRoutine?: RoutineRecord,
    updatedOccurrence?: RoutineOccurrenceRecord,
    updatedJournalEntry?: JournalEntryRecord,
    updatedCalendarEvent?: CalendarEventRecord
  ): Promise<void>;

  // --- 6. Notes & Documents ---
  getNote(workspaceId: string, id: string): Promise<NoteRecord | null>;
  listNotes(workspaceId: string): Promise<NoteRecord[]>;
  upsertNote(note: NoteRecord): Promise<void>;
  deleteNote(workspaceId: string, id: string): Promise<void>;

  // --- 7. Tasks & Deadlines ---
  getTask(workspaceId: string, id: string): Promise<TaskRecord | null>;
  listTasks(workspaceId: string): Promise<TaskRecord[]>;
  upsertTask(task: TaskRecord): Promise<void>;
  deleteTask(workspaceId: string, id: string): Promise<void>;

  // --- 8. Routines & Routine Occurrences ---
  getRoutine(workspaceId: string, id: string): Promise<RoutineRecord | null>;
  listRoutines(workspaceId: string): Promise<RoutineRecord[]>;
  upsertRoutine(routine: RoutineRecord): Promise<void>;
  deleteRoutine(workspaceId: string, id: string): Promise<void>;

  getRoutineOccurrence(workspaceId: string, id: string): Promise<RoutineOccurrenceRecord | null>;
  listRoutineOccurrences(
    workspaceId: string,
    routineId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<RoutineOccurrenceRecord[]>;
  upsertRoutineOccurrence(occurrence: RoutineOccurrenceRecord): Promise<void>;
  deleteRoutineOccurrence(workspaceId: string, id: string): Promise<void>;

  // --- 9. Journal Entries ---
  getJournalEntry(workspaceId: string, id: string): Promise<JournalEntryRecord | null>;
  listJournalEntries(
    workspaceId: string,
    options?: {
      entryDate?: string;
      startDate?: string;
      endDate?: string;
      includeDeleted?: boolean;
    }
  ): Promise<JournalEntryRecord[]>;
  upsertJournalEntry(entry: JournalEntryRecord): Promise<void>;
  deleteJournalEntry(workspaceId: string, id: string): Promise<void>;

  // --- 10. File Metadata Records ---
  getFile(workspaceId: string, id: string): Promise<FileRecord | null>;
  listFiles(workspaceId: string, folderId?: string | null): Promise<FileRecord[]>;
  upsertFile(file: FileRecord): Promise<void>;
  deleteFile(workspaceId: string, id: string): Promise<void>;

  // --- 11. Calendar Events ---
  getCalendarEvent(workspaceId: string, id: string): Promise<CalendarEventRecord | null>;
  listCalendarEvents(
    workspaceId: string,
    options?: {
      startDate?: string;
      endDate?: string;
      includeDeleted?: boolean;
    }
  ): Promise<CalendarEventRecord[]>;
  upsertCalendarEvent(event: CalendarEventRecord): Promise<void>;
  deleteCalendarEvent(workspaceId: string, id: string): Promise<void>;

  // --- 12. Sync Cursors ---
  getCursor(workspaceId: string, userId: string): Promise<SyncCursorRecord | null>;
  saveCursor(cursor: SyncCursorRecord): Promise<void>;

  // --- 13. Preference Snapshots ---
  getPreferenceSnapshot(userId: string): Promise<PreferenceSnapshotRecord | null>;
  savePreferenceSnapshot(snapshot: PreferenceSnapshotRecord): Promise<void>;

  // --- 14. Boundary Lifecycle & Data Erasure ---
  clearWorkspaceData(workspaceId: string): Promise<void>;
  clearAccountData(userId: string): Promise<void>;
}

/**
 * Legacy port interface from Phase 01 retained for contract compatibility.
 */
export interface SyncStoragePort {
  getPendingMutations(workspaceId: WorkspaceId): Promise<ClientMutation[]>;
  enqueueMutation(mutation: ClientMutation): Promise<void>;
  markAcknowledged(mutationId: string): Promise<void>;
  getCursor(workspaceId: WorkspaceId): Promise<string | null>;
  saveCursor(workspaceId: WorkspaceId, cursor: string): Promise<void>;
}
