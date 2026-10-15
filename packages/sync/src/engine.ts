import crypto from 'node:crypto';
import type {
  SyncCommand,
  SyncPushRequest,
  SyncCommandType,
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
} from './models.js';
import {
  type SyncTransportPort,
  classifySyncError,
} from './transport.js';
import {
  type TabCoordinationPort,
  SingleProcessCoordinator,
} from './coordination.js';

export interface SaveItemOptions {
  dependencyOperationIds?: string[];
  autoSync?: boolean;
}

export interface SyncEngineOptions {
  repository: LocalRepositoryPort;
  transport: SyncTransportPort;
  namespace: AccountNamespace;
  deviceId: string;
  coordination?: TabCoordinationPort;
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

export class SyncEngine {
  private repository: LocalRepositoryPort;
  private transport: SyncTransportPort;
  private namespace: AccountNamespace;
  private deviceId: string;
  private coordination: TabCoordinationPort;

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

  private itemStates = new Map<string, ItemSyncState>();
  private activeConflicts = new Map<string, ConflictRecord>();
  private listeners = new Set<(event: SyncEngineEvent) => void>();

  private logger?: (level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
  private abortController: AbortController | null = null;
  private activeSyncPromise: Promise<void> | null = null;
  private queuedSyncPromise: Promise<void> | null = null;

  constructor(options: SyncEngineOptions) {
    this.repository = options.repository;
    this.transport = options.transport;
    this.namespace = options.namespace;
    this.deviceId = options.deviceId;
    this.coordination = options.coordination ?? new SingleProcessCoordinator();

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

    this.coordination.start();
    this.coordination.onSyncRequested(() => {
      if (this.networkStatus === 'online') {
        this.syncNow().catch(() => {});
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
        this.syncNow().catch(() => {});
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
    return {
      workspaceId: this.namespace.workspaceId,
      userId: this.namespace.userId,
      deviceId: this.deviceId,
      isLeader: this.coordination.isLeader,
      networkStatus: this.networkStatus,
      cloudSyncStatus: this.overallCloudStatus,
      queueLength: this.countPendingMutations(),
      inFlightCount: this.countInFlightMutations(),
      failedCount: this.countFailedMutations(),
      lastSyncedAt: this.lastSyncedAt,
      lastSyncSequence: this.lastSyncSequence,
      accessEpoch: this.accessEpoch,
      consecutiveFailures: this.consecutiveFailures,
      activeConflictsCount: this.activeConflicts.size,
    };
  }

  getConflicts(): ConflictRecord[] {
    return Array.from(this.activeConflicts.values()).filter((c) => !c.resolved);
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
    const operationId = crypto.randomUUID();
    const clientTimestamp = new Date().toISOString();

    // 1. Resolve dependency operations:
    // If there are pending operations for this entity, automatically depend on the latest one
    // to guarantee deterministic ordering within this client queue.
    const pendingForEntity = await this.getPendingForEntity(item.id);
    const inferredDeps = pendingForEntity.map((m) => m.operationId);
    const resolvedDeps = Array.from(
      new Set([...(options?.dependencyOperationIds || []), ...inferredDeps])
    );

    const determinedCommand = command || 'updateItem';
    const action: 'create' | 'update' | 'delete' =
      determinedCommand === 'trashItem'
        ? 'delete'
        : determinedCommand === 'createItem'
        ? 'create'
        : 'update';

    const mutationPayload = draft
      ? { kind: item.kind, ...draft.payload }
      : { kind: item.kind, rank: item.rank };

    const mutationRecord: PendingMutationRecord = {
      operationId,
      deviceId: this.deviceId,
      workspaceId: item.workspaceId,
      userId: this.namespace.userId,
      entityType: 'item',
      entityId: item.id,
      action,
      command: determinedCommand,
      commandVersion: 1,
      schemaVersion: 1,
      payload: mutationPayload,
      baseRevision: item.serverRevision,
      dependencyOperationIds: resolvedDeps,
      clientTimestamp,
      retryCount: 0,
      status: 'pending',
      lastError: null,
    };

    // 2. Perform atomic local storage write
    try {
      if (draft) {
        await this.repository.saveDraftAndMutation(draft, mutationRecord);
      } else {
        await this.repository.enqueueMutation(mutationRecord);
      }
      await this.repository.upsertItemHeader(item);
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

  private async executeSyncCycle(): Promise<void> {
    this.isSyncing = true;
    this.setOverallStatus('syncing');

    try {
      // 1. Pull latest server changes first to update projection and detect conflicts
      const pullResult = await this.pullChanges();

      // 2. Push local pending mutations
      const pushResult = await this.pushPending();

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
      this.handleSyncFailure(error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Drains the local pending mutation queue in dependency order, sending batches
   * of up to 50 operations.
   */
  async pushPending(): Promise<{ pushedCount: number }> {
    if (this.networkStatus === 'offline') {
      return { pushedCount: 0 };
    }

    const pending = await this.repository.getPendingMutations(
      this.namespace.workspaceId,
      this.namespace.userId
    );

    if (pending.length === 0) {
      return { pushedCount: 0 };
    }

    // 1. Topologically sort queue respecting dependencyOperationIds
    const sortedQueue = this.topologicallySortPending(pending);
    const batch = sortedQueue.slice(0, 50);

    const commands: SyncCommand[] = batch.map((m) => {
      const cmdType: SyncCommandType = (m.command as SyncCommandType) ||
        (m.action === 'delete' ? 'trashItem' : m.action === 'create' ? 'createItem' : 'updateItem');

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
    const pushResponse = await this.transport.push(pushRequest);

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
        if (header) {
          header.serverRevision = result.revision;
          if (origMutation.command === 'trashItem') {
            header.deletedAt = new Date().toISOString();
          } else if (origMutation.command === 'restoreItem') {
            header.deletedAt = null;
          }
          await this.repository.upsertItemHeader(header);
        }

        // B. Retain pending work until the durable result is applied locally
        await this.repository.removePendingMutation(result.operationId);

        // C. Update item sync state to synced
        this.itemStates.set(result.entityId, {
          savedOnDevice: true,
          cloudSyncStatus: 'synced',
          lastSyncedRevision: result.revision,
        });
      } else if (result.status === 'conflict') {
        // Explicit conflict handling: preserve local intent and server state
        const conflictRecord: ConflictRecord = {
          id: crypto.randomUUID(),
          entityId: result.entityId,
          entityType: 'item',
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

        // Update mutation state to failed, retaining the operation in local queue
        origMutation.status = 'failed';
        origMutation.lastError = conflictRecord.conflictReason;
        await this.repository.enqueueMutation(origMutation);

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
  async pullChanges(): Promise<{ changesCount: number }> {
    if (this.networkStatus === 'offline') {
      return { changesCount: 0 };
    }

    let totalChanges = 0;
    let hasMore = true;

    while (hasMore) {
      const cursorRecord = await this.repository.getCursor(
        this.namespace.workspaceId,
        this.namespace.userId
      );

      try {
        const pullRes = await this.transport.pull({
          workspaceId: this.namespace.workspaceId,
          cursor: cursorRecord?.cursor,
          limit: 100,
        });

        // 1. Apply each change to local repository
        for (const change of pullRes.data.changes) {
          totalChanges++;
          const existing = await this.repository.getItemHeader(
            this.namespace.workspaceId,
            change.entityId
          );

          // Out-of-order and duplicate revision handling:
          if (existing && existing.serverRevision >= change.revision) {
            continue; // No-op for stale revision
          }

          // Tombstone protection: do not resurrect deleted entity unless explicit restore
          if (existing && existing.deletedAt !== null && !change.isTombstone) {
            // Preserve tombstone if change is not a newer restoration
            continue;
          }

          if (change.isTombstone) {
            if (existing) {
              existing.deletedAt = new Date().toISOString();
              existing.serverRevision = change.revision;
              await this.repository.upsertItemHeader(existing);
            }
          } else {
            const data = (change.data || {}) as Record<string, unknown>;
            const updatedHeader: ItemHeaderRecord = {
              id: change.entityId,
              workspaceId: this.namespace.workspaceId,
              kind: typeof data.kind === 'string' ? data.kind : existing?.kind || 'note',
              folderId: (data.folderId as string | null) ?? existing?.folderId ?? null,
              rank: typeof data.rank === 'string' ? data.rank : existing?.rank || '0',
              isArchived: Boolean(data.isArchived ?? existing?.isArchived ?? false),
              isPinned: Boolean(data.isPinned ?? existing?.isPinned ?? false),
              securityScope: (data.securityScope as 'standard' | 'vault') || existing?.securityScope || 'standard',
              serverRevision: change.revision,
              createdAt: typeof data.createdAt === 'string' ? data.createdAt : existing?.createdAt || new Date().toISOString(),
              updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
              deletedAt: null,
            };
            await this.repository.upsertItemHeader(updatedHeader);
          }
        }

        // 2. Advance cursor in the same local transaction / step
        const newCursorRecord: SyncCursorRecord = {
          workspaceId: this.namespace.workspaceId,
          userId: this.namespace.userId,
          lastServerRevision: pullRes.data.changes.length > 0
            ? Math.max(...pullRes.data.changes.map((c) => c.revision))
            : cursorRecord?.lastServerRevision || 0,
          cursor: pullRes.meta.cursor || cursorRecord?.cursor || '',
          lastSyncedAt: new Date().toISOString(),
          epoch: pullRes.data.accessEpoch,
        };
        await this.repository.saveCursor(newCursorRecord);

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
    const bootstrapRes = await this.transport.bootstrap({
      workspaceId: this.namespace.workspaceId,
    });

    // 1. Upsert all active items from snapshot
    for (const item of bootstrapRes.data.items) {
      const header: ItemHeaderRecord = {
        id: item.id,
        workspaceId: item.workspaceId,
        kind: item.kind,
        folderId: item.folderId,
        rank: item.rank,
        isArchived: item.isArchived,
        isPinned: item.isPinned,
        securityScope: item.securityScope,
        serverRevision: item.revision,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        deletedAt: item.deletedAt,
      };
      await this.repository.upsertItemHeader(header);
    }

    // 2. Save new watermark cursor
    const newCursor: SyncCursorRecord = {
      workspaceId: this.namespace.workspaceId,
      userId: this.namespace.userId,
      lastServerRevision: Math.max(0, ...bootstrapRes.data.items.map((i) => i.revision)),
      cursor: bootstrapRes.data.watermarkCursor,
      lastSyncedAt: new Date().toISOString(),
      epoch: bootstrapRes.data.accessEpoch,
    };
    await this.repository.saveCursor(newCursor);

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
    resolution: 'keep_local' | 'keep_server' | 'custom',
    customPayload?: Record<string, unknown>
  ): Promise<void> {
    const conflict =
      this.activeConflicts.get(conflictId) ||
      Array.from(this.activeConflicts.values()).find((c) => c.id === conflictId);
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    // Always remove the original rejected operation from queue
    await this.repository.removePendingMutation(conflict.operationId);

    if (resolution === 'keep_local' || resolution === 'custom') {
      const payload = resolution === 'custom' && customPayload ? customPayload : conflict.localPayload;

      // Invariant: Never reuse the rejected operation ID or baseRevision!
      // Mint a fresh operation ID with baseRevision equal to the current serverRevision.
      const newOpId = crypto.randomUUID();
      const newMutation: PendingMutationRecord = {
        operationId: newOpId,
        deviceId: this.deviceId,
        workspaceId: conflict.workspaceId,
        userId: conflict.userId,
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        action: 'update',
        command: 'updateItem',
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

      await this.repository.enqueueMutation(newMutation);

      this.itemStates.set(conflict.entityId, {
        savedOnDevice: true,
        cloudSyncStatus: 'saved_locally',
        pendingOperationId: newOpId,
      });
    } else {
      // keep_server: accept server version, local item state becomes synced
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
      this.syncNow().catch(() => {});
    }
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
    this.syncNow().catch(() => {});
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
        this.syncNow().catch(() => {});
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

  private countPendingMutations(): number {
    return Array.from(this.itemStates.values()).filter(
      (s) => s.cloudSyncStatus === 'saved_locally' || s.cloudSyncStatus === 'syncing'
    ).length;
  }

  private countInFlightMutations(): number {
    return this.isSyncing ? 1 : 0;
  }

  private countFailedMutations(): number {
    return Array.from(this.itemStates.values()).filter((s) => s.cloudSyncStatus === 'error').length;
  }
}
