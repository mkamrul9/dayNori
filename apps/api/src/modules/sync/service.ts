import type { Pool, PoolClient } from 'pg';
import type {
  SyncCommand,
  MutationResult,
  SyncPullQuery,
  ChangeRecord,
  Item,
} from '@daynori/contracts';
import {
  lockWorkspaceSyncState,
  getWorkspaceSyncState,
  updateWorkspaceSyncSeq,
  getMutationReceipt,
  insertMutationReceipt,
  insertChange,
  insertOutboxIntent,
  getItemForSync,
  insertItemForSync,
  updateItemForSync,
  setItemFlagsForSync,
  tombstoneItemForSync,
  restoreItemForSync,
  pullChanges as repoPullChanges,
  listActiveItemsForBootstrap,
} from './repository.js';
import {
  encodeSyncCursor,
  decodeSyncCursor,
  computeCanonicalPayloadHash,
  SUPPORTED_OFFLINE_HORIZON_MS,
} from './types.js';
import { withTenantContext } from '../../db/index.js';
import { NotFoundError, ConflictError, ValidationError } from '../../plugins/errorHandler.js';

export class SyncService {
  constructor(private pool: Pool) {}

  /**
   * Pushes a batch of up to 50 commands.
   * Each command commits independently in its own transaction in dependency order.
   * A successful HTTP 200 response does not imply all commands were accepted.
   */
  async pushBatch(actorUserId: string, commands: SyncCommand[]): Promise<MutationResult[]> {
    const results: MutationResult[] = [];

    for (const cmd of commands) {
      const res = await this.applySingleCommand(actorUserId, cmd);
      results.push(res);
    }

    return results;
  }

  private async applySingleCommand(actorUserId: string, cmd: SyncCommand): Promise<MutationResult> {
    const payloadHash = computeCanonicalPayloadHash({
      workspaceId: cmd.workspaceId,
      command: cmd.command,
      entityType: cmd.entityType,
      entityId: cmd.entityId,
      baseRevision: cmd.baseRevision,
      schemaVersion: cmd.schemaVersion,
      payload: cmd.payload,
    });

    try {
      return await withTenantContext(
        this.pool,
        { userId: actorUserId, workspaceId: cmd.workspaceId },
        async (client) => {
          // 1. Authorize: Caller must have editor role in the workspace
          const authCheck = await client.query<{ has_access: boolean }>(
            `SELECT app.user_has_workspace_role($1, 'editor') as has_access;`,
            [cmd.workspaceId]
          );

          if (!authCheck.rows[0]?.has_access) {
            return {
              operationId: cmd.operationId,
              status: 'rejected',
              entityId: cmd.entityId,
              revision: 0,
              seq: null,
              error: {
                code: 'FORBIDDEN',
                message: 'Caller lacks editor authorization in target workspace',
              },
            };
          }

          // 2. Durable Idempotency Check
          const existingReceipt = await getMutationReceipt(
            client,
            actorUserId,
            cmd.deviceId,
            cmd.operationId
          );

          if (existingReceipt) {
            // Verify scope and payload hash match
            if (
              existingReceipt.workspaceId !== cmd.workspaceId ||
              existingReceipt.canonicalPayloadHash !== payloadHash
            ) {
              return {
                operationId: cmd.operationId,
                status: 'rejected',
                entityId: cmd.entityId,
                revision: 0,
                seq: null,
                error: {
                  code: 'IDEMPOTENCY_KEY_REUSED',
                  message:
                    'Operation ID was already used with a different workspace, command, or payload.',
                },
              };
            }

            // Return durable existing result
            return {
              operationId: cmd.operationId,
              status: existingReceipt.status,
              entityId: existingReceipt.entityId,
              revision: existingReceipt.acceptedRevision ?? 0,
              seq: existingReceipt.appliedChangeSeq,
              error:
                (existingReceipt.resultPayload?.error as { code: string; message: string }) ||
                undefined,
            };
          }

          // 3. Acquire workspace row lock before domain writes
          const syncState = await lockWorkspaceSyncState(client, cmd.workspaceId);

          // 4. Dispatch explicit command
          return this.dispatchCommand(client, actorUserId, cmd, payloadHash, syncState);
        }
      );
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === '23505'
      ) {
        // Race condition: another concurrent transaction committed a receipt with this (actor, device, operationId).
        // Safely re-read the committed receipt and return the durable result or IDEMPOTENCY_KEY_REUSED
        return await withTenantContext(
          this.pool,
          { userId: actorUserId, workspaceId: cmd.workspaceId },
          async (client) => {
            const existingReceipt = await getMutationReceipt(
              client,
              actorUserId,
              cmd.deviceId,
              cmd.operationId
            );
            if (existingReceipt) {
              if (
                existingReceipt.workspaceId !== cmd.workspaceId ||
                existingReceipt.canonicalPayloadHash !== payloadHash
              ) {
                return {
                  operationId: cmd.operationId,
                  status: 'rejected',
                  entityId: cmd.entityId,
                  revision: 0,
                  seq: null,
                  error: {
                    code: 'IDEMPOTENCY_KEY_REUSED',
                    message:
                      'Operation ID was already used with a different workspace, command, or payload.',
                  },
                };
              }
              return {
                operationId: cmd.operationId,
                status: existingReceipt.status,
                entityId: existingReceipt.entityId,
                revision: existingReceipt.acceptedRevision ?? 0,
                seq: existingReceipt.appliedChangeSeq,
                error:
                  (existingReceipt.resultPayload?.error as { code: string; message: string }) ||
                  undefined,
              };
            }
            throw err;
          }
        );
      }
      throw err;
    }
  }

  private async dispatchCommand(
    client: PoolClient,
    actorUserId: string,
    cmd: SyncCommand,
    payloadHash: string,
    syncState: { nextChangeSeq: number; accessEpoch: string }
  ): Promise<MutationResult> {
    const existingItem = await getItemForSync(client, cmd.workspaceId, cmd.entityId);

    // --- Command: createItem ---
    if (cmd.command === 'createItem') {
      if (existingItem) {
        return {
          operationId: cmd.operationId,
          status: 'rejected',
          entityId: cmd.entityId,
          revision: existingItem.revision,
          seq: null,
          error: {
            code: 'VALIDATION_FAILED',
            message: `Entity with ID ${cmd.entityId} already exists in this workspace.`,
          },
        };
      }

      const newRevision = 1;
      const seq = syncState.nextChangeSeq;
      const kind = typeof cmd.payload['kind'] === 'string' ? cmd.payload['kind'] : 'note';
      const folderId = typeof cmd.payload['folderId'] === 'string' ? cmd.payload['folderId'] : null;
      const rank = typeof cmd.payload['rank'] === 'string' ? cmd.payload['rank'] : '0';
      const secScope = cmd.payload['securityScope'] === 'vault' ? 'vault' : 'standard';

      await insertItemForSync(client, {
        id: cmd.entityId,
        workspaceId: cmd.workspaceId,
        kind,
        folderId,
        createdBy: actorUserId,
        rank,
        revision: newRevision,
        securityScope: secScope,
      });

      const changeData = {
        kind,
        folderId,
        rank,
        securityScope: secScope,
        isArchived: false,
        isPinned: false,
      };

      await insertChange(client, {
        workspaceId: cmd.workspaceId,
        seq,
        entityType: 'item',
        entityId: cmd.entityId,
        revision: newRevision,
        isTombstone: false,
        operationId: cmd.operationId,
        changeData,
      });

      await insertMutationReceipt(client, {
        workspaceId: cmd.workspaceId,
        actorUserId,
        deviceId: cmd.deviceId,
        operationId: cmd.operationId,
        command: cmd.command,
        entityType: cmd.entityType,
        entityId: cmd.entityId,
        schemaVersion: cmd.schemaVersion,
        baseRevision: cmd.baseRevision,
        canonicalPayloadHash: payloadHash,
        status: 'accepted',
        acceptedRevision: newRevision,
        appliedChangeSeq: seq,
        resultPayload: {},
      });

      await insertOutboxIntent(client, {
        workspaceId: cmd.workspaceId,
        eventType: 'item.created',
        payload: { itemId: cmd.entityId, revision: newRevision, seq },
      });

      await updateWorkspaceSyncSeq(client, cmd.workspaceId, seq + 1);

      return {
        operationId: cmd.operationId,
        status: 'accepted',
        entityId: cmd.entityId,
        revision: newRevision,
        seq,
      };
    }

    // Existing item required for update/trash/pin/archive
    if (!existingItem) {
      return {
        operationId: cmd.operationId,
        status: 'rejected',
        entityId: cmd.entityId,
        revision: 0,
        seq: null,
        error: {
          code: 'NOT_FOUND',
          message: `Entity ${cmd.entityId} was not found in workspace.`,
        },
      };
    }

    // Optimistic concurrency check: baseRevision must equal server revision
    if (existingItem.revision !== cmd.baseRevision) {
      const conflictError = {
        code: 'REVISION_CONFLICT',
        message: `Stale revision conflict: client base revision is ${cmd.baseRevision}, server revision is ${existingItem.revision}.`,
        currentServerRevision: existingItem.revision,
        currentServerState: {
          id: existingItem.id,
          workspaceId: existingItem.workspaceId,
          revision: existingItem.revision,
          isArchived: existingItem.isArchived,
          isPinned: existingItem.isPinned,
          deletedAt: existingItem.deletedAt ? existingItem.deletedAt.toISOString() : null,
        },
      };

      // Persist durable conflict receipt
      await insertMutationReceipt(client, {
        workspaceId: cmd.workspaceId,
        actorUserId,
        deviceId: cmd.deviceId,
        operationId: cmd.operationId,
        command: cmd.command,
        entityType: cmd.entityType,
        entityId: cmd.entityId,
        schemaVersion: cmd.schemaVersion,
        baseRevision: cmd.baseRevision,
        canonicalPayloadHash: payloadHash,
        status: 'conflict',
        acceptedRevision: null,
        appliedChangeSeq: null,
        resultPayload: { error: conflictError },
      });

      return {
        operationId: cmd.operationId,
        status: 'conflict',
        entityId: cmd.entityId,
        revision: existingItem.revision,
        seq: null,
        error: conflictError,
      };
    }

    const newRevision = existingItem.revision + 1;
    const seq = syncState.nextChangeSeq;
    let isTombstone = false;
    let changeData: Record<string, unknown> = {};

    switch (cmd.command) {
      case 'updateItem': {
        const folderId =
          typeof cmd.payload['folderId'] === 'string' ? cmd.payload['folderId'] : undefined;
        const rank = typeof cmd.payload['rank'] === 'string' ? cmd.payload['rank'] : undefined;
        await updateItemForSync(client, {
          id: cmd.entityId,
          workspaceId: cmd.workspaceId,
          folderId,
          rank,
          updatedBy: actorUserId,
          revision: newRevision,
        });
        changeData = { folderId, rank };
        break;
      }
      case 'archiveItem':
      case 'unarchiveItem': {
        const isArchived = cmd.command === 'archiveItem';
        await setItemFlagsForSync(client, {
          workspaceId: cmd.workspaceId,
          id: cmd.entityId,
          isArchived,
          updatedBy: actorUserId,
          revision: newRevision,
        });
        changeData = { isArchived };
        break;
      }
      case 'pinItem':
      case 'unpinItem': {
        const isPinned = cmd.command === 'pinItem';
        await setItemFlagsForSync(client, {
          workspaceId: cmd.workspaceId,
          id: cmd.entityId,
          isPinned,
          updatedBy: actorUserId,
          revision: newRevision,
        });
        changeData = { isPinned };
        break;
      }
      case 'trashItem': {
        isTombstone = true;
        await tombstoneItemForSync(client, cmd.workspaceId, cmd.entityId, actorUserId, newRevision);
        changeData = { deleted: true };
        break;
      }
      case 'restoreItem': {
        await restoreItemForSync(client, cmd.workspaceId, cmd.entityId, actorUserId, newRevision);
        changeData = { restored: true };
        break;
      }
      default:
        return {
          operationId: cmd.operationId,
          status: 'rejected',
          entityId: cmd.entityId,
          revision: existingItem.revision,
          seq: null,
          error: {
            code: 'VALIDATION_FAILED',
            message: `Unsupported command: ${(cmd as { command: string }).command}`,
          },
        };
    }

    await insertChange(client, {
      workspaceId: cmd.workspaceId,
      seq,
      entityType: 'item',
      entityId: cmd.entityId,
      revision: newRevision,
      isTombstone,
      operationId: cmd.operationId,
      changeData,
    });

    await insertMutationReceipt(client, {
      workspaceId: cmd.workspaceId,
      actorUserId,
      deviceId: cmd.deviceId,
      operationId: cmd.operationId,
      command: cmd.command,
      entityType: cmd.entityType,
      entityId: cmd.entityId,
      schemaVersion: cmd.schemaVersion,
      baseRevision: cmd.baseRevision,
      canonicalPayloadHash: payloadHash,
      status: 'accepted',
      acceptedRevision: newRevision,
      appliedChangeSeq: seq,
      resultPayload: {},
    });

    await insertOutboxIntent(client, {
      workspaceId: cmd.workspaceId,
      eventType: `item.${cmd.command}`,
      payload: { itemId: cmd.entityId, revision: newRevision, seq },
    });

    await updateWorkspaceSyncSeq(client, cmd.workspaceId, seq + 1);

    return {
      operationId: cmd.operationId,
      status: 'accepted',
      entityId: cmd.entityId,
      revision: newRevision,
      seq,
    };
  }

  /**
   * Pulls ordered workspace changes using opaque checkpoint cursors.
   */
  async pull(
    actorUserId: string,
    query: SyncPullQuery
  ): Promise<{
    changes: ChangeRecord[];
    nextCursor?: string;
    hasMore: boolean;
    accessEpoch: string;
  }> {
    return withTenantContext(
      this.pool,
      { userId: actorUserId, workspaceId: query.workspaceId },
      async (client) => {
        // Authorize: Caller must have viewer role in target workspace
        const auth = await client.query<{ has_access: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'viewer') as has_access;`,
          [query.workspaceId]
        );
        if (!auth.rows[0]?.has_access) {
          throw new NotFoundError('Workspace not found or access revoked');
        }

        const syncState = await getWorkspaceSyncState(client, query.workspaceId);
        if (!syncState) {
          return { changes: [], hasMore: false, accessEpoch: '' };
        }

        let sinceSeq = 0;
        if (query.cursor) {
          let decoded;
          try {
            decoded = decodeSyncCursor(query.cursor, query.workspaceId);
          } catch {
            throw new ValidationError('Invalid or malformed sync cursor');
          }

          // Check retention horizon (90 days)
          const cursorAge = Date.now() - new Date(decoded.ts).getTime();
          if (cursorAge > SUPPORTED_OFFLINE_HORIZON_MS) {
            throw new ConflictError(
              'SYNC_RESET_REQUIRED: Cursor has expired beyond the 90-day offline horizon. A full bootstrap snapshot is required.'
            );
          }

          // Check access epoch (reauthorization on membership or room epoch change)
          if (decoded.epoch !== syncState.accessEpoch) {
            throw new ConflictError(
              'SYNC_RESET_REQUIRED: Workspace access epoch has changed. A safe snapshot reset is required.'
            );
          }

          sinceSeq = decoded.seq;
        }

        // Fetch limit + 1 to detect hasMore
        const rawChanges = await repoPullChanges(
          client,
          query.workspaceId,
          sinceSeq,
          query.limit + 1
        );
        const hasMore = rawChanges.length > query.limit;
        const changesToReturn = hasMore ? rawChanges.slice(0, query.limit) : rawChanges;

        const lastChange = changesToReturn[changesToReturn.length - 1];
        const highWaterSeq = lastChange ? lastChange.seq : sinceSeq;

        const nextCursor = encodeSyncCursor({
          v: 1,
          ws: query.workspaceId,
          seq: highWaterSeq,
          epoch: syncState.accessEpoch,
          ts: new Date().toISOString(),
        });

        const formattedChanges: ChangeRecord[] = changesToReturn.map((c) => ({
          seq: c.seq,
          entityType: c.entityType,
          entityId: c.entityId,
          revision: c.revision,
          isTombstone: c.isTombstone,
          operationId: c.operationId,
          data: c.changeData,
          createdAt: c.createdAt.toISOString(),
        }));

        return {
          changes: formattedChanges,
          nextCursor,
          hasMore,
          accessEpoch: syncState.accessEpoch,
        };
      }
    );
  }

  /**
   * Bootstraps workspace state by returning a consistent snapshot paired with its high-watermark cursor.
   */
  async bootstrap(
    actorUserId: string,
    workspaceId: string
  ): Promise<{ items: Item[]; watermarkCursor: string; accessEpoch: string }> {
    return withTenantContext(this.pool, { userId: actorUserId, workspaceId }, async (client) => {
      // Authorize: Caller must have viewer role
      const auth = await client.query<{ has_access: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'viewer') as has_access;`,
        [workspaceId]
      );
      if (!auth.rows[0]?.has_access) {
        throw new NotFoundError('Workspace not found or access revoked');
      }

      const syncState = await getWorkspaceSyncState(client, workspaceId);
      if (!syncState) {
        throw new NotFoundError('Workspace sync state not initialized');
      }

      const activeItems = await listActiveItemsForBootstrap(client, workspaceId);
      const watermarkSeq = syncState.nextChangeSeq - 1;

      const watermarkCursor = encodeSyncCursor({
        v: 1,
        ws: workspaceId,
        seq: watermarkSeq,
        epoch: syncState.accessEpoch,
        ts: new Date().toISOString(),
      });

      const formattedItems: Item[] = activeItems.map((item) => ({
        id: item.id,
        workspaceId: item.workspaceId,
        folderId: item.folderId,
        kind: item.kind as 'folder' | 'note' | 'task' | 'file',
        createdBy: item.createdBy,
        updatedBy: item.updatedBy,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        deletedAt: item.deletedAt ? item.deletedAt.toISOString() : null,
        displayOrder: item.displayOrder,
      }));

      return {
        items: formattedItems,
        watermarkCursor,
        accessEpoch: syncState.accessEpoch,
      };
    });
  }
}
