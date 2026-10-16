import type {
  SyncCommand,
  SyncPushRequest,
  SyncCommandType,
  NoteDocument,
  TaskPriority,
  TaskStatus,
  TaskDeadline,
  TaskCompletionHistoryItem,
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
} from './models.js';
import { type SyncTransportPort, classifySyncError } from './transport.js';
import { type TabCoordinationPort, SingleProcessCoordinator } from './coordination.js';

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
    const isNote = item.kind === 'note' || (command !== undefined && command.includes('Note'));
    const isTask =
      item.kind === 'task' ||
      item.kind === 'todo' ||
      (command !== undefined && command.includes('Task'));
    const determinedCommand =
      command ||
      (item.serverRevision === 0
        ? isFolder
          ? 'createFolder'
          : isNote
            ? 'createNote'
            : isTask
              ? 'createTask'
              : 'createItem'
        : isFolder
          ? 'updateFolder'
          : isNote
            ? 'updateNote'
            : isTask
              ? 'updateTask'
              : 'updateItem');

    const action: 'create' | 'update' | 'delete' =
      determinedCommand === 'trashItem' ||
      determinedCommand === 'trashFolder' ||
      determinedCommand === 'trashNote' ||
      determinedCommand === 'trashTask'
        ? 'delete'
        : determinedCommand === 'createItem' ||
            determinedCommand === 'createFolder' ||
            determinedCommand === 'createNote' ||
            determinedCommand === 'createTask'
          ? 'create'
          : 'update';

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
      entityType: isFolder ? 'folder' : isNote ? 'note' : isTask ? 'task' : 'item',
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

    // 2. Perform atomic local storage write via transaction
    try {
      await this.repository.saveItemTransaction(
        item,
        mutationRecord,
        draft,
        noteRecord,
        taskRecord
      );
    } catch (err) {
      // Local transaction failed: cannot show as saved on device
      this.itemStates.set(item.id, {
        savedOnDevice: false,
        cloudSyncStatus: 'error',
        lastError: err instanceof Error ? err.message : String(err),
      });
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
    const batch = sortedQueue.slice(0, 50);

    const commands: SyncCommand[] = batch.map((m) => {
      const isTask = m.entityType === 'task';
      const cmdType: SyncCommandType =
        (m.command as SyncCommandType) ||
        (isTask
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
        entityType: 'item',
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
      const origMutation = batch.find((m) => m.operationId === result.operationId);
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
                origMutation.command === 'trashNote'
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

        // B. Retain pending work until the durable result is applied locally
        // and apply acknowledgment atomically in a single transaction
        await this.repository.applyAcknowledgment(
          updatedHeader,
          result.operationId,
          noteToAck,
          taskToAck
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

        for (const change of pullRes.data.changes) {
          totalChanges++;
          const data = (change.data || {}) as Record<string, unknown>;
          const existing = await this.repository.getItemHeader(
            this.namespace.workspaceId,
            change.entityId
          );

          const defaultKind =
            change.entityType === 'folder'
              ? 'folder'
              : change.entityType === 'task'
                ? 'task'
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
          } else if ('restored' in data && data.restored) {
            deletedAt = null;
          }

          const header: ItemHeaderRecord = {
            id: change.entityId,
            workspaceId: this.namespace.workspaceId,
            kind,
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

          if (kind === 'note' || change.entityType === 'note') {
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
          tasksToApply
        );

        this.lastSyncedAt = newCursorRecord.lastSyncedAt;
        this.accessEpoch = pullRes.data.accessEpoch;

        hasMore = pullRes.data.hasMore;
      } catch (err) {
        const classified = classifySyncError(err);
        if (classified.isResetRequired) {
          this.log('warn', 'Cursor expired or epoch rotated; initiating bootstrap snapshot reset');
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
    }

    // Atomically install snapshot, replacing obsolete projections while preserving local work
    await this.repository.installBootstrapGeneration(
      snapshotItems,
      newCursor,
      preserveLocalItemIds,
      snapshotNotes,
      snapshotTasks
    );

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
    resolution: 'keep_local' | 'keep_server' | 'custom' | 'save_copy',
    customPayload?: Record<string, unknown>
  ): Promise<void> {
    const conflict =
      this.activeConflicts.get(conflictId) ||
      Array.from(this.activeConflicts.values()).find((c) => c.id === conflictId);
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
      }

      await this.repository.resolveConflictTransaction(
        conflict.id,
        'save_copy',
        serverHeader,
        copyMutation,
        conflict.operationId,
        serverNote,
        undefined,
        serverTask
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
    } else if (resolution === 'keep_local' || resolution === 'custom') {
      const payload =
        resolution === 'custom' && customPayload ? customPayload : conflict.localPayload;

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
        resolution,
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
      if (conflict.serverState) {
        const s = conflict.serverState;
        updatedHeader = {
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
        updatedTask
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

  private handleSyncFailure(error: unknown): void {
    const classified = classifySyncError(error);
    this.consecutiveFailures++;

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
