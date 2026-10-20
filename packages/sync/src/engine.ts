import type {
  SyncCommand,
  SyncPushRequest,
  SyncCommandType,
  NoteDocument,
  NotePurpose,
  TaskPriority,
  TaskStatus,
  TaskDeadline,
  TaskCompletionHistoryItem,
  RoutineFrequency,
  Weekday,
  RoutineOccurrenceStatus,
  RoutineOccurrenceTransition,
  JournalPromptEntry,
} from '@daynori/contracts';
import type { LocalRepositoryPort } from './ports.js';
import type {
  AccountNamespace,
  ItemHeaderRecord,
  DraftRecord,
  PendingMutationRecord,
  SyncCursorRecord,
  CloudSyncStatus,
  ItemSyncState,
  ConflictRecord,
  SyncDiagnostics,
  NoteRecord,
  TaskRecord,
  RoutineRecord,
  RoutineOccurrenceRecord,
  JournalEntryRecord,
  CalendarEventRecord,
} from './models.js';
import { type SyncTransportPort } from './transport.js';
import { type TabCoordinationPort, SingleProcessCoordinator } from './coordination.js';
import {
  MAX_OFFLINE_HORIZON_MS,
  validateFolderMovePolicy,
  mergeTaskFields,
} from './recovery.js';
import {
  applyRoomRevocationPurge,
  classifyRoomSyncFailure,
  planRoomRevocationPurge,
} from './roomRevocation.js';

export interface SaveItemOptions {
  dependencyOperationIds?: string[];
  autoSync?: boolean;
  payload?: Record<string, unknown>;
  commandVersion?: number;
  schemaVersion?: number;
}

export interface SyncEngineOptions {
  repository: LocalRepositoryPort;
  transport: SyncTransportPort;
  namespace?: AccountNamespace;
  workspaceId?: string;
  userId?: string;
  deviceId: string;
  coordination?: TabCoordinationPort;
  idGenerator?: () => string;
  initialNetworkStatus?: 'online' | 'offline';
  backoffOptions?: {
    initialDelayMs?: number;
    maxDelayMs?: number;
    factor?: number;
    jitter?: number;
    maxRetries?: number;
  };
  pollIntervalMs?: number;
  logger?: (level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
}

export type SyncEngineEvent =
  | { type: 'state_changed'; status: CloudSyncStatus }
  | { type: 'sync_completed'; changesCount: number; pushedCount: number }
  | { type: 'conflict_detected'; conflict: ConflictRecord }
  | { type: 'conflict_resolved'; conflictId: string }
  | {
      type: 'room_revoked';
      workspaceId: string;
      reason: string;
      message: string;
    }
  | { type: 'error'; message: string; code?: string; isAuthError?: boolean };

function defaultIdGenerator(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class SyncEngine {
  private repository: LocalRepositoryPort;
  private transport: SyncTransportPort;
  private namespace: AccountNamespace;
  private deviceId: string;
  private coordination: TabCoordinationPort;
  private generateId: () => string;

  private isRunning = false;
  private isSyncing = false;
  private networkStatus: 'online' | 'offline' = 'online';
  private overallCloudStatus: CloudSyncStatus = 'synced';
  private authLost = false;

  private pollIntervalMs: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  private initialDelayMs: number;
  private maxDelayMs: number;
  private factor: number;
  private jitter: number;
  private maxRetries: number;
  private consecutiveFailures = 0;

  private lastSyncedAt: string | null = null;
  private lastSyncSequence = 0;
  private accessEpoch: string | null = null;
  private syncGeneration = 0;

  private itemStates = new Map<string, ItemSyncState>();
  private activeConflicts = new Map<string, ConflictRecord>();
  private listeners = new Set<(event: SyncEngineEvent) => void>();

  private logger?: (
    level: 'info' | 'warn' | 'error',
    msg: string,
    meta?: Record<string, unknown>
  ) => void;
  private abortController: AbortController | null = null;
  private activeSyncPromise: Promise<void> | null = null;
  private queuedSyncPromise: Promise<void> | null = null;

  constructor(options: SyncEngineOptions) {
    this.repository = options.repository;
    this.transport = options.transport;
    this.namespace = options.namespace ?? {
      workspaceId: options.workspaceId ?? '',
      userId: options.userId ?? '',
    };
    this.deviceId = options.deviceId;
    this.coordination = options.coordination ?? new SingleProcessCoordinator();
    this.generateId = options.idGenerator ?? defaultIdGenerator;

    this.pollIntervalMs = options.pollIntervalMs ?? 30000;
    this.initialDelayMs = options.backoffOptions?.initialDelayMs ?? 500;
    this.maxDelayMs = options.backoffOptions?.maxDelayMs ?? 30000;
    this.factor = options.backoffOptions?.factor ?? 2;
    this.jitter = options.backoffOptions?.jitter ?? 0.2;
    this.maxRetries = options.backoffOptions?.maxRetries ?? 5;
    this.logger = options.logger;
    this.networkStatus = options.initialNetworkStatus ?? 'online';
  }

  // --- Lifecycle & Control ---

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.abortController = new AbortController();
    this.syncGeneration++;

    // 1. Reload durable state (conflicts and pending mutations)
    try {
      const persistedConflicts = await this.repository.listConflicts(this.namespace.workspaceId);
      this.activeConflicts.clear();
      for (const conflict of persistedConflicts) {
        this.activeConflicts.set(conflict.entityId, conflict);
        this.activeConflicts.set(conflict.id, conflict);
        this.itemStates.set(conflict.entityId, {
          savedOnDevice: true,
          cloudSyncStatus: 'conflict',
          lastError: conflict.conflictReason,
        });
      }

      const pending = await this.repository.getPendingMutations(
        this.namespace.workspaceId,
        this.namespace.userId
      );
      for (const m of pending) {
        if (!this.activeConflicts.has(m.entityId)) {
          this.itemStates.set(m.entityId, {
            savedOnDevice: true,
            cloudSyncStatus: m.status === 'failed' ? 'error' : 'saved_locally',
            pendingOperationId: m.operationId,
            lastError: m.lastError ?? undefined,
          });
        }
      }

      if (pending.some((m) => m.status === 'failed')) {
        this.setOverallStatus('error');
      } else if (this.activeConflicts.size > 0) {
        this.setOverallStatus('conflict');
      } else if (pending.length > 0) {
        this.setOverallStatus('saved_locally');
      } else {
        this.setOverallStatus('synced');
      }
    } catch (loadErr) {
      this.log('warn', `Failed to load durable sync state on start: ${String(loadErr)}`);
    }

    // 2. Start tab coordination
    this.coordination.start();
    this.coordination.onSyncRequested(() => {
      if (this.networkStatus === 'online') {
        if (this.coordination.isLeader) {
          this.syncNow().catch(() => {});
        }
      }
    });
    this.coordination.onLeaderChanged((isLeader) => {
      if (isLeader) {
        this.log('info', 'Elected as sync leader tab');
        this.scheduleNextPoll();
        if (this.networkStatus === 'online') {
          this.syncNow().catch(() => {});
        }
      } else {
        this.log('info', 'Yielded leadership to another tab');
        this.clearPollTimer();
      }
    });

    if (this.coordination.isLeader) {
      this.scheduleNextPoll();
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.syncGeneration++;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.clearPollTimer();
    this.clearRetryTimer();
    this.coordination.stop();
    this.log('info', 'SyncEngine stopped');
  }

  // --- State Query & Accessors ---

  getNetworkStatus(): 'online' | 'offline' {
    return this.networkStatus;
  }

  setNetworkStatus(status: 'online' | 'offline'): void {
    if (this.networkStatus !== status) {
      this.networkStatus = status;
      this.log('info', `Network status changed to ${status}`);
      if (status === 'online') {
        this.consecutiveFailures = 0;
        if (this.coordination.isLeader) {
          this.syncNow().catch(() => {});
        } else {
          this.coordination.requestSync();
        }
      } else {
        this.setOverallStatus('saved_locally');
      }
    }
  }

  getOverallCloudStatus(): CloudSyncStatus {
    return this.overallCloudStatus;
  }

  getItemSyncState(entityId: string): ItemSyncState {
    const existing = this.itemStates.get(entityId);
    if (existing) return existing;
    return {
      savedOnDevice: true,
      cloudSyncStatus: 'synced',
    };
  }

  getDiagnostics(): SyncDiagnostics {
    let pendingCount = 0;
    let failedCount = 0;
    for (const state of this.itemStates.values()) {
      if (state.cloudSyncStatus === 'saved_locally' || state.cloudSyncStatus === 'syncing') {
        pendingCount++;
      }
      if (state.cloudSyncStatus === 'error') {
        failedCount++;
      }
    }

    return {
      workspaceId: this.namespace.workspaceId,
      userId: this.namespace.userId,
      deviceId: this.deviceId,
      isLeader: this.coordination.isLeader,
      networkStatus: this.networkStatus,
      cloudSyncStatus: this.overallCloudStatus,
      queueLength: pendingCount,
      inFlightCount: this.isSyncing ? 1 : 0,
      failedCount,
      lastSyncedAt: this.lastSyncedAt,
      lastSyncSequence: this.lastSyncSequence,
      accessEpoch: this.accessEpoch,
      consecutiveFailures: this.consecutiveFailures,
      activeConflictsCount: this.getConflicts().length,
    };
  }

  getConflicts(): ConflictRecord[] {
    const unique = new Map<string, ConflictRecord>();
    for (const c of this.activeConflicts.values()) {
      if (!c.resolved) {
        unique.set(c.id, c);
      }
    }
    return Array.from(unique.values());
  }

  onEvent(callback: (event: SyncEngineEvent) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // --- Local Write Transaction ---

  /**
   * Performs an atomic local projection and/or draft save plus immutable mutation enqueue.
   * Guarantees that local storage reflects the edit before returning.
   * Never marks an unacknowledged mutation as synced.
   */
  async saveItem(
    item: ItemHeaderRecord,
    draft?: DraftRecord,
    command?: SyncCommandType,
    options?: SaveItemOptions
  ): Promise<PendingMutationRecord> {
    const operationId = this.generateId();
    const clientTimestamp = new Date().toISOString();

    // 1. Resolve dependency operations:
    // If there are pending operations for this entity, automatically depend on the latest one
    // to guarantee deterministic ordering within this client queue.
    const pendingForEntity = await this.getPendingForEntity(item.id);
    const inferredDeps = pendingForEntity.map((m) => m.operationId);
    const resolvedDeps = Array.from(
      new Set([...(options?.dependencyOperationIds || []), ...inferredDeps])
    );

    const isFolder =
      item.kind === 'folder' || (command !== undefined && command.includes('Folder'));
    const isNote =
      item.kind === 'note' ||
      item.kind === 'knowledge' ||
      (command !== undefined && (command.includes('Note') || command.includes('Knowledge')));
    const isTask =
      item.kind === 'task' ||
      item.kind === 'todo' ||
      (command !== undefined && command.includes('Task'));
    const isRoutine =
      item.kind === 'routine' || (command !== undefined && command.includes('Routine'));
    const isJournal =
      item.kind === 'journal_entry' ||
      item.kind === 'journal' ||
      (command !== undefined && (command.includes('Journal') || command.includes('journal')));
    const isCalendar =
      item.kind === 'calendar_event' ||
      (command !== undefined && (command.includes('CalendarEvent') || command.includes('Calendar')));

    const determinedCommand =
      command ||
      (item.serverRevision === 0
        ? isFolder
          ? 'createFolder'
          : isNote
            ? 'createNote'
            : isTask
              ? 'createTask'
              : isRoutine
                ? 'createRoutine'
                : isJournal
                  ? 'createJournalEntry'
                  : isCalendar
                    ? 'createCalendarEvent'
                    : 'createItem'
        : isFolder
          ? 'updateFolder'
          : isNote
            ? 'updateNote'
            : isTask
              ? 'updateTask'
              : isRoutine
                ? 'updateRoutine'
                : isJournal
                  ? 'updateJournalEntry'
                  : isCalendar
                    ? 'updateCalendarEvent'
                    : 'updateItem');

    const action: 'create' | 'update' | 'delete' =
      determinedCommand === 'trashItem' ||
      determinedCommand === 'trashFolder' ||
      determinedCommand === 'trashNote' ||
      determinedCommand === 'trashTask' ||
      determinedCommand === 'trashRoutine' ||
      determinedCommand === 'trashJournalEntry' ||
      determinedCommand === 'trashCalendarEvent' ||
      determinedCommand === 'deleteCalendarEvent'
        ? 'delete'
        : determinedCommand === 'createItem' ||
            determinedCommand === 'createFolder' ||
            determinedCommand === 'createNote' ||
            determinedCommand === 'createTask' ||
            determinedCommand === 'createRoutine' ||
            determinedCommand === 'createJournalEntry' ||
            determinedCommand === 'createCalendarEvent'
          ? 'create'
          : 'update';

    if (isFolder && action !== 'delete') {
      const targetParentId =
        item.parentId !== undefined
          ? item.parentId
          : item.folderId !== undefined
            ? item.folderId
            : null;
      const allHeaders = await this.repository.listItemHeaders(this.namespace.workspaceId);
      const existingFolders = allHeaders
        .filter((h) => (h.kind === 'folder' || !h.kind) && h.deletedAt === null)
        .map((h) => ({ id: h.id, parentId: h.parentId ?? h.folderId ?? null }));
      const validation = validateFolderMovePolicy({
        folderId: item.id,
        targetParentId,
        existingFolders,
      });
      if (!validation.valid) {
        throw new Error(validation.reason || 'Invalid folder move policy');
      }
    }

    // Typed metadata only - do NOT leak unpersisted feature bodies into server metadata sync payload
    const mutationPayload: Record<string, unknown> = isFolder
      ? {
          kind: 'folder',
          name: item.name || item.title || 'Untitled Folder',
          parentId: item.parentId !== undefined ? item.parentId : item.folderId,
          color: item.color,
          icon: item.icon,
          rank: item.rank,
          securityScope: item.securityScope,
          isArchived: item.isArchived,
          isPinned: item.isPinned,
          ...(options?.payload || {}),
        }
      : isNote
        ? {
            kind: 'note',
            title: item.title || item.name || 'Untitled',
            folderId: item.folderId,
            rank: item.rank,
            securityScope: item.securityScope,
            isArchived: item.isArchived,
            isPinned: item.isPinned,
            purpose:
              (options?.payload?.['purpose'] as string | undefined) ||
              item.purpose ||
              (item.kind === 'knowledge' ? 'guide' : 'standard'),
            ...(draft?.payload?.['document'] ? { document: draft.payload['document'] } : {}),
            ...(draft?.payload?.['plainText'] ? { plainText: draft.payload['plainText'] } : {}),
            ...(options?.payload || {}),
          }
        : isTask
          ? {
              kind: 'task',
              title: item.title || item.name || 'Untitled',
              folderId: item.folderId,
              rank: item.rank,
              securityScope: item.securityScope,
              isArchived: item.isArchived,
              isPinned: item.isPinned,
              priority: (options?.payload?.['priority'] as TaskPriority | undefined) ?? 'normal',
              status: (options?.payload?.['status'] as TaskStatus | undefined) ?? 'todo',
              deadline: (options?.payload?.['deadline'] as TaskDeadline | undefined) ?? {
                type: 'none',
              },
              details: (options?.payload?.['details'] as string | null | undefined) ?? null,
              parentId: (options?.payload?.['parentId'] as string | null | undefined) ?? null,
              subtaskOrder: (options?.payload?.['subtaskOrder'] as number | undefined) ?? 0,
              tags: (options?.payload?.['tags'] as string[] | undefined) ?? [],
              ...(options?.payload || {}),
            }
          : isRoutine
            ? {
                kind: 'routine',
                title: item.title || item.name || 'Untitled Routine',
                folderId: item.folderId,
                rank: item.rank,
                securityScope: item.securityScope,
                isArchived: item.isArchived,
                isPinned: item.isPinned,
                details: (options?.payload?.['details'] as string | null | undefined) ?? null,
                frequency:
                  (options?.payload?.['frequency'] as RoutineFrequency | undefined) ?? 'daily',
                weekdays: (options?.payload?.['weekdays'] as Weekday[] | undefined) ?? [],
                timezone: (options?.payload?.['timezone'] as string | undefined) ?? 'UTC',
                scheduledTime:
                  (options?.payload?.['scheduledTime'] as string | null | undefined) ?? null,
                activeFrom:
                  (options?.payload?.['activeFrom'] as string | undefined) ??
                  clientTimestamp.slice(0, 10),
                activeTo: (options?.payload?.['activeTo'] as string | null | undefined) ?? null,
                isPaused: (options?.payload?.['isPaused'] as boolean | undefined) ?? false,
                scheduleRevision:
                  (options?.payload?.['scheduleRevision'] as number | undefined) ?? 1,
                effectiveDate:
                  (options?.payload?.['effectiveDate'] as string | undefined) ??
                  clientTimestamp.slice(0, 10),
                ...(options?.payload || {}),
              }
            : isJournal
              ? {
                  kind: 'journal_entry',
                  title: item.title ?? (options?.payload?.['title'] as string | null) ?? null,
                  folderId: item.folderId,
                  rank: item.rank,
                  securityScope: item.securityScope,
                  isArchived: item.isArchived,
                  isPinned: item.isPinned,
                  entryDate:
                    (options?.payload?.['entryDate'] as string | undefined) ??
                    (draft?.payload?.['entryDate'] as string | undefined) ??
                    clientTimestamp.slice(0, 10),
                  timezone:
                    (options?.payload?.['timezone'] as string | undefined) ??
                    (draft?.payload?.['timezone'] as string | undefined) ??
                    'UTC',
                  mood: (options?.payload?.['mood'] as string | null | undefined) ?? null,
                  prompts:
                    (options?.payload?.['prompts'] as JournalPromptEntry[] | undefined) ??
                    (draft?.payload?.['prompts'] as JournalPromptEntry[] | undefined) ??
                    [],
                  tags:
                    (options?.payload?.['tags'] as string[] | undefined) ??
                    (draft?.payload?.['tags'] as string[] | undefined) ??
                    [],
                  isDraft: Boolean(
                    options?.payload?.['isDraft'] ?? draft?.payload?.['isDraft'] ?? false
                  ),
                  ...(draft?.payload?.['document'] ? { document: draft.payload['document'] } : {}),
                  ...(draft?.payload?.['plainText']
                    ? { plainText: draft.payload['plainText'] }
                    : {}),
                  ...(options?.payload || {}),
                }
              : isCalendar
                ? {
                    kind: 'calendar_event',
                    title: item.title || item.name || 'Untitled Event',
                    folderId: item.folderId,
                    rank: item.rank,
                    securityScope: item.securityScope,
                    isArchived: item.isArchived,
                    isPinned: item.isPinned,
                    ...(options?.payload || {}),
                  }
              : {
                  kind: item.kind,
                  rank: item.rank,
                  folderId: item.folderId,
                  securityScope: item.securityScope,
                  isArchived: item.isArchived,
                  isPinned: item.isPinned,
                  ...(item.name ? { name: item.name } : {}),
                  ...(item.title ? { title: item.title } : {}),
                  ...(options?.payload || {}),
                };

    // Calculate baseRevision for unsent intents:
    // If there are pending operations for this entity, chain expected base revision
    let baseRevision = item.serverRevision;
    if (pendingForEntity.length > 0) {
      const lastPending = pendingForEntity[pendingForEntity.length - 1];
      if (lastPending) {
        baseRevision = lastPending.baseRevision + 1;
      }
    }

    const mutationRecord: PendingMutationRecord = {
      operationId,
      deviceId: this.deviceId,
      workspaceId: item.workspaceId,
      userId: this.namespace.userId,
      entityType: isFolder
        ? 'folder'
        : isNote
          ? 'note'
          : isTask
            ? 'task'
            : isRoutine
              ? 'routine'
              : isJournal
                ? 'journal_entry'
                : isCalendar
                  ? 'calendar_event'
                  : 'item',
      entityId: item.id,
      action,
      command: determinedCommand,
      commandVersion: options?.commandVersion ?? 1,
      schemaVersion: options?.schemaVersion ?? 1,
      payload: mutationPayload,
      baseRevision,
      dependencyOperationIds: resolvedDeps,
      clientTimestamp,
      retryCount: 0,
      status: 'pending',
      lastError: null,
    };

    let noteRecord: NoteRecord | undefined;
    if (isNote) {
      const doc = (draft?.payload?.['document'] as Record<string, unknown> | undefined) ||
        (options?.payload?.['document'] as Record<string, unknown> | undefined) || {
          version: 1,
          type: 'doc',
          content: [],
        };
      const plainText =
        (draft?.payload?.['plainText'] as string | undefined) ??
        (options?.payload?.['plainText'] as string | undefined) ??
        '';
      const wordCount =
        (draft?.payload?.['wordCount'] as number | undefined) ??
        (options?.payload?.['wordCount'] as number | undefined) ??
        (plainText ? plainText.trim().split(/\s+/).filter(Boolean).length : 0);
      const charCount =
        (draft?.payload?.['charCount'] as number | undefined) ??
        (options?.payload?.['charCount'] as number | undefined) ??
        plainText.length;

      noteRecord = {
        id: item.id,
        workspaceId: item.workspaceId,
        folderId: item.folderId ?? null,
        title: item.title || item.name || 'Untitled',
        document: doc as NoteDocument,
        plainText,
        wordCount,
        charCount,
        serverRevision: item.serverRevision,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        deletedAt: item.deletedAt,
      };
    }

    let taskRecord: TaskRecord | undefined;
    if (isTask) {
      const priority = (options?.payload?.['priority'] as TaskPriority | undefined) ?? 'normal';
      const status = (options?.payload?.['status'] as TaskStatus | undefined) ?? 'todo';
      const deadline = (options?.payload?.['deadline'] as TaskDeadline | undefined) ?? {
        type: 'none',
      };
      const details = (options?.payload?.['details'] as string | null | undefined) ?? null;
      const completedAt =
        (options?.payload?.['completedAt'] as string | null | undefined) ??
        (status === 'completed' ? clientTimestamp : null);
      const reopenedAt = (options?.payload?.['reopenedAt'] as string | null | undefined) ?? null;
      const completionHistory =
        (options?.payload?.['completionHistory'] as TaskCompletionHistoryItem[] | undefined) ??
        (status === 'completed' ? [{ completedAt: clientTimestamp }] : []);
      const parentId = (options?.payload?.['parentId'] as string | null | undefined) ?? null;
      const subtaskOrder = (options?.payload?.['subtaskOrder'] as number | undefined) ?? 0;
      const tags = (options?.payload?.['tags'] as string[] | undefined) ?? [];

      taskRecord = {
        id: item.id,
        workspaceId: item.workspaceId,
        folderId: item.folderId ?? null,
        title: item.title || item.name || 'Untitled',
        details,
        priority,
        status,
        deadline,
        completedAt,
        reopenedAt,
        completionHistory,
        parentId,
        subtaskOrder,
        tags,
        serverRevision: item.serverRevision,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        deletedAt: item.deletedAt,
      };
    }

    let routineRecord: RoutineRecord | undefined;
    if (isRoutine) {
      const p = options?.payload || {};
      routineRecord = {
        id: item.id,
        workspaceId: item.workspaceId,
        folderId: item.folderId ?? null,
        title: (p['title'] as string) || item.title || item.name || 'Untitled Routine',
        details: (p['details'] as string | null) ?? null,
        frequency: (p['frequency'] as RoutineFrequency) ?? 'daily',
        weekdays: (p['weekdays'] as Weekday[]) ?? [],
        timezone: (p['timezone'] as string) || 'UTC',
        scheduledTime: (p['scheduledTime'] as string | null) ?? null,
        activeFrom: (p['activeFrom'] as string) || clientTimestamp.slice(0, 10),
        activeTo: (p['activeTo'] as string | null) ?? null,
        isPaused: Boolean(p['isPaused'] ?? false),
        isArchived: Boolean(p['isArchived'] ?? item.isArchived ?? false),
        isPinned: Boolean(p['isPinned'] ?? item.isPinned ?? false),
        scheduleRevision: (p['scheduleRevision'] as number) ?? 1,
        effectiveDate: (p['effectiveDate'] as string) || clientTimestamp.slice(0, 10),
        serverRevision: item.serverRevision,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        deletedAt: item.deletedAt,
      };
    }

    let journalRecord: JournalEntryRecord | undefined;
    if (isJournal) {
      const p = options?.payload || {};
      const doc = (draft?.payload?.['document'] as Record<string, unknown> | undefined) ||
        (p['document'] as Record<string, unknown> | undefined) || {
          version: 1,
          type: 'doc',
          content: [],
        };
      const plainText =
        (draft?.payload?.['plainText'] as string | undefined) ??
        (p['plainText'] as string | undefined) ??
        '';
      const wordCount =
        (draft?.payload?.['wordCount'] as number | undefined) ??
        (p['wordCount'] as number | undefined) ??
        (plainText ? plainText.trim().split(/\s+/).filter(Boolean).length : 0);
      const charCount =
        (draft?.payload?.['charCount'] as number | undefined) ??
        (p['charCount'] as number | undefined) ??
        plainText.length;
      const prompts =
        (p['prompts'] as JournalPromptEntry[]) ||
        (draft?.payload?.['prompts'] as JournalPromptEntry[]) ||
        [];
      const tags = (p['tags'] as string[]) || (draft?.payload?.['tags'] as string[]) || [];

      journalRecord = {
        id: item.id,
        workspaceId: item.workspaceId,
        folderId: item.folderId ?? null,
        title: item.title ?? (p['title'] as string | null) ?? null,
        entryDate:
          (p['entryDate'] as string) ||
          (draft?.payload?.['entryDate'] as string) ||
          clientTimestamp.slice(0, 10),
        timezone: (p['timezone'] as string) || (draft?.payload?.['timezone'] as string) || 'UTC',
        document: doc as NoteDocument,
        plainText,
        wordCount,
        charCount,
        mood: (p['mood'] as string | null) ?? null,
        prompts,
        tags,
        isDraft: Boolean(p['isDraft'] ?? draft?.payload?.['isDraft'] ?? false),
        isArchived: Boolean(p['isArchived'] ?? item.isArchived ?? false),
        isPinned: Boolean(p['isPinned'] ?? item.isPinned ?? false),
        securityScope: item.securityScope,
        serverRevision: item.serverRevision,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        deletedAt: item.deletedAt,
      };
    }

    let calendarRecord: CalendarEventRecord | undefined;
    if (isCalendar) {
      const p = options?.payload || {};
      const allDay = Boolean(p['allDay'] ?? false);
      calendarRecord = {
        id: item.id,
        workspaceId: item.workspaceId,
        folderId: item.folderId ?? null,
        title: (p['title'] as string) || item.title || item.name || 'Untitled Event',
        details: (p['details'] as string | null) ?? null,
        allDay,
        startDate: (p['startDate'] as string | null) ?? null,
        endDate: (p['endDate'] as string | null) ?? null,
        startAt: (p['startAt'] as string | null) ?? null,
        endAt: (p['endAt'] as string | null) ?? null,
        timezone: (p['timezone'] as string) || 'UTC',
        isArchived: Boolean(p['isArchived'] ?? item.isArchived ?? false),
        securityScope: (item.securityScope as 'standard' | 'vault') || 'standard',
        serverRevision: item.serverRevision,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        deletedAt: item.deletedAt,
      };
    }

    // 2. Perform atomic local storage write via transaction
    try {
      await this.repository.saveItemTransaction(
        item,
        mutationRecord,
        draft,
        noteRecord,
        taskRecord,
        routineRecord,
        undefined,
        journalRecord,
        calendarRecord
      );
    } catch (err) {
      // Local transaction failed: cannot show as saved on device
      const isQuota =
        (err instanceof Error &&
          (err.name === 'QuotaExceededError' ||
            err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
            err.message.toLowerCase().includes('quota') ||
            err.message.toLowerCase().includes('storage'))) ||
        (typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: unknown }).code === 'QUOTA_EXCEEDED');
      this.itemStates.set(item.id, {
        savedOnDevice: false,
        cloudSyncStatus: 'error',
        lastError: isQuota
          ? 'Local storage quota exceeded. Free up device storage.'
          : err instanceof Error
            ? err.message
            : String(err),
      });
      if (isQuota) {
        this.setOverallStatus('error');
      }
      throw err;
    }

    // 3. Mark state as saved locally (never say synced before server acknowledgment)
    this.itemStates.set(item.id, {
      savedOnDevice: true,
      cloudSyncStatus: 'saved_locally',
      pendingOperationId: operationId,
      lastSyncedRevision: item.serverRevision,
    });
    this.setOverallStatus('saved_locally');

    // 4. Request sync if online and autoSync is not false
    if (options?.autoSync !== false && this.networkStatus === 'online') {
      if (this.coordination.isLeader) {
        this.syncNow().catch(() => {});
      } else {
        this.coordination.requestSync();
      }
    }

    return mutationRecord;
  }

  async saveRoutine(
    routine: RoutineRecord,
    command?: SyncCommandType,
    options?: SaveItemOptions
  ): Promise<PendingMutationRecord> {
    const itemHeader: ItemHeaderRecord = {
      id: routine.id,
      workspaceId: routine.workspaceId,
      kind: 'routine',
      folderId: routine.folderId,
      rank: '00001000',
      isArchived: routine.isArchived,
      isPinned: routine.isPinned,
      securityScope: 'standard',
      serverRevision: routine.serverRevision,
      title: routine.title,
      name: routine.title,
      createdAt: routine.createdAt,
      updatedAt: routine.updatedAt,
      deletedAt: routine.deletedAt,
    };
    const payload = {
      id: routine.id,
      folderId: routine.folderId,
      title: routine.title,
      details: routine.details,
      frequency: routine.frequency,
      weekdays: routine.weekdays,
      timezone: routine.timezone,
      scheduledTime: routine.scheduledTime,
      activeFrom: routine.activeFrom,
      activeTo: routine.activeTo,
      isPaused: routine.isPaused,
      isArchived: routine.isArchived,
      isPinned: routine.isPinned,
      scheduleRevision: routine.scheduleRevision,
      effectiveDate: routine.effectiveDate,
      ...(options?.payload || {}),
    };
    return this.saveItem(itemHeader, undefined, command || 'createRoutine', {
      ...options,
      payload,
    });
  }

  async saveJournalEntry(
    entry: JournalEntryRecord,
    command?: SyncCommandType,
    options?: SaveItemOptions
  ): Promise<PendingMutationRecord> {
    const itemHeader: ItemHeaderRecord = {
      id: entry.id,
      workspaceId: entry.workspaceId,
      kind: 'journal_entry',
      folderId: entry.folderId,
      rank: '00001000',
      isArchived: entry.isArchived,
      isPinned: entry.isPinned,
      securityScope: entry.securityScope,
      serverRevision: entry.serverRevision,
      title: entry.title ?? undefined,
      name: entry.title ?? undefined,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      deletedAt: entry.deletedAt,
    };
    const payload = {
      id: entry.id,
      folderId: entry.folderId,
      title: entry.title,
      entryDate: entry.entryDate,
      timezone: entry.timezone,
      document: entry.document,
      plainText: entry.plainText,
      wordCount: entry.wordCount,
      charCount: entry.charCount,
      mood: entry.mood,
      prompts: entry.prompts,
      tags: entry.tags,
      isDraft: entry.isDraft,
      isArchived: entry.isArchived,
      isPinned: entry.isPinned,
      securityScope: entry.securityScope,
      ...(options?.payload || {}),
    };
    return this.saveItem(itemHeader, undefined, command || 'createJournalEntry', {
      ...options,
      payload,
    });
  }

  async saveCalendarEvent(
    event: CalendarEventRecord,
    command?: SyncCommandType,
    options?: SaveItemOptions
  ): Promise<PendingMutationRecord> {
    const itemHeader: ItemHeaderRecord = {
      id: event.id,
      workspaceId: event.workspaceId,
      kind: 'calendar_event',
      folderId: event.folderId,
      rank: '00001000',
      isArchived: event.isArchived,
      isPinned: false,
      securityScope: event.securityScope,
      serverRevision: event.serverRevision,
      title: event.title,
      name: event.title,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      deletedAt: event.deletedAt,
    };
    const payload = {
      id: event.id,
      folderId: event.folderId,
      title: event.title,
      details: event.details,
      allDay: event.allDay,
      startDate: event.startDate,
      endDate: event.endDate,
      startAt: event.startAt,
      endAt: event.endAt,
      timezone: event.timezone,
      isArchived: event.isArchived,
      securityScope: event.securityScope,
      ...(options?.payload || {}),
    };
    const defaultCommand: SyncCommandType =
      event.serverRevision === 0 ? 'createCalendarEvent' : 'updateCalendarEvent';
    return this.saveItem(itemHeader, undefined, command || defaultCommand, {
      ...options,
      payload,
    });
  }

  async saveRoutineOccurrence(
    occurrence: RoutineOccurrenceRecord,
    command?: SyncCommandType,
    options?: SaveItemOptions
  ): Promise<PendingMutationRecord> {
    const operationId = this.generateId();
    const clientTimestamp = new Date().toISOString();

    const pendingForEntity = await this.getPendingForEntity(occurrence.id);
    const pendingForRoutine = await this.getPendingForEntity(occurrence.routineId);

    const resolvedDeps = Array.from(
      new Set([
        ...(options?.dependencyOperationIds || []),
        ...pendingForRoutine.map((p) => p.operationId),
        ...pendingForEntity.map((p) => p.operationId),
      ])
    );

    let baseRevision = occurrence.serverRevision;
    if (pendingForEntity.length > 0) {
      const lastPending = pendingForEntity[pendingForEntity.length - 1];
      if (lastPending) {
        baseRevision = lastPending.baseRevision + 1;
      }
    }

    const determinedCommand: SyncCommandType =
      command ||
      (occurrence.status === 'done'
        ? 'completeOccurrence'
        : occurrence.status === 'skipped'
          ? 'skipOccurrence'
          : 'reopenOccurrence');

    const mutationPayload = {
      id: occurrence.id,
      routineId: occurrence.routineId,
      scheduledDate: occurrence.scheduledDate,
      status: occurrence.status,
      completedAt: occurrence.completedAt,
      completedBy: occurrence.completedBy,
      history: occurrence.history,
      baseRevision,
      ...(options?.payload || {}),
    };

    const mutationRecord: PendingMutationRecord = {
      operationId,
      deviceId: this.deviceId,
      workspaceId: occurrence.workspaceId,
      userId: this.namespace.userId,
      entityType: 'routine_occurrence',
      entityId: occurrence.id,
      action: 'update',
      command: determinedCommand,
      commandVersion: options?.commandVersion ?? 1,
      schemaVersion: options?.schemaVersion ?? 1,
      payload: mutationPayload,
      baseRevision,
      dependencyOperationIds: resolvedDeps,
      clientTimestamp,
      retryCount: 0,
      status: 'pending',
      lastError: null,
    };

    const dummyHeader: ItemHeaderRecord = {
      id: occurrence.id,
      workspaceId: occurrence.workspaceId,
      kind: 'routine_occurrence',
      folderId: null,
      rank: '0',
      isArchived: false,
      isPinned: false,
      securityScope: 'standard',
      serverRevision: occurrence.serverRevision,
      createdAt: occurrence.createdAt,
      updatedAt: occurrence.updatedAt,
      deletedAt: null,
    };

    try {
      await this.repository.saveItemTransaction(
        dummyHeader,
        mutationRecord,
        undefined,
        undefined,
        undefined,
        undefined,
        occurrence
      );
    } catch (err) {
      this.itemStates.set(occurrence.id, {
        savedOnDevice: false,
        cloudSyncStatus: 'error',
        lastError: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    this.itemStates.set(occurrence.id, {
      savedOnDevice: true,
      cloudSyncStatus: 'saved_locally',
      pendingOperationId: operationId,
      lastSyncedRevision: occurrence.serverRevision,
    });
    this.setOverallStatus('saved_locally');

    if (options?.autoSync !== false && this.networkStatus === 'online') {
      if (this.coordination.isLeader) {
        this.syncNow().catch(() => {});
      } else {
        this.coordination.requestSync();
      }
    }

    return mutationRecord;
  }

  // --- Synchronization Execution Cycle ---

  async syncNow(): Promise<void> {
    if (!this.isRunning) return;

    // Follower tabs must delegate synchronization to the elected leader
    if (!this.coordination.isLeader) {
      this.log('info', 'Follower tab delegating syncNow call to leader');
      this.coordination.requestSync();
      return;
    }

    if (this.networkStatus === 'offline') {
      this.log('info', 'Sync deferred: network is offline');
      return;
    }
    if (this.authLost) {
      this.log('warn', 'Sync deferred: authentication credentials required');
      return;
    }

    if (this.activeSyncPromise) {
      if (!this.queuedSyncPromise) {
        this.queuedSyncPromise = (async () => {
          try {
            await this.activeSyncPromise;
          } catch {
            // ignore active failure so queued attempt can run
          }
          this.queuedSyncPromise = null;
          return this.syncNow();
        })();
      }
      return this.queuedSyncPromise;
    }

    this.activeSyncPromise = (async () => {
      try {
        await this.executeSyncCycle();
      } finally {
        this.activeSyncPromise = null;
      }
    })();

    return this.activeSyncPromise;
  }

  /**
   * Alias for synchronize: ensures engine is started and triggers syncNow immediately.
   */
  async synchronize(): Promise<void> {
    if (!this.isRunning) {
      await this.start();
    }
    return this.syncNow();
  }

  private async executeSyncCycle(): Promise<void> {
    const currentGen = ++this.syncGeneration;
    const currentNsKey = `${this.namespace.userId}:${this.namespace.workspaceId}`;

    const isStale = () => {
      return (
        !this.isRunning ||
        this.syncGeneration !== currentGen ||
        !this.coordination.isLeader ||
        `${this.namespace.userId}:${this.namespace.workspaceId}` !== currentNsKey
      );
    };

    this.isSyncing = true;
    this.setOverallStatus('syncing');

    try {
      // 1. Pull latest server changes first to update projection and detect conflicts
      const pullResult = await this.pullChanges(isStale);
      if (isStale()) return;

      // 2. Push local pending mutations
      const pushResult = await this.pushPending(isStale);
      if (isStale()) return;

      this.consecutiveFailures = 0;
      this.clearRetryTimer();

      const remainingPending = await this.repository.getPendingMutations(
        this.namespace.workspaceId,
        this.namespace.userId
      );

      if (remainingPending.some((m) => m.status === 'failed')) {
        this.setOverallStatus('error');
      } else if (remainingPending.length > 0) {
        this.setOverallStatus('saved_locally');
      } else if (this.activeConflicts.size > 0) {
        this.setOverallStatus('conflict');
      } else {
        this.setOverallStatus('synced');
      }

      this.emit({
        type: 'sync_completed',
        changesCount: pullResult.changesCount,
        pushedCount: pushResult.pushedCount,
      });
    } catch (error) {
      if (!isStale()) {
        this.handleSyncFailure(error);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Drains the local pending mutation queue in dependency order, sending batches
   * of up to 50 operations.
   */
  async pushPending(isStale?: () => boolean): Promise<{ pushedCount: number }> {
    if (this.networkStatus === 'offline' || !this.coordination.isLeader) {
      return { pushedCount: 0 };
    }

    const pending = await this.repository.getPendingMutations(
      this.namespace.workspaceId,
      this.namespace.userId
    );

    // Exclude terminal failures from automatic retry loops!
    const retryable = pending.filter((m) => m.status !== 'failed');
    if (retryable.length === 0) {
      return { pushedCount: 0 };
    }

    // 1. Topologically sort queue respecting dependencyOperationIds
    const sortedQueue = this.topologicallySortPending(retryable);
    const rawBatch = sortedQueue.slice(0, 50);

    // Filter mutations against 90-day offline horizon: reject automatic replay and retain locally as conflicts
    const now = Date.now();
    const validBatch: PendingMutationRecord[] = [];
    for (const m of rawBatch) {
      const clientTime = new Date(m.clientTimestamp).getTime();
      if (!isNaN(clientTime) && now - clientTime > MAX_OFFLINE_HORIZON_MS) {
        const conflictRecord: ConflictRecord = {
          id: this.generateId(),
          entityId: m.entityId,
          entityType: m.entityType || 'item',
          operationId: m.operationId,
          workspaceId: this.namespace.workspaceId,
          userId: this.namespace.userId,
          localPayload: m.payload,
          baseRevision: m.baseRevision,
          serverRevision: 0,
          conflictReason:
            'Operation exceeds 90-day supported offline horizon. Review or export before retrying.',
          detectedAt: new Date().toISOString(),
          resolved: false,
        };
        this.activeConflicts.set(conflictRecord.entityId, conflictRecord);
        this.activeConflicts.set(conflictRecord.id, conflictRecord);
        m.status = 'failed';
        m.lastError = conflictRecord.conflictReason;
        await this.repository.saveConflict(conflictRecord, m);
        this.itemStates.set(m.entityId, {
          savedOnDevice: true,
          cloudSyncStatus: 'conflict',
          lastError: conflictRecord.conflictReason,
        });
        this.emit({ type: 'conflict_detected', conflict: conflictRecord });
      } else {
        validBatch.push(m);
      }
    }

    if (validBatch.length === 0) {
      return { pushedCount: 0 };
    }

    const commands: SyncCommand[] = validBatch.map((m) => {
      const isTask = m.entityType === 'task';
      const isCalendar = m.entityType === 'calendar_event';
      const cmdType: SyncCommandType =
        (m.command as SyncCommandType) ||
        (isCalendar
          ? m.action === 'delete'
            ? 'deleteCalendarEvent'
            : m.action === 'create'
              ? 'createCalendarEvent'
              : 'updateCalendarEvent'
          : isTask
            ? m.action === 'delete'
              ? 'trashTask'
              : m.action === 'create'
                ? 'createTask'
                : 'updateTask'
            : m.action === 'delete'
              ? 'trashItem'
              : m.action === 'create'
                ? 'createItem'
                : 'updateItem');

      return {
        operationId: m.operationId,
        deviceId: m.deviceId,
        workspaceId: m.workspaceId,
        commandVersion: m.commandVersion || 1,
        schemaVersion: m.schemaVersion || 1,
        command: cmdType,
        entityType:
          m.entityType === 'calendar_event'
            ? 'calendar_event'
            : m.entityType === 'journal' || m.entityType === 'journal_entry'
              ? 'journal_entry'
              : m.entityType === 'task'
                ? 'task'
                : m.entityType === 'routine'
                  ? 'routine'
                  : m.entityType === 'routine_occurrence'
                    ? 'routine_occurrence'
                    : m.entityType === 'note'
                      ? 'note'
                      : m.entityType === 'folder'
                        ? 'folder'
                        : 'item',
        entityId: m.entityId,
        baseRevision: m.baseRevision,
        dependencyOperationIds: m.dependencyOperationIds,
        clientTimestamp: m.clientTimestamp,
        payload: m.payload,
      };
    });

    const pushRequest: SyncPushRequest = { commands };
    const pushResponse = await this.transport.push(pushRequest, {
      signal: this.abortController?.signal,
    });

    if (isStale && isStale()) {
      return { pushedCount: 0 };
    }

    let pushedCount = 0;

    // 2. Transactional acknowledgment handling
    for (const result of pushResponse.data.results) {
      const origMutation = validBatch.find((m) => m.operationId === result.operationId);
      if (!origMutation) continue;

      if (result.status === 'accepted') {
        pushedCount++;

        // A. Update local item projection
        const header = await this.repository.getItemHeader(
          this.namespace.workspaceId,
          result.entityId
        );
        const updatedHeader: ItemHeaderRecord = header
          ? {
              ...header,
              serverRevision: result.revision,
              name: (origMutation.payload['name'] as string) || header.name,
              color:
                'color' in origMutation.payload
                  ? (origMutation.payload['color'] as string | null)
                  : header.color,
              icon:
                'icon' in origMutation.payload
                  ? (origMutation.payload['icon'] as string | null)
                  : header.icon,
              parentId:
                'parentId' in origMutation.payload
                  ? (origMutation.payload['parentId'] as string | null)
                  : header.parentId,
              folderId:
                'folderId' in origMutation.payload
                  ? (origMutation.payload['folderId'] as string | null)
                  : header.folderId,
              deletedAt:
                origMutation.command === 'trashItem' ||
                origMutation.command === 'trashFolder' ||
                origMutation.command === 'trashNote'
                  ? new Date().toISOString()
                  : origMutation.command === 'restoreItem' ||
                      origMutation.command === 'restoreFolder' ||
                      origMutation.command === 'restoreNote'
                    ? null
                    : header.deletedAt,
            }
          : {
              id: result.entityId,
              workspaceId: this.namespace.workspaceId,
              kind:
                (origMutation.payload['kind'] as string) ||
                (origMutation.entityType === 'folder'
                  ? 'folder'
                  : origMutation.entityType === 'task'
                    ? 'task'
                    : origMutation.entityType === 'routine'
                      ? 'routine'
                      : 'note'),
              folderId: (origMutation.payload['folderId'] as string | null) ?? null,
              rank: (origMutation.payload['rank'] as string) || '0',
              isArchived: Boolean(origMutation.payload['isArchived'] ?? false),
              isPinned: Boolean(origMutation.payload['isPinned'] ?? false),
              securityScope:
                (origMutation.payload['securityScope'] as 'standard' | 'vault') || 'standard',
              serverRevision: result.revision,
              name:
                (origMutation.payload['name'] as string | undefined) ??
                (origMutation.payload['title'] as string | undefined),
              title:
                (origMutation.payload['title'] as string | undefined) ??
                (origMutation.payload['name'] as string | undefined),
              color: origMutation.payload['color'] as string | null | undefined,
              icon: origMutation.payload['icon'] as string | null | undefined,
              parentId: (origMutation.payload['parentId'] as string | null) ?? null,
              createdAt: origMutation.clientTimestamp,
              updatedAt: new Date().toISOString(),
              deletedAt:
                origMutation.command === 'trashItem' ||
                origMutation.command === 'trashFolder' ||
                origMutation.command === 'trashNote' ||
                origMutation.command === 'trashTask' ||
                origMutation.command === 'trashRoutine' ||
                origMutation.command === 'trashJournalEntry'
                  ? new Date().toISOString()
                  : null,
            };

        let noteToAck: NoteRecord | undefined;
        if (updatedHeader.kind === 'note' || origMutation.entityType === 'note') {
          const existingNote = await this.repository.getNote(
            this.namespace.workspaceId,
            result.entityId
          );
          if (existingNote) {
            noteToAck = {
              ...existingNote,
              serverRevision: result.revision,
              title: updatedHeader.title || updatedHeader.name || existingNote.title,
              folderId: updatedHeader.folderId ?? null,
              deletedAt: updatedHeader.deletedAt,
            };
          }
        }

        let taskToAck: TaskRecord | undefined;
        if (
          updatedHeader.kind === 'task' ||
          updatedHeader.kind === 'todo' ||
          origMutation.entityType === 'task'
        ) {
          const existingTask = await this.repository.getTask(
            this.namespace.workspaceId,
            result.entityId
          );
          if (existingTask) {
            taskToAck = {
              ...existingTask,
              serverRevision: result.revision,
              title: updatedHeader.title || updatedHeader.name || existingTask.title,
              folderId: updatedHeader.folderId ?? null,
              deletedAt: updatedHeader.deletedAt,
            };
          }
        }

        let routineToAck: RoutineRecord | undefined;
        if (updatedHeader.kind === 'routine' || origMutation.entityType === 'routine') {
          const existingRoutine = await this.repository.getRoutine(
            this.namespace.workspaceId,
            result.entityId
          );
          if (existingRoutine) {
            routineToAck = {
              ...existingRoutine,
              serverRevision: result.revision,
              title: updatedHeader.title || updatedHeader.name || existingRoutine.title,
              folderId: updatedHeader.folderId ?? null,
              deletedAt: updatedHeader.deletedAt,
            };
          }
        }

        let occurrenceToAck: RoutineOccurrenceRecord | undefined;
        if (origMutation.entityType === 'routine_occurrence') {
          const existingOcc = await this.repository.getRoutineOccurrence(
            this.namespace.workspaceId,
            result.entityId
          );
          if (existingOcc) {
            occurrenceToAck = {
              ...existingOcc,
              serverRevision: result.revision,
            };
          }
        }

        let journalToAck: JournalEntryRecord | undefined;
        if (
          updatedHeader.kind === 'journal_entry' ||
          updatedHeader.kind === 'journal' ||
          origMutation.entityType === 'journal_entry'
        ) {
          const existingJournal = await this.repository.getJournalEntry(
            this.namespace.workspaceId,
            result.entityId
          );
          if (existingJournal) {
            journalToAck = {
              ...existingJournal,
              serverRevision: result.revision,
              title:
                updatedHeader.title !== undefined ? updatedHeader.title : existingJournal.title,
              folderId: updatedHeader.folderId ?? null,
              deletedAt: updatedHeader.deletedAt,
            };
          }
        }

        let calendarToAck: CalendarEventRecord | undefined;
        if (
          updatedHeader.kind === 'calendar_event' ||
          origMutation.entityType === 'calendar_event'
        ) {
          const existingCal = await this.repository.getCalendarEvent(
            this.namespace.workspaceId,
            result.entityId
          );
          if (existingCal) {
            calendarToAck = {
              ...existingCal,
              serverRevision: result.revision,
              title:
                updatedHeader.title !== undefined && updatedHeader.title !== null
                  ? updatedHeader.title
                  : (updatedHeader.name || existingCal.title),
              folderId: updatedHeader.folderId ?? null,
              deletedAt: updatedHeader.deletedAt,
            };
          }
        }

        // B. Retain pending work until the durable result is applied locally
        // and apply acknowledgment atomically in a single transaction
        await this.repository.applyAcknowledgment(
          updatedHeader,
          result.operationId,
          noteToAck,
          taskToAck,
          routineToAck,
          occurrenceToAck,
          journalToAck,
          calendarToAck
        );

        // C. Update item sync state: do NOT report item synced if other operations for it remain unresolved
        const remainingForEntity = (
          await this.repository.getPendingMutations(
            this.namespace.workspaceId,
            this.namespace.userId
          )
        ).filter((m) => m.entityId === result.entityId && m.operationId !== result.operationId);

        if (remainingForEntity.length === 0 && !this.activeConflicts.has(result.entityId)) {
          this.itemStates.set(result.entityId, {
            savedOnDevice: true,
            cloudSyncStatus: 'synced',
            lastSyncedRevision: result.revision,
          });
        } else {
          this.itemStates.set(result.entityId, {
            savedOnDevice: true,
            cloudSyncStatus: 'saved_locally',
            pendingOperationId: remainingForEntity[0]?.operationId,
          });
        }
      } else if (result.status === 'conflict') {
        // Explicit conflict handling: preserve local intent and server state
        const conflictRecord: ConflictRecord = {
          id: this.generateId(),
          entityId: result.entityId,
          entityType: origMutation.entityType || 'item',
          operationId: result.operationId,
          workspaceId: this.namespace.workspaceId,
          userId: this.namespace.userId,
          localPayload: origMutation.payload,
          baseRevision: origMutation.baseRevision,
          serverRevision: result.error?.currentServerRevision ?? result.revision,
          serverState: result.error?.currentServerState,
          conflictReason: result.error?.message || 'Revision conflict',
          detectedAt: new Date().toISOString(),
          resolved: false,
        };

        this.activeConflicts.set(conflictRecord.entityId, conflictRecord);
        this.activeConflicts.set(conflictRecord.id, conflictRecord);

        // Update mutation state to failed, retaining the operation in local queue durably
        origMutation.status = 'failed';
        origMutation.lastError = conflictRecord.conflictReason;

        // Durably save conflict and updated mutation
        await this.repository.saveConflict(conflictRecord, origMutation);

        this.itemStates.set(result.entityId, {
          savedOnDevice: true,
          cloudSyncStatus: 'conflict',
          lastError: conflictRecord.conflictReason,
        });

        this.emit({ type: 'conflict_detected', conflict: conflictRecord });
      } else if (result.status === 'rejected') {
        // Terminal domain failure
        origMutation.status = 'failed';
        origMutation.lastError = result.error?.message || 'Rejected by server';
        await this.repository.enqueueMutation(origMutation);

        this.itemStates.set(result.entityId, {
          savedOnDevice: true,
          cloudSyncStatus: 'error',
          lastError: origMutation.lastError,
        });
      }
    }

    return { pushedCount };
  }

  /**
   * Pulls incremental server changes with pagination and atomic cursor advancement.
   */
  async pullChanges(isStale?: () => boolean): Promise<{ changesCount: number }> {
    if (this.networkStatus === 'offline' || !this.coordination.isLeader) {
      return { changesCount: 0 };
    }

    let totalChanges = 0;
    let hasMore = true;

    while (hasMore) {
      if (isStale && isStale()) {
        return { changesCount: totalChanges };
      }

      const cursorRecord = await this.repository.getCursor(
        this.namespace.workspaceId,
        this.namespace.userId
      );

      try {
        const pullRes = await this.transport.pull(
          {
            workspaceId: this.namespace.workspaceId,
            cursor: cursorRecord?.cursor,
            limit: 100,
          },
          { signal: this.abortController?.signal }
        );

        if (isStale && isStale()) {
          return { changesCount: totalChanges };
        }

        const changesToApply: ItemHeaderRecord[] = [];
        const notesToApply: NoteRecord[] = [];
        const tasksToApply: TaskRecord[] = [];
        const routinesToApply: RoutineRecord[] = [];
        const occurrencesToApply: RoutineOccurrenceRecord[] = [];
        const journalEntriesToApply: JournalEntryRecord[] = [];
        const calendarEventsToApply: CalendarEventRecord[] = [];

        const incomingChangesMap = new Map(pullRes.data.changes.map((c) => [c.entityId, c]));

        for (const change of pullRes.data.changes) {
          totalChanges++;
          const data = (change.data || {}) as Record<string, unknown>;

          if (change.entityType === 'routine_occurrence') {
            if (change.isTombstone) {
              await this.repository.deleteRoutineOccurrence(
                this.namespace.workspaceId,
                change.entityId
              );
              continue;
            }

            const routineId = String(data.routineId || data.routine_id || '');
            const scheduledDate = String(data.scheduledDate || data.scheduled_date || '');
            if (routineId && scheduledDate) {
              const localOccs = await this.repository.listRoutineOccurrences(
                this.namespace.workspaceId,
                routineId,
                scheduledDate,
                scheduledDate
              );
              for (const localOcc of localOccs) {
                if (localOcc.id !== change.entityId) {
                  const pending = await this.repository.getPendingMutations(
                    this.namespace.workspaceId,
                    this.namespace.userId
                  );
                  for (const p of pending) {
                    if (p.entityId === localOcc.id) {
                      p.entityId = change.entityId;
                      await this.repository.enqueueMutation(p);
                    }
                  }
                  await this.repository.deleteRoutineOccurrence(
                    this.namespace.workspaceId,
                    localOcc.id
                  );
                }
              }
            }

            const rawStatus = (data.status as string) || 'pending';
            const occStatus: RoutineOccurrenceStatus =
              rawStatus === 'done' || rawStatus === 'skipped' || rawStatus === 'cancelled'
                ? rawStatus
                : 'pending';

            occurrencesToApply.push({
              id: change.entityId,
              workspaceId: this.namespace.workspaceId,
              routineId,
              scheduledDate,
              scheduleRevision: Number(data.scheduleRevision || data.schedule_revision) || 1,
              plannedInstant: data.plannedInstant ? String(data.plannedInstant) : null,
              timezone: String(data.timezone || 'UTC'),
              status: occStatus,
              completedAt: data.completedAt ? String(data.completedAt) : null,
              completedBy: data.completedBy ? String(data.completedBy) : null,
              history: Array.isArray(data.history)
                ? (data.history as RoutineOccurrenceTransition[])
                : [],
              serverRevision: change.revision,
              createdAt:
                typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
              updatedAt:
                typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
            });
            continue;
          }

          const existing = await this.repository.getItemHeader(
            this.namespace.workspaceId,
            change.entityId
          );

          const defaultKind =
            change.entityType === 'folder'
              ? 'folder'
              : change.entityType === 'task'
                ? 'task'
                : change.entityType === 'routine'
                  ? 'routine'
                  : change.entityType === 'calendar_event'
                    ? 'calendar_event'
                    : 'note';
          const kind = typeof data.kind === 'string' ? data.kind : existing?.kind || defaultKind;

          // Distinguish an omitted field from an explicit null
          let folderId = existing?.folderId ?? null;
          if ('folderId' in data) {
            folderId =
              data.folderId !== null && data.folderId !== undefined ? String(data.folderId) : null;
          } else if ('parentId' in data) {
            folderId =
              data.parentId !== null && data.parentId !== undefined ? String(data.parentId) : null;
          }

          // Re-parent to root ONLY if parent folder was confirmed deleted
          if (folderId !== null) {
            const incomingParent = incomingChangesMap.get(folderId);
            if (incomingParent) {
              if (incomingParent.isTombstone) {
                folderId = null; // Confirmed deleted in this incoming page
              }
              // Else: incomingParent is active, so parent is arriving or updated in this page. Keep folderId.
            } else {
              const parentFolder = await this.repository.getItemHeader(
                this.namespace.workspaceId,
                folderId
              );
              if (parentFolder && parentFolder.deletedAt !== null) {
                folderId = null; // Confirmed deleted in local repository
              }
              // If parentFolder does NOT exist locally yet, it is not-yet-loaded.
              // Distinguish not-yet-loaded parents from confirmed deletion; do not silently move to Inbox/root.
            }
          }

          const rank = typeof data.rank === 'string' ? data.rank : existing?.rank || '0';
          const isArchived =
            'isArchived' in data ? Boolean(data.isArchived) : (existing?.isArchived ?? false);
          const isPinned =
            'isPinned' in data ? Boolean(data.isPinned) : (existing?.isPinned ?? false);
          const securityScope =
            'securityScope' in data &&
            (data.securityScope === 'standard' || data.securityScope === 'vault')
              ? data.securityScope
              : existing?.securityScope || 'standard';

          const name = 'name' in data && typeof data.name === 'string' ? data.name : existing?.name;
          const color =
            'color' in data
              ? typeof data.color === 'string'
                ? data.color
                : null
              : existing?.color;
          const icon =
            'icon' in data ? (typeof data.icon === 'string' ? data.icon : null) : existing?.icon;

          const createdAt =
            typeof data.createdAt === 'string'
              ? data.createdAt
              : existing?.createdAt || new Date().toISOString();
          const updatedAt =
            typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString();

          let deletedAt = existing?.deletedAt ?? null;
          if (change.isTombstone) {
            deletedAt = new Date().toISOString();
            // Edit-versus-delete detection: item was deleted on server, but edited locally while offline.
            // Keep item deleted locally, but preserve all unconfirmed offline edits and drafts as a recoverable conflict!
            const pendingForEntity = await this.getPendingForEntity(change.entityId);
            const unconfirmedPending = pendingForEntity.filter((m) => m.status !== 'failed');
            if (unconfirmedPending.length > 0) {
              const draft = await this.repository.getDraft(
                this.namespace.workspaceId,
                this.namespace.userId,
                change.entityId
              );
              const existingNote = await this.repository.getNote(
                this.namespace.workspaceId,
                change.entityId
              );
              const existingTask = await this.repository.getTask(
                this.namespace.workspaceId,
                change.entityId
              );
              const existingJournal = await this.repository.getJournalEntry(
                this.namespace.workspaceId,
                change.entityId
              );

              const latestLocalPayload: Record<string, unknown> = {
                ...(existingNote ? { ...existingNote } : {}),
                ...(existingTask ? { ...existingTask } : {}),
                ...(existingJournal ? { ...existingJournal } : {}),
                ...(draft?.payload || {}),
              };
              for (const m of unconfirmedPending) {
                Object.assign(latestLocalPayload, m.payload);
              }

              const firstPending = unconfirmedPending[0];
              if (!firstPending) continue;

              const conflictRecord: ConflictRecord = {
                id: this.generateId(),
                entityId: change.entityId,
                entityType: change.entityType || 'item',
                operationId: firstPending.operationId,
                workspaceId: this.namespace.workspaceId,
                userId: this.namespace.userId,
                localPayload: latestLocalPayload,
                baseRevision: firstPending.baseRevision,
                serverRevision: change.revision,
                serverState: {
                  id: change.entityId,
                  deletedAt: new Date().toISOString(),
                  isTombstone: true,
                },
                conflictReason: 'Item was deleted on the server while being edited offline.',
                detectedAt: new Date().toISOString(),
                resolved: false,
              };
              this.activeConflicts.set(conflictRecord.entityId, conflictRecord);
              this.activeConflicts.set(conflictRecord.id, conflictRecord);

              for (const p of unconfirmedPending) {
                p.status = 'failed';
                p.lastError = conflictRecord.conflictReason;
                await this.repository.enqueueMutation(p);
              }

              await this.repository.saveConflict(conflictRecord, firstPending);
              this.itemStates.set(change.entityId, {
                savedOnDevice: true,
                cloudSyncStatus: 'conflict',
                lastError: conflictRecord.conflictReason,
              });
              this.emit({ type: 'conflict_detected', conflict: conflictRecord });
            }
          } else if ('restored' in data && data.restored) {
            deletedAt = null;
          }

          const rawPurpose =
            typeof data.purpose === 'string'
              ? data.purpose
              : existing?.purpose;
          const notePurpose: NotePurpose | undefined =
            rawPurpose && ['standard', 'guide', 'cheatsheet', 'reference'].includes(rawPurpose)
              ? (rawPurpose as NotePurpose)
              : undefined;

          // If note has a knowledge purpose, classify header as knowledge
          const finalKind =
            (kind === 'note' || change.entityType === 'note') && notePurpose && notePurpose !== 'standard'
              ? 'knowledge'
              : kind;

          const header: ItemHeaderRecord = {
            id: change.entityId,
            workspaceId: this.namespace.workspaceId,
            kind: finalKind,
            purpose: notePurpose,
            folderId,
            rank,
            isArchived,
            isPinned,
            securityScope,
            serverRevision: change.revision,
            name,
            color,
            icon,
            parentId: folderId,
            createdAt,
            updatedAt,
            deletedAt,
          };

          changesToApply.push(header);

          if (kind === 'note' || finalKind === 'knowledge' || change.entityType === 'note') {
            const doc =
              (data.document as Record<string, unknown> | undefined) ||
              (typeof data.documentJson === 'string'
                ? (JSON.parse(data.documentJson) as Record<string, unknown>)
                : undefined);
            if (doc) {
              const plainText = typeof data.plainText === 'string' ? data.plainText : '';
              const wordCount = typeof data.wordCount === 'number' ? data.wordCount : 0;
              const charCount =
                typeof data.charCount === 'number' ? data.charCount : plainText.length;
              const title = typeof data.title === 'string' ? data.title : name || undefined;

              notesToApply.push({
                id: change.entityId,
                workspaceId: this.namespace.workspaceId,
                folderId: folderId ?? null,
                title: title || 'Untitled',
                document: doc as NoteDocument,
                plainText,
                wordCount,
                charCount,
                purpose: notePurpose || 'standard',
                serverRevision: change.revision,
                createdAt,
                updatedAt,
                deletedAt,
              });
            }
          }

          if (kind === 'task' || kind === 'todo' || change.entityType === 'task') {
            const existingTask = await this.repository.getTask(
              this.namespace.workspaceId,
              change.entityId
            );

            if (change.isTombstone && existingTask) {
              tasksToApply.push({
                ...existingTask,
                serverRevision: change.revision,
                deletedAt: deletedAt || new Date().toISOString(),
                updatedAt,
              });
            } else {
              const title =
                'title' in data && typeof data.title === 'string'
                  ? data.title
                  : (existingTask?.title ?? (name || 'Untitled'));
              const details =
                'details' in data
                  ? typeof data.details === 'string'
                    ? data.details
                    : null
                  : (existingTask?.details ?? null);
              const priority =
                'priority' in data && typeof data.priority === 'string'
                  ? (data.priority as TaskPriority)
                  : (existingTask?.priority ?? 'normal');
              const status =
                'status' in data && typeof data.status === 'string'
                  ? (data.status as TaskStatus)
                  : (existingTask?.status ?? 'todo');
              const deadline =
                'deadline' in data &&
                data.deadline &&
                typeof data.deadline === 'object' &&
                'type' in data.deadline
                  ? (data.deadline as TaskDeadline)
                  : (existingTask?.deadline ?? { type: 'none' as const });
              const completedAt =
                'completedAt' in data
                  ? typeof data.completedAt === 'string'
                    ? data.completedAt
                    : null
                  : (existingTask?.completedAt ?? (status === 'completed' ? updatedAt : null));
              const reopenedAt =
                'reopenedAt' in data
                  ? typeof data.reopenedAt === 'string'
                    ? data.reopenedAt
                    : null
                  : (existingTask?.reopenedAt ?? null);
              const completionHistory =
                'completionHistory' in data && Array.isArray(data.completionHistory)
                  ? (data.completionHistory as TaskCompletionHistoryItem[])
                  : (existingTask?.completionHistory ??
                    (status === 'completed' ? [{ completedAt: completedAt || updatedAt }] : []));
              const parentId =
                'parentId' in data
                  ? typeof data.parentId === 'string'
                    ? data.parentId
                    : null
                  : (existingTask?.parentId ?? null);
              const subtaskOrder =
                'subtaskOrder' in data && typeof data.subtaskOrder === 'number'
                  ? data.subtaskOrder
                  : (existingTask?.subtaskOrder ?? 0);
              const tags =
                'tags' in data && Array.isArray(data.tags)
                  ? data.tags.map(String)
                  : (existingTask?.tags ?? []);

              tasksToApply.push({
                id: change.entityId,
                workspaceId: this.namespace.workspaceId,
                folderId: folderId ?? null,
                title,
                details,
                priority,
                status,
                deadline,
                completedAt,
                reopenedAt,
                completionHistory,
                parentId,
                subtaskOrder,
                tags,
                serverRevision: change.revision,
                createdAt,
                updatedAt,
                deletedAt,
              });
            }
          }

          if (kind === 'routine' || change.entityType === 'routine') {
            const freq: RoutineFrequency = data.frequency === 'weekdays' ? 'weekdays' : 'daily';
            const weekdays = Array.isArray(data.weekdays) ? (data.weekdays as Weekday[]) : [];
            routinesToApply.push({
              id: change.entityId,
              workspaceId: this.namespace.workspaceId,
              folderId: folderId ?? null,
              title: (data.title as string) || name || 'Untitled Routine',
              details: typeof data.details === 'string' ? data.details : null,
              frequency: freq,
              weekdays,
              timezone: typeof data.timezone === 'string' ? data.timezone : 'UTC',
              scheduledTime: typeof data.scheduledTime === 'string' ? data.scheduledTime : null,
              activeFrom: (data.activeFrom as string) || createdAt.slice(0, 10),
              activeTo: data.activeTo ? String(data.activeTo) : null,
              isPaused: Boolean(data.isPaused),
              isArchived,
              isPinned,
              scheduleRevision: Number(data.scheduleRevision) || 1,
              effectiveDate: (data.effectiveDate as string) || createdAt.slice(0, 10),
              serverRevision: change.revision,
              createdAt,
              updatedAt,
              deletedAt,
            });
          }

          if (
            kind === 'journal_entry' ||
            kind === 'journal' ||
            change.entityType === 'journal_entry'
          ) {
            const existingJournal = await this.repository.getJournalEntry(
              this.namespace.workspaceId,
              change.entityId
            );
            const doc = (data.document as NoteDocument | undefined) ||
              existingJournal?.document || {
                version: 1,
                type: 'doc',
                content: [],
              };
            const plainText =
              typeof data.plainText === 'string'
                ? data.plainText
                : (existingJournal?.plainText ?? '');
            const wordCount =
              typeof data.wordCount === 'number'
                ? data.wordCount
                : (existingJournal?.wordCount ??
                  (plainText ? plainText.trim().split(/\s+/).filter(Boolean).length : 0));
            const charCount =
              typeof data.charCount === 'number'
                ? data.charCount
                : (existingJournal?.charCount ?? plainText.length);
            const journalPrompts =
              'prompts' in data
                ? Array.isArray(data.prompts)
                  ? (data.prompts as JournalPromptEntry[])
                  : []
                : (existingJournal?.prompts ?? []);
            const journalTags =
              'tags' in data
                ? Array.isArray(data.tags)
                  ? data.tags.map(String)
                  : []
                : (existingJournal?.tags ?? []);

            const journalTitle =
              'title' in data
                ? data.title !== null && data.title !== undefined
                  ? String(data.title)
                  : null
                : (existingJournal?.title ?? null);

            const journalMood =
              'mood' in data
                ? data.mood !== null && data.mood !== undefined
                  ? String(data.mood)
                  : null
                : (existingJournal?.mood ?? null);

            const journalFolderId =
              'folderId' in data
                ? data.folderId !== null && data.folderId !== undefined
                  ? String(data.folderId)
                  : null
                : (existingJournal?.folderId ?? folderId ?? null);

            journalEntriesToApply.push({
              id: change.entityId,
              workspaceId: this.namespace.workspaceId,
              folderId: journalFolderId,
              title: journalTitle,
              entryDate:
                (data.entryDate as string) ||
                (existingJournal?.entryDate ?? createdAt.slice(0, 10)),
              timezone: (data.timezone as string) || (existingJournal?.timezone ?? 'UTC'),
              document: doc,
              plainText,
              wordCount,
              charCount,
              mood: journalMood,
              prompts: journalPrompts,
              tags: journalTags,
              isDraft: Boolean(data.isDraft ?? existingJournal?.isDraft ?? false),
              isArchived,
              isPinned,
              securityScope:
                (securityScope as 'standard' | 'vault') ||
                existingJournal?.securityScope ||
                'standard',
              serverRevision: change.revision,
              createdAt,
              updatedAt,
              deletedAt,
            });
          }

          if (kind === 'calendar_event' || change.entityType === 'calendar_event') {
            const existingCal = await this.repository.getCalendarEvent(
              this.namespace.workspaceId,
              change.entityId
            );

            const title =
              'title' in data && typeof data.title === 'string'
                ? data.title
                : (existingCal?.title ?? (name || 'Untitled Event'));
            const details =
              'details' in data
                ? data.details !== null && data.details !== undefined
                  ? String(data.details)
                  : null
                : (existingCal?.details ?? null);
            const allDay = Boolean(data.allDay ?? existingCal?.allDay ?? false);
            const startDate =
              'startDate' in data
                ? data.startDate
                  ? String(data.startDate)
                  : null
                : (existingCal?.startDate ?? null);
            const endDate =
              'endDate' in data
                ? data.endDate
                  ? String(data.endDate)
                  : null
                : (existingCal?.endDate ?? null);
            const startAt =
              'startAt' in data
                ? data.startAt
                  ? String(data.startAt)
                  : null
                : (existingCal?.startAt ?? null);
            const endAt =
              'endAt' in data
                ? data.endAt
                  ? String(data.endAt)
                  : null
                : (existingCal?.endAt ?? null);
            const timezone = (data.timezone as string) || (existingCal?.timezone ?? 'UTC');

            calendarEventsToApply.push({
              id: change.entityId,
              workspaceId: this.namespace.workspaceId,
              folderId: folderId ?? existingCal?.folderId ?? null,
              title,
              details,
              allDay,
              startDate,
              endDate,
              startAt,
              endAt,
              timezone,
              isArchived,
              securityScope:
                (securityScope as 'standard' | 'vault') || existingCal?.securityScope || 'standard',
              serverRevision: change.revision,
              createdAt,
              updatedAt,
              deletedAt,
            });
          }
        }

        const newCursorRecord: SyncCursorRecord = {
          workspaceId: this.namespace.workspaceId,
          userId: this.namespace.userId,
          lastServerRevision:
            pullRes.data.changes.length > 0
              ? Math.max(...pullRes.data.changes.map((c) => c.revision))
              : cursorRecord?.lastServerRevision || 0,
          cursor: pullRes.meta.cursor || cursorRecord?.cursor || '',
          lastSyncedAt: new Date().toISOString(),
          epoch: pullRes.data.accessEpoch,
        };

        // Atomically apply changes and advance cursor in single transaction
        await this.repository.applyPullPage(
          changesToApply,
          newCursorRecord,
          notesToApply,
          tasksToApply,
          routinesToApply,
          occurrencesToApply,
          journalEntriesToApply,
          undefined,
          calendarEventsToApply
        );

        this.lastSyncedAt = newCursorRecord.lastSyncedAt;
        this.accessEpoch = pullRes.data.accessEpoch;

        for (const change of pullRes.data.changes) {
          if (!this.activeConflicts.has(change.entityId)) {
            this.itemStates.set(change.entityId, {
              savedOnDevice: true,
              cloudSyncStatus: 'synced',
              lastSyncedRevision: change.revision,
            });
          }
        }

        hasMore = pullRes.data.hasMore;
      } catch (err) {
        const classified = classifyRoomSyncFailure(err);
        if (classified.isMembershipRevoked) {
          await this.handleRoomMembershipRevoked(classified.revocationReason ?? 'membership_removed');
          return { changesCount: totalChanges };
        }
        if (classified.isResetRequired) {
          this.log('warn', 'Cursor expired or epoch rotated; initiating bootstrap snapshot reset');
          // For rooms, epoch rotation after membership change is handled as revocation above.
          // Personal/workspace reset preserves drafts via bootstrap rebase.
          await this.resetAndBootstrap();
          return { changesCount: totalChanges };
        }
        throw err;
      }
    }

    return { changesCount: totalChanges };
  }

  /**
   * Handles SYNC_RESET_REQUIRED: downloads a fresh bootstrap snapshot while strictly
   * preserving unsent local drafts, pending mutations, and conflict state.
   */
  async resetAndBootstrap(): Promise<void> {
    const bootstrapRes = await this.transport.bootstrap(
      {
        workspaceId: this.namespace.workspaceId,
      },
      { signal: this.abortController?.signal }
    );

    const snapshotItems: ItemHeaderRecord[] = bootstrapRes.data.items.map((item) => ({
      id: item.id,
      workspaceId: item.workspaceId,
      kind: item.kind,
      folderId: item.folderId,
      rank: item.rank,
      isArchived: item.isArchived,
      isPinned: item.isPinned,
      securityScope: item.securityScope,
      serverRevision: item.revision,
      name: item.name,
      color: item.color,
      icon: item.icon,
      parentId: item.parentId || item.folderId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      deletedAt: item.deletedAt,
    }));

    const newCursor: SyncCursorRecord = {
      workspaceId: this.namespace.workspaceId,
      userId: this.namespace.userId,
      lastServerRevision: Math.max(0, ...bootstrapRes.data.items.map((i) => i.revision)),
      cursor: bootstrapRes.data.watermarkCursor,
      lastSyncedAt: new Date().toISOString(),
      epoch: bootstrapRes.data.accessEpoch,
    };

    // Collect all local entities that have unsent drafts, pending mutations, or conflicts
    const pending = await this.repository.getPendingMutations(
      this.namespace.workspaceId,
      this.namespace.userId
    );
    const drafts = await this.repository.listDrafts(
      this.namespace.workspaceId,
      this.namespace.userId
    );
    const conflicts = await this.repository.listConflicts(this.namespace.workspaceId);

    const preserveLocalItemIds = new Set<string>([
      ...pending.map((p) => p.entityId),
      ...(drafts.map((d) => d.entityId).filter(Boolean) as string[]),
      ...conflicts.map((c) => c.entityId),
    ]);

    const snapshotNotes: NoteRecord[] = [];
    const snapshotTasks: TaskRecord[] = [];
    const snapshotRoutines: RoutineRecord[] = [];
    const snapshotOccurrences: RoutineOccurrenceRecord[] = [];
    const snapshotJournalEntries: JournalEntryRecord[] = [];
    const snapshotCalendarEvents: CalendarEventRecord[] = [];

    const bData = bootstrapRes.data as Record<string, unknown>;
    const journalMap = new Map<string, JournalEntryRecord>();
    if (Array.isArray(bData['journalEntries'])) {
      for (const j of bData['journalEntries'] as JournalEntryRecord[]) {
        if (!j || !j.id) continue;
        journalMap.set(j.id, {
          ...j,
          serverRevision: (j as { revision?: number }).revision || j.serverRevision || 1,
        });
      }
    }

    for (const item of bootstrapRes.data.items) {
      const raw = item as Record<string, unknown>;
      if (item.kind === 'note' && raw.document) {
        snapshotNotes.push({
          id: item.id,
          workspaceId: item.workspaceId,
          folderId: item.folderId ?? null,
          title: (raw.title as string) || item.name || 'Untitled',
          document: raw.document as NoteDocument,
          plainText: (raw.plainText as string) || '',
          wordCount: typeof raw.wordCount === 'number' ? raw.wordCount : 0,
          charCount: typeof raw.charCount === 'number' ? raw.charCount : 0,
          serverRevision: item.revision,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          deletedAt: item.deletedAt,
        });
      }

      if (item.kind === 'task' || item.kind === 'todo') {
        const priority = (raw.priority as TaskPriority | undefined) ?? 'normal';
        const status = (raw.status as TaskStatus | undefined) ?? 'todo';
        const deadline =
          raw.deadline && typeof raw.deadline === 'object' && 'type' in raw.deadline
            ? (raw.deadline as TaskDeadline)
            : { type: 'none' as const };
        const details = typeof raw.details === 'string' ? raw.details : null;
        const completedAt = typeof raw.completedAt === 'string' ? raw.completedAt : null;
        const reopenedAt = typeof raw.reopenedAt === 'string' ? raw.reopenedAt : null;
        const completionHistory = Array.isArray(raw.completionHistory)
          ? (raw.completionHistory as TaskCompletionHistoryItem[])
          : [];
        const parentId = typeof raw.parentId === 'string' ? raw.parentId : null;
        const subtaskOrder = typeof raw.subtaskOrder === 'number' ? raw.subtaskOrder : 0;
        const tags = Array.isArray(raw.tags) ? raw.tags.map(String) : [];

        snapshotTasks.push({
          id: item.id,
          workspaceId: item.workspaceId,
          folderId: item.folderId ?? null,
          title: (raw.title as string) || item.name || 'Untitled',
          details,
          priority,
          status,
          deadline,
          completedAt,
          reopenedAt,
          completionHistory,
          parentId,
          subtaskOrder,
          tags,
          serverRevision: item.revision,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          deletedAt: item.deletedAt,
        });
      }

      if (item.kind === 'routine') {
        const freq: RoutineFrequency = raw.frequency === 'weekdays' ? 'weekdays' : 'daily';
        const weekdays = Array.isArray(raw.weekdays) ? (raw.weekdays as Weekday[]) : [];
        snapshotRoutines.push({
          id: item.id,
          workspaceId: item.workspaceId,
          folderId: item.folderId ?? null,
          title: (raw.title as string) || item.name || 'Untitled Routine',
          details: typeof raw.details === 'string' ? raw.details : null,
          frequency: freq,
          weekdays,
          timezone: typeof raw.timezone === 'string' ? raw.timezone : 'UTC',
          scheduledTime: typeof raw.scheduledTime === 'string' ? raw.scheduledTime : null,
          activeFrom: (raw.activeFrom as string) || item.createdAt.slice(0, 10),
          activeTo: raw.activeTo ? String(raw.activeTo) : null,
          isPaused: Boolean(raw.isPaused),
          isArchived: item.isArchived,
          isPinned: item.isPinned,
          scheduleRevision: Number(raw.scheduleRevision) || 1,
          effectiveDate: (raw.effectiveDate as string) || item.createdAt.slice(0, 10),
          serverRevision: item.revision,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          deletedAt: item.deletedAt,
        });
      }

      if (item.kind === 'journal_entry') {
        const existingJ = journalMap.get(item.id);
        if (existingJ) {
          snapshotJournalEntries.push(existingJ);
          journalMap.delete(item.id);
        } else if (raw.document && raw.entryDate) {
          snapshotJournalEntries.push({
            id: item.id,
            workspaceId: item.workspaceId,
            folderId: item.folderId ?? null,
            title: (raw.title as string | null) ?? null,
            entryDate: String(raw.entryDate),
            timezone: (raw.timezone as string) || 'UTC',
            document: raw.document as NoteDocument,
            plainText: (raw.plainText as string) || '',
            wordCount: typeof raw.wordCount === 'number' ? raw.wordCount : 0,
            charCount: typeof raw.charCount === 'number' ? raw.charCount : 0,
            mood: (raw.mood as string | null) ?? null,
            prompts: Array.isArray(raw.prompts) ? (raw.prompts as JournalPromptEntry[]) : [],
            tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
            isDraft: Boolean(raw.isDraft),
            isArchived: item.isArchived,
            isPinned: item.isPinned,
            securityScope: item.securityScope,
            serverRevision: item.revision,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            deletedAt: item.deletedAt,
          });
        } else {
          throw new Error(
            `Bootstrap snapshot corrupted: item ${item.id} of kind journal_entry is missing required journal content.`
          );
        }
      }

      if (item.kind === 'calendar_event') {
        snapshotCalendarEvents.push({
          id: item.id,
          workspaceId: item.workspaceId,
          folderId: item.folderId ?? null,
          title: (raw.title as string) || item.name || 'Untitled Event',
          details: typeof raw.details === 'string' ? raw.details : null,
          allDay: Boolean(raw.allDay),
          startDate: raw.startDate ? String(raw.startDate) : null,
          endDate: raw.endDate ? String(raw.endDate) : null,
          startAt: raw.startAt ? String(raw.startAt) : null,
          endAt: raw.endAt ? String(raw.endAt) : null,
          timezone: (raw.timezone as string) || 'UTC',
          isArchived: item.isArchived,
          securityScope: item.securityScope,
          serverRevision: item.revision,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          deletedAt: item.deletedAt,
        });
      }
    }

    // Add any remaining journal entries from the snapshot map
    for (const remainingJ of journalMap.values()) {
      snapshotJournalEntries.push(remainingJ);
    }

    if (Array.isArray(bData['routines'])) {
      for (const r of bData['routines'] as RoutineRecord[]) {
        snapshotRoutines.push({
          id: r.id,
          workspaceId: r.workspaceId,
          folderId: r.folderId ?? null,
          title: r.title,
          details: r.details,
          frequency: r.frequency,
          weekdays: r.weekdays,
          timezone: r.timezone,
          scheduledTime: r.scheduledTime,
          activeFrom: r.activeFrom,
          activeTo: r.activeTo,
          isPaused: r.isPaused,
          isArchived: r.isArchived,
          isPinned: r.isPinned,
          scheduleRevision: r.scheduleRevision,
          effectiveDate: r.effectiveDate,
          serverRevision: (r as { revision?: number }).revision || r.serverRevision || 1,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          deletedAt: r.deletedAt,
        });
      }
    }

    if (Array.isArray(bData['routineOccurrences'])) {
      for (const occ of bData['routineOccurrences'] as RoutineOccurrenceRecord[]) {
        snapshotOccurrences.push({
          id: occ.id,
          workspaceId: occ.workspaceId,
          routineId: occ.routineId,
          scheduledDate: occ.scheduledDate,
          scheduleRevision: occ.scheduleRevision,
          plannedInstant: occ.plannedInstant,
          timezone: occ.timezone,
          status: occ.status,
          completedAt: occ.completedAt,
          completedBy: occ.completedBy,
          history: occ.history || [],
          serverRevision: (occ as { revision?: number }).revision || occ.serverRevision || 1,
          createdAt: occ.createdAt,
          updatedAt: occ.updatedAt,
        });
      }
    }

    if (Array.isArray(bData['calendarEvents'])) {
      for (const c of bData['calendarEvents'] as CalendarEventRecord[]) {
        snapshotCalendarEvents.push({
          id: c.id,
          workspaceId: c.workspaceId,
          folderId: c.folderId ?? null,
          title: c.title,
          details: c.details ?? null,
          allDay: Boolean(c.allDay),
          startDate: c.startDate ?? null,
          endDate: c.endDate ?? null,
          startAt: c.startAt ?? null,
          endAt: c.endAt ?? null,
          timezone: c.timezone || 'UTC',
          isArchived: Boolean(c.isArchived),
          securityScope: c.securityScope || 'standard',
          serverRevision: (c as { revision?: number }).revision || c.serverRevision || 1,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          deletedAt: c.deletedAt ?? null,
        });
      }
    }

    // Re-parent items whose parent folder is deleted or missing in snapshot
    const activeFolderIds = new Set(
      snapshotItems.filter((i) => i.kind === 'folder' && !i.deletedAt).map((i) => i.id)
    );
    for (const item of snapshotItems) {
      if (item.folderId && !activeFolderIds.has(item.folderId)) {
        item.folderId = null;
      }
      if (item.parentId && !activeFolderIds.has(item.parentId)) {
        item.parentId = null;
      }
    }
    for (const note of snapshotNotes) {
      if (note.folderId && !activeFolderIds.has(note.folderId)) {
        note.folderId = null;
      }
    }
    for (const task of snapshotTasks) {
      if (task.folderId && !activeFolderIds.has(task.folderId)) {
        task.folderId = null;
      }
    }
    for (const routine of snapshotRoutines) {
      if (routine.folderId && !activeFolderIds.has(routine.folderId)) {
        routine.folderId = null;
      }
    }
    for (const j of snapshotJournalEntries) {
      if (j.folderId && !activeFolderIds.has(j.folderId)) {
        j.folderId = null;
      }
    }
    for (const cal of snapshotCalendarEvents) {
      if (cal.folderId && !activeFolderIds.has(cal.folderId)) {
        cal.folderId = null;
      }
    }

    // Atomically install snapshot, replacing obsolete projections while preserving local work
    await this.repository.installBootstrapGeneration(
      snapshotItems,
      newCursor,
      preserveLocalItemIds,
      snapshotNotes,
      snapshotTasks,
      snapshotRoutines,
      snapshotOccurrences,
      snapshotJournalEntries,
      undefined,
      snapshotCalendarEvents
    );

    // Rebase preserved pending mutations against snapshot state or flag edit-vs-delete conflicts
    const snapshotItemMap = new Map(snapshotItems.map((i) => [i.id, i]));
    for (const p of pending) {
      if (p.status === 'failed') continue;
      const sItem = snapshotItemMap.get(p.entityId);
      if (sItem) {
        if (
          sItem.deletedAt &&
          p.action !== 'delete' &&
          p.command !== 'restoreItem' &&
          p.command !== 'restoreFolder' &&
          p.command !== 'restoreNote'
        ) {
          const allPendingForEntity = pending.filter(
            (m) => m.entityId === p.entityId && m.status !== 'failed'
          );
          const draft = await this.repository.getDraft(
            this.namespace.workspaceId,
            this.namespace.userId,
            p.entityId
          );
          const latestLocalPayload: Record<string, unknown> = {
            ...(p.payload || {}),
            ...(draft?.payload || {}),
          };
          for (const m of allPendingForEntity) {
            Object.assign(latestLocalPayload, m.payload);
          }

          const conflictRecord: ConflictRecord = {
            id: this.generateId(),
            entityId: p.entityId,
            entityType: p.entityType || 'item',
            operationId: p.operationId,
            workspaceId: this.namespace.workspaceId,
            userId: this.namespace.userId,
            localPayload: latestLocalPayload,
            baseRevision: p.baseRevision,
            serverRevision: sItem.serverRevision,
            serverState: {
              id: sItem.id,
              deletedAt: sItem.deletedAt,
              isTombstone: true,
            },
            conflictReason: 'Item was deleted on the server before snapshot bootstrap.',
            detectedAt: new Date().toISOString(),
            resolved: false,
          };
          this.activeConflicts.set(conflictRecord.entityId, conflictRecord);
          this.activeConflicts.set(conflictRecord.id, conflictRecord);

          for (const m of allPendingForEntity) {
            m.status = 'failed';
            m.lastError = conflictRecord.conflictReason;
            await this.repository.enqueueMutation(m);
          }
          await this.repository.saveConflict(conflictRecord, p);
          this.itemStates.set(p.entityId, {
            savedOnDevice: true,
            cloudSyncStatus: 'conflict',
            lastError: conflictRecord.conflictReason,
          });
          this.emit({ type: 'conflict_detected', conflict: conflictRecord });
        } else {
          // Invariant: Never overwrite p.baseRevision in place!
          // Preserving immutable operation IDs and their original command payload/revision envelope
          // guarantees that a lost-response retry remains compatible with existing server receipts,
          // and prevents turning a stale edit into a silent overwrite.
          await this.repository.enqueueMutation(p);
        }
      }
    }

    this.lastSyncedAt = newCursor.lastSyncedAt;
    this.accessEpoch = bootstrapRes.data.accessEpoch;
    this.log('info', 'Snapshot bootstrap completed successfully');
  }

  // --- Explicit Conflict Recovery ---

  /**
   * Resolves a detected conflict explicitly without silent overwrites or reusing operation IDs.
   */
  async resolveConflict(
    conflictId: string,
    resolution: 'keep_local' | 'keep_server' | 'custom' | 'save_copy' | 'merge',
    customPayload?: Record<string, unknown>
  ): Promise<void> {
    let conflict =
      this.activeConflicts.get(conflictId) ||
      Array.from(this.activeConflicts.values()).find(
        (c) => c.id === conflictId || c.entityId === conflictId
      );
    if (!conflict) {
      const persisted = await this.repository.listConflicts(this.namespace.workspaceId);
      conflict = persisted.find(
        (c) => !c.resolved && (c.id === conflictId || c.entityId === conflictId)
      );
      if (conflict) {
        this.activeConflicts.set(conflict.entityId, conflict);
        this.activeConflicts.set(conflict.id, conflict);
      }
    }
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    if (resolution === 'save_copy') {
      const copyEntityId = this.generateId();
      const copyOpId = this.generateId();
      const localTitle =
        (conflict.localPayload['title'] as string | undefined) ??
        (conflict.localPayload['name'] as string | undefined) ??
        'Copy';
      const copyPayload = {
        ...conflict.localPayload,
        id: copyEntityId,
        title: `${localTitle} (Copy)`,
        name: `${localTitle} (Copy)`,
      };

      const copyMutation: PendingMutationRecord = {
        operationId: copyOpId,
        deviceId: this.deviceId,
        workspaceId: conflict.workspaceId,
        userId: conflict.userId,
        entityType: conflict.entityType,
        entityId: copyEntityId,
        action: 'create',
        command:
          conflict.entityType === 'folder'
            ? 'createFolder'
            : conflict.entityType === 'note'
              ? 'createNote'
              : conflict.entityType === 'task'
                ? 'createTask'
                : conflict.entityType === 'journal_entry'
                  ? 'createJournalEntry'
                  : 'createItem',
        commandVersion: 1,
        schemaVersion: 1,
        payload: copyPayload,
        baseRevision: 0,
        dependencyOperationIds: [],
        clientTimestamp: new Date().toISOString(),
        retryCount: 0,
        status: 'pending',
        lastError: null,
      };

      // Also accept server state for original entity
      let serverHeader: ItemHeaderRecord | undefined = undefined;
      let serverNote: NoteRecord | undefined = undefined;
      let serverTask: TaskRecord | undefined = undefined;
      let serverJournal: JournalEntryRecord | undefined = undefined;
      if (conflict.serverState) {
        const s = conflict.serverState;
        serverHeader = {
          id: conflict.entityId,
          workspaceId: conflict.workspaceId,
          kind: (s['kind'] as string) || (conflict.entityType === 'task' ? 'task' : 'note'),
          folderId: (s['folderId'] as string | null) ?? null,
          rank: (s['rank'] as string) || '0',
          isArchived: Boolean(s['isArchived'] ?? false),
          isPinned: Boolean(s['isPinned'] ?? false),
          securityScope: (s['securityScope'] as 'standard' | 'vault') || 'standard',
          serverRevision: conflict.serverRevision,
          name: (s['title'] as string) || (s['name'] as string) || undefined,
          title: (s['title'] as string) || (s['name'] as string) || undefined,
          createdAt: (s['createdAt'] as string) || new Date().toISOString(),
          updatedAt: (s['updatedAt'] as string) || new Date().toISOString(),
          deletedAt: s['deletedAt'] ? String(s['deletedAt']) : null,
        };
        if (s['document']) {
          serverNote = {
            id: conflict.entityId,
            workspaceId: conflict.workspaceId,
            folderId: (s['folderId'] as string | null) ?? null,
            title:
              (s['title'] as string | undefined) ?? (s['name'] as string | undefined) ?? 'Untitled',
            document: s['document'] as NoteDocument,
            plainText: (s['plainText'] as string) || '',
            wordCount: (s['wordCount'] as number) || 0,
            charCount: (s['charCount'] as number) || 0,
            serverRevision: conflict.serverRevision,
            createdAt: (s['createdAt'] as string) || new Date().toISOString(),
            updatedAt: (s['updatedAt'] as string) || new Date().toISOString(),
            deletedAt: s['deletedAt'] ? String(s['deletedAt']) : null,
          };
        }
        if (conflict.entityType === 'task' || s['kind'] === 'task' || s['kind'] === 'todo') {
          serverTask = {
            id: conflict.entityId,
            workspaceId: conflict.workspaceId,
            folderId: (s['folderId'] as string | null) ?? null,
            title: (s['title'] as string) || (s['name'] as string) || 'Untitled',
            details: typeof s['details'] === 'string' ? s['details'] : null,
            priority: (s['priority'] as TaskPriority | undefined) ?? 'normal',
            status: (s['status'] as TaskStatus | undefined) ?? 'todo',
            deadline:
              s['deadline'] && typeof s['deadline'] === 'object' && 'type' in s['deadline']
                ? (s['deadline'] as TaskDeadline)
                : { type: 'none' as const },
            completedAt: typeof s['completedAt'] === 'string' ? s['completedAt'] : null,
            reopenedAt: typeof s['reopenedAt'] === 'string' ? s['reopenedAt'] : null,
            completionHistory: Array.isArray(s['completionHistory'])
              ? (s['completionHistory'] as TaskCompletionHistoryItem[])
              : [],
            parentId: typeof s['parentId'] === 'string' ? s['parentId'] : null,
            subtaskOrder: typeof s['subtaskOrder'] === 'number' ? s['subtaskOrder'] : 0,
            tags: Array.isArray(s['tags']) ? s['tags'].map(String) : [],
            serverRevision: conflict.serverRevision,
            createdAt: (s['createdAt'] as string) || new Date().toISOString(),
            updatedAt: (s['updatedAt'] as string) || new Date().toISOString(),
            deletedAt: s['deletedAt'] ? String(s['deletedAt']) : null,
          };
        }
        if (
          conflict.entityType === 'journal_entry' ||
          s['kind'] === 'journal_entry' ||
          s['kind'] === 'journal'
        ) {
          serverJournal = {
            id: conflict.entityId,
            workspaceId: conflict.workspaceId,
            folderId: (s['folderId'] as string | null) ?? null,
            title: (s['title'] as string | null) ?? null,
            entryDate: (s['entryDate'] as string) || (s['createdAt'] as string).slice(0, 10),
            timezone: (s['timezone'] as string) || 'UTC',
            document: (s['document'] as NoteDocument) || { version: 1, type: 'doc', content: [] },
            plainText: (s['plainText'] as string) || '',
            wordCount: (s['wordCount'] as number) || 0,
            charCount: (s['charCount'] as number) || 0,
            mood: (s['mood'] as string | null) ?? null,
            prompts: Array.isArray(s['prompts']) ? (s['prompts'] as JournalPromptEntry[]) : [],
            tags: Array.isArray(s['tags']) ? s['tags'].map(String) : [],
            isDraft: Boolean(s['isDraft']),
            isArchived: Boolean(s['isArchived']),
            isPinned: Boolean(s['isPinned']),
            securityScope: (s['securityScope'] as 'standard' | 'vault') || 'standard',
            serverRevision: conflict.serverRevision,
            createdAt: (s['createdAt'] as string) || new Date().toISOString(),
            updatedAt: (s['updatedAt'] as string) || new Date().toISOString(),
            deletedAt: s['deletedAt'] ? String(s['deletedAt']) : null,
          };
        }
      }

      await this.repository.resolveConflictTransaction(
        conflict.id,
        'save_copy',
        serverHeader,
        copyMutation,
        conflict.operationId,
        serverNote,
        undefined,
        serverTask,
        undefined,
        undefined,
        serverJournal
      );

      this.itemStates.set(conflict.entityId, {
        savedOnDevice: true,
        cloudSyncStatus: 'synced',
        lastSyncedRevision: conflict.serverRevision,
      });
      this.itemStates.set(copyEntityId, {
        savedOnDevice: true,
        cloudSyncStatus: 'saved_locally',
        pendingOperationId: copyOpId,
      });
    } else if (resolution === 'keep_local' || resolution === 'custom' || resolution === 'merge') {
      let payload =
        resolution === 'custom' && customPayload ? customPayload : conflict.localPayload;

      if (resolution === 'merge') {
        if (conflict.entityType === 'task' || conflict.entityType === 'todo') {
          const baseTask = (conflict.baseState as TaskRecord | undefined) || null;
          const localTask = conflict.localPayload as Partial<TaskRecord>;
          const serverTask = (conflict.serverState as Partial<TaskRecord>) || {};
          const { merged, conflictingFields } = mergeTaskFields(baseTask, localTask, serverTask);
          if (conflictingFields.length > 0 && !customPayload) {
            throw new Error(
              `Cannot automatically merge task fields: conflicting edits in ${conflictingFields.join(', ')}`
            );
          }
          payload = customPayload
            ? { ...merged, ...customPayload }
            : (merged as Record<string, unknown>);
        }
      }

      // Invariant: Never reuse the rejected operation ID or baseRevision!
      // Mint a fresh operation ID with baseRevision equal to the current serverRevision.
      const newOpId = this.generateId();
      const newMutation: PendingMutationRecord = {
        operationId: newOpId,
        deviceId: this.deviceId,
        workspaceId: conflict.workspaceId,
        userId: conflict.userId,
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        action: 'update',
        command:
          conflict.entityType === 'folder'
            ? 'updateFolder'
            : conflict.entityType === 'note'
              ? 'updateNote'
              : conflict.entityType === 'task'
                ? 'updateTask'
                : conflict.entityType === 'journal_entry'
                  ? 'updateJournalEntry'
                  : 'updateItem',
        commandVersion: 1,
        schemaVersion: 1,
        payload,
        baseRevision: conflict.serverRevision,
        dependencyOperationIds: [],
        clientTimestamp: new Date().toISOString(),
        retryCount: 0,
        status: 'pending',
        lastError: null,
      };

      // Atomic conflict resolution transaction: marks resolved, removes old op, enqueues replacement
      await this.repository.resolveConflictTransaction(
        conflict.id,
        resolution === 'merge' ? 'custom' : resolution,
        undefined,
        newMutation,
        conflict.operationId
      );

      this.itemStates.set(conflict.entityId, {
        savedOnDevice: true,
        cloudSyncStatus: 'saved_locally',
        pendingOperationId: newOpId,
      });
    } else {
      // keep_server: accept server representation
      let updatedHeader: ItemHeaderRecord | undefined = undefined;
      let updatedNote: NoteRecord | undefined = undefined;
      let updatedTask: TaskRecord | undefined = undefined;
      let updatedRoutine: RoutineRecord | undefined = undefined;
      let updatedOccurrence: RoutineOccurrenceRecord | undefined = undefined;
      let updatedJournal: JournalEntryRecord | undefined = undefined;
      if (conflict.serverState) {
        const s = conflict.serverState;
        updatedHeader = {
          id: conflict.entityId,
          workspaceId: conflict.workspaceId,
          kind:
            (s['kind'] as string) ||
            (conflict.entityType === 'task'
              ? 'task'
              : conflict.entityType === 'routine'
                ? 'routine'
                : conflict.entityType === 'journal_entry'
                  ? 'journal_entry'
                  : 'note'),
          folderId: (s['folderId'] as string | null) ?? null,
          rank: (s['rank'] as string) || '0',
          isArchived: Boolean(s['isArchived'] ?? false),
          isPinned: Boolean(s['isPinned'] ?? false),
          securityScope: (s['securityScope'] as 'standard' | 'vault') || 'standard',
          serverRevision: conflict.serverRevision,
          name: (s['title'] as string) || (s['name'] as string) || undefined,
          title: (s['title'] as string) || (s['name'] as string) || undefined,
          createdAt: (s['createdAt'] as string) || new Date().toISOString(),
          updatedAt: (s['updatedAt'] as string) || new Date().toISOString(),
          deletedAt: s['deletedAt'] ? String(s['deletedAt']) : null,
        };
        if (s['document']) {
          updatedNote = {
            id: conflict.entityId,
            workspaceId: conflict.workspaceId,
            folderId: (s['folderId'] as string | null) ?? null,
            title:
              (s['title'] as string | undefined) ?? (s['name'] as string | undefined) ?? 'Untitled',
            document: s['document'] as NoteDocument,
            plainText: (s['plainText'] as string) || '',
            wordCount: (s['wordCount'] as number) || 0,
            charCount: (s['charCount'] as number) || 0,
            serverRevision: conflict.serverRevision,
            createdAt: (s['createdAt'] as string) || new Date().toISOString(),
            updatedAt: (s['updatedAt'] as string) || new Date().toISOString(),
            deletedAt: s['deletedAt'] ? String(s['deletedAt']) : null,
          };
        }
        if (conflict.entityType === 'task' || s['kind'] === 'task' || s['kind'] === 'todo') {
          updatedTask = {
            id: conflict.entityId,
            workspaceId: conflict.workspaceId,
            folderId: (s['folderId'] as string | null) ?? null,
            title: (s['title'] as string) || (s['name'] as string) || 'Untitled',
            details: typeof s['details'] === 'string' ? s['details'] : null,
            priority: (s['priority'] as TaskPriority | undefined) ?? 'normal',
            status: (s['status'] as TaskStatus | undefined) ?? 'todo',
            deadline:
              s['deadline'] && typeof s['deadline'] === 'object' && 'type' in s['deadline']
                ? (s['deadline'] as TaskDeadline)
                : { type: 'none' as const },
            completedAt: typeof s['completedAt'] === 'string' ? s['completedAt'] : null,
            reopenedAt: typeof s['reopenedAt'] === 'string' ? s['reopenedAt'] : null,
            completionHistory: Array.isArray(s['completionHistory'])
              ? (s['completionHistory'] as TaskCompletionHistoryItem[])
              : [],
            parentId: typeof s['parentId'] === 'string' ? s['parentId'] : null,
            subtaskOrder: typeof s['subtaskOrder'] === 'number' ? s['subtaskOrder'] : 0,
            tags: Array.isArray(s['tags']) ? s['tags'].map(String) : [],
            serverRevision: conflict.serverRevision,
            createdAt: (s['createdAt'] as string) || new Date().toISOString(),
            updatedAt: (s['updatedAt'] as string) || new Date().toISOString(),
            deletedAt: s['deletedAt'] ? String(s['deletedAt']) : null,
          };
        }
        if (conflict.entityType === 'routine' || s['kind'] === 'routine') {
          updatedRoutine = {
            id: conflict.entityId,
            workspaceId: conflict.workspaceId,
            folderId: (s['folderId'] as string | null) ?? null,
            title: (s['title'] as string) || (s['name'] as string) || 'Untitled Routine',
            details: typeof s['details'] === 'string' ? s['details'] : null,
            frequency: s['frequency'] === 'weekdays' ? 'weekdays' : 'daily',
            weekdays: Array.isArray(s['weekdays']) ? (s['weekdays'] as Weekday[]) : [],
            timezone: typeof s['timezone'] === 'string' ? s['timezone'] : 'UTC',
            scheduledTime: typeof s['scheduledTime'] === 'string' ? s['scheduledTime'] : null,
            activeFrom: (s['activeFrom'] as string) || new Date().toISOString().slice(0, 10),
            activeTo: s['activeTo'] ? String(s['activeTo']) : null,
            isPaused: Boolean(s['isPaused']),
            isArchived: Boolean(s['isArchived']),
            isPinned: Boolean(s['isPinned']),
            scheduleRevision: Number(s['scheduleRevision']) || 1,
            effectiveDate: (s['effectiveDate'] as string) || new Date().toISOString().slice(0, 10),
            serverRevision: conflict.serverRevision,
            createdAt: (s['createdAt'] as string) || new Date().toISOString(),
            updatedAt: (s['updatedAt'] as string) || new Date().toISOString(),
            deletedAt: s['deletedAt'] ? String(s['deletedAt']) : null,
          };
        }
        if (
          conflict.entityType === 'journal_entry' ||
          s['kind'] === 'journal_entry' ||
          s['kind'] === 'journal'
        ) {
          updatedJournal = {
            id: conflict.entityId,
            workspaceId: conflict.workspaceId,
            folderId: (s['folderId'] as string | null) ?? null,
            title: (s['title'] as string | null) ?? null,
            entryDate: (s['entryDate'] as string) || (s['createdAt'] as string).slice(0, 10),
            timezone: (s['timezone'] as string) || 'UTC',
            document: (s['document'] as NoteDocument) || { version: 1, type: 'doc', content: [] },
            plainText: (s['plainText'] as string) || '',
            wordCount: (s['wordCount'] as number) || 0,
            charCount: (s['charCount'] as number) || 0,
            mood: (s['mood'] as string | null) ?? null,
            prompts: Array.isArray(s['prompts']) ? (s['prompts'] as JournalPromptEntry[]) : [],
            tags: Array.isArray(s['tags']) ? s['tags'].map(String) : [],
            isDraft: Boolean(s['isDraft']),
            isArchived: Boolean(s['isArchived']),
            isPinned: Boolean(s['isPinned']),
            securityScope: (s['securityScope'] as 'standard' | 'vault') || 'standard',
            serverRevision: conflict.serverRevision,
            createdAt: (s['createdAt'] as string) || new Date().toISOString(),
            updatedAt: (s['updatedAt'] as string) || new Date().toISOString(),
            deletedAt: s['deletedAt'] ? String(s['deletedAt']) : null,
          };
        }

        if (conflict.entityType === 'routine_occurrence') {
          updatedOccurrence = {
            id: conflict.entityId,
            workspaceId: conflict.workspaceId,
            routineId: String(s['routineId'] || s['routine_id'] || ''),
            scheduledDate: String(s['scheduledDate'] || s['scheduled_date'] || ''),
            scheduleRevision: Number(s['scheduleRevision'] || s['schedule_revision']) || 1,
            plannedInstant: s['plannedInstant'] ? String(s['plannedInstant']) : null,
            timezone: String(s['timezone'] || 'UTC'),
            status: (s['status'] as RoutineOccurrenceStatus) || 'pending',
            completedAt: s['completedAt'] ? String(s['completedAt']) : null,
            completedBy: s['completedBy'] ? String(s['completedBy']) : null,
            history: Array.isArray(s['history'])
              ? (s['history'] as RoutineOccurrenceTransition[])
              : [],
            serverRevision: conflict.serverRevision,
            createdAt: (s['createdAt'] as string) || new Date().toISOString(),
            updatedAt: (s['updatedAt'] as string) || new Date().toISOString(),
          };
        }
      }

      // Preserve local intent as recovery draft
      const recoveryDraft: DraftRecord = {
        id: this.generateId(),
        workspaceId: conflict.workspaceId,
        userId: conflict.userId,
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        title:
          (conflict.localPayload['title'] as string) ||
          (conflict.localPayload['name'] as string) ||
          'Conflicted local version',
        payload: conflict.localPayload,
        savedAt: new Date().toISOString(),
        isQuarantined: false,
        quarantinedAt: null,
      };

      await this.repository.resolveConflictTransaction(
        conflict.id,
        'keep_server',
        updatedHeader,
        undefined,
        conflict.operationId,
        updatedNote,
        recoveryDraft,
        updatedTask,
        updatedRoutine,
        updatedOccurrence,
        updatedJournal
      );

      this.itemStates.set(conflict.entityId, {
        savedOnDevice: true,
        cloudSyncStatus: 'synced',
        lastSyncedRevision: conflict.serverRevision,
      });
    }

    conflict.resolved = true;
    this.activeConflicts.delete(conflict.entityId);
    this.activeConflicts.delete(conflict.id);
    this.emit({ type: 'conflict_resolved', conflictId: conflict.id });

    if (resolution !== 'keep_server') {
      if (this.coordination.isLeader) {
        this.syncNow().catch(() => {});
      } else {
        this.coordination.requestSync();
      }
    }
  }

  async getNote(id: string): Promise<NoteRecord | null> {
    return this.repository.getNote(this.namespace.workspaceId, id);
  }

  async getTask(id: string): Promise<TaskRecord | null> {
    return this.repository.getTask(this.namespace.workspaceId, id);
  }

  async listTasks(): Promise<TaskRecord[]> {
    return this.repository.listTasks(this.namespace.workspaceId);
  }

  async getRoutine(id: string): Promise<RoutineRecord | null> {
    return this.repository.getRoutine(this.namespace.workspaceId, id);
  }

  async listRoutines(): Promise<RoutineRecord[]> {
    return this.repository.listRoutines(this.namespace.workspaceId);
  }

  async getRoutineOccurrence(id: string): Promise<RoutineOccurrenceRecord | null> {
    return this.repository.getRoutineOccurrence(this.namespace.workspaceId, id);
  }

  async listRoutineOccurrences(
    routineId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<RoutineOccurrenceRecord[]> {
    return this.repository.listRoutineOccurrences(
      this.namespace.workspaceId,
      routineId,
      startDate,
      endDate
    );
  }

  async getJournalEntry(id: string): Promise<JournalEntryRecord | null> {
    return this.repository.getJournalEntry(this.namespace.workspaceId, id);
  }

  async listJournalEntries(options?: {
    entryDate?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<JournalEntryRecord[]> {
    return this.repository.listJournalEntries(this.namespace.workspaceId, options);
  }


  // --- Auth & Account Boundary Handlers ---

  handleAuthLost(): void {
    this.authLost = true;
    this.setOverallStatus('needs_attention');
    this.emit({
      type: 'error',
      message: 'Authentication session expired or revoked',
      isAuthError: true,
    });
  }

  handleAuthRestored(): void {
    this.authLost = false;
    this.consecutiveFailures = 0;
    if (this.coordination.isLeader) {
      this.syncNow().catch(() => {});
    } else {
      this.coordination.requestSync();
    }
  }

  async handleAccountSwitch(newNamespace: AccountNamespace): Promise<void> {
    await this.stop();
    await this.repository.quarantineUserDrafts(this.namespace.userId);
    this.namespace = newNamespace;
    this.itemStates.clear();
    this.activeConflicts.clear();
    await this.repository.initialize(newNamespace);
    await this.start();
  }

  async handleLogout(clearLocalData: boolean): Promise<void> {
    await this.stop();
    if (clearLocalData) {
      await this.repository.clearAccountData(this.namespace.userId);
    } else {
      await this.repository.quarantineUserDrafts(this.namespace.userId);
    }
    this.itemStates.clear();
    this.activeConflicts.clear();
  }

  // --- Internal Utilities ---

  /**
   * Observed room membership revocation: stop sync for this workspace, purge readable
   * room caches, drop unauthorized queued writes. Does not publish drafts elsewhere.
   * Offline devices may retain previously downloaded bytes until this path runs.
   */
  async handleRoomMembershipRevoked(
    reason: string = 'membership_removed'
  ): Promise<void> {
    this.log('warn', `Room membership revoked (${reason}); purging local room cache`);
    await this.stop();
    const scope = planRoomRevocationPurge({
      workspaceId: this.namespace.workspaceId,
      userId: this.namespace.userId,
      reason: reason as
        | 'membership_removed'
        | 'role_downgraded'
        | 'room_archived'
        | 'access_epoch_changed'
        | 'cursor_invalid',
    });
    await applyRoomRevocationPurge(
      this.repository,
      scope,
      this.abortController ?? undefined
    );
    this.itemStates.clear();
    this.activeConflicts.clear();
    this.setOverallStatus('needs_attention');
    this.emit({
      type: 'room_revoked',
      workspaceId: this.namespace.workspaceId,
      reason,
      message:
        'Room access was revoked. Shared caches for this room were cleared. Previously downloaded offline copies may remain on disconnected devices until reconnect.',
    });
  }

  private handleSyncFailure(error: unknown): void {
    const classified = classifyRoomSyncFailure(error);
    this.consecutiveFailures++;

    if (classified.isMembershipRevoked) {
      void this.handleRoomMembershipRevoked(classified.revocationReason ?? 'membership_removed');
      return;
    }

    if (classified.isAuthError) {
      this.handleAuthLost();
      return;
    }

    this.log('warn', `Sync iteration failed: ${classified.message}`);
    this.setOverallStatus(classified.isNetworkError ? 'saved_locally' : 'error');

    this.emit({
      type: 'error',
      message: classified.message,
      code: classified.code,
      isAuthError: classified.isAuthError,
    });

    // Bounded exponential backoff with jitter
    const delay = classified.retryAfterMs ?? this.calculateBackoffDelay();
    this.scheduleRetry(delay);
  }

  private calculateBackoffDelay(): number {
    const exp = Math.min(this.consecutiveFailures, this.maxRetries);
    const base = this.initialDelayMs * Math.pow(this.factor, exp);
    const bounded = Math.min(base, this.maxDelayMs);
    const jitterAmount = bounded * this.jitter * (Math.random() * 2 - 1);
    return Math.max(100, Math.floor(bounded + jitterAmount));
  }

  private scheduleRetry(delayMs: number): void {
    this.clearRetryTimer();
    this.retryTimer = setTimeout(() => {
      if (this.isRunning && this.networkStatus === 'online') {
        if (this.coordination.isLeader) {
          this.syncNow().catch(() => {});
        } else {
          this.coordination.requestSync();
        }
      }
    }, delayMs);
  }

  private scheduleNextPoll(): void {
    this.clearPollTimer();
    this.pollTimer = setInterval(() => {
      if (this.isRunning && this.coordination.isLeader) {
        this.syncNow().catch(() => {});
      }
    }, this.pollIntervalMs);
  }

  private clearPollTimer(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private setOverallStatus(status: CloudSyncStatus): void {
    if (this.overallCloudStatus !== status) {
      this.overallCloudStatus = status;
      this.emit({ type: 'state_changed', status });
    }
  }

  private emit(event: SyncEngineEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* ignore listener exceptions */
      }
    }
  }

  private log(level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>): void {
    if (this.logger) {
      this.logger(level, msg, meta);
    }
  }

  private async getPendingForEntity(entityId: string): Promise<PendingMutationRecord[]> {
    const all = await this.repository.getPendingMutations(
      this.namespace.workspaceId,
      this.namespace.userId
    );
    return all.filter((m) => m.entityId === entityId);
  }

  private topologicallySortPending(mutations: PendingMutationRecord[]): PendingMutationRecord[] {
    const byId = new Map<string, PendingMutationRecord>();
    for (const m of mutations) {
      byId.set(m.operationId, m);
    }

    const visited = new Set<string>();
    const result: PendingMutationRecord[] = [];

    const visit = (m: PendingMutationRecord) => {
      if (visited.has(m.operationId)) return;
      visited.add(m.operationId);

      for (const depId of m.dependencyOperationIds) {
        const dep = byId.get(depId);
        if (dep) {
          visit(dep);
        }
      }
      result.push(m);
    };

    for (const m of mutations) {
      visit(m);
    }

    return result;
  }
}
