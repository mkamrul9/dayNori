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
  type SyncItemRecord,
} from './repository.js';
import {
  encodeSyncCursor,
  decodeSyncCursor,
  computeCanonicalPayloadHash,
  safeBigIntToNumber,
} from './types.js';
import { withTenantContext } from '../../db/index.js';
import { NotFoundError, ConflictError, ValidationError } from '../../plugins/errorHandler.js';

const VALID_ITEM_KINDS = new Set([
  'note',
  'todo',
  'task',
  'routine',
  'journal_entry',
  'file',
  'file_item',
  'calendar_event',
  'folder',
]);

export class SyncService {
  constructor(private pool: Pool) {}

  /**
   * Pushes a batch of up to 50 commands.
   * Enforces topological dependency ordering, cycle rejection, missing/failed dependency checks,
   * and isolated per-command commits so independent commands succeed and persist.
   */
  async pushBatch(
    actorUserId: string,
    commands: SyncCommand[],
    claims?: Record<string, unknown>
  ): Promise<MutationResult[]> {
    const total = commands.length;
    const finalResults = new Array<MutationResult>(total);

    // 1. Check for duplicate operation IDs within this batch
    const seenOpIds = new Map<string, number>();
    const duplicateIndices = new Set<number>();

    for (let i = 0; i < total; i++) {
      const opId = commands[i]!.operationId;
      if (seenOpIds.has(opId)) {
        duplicateIndices.add(i);
        finalResults[i] = {
          operationId: opId,
          status: 'rejected',
          entityId: commands[i]!.entityId,
          revision: 0,
          seq: null,
          error: {
            code: 'DUPLICATE_OPERATION_IN_BATCH',
            message: `Duplicate operationId ${opId} within the same push batch.`,
          },
        };
      } else {
        seenOpIds.set(opId, i);
      }
    }

    // 2. Build dependency graph for commands in batch
    const batchCmdMap = new Map<string, SyncCommand>();
    for (let i = 0; i < total; i++) {
      if (!duplicateIndices.has(i)) {
        batchCmdMap.set(commands[i]!.operationId, commands[i]!);
      }
    }

    const inBatchDeps = new Map<string, string[]>();

    for (let i = 0; i < total; i++) {
      if (duplicateIndices.has(i)) continue;
      const cmd = commands[i]!;
      // An operation can only depend in-batch on an operation within the same actor, device, and workspace
      const validInBatchDeps = (cmd.dependencyOperationIds || []).filter((depId) => {
        const parentCmd = batchCmdMap.get(depId);
        return (
          parentCmd &&
          parentCmd.workspaceId === cmd.workspaceId &&
          parentCmd.deviceId === cmd.deviceId
        );
      });
      inBatchDeps.set(cmd.operationId, validInBatchDeps);
    }

    // 3. Cycle Detection via 3-color DFS
    const visited = new Map<string, 'WHITE' | 'GRAY' | 'BLACK'>();
    for (const opId of inBatchDeps.keys()) {
      visited.set(opId, 'WHITE');
    }

    const cyclicOpIds = new Set<string>();

    const checkCycle = (node: string, path: string[]): boolean => {
      visited.set(node, 'GRAY');
      const neighbors = inBatchDeps.get(node) || [];
      for (const neighbor of neighbors) {
        const state = visited.get(neighbor);
        if (state === 'GRAY') {
          // Cycle found: mark all nodes in the cycle
          cyclicOpIds.add(neighbor);
          for (let k = path.length - 1; k >= 0; k--) {
            cyclicOpIds.add(path[k]!);
            if (path[k] === neighbor) break;
          }
          return true;
        }
        if (state === 'WHITE') {
          checkCycle(neighbor, [...path, neighbor]);
        }
      }
      visited.set(node, 'BLACK');
      return false;
    };

    for (const opId of inBatchDeps.keys()) {
      if (visited.get(opId) === 'WHITE') {
        checkCycle(opId, [opId]);
      }
    }

    // Reject all cyclic operations
    for (const opId of cyclicOpIds) {
      const idx = seenOpIds.get(opId)!;
      finalResults[idx] = {
        operationId: opId,
        status: 'rejected',
        entityId: commands[idx]!.entityId,
        revision: 0,
        seq: null,
        error: {
          code: 'DEPENDENCY_CYCLE',
          message: 'Cycle detected in operation dependencies.',
        },
      };
    }

    // 4. Deterministic Topological Sort of acyclic operations
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>(); // parent -> children who depend on parent

    for (const opId of inBatchDeps.keys()) {
      if (cyclicOpIds.has(opId)) continue;
      inDegree.set(opId, 0);
      dependents.set(opId, []);
    }

    for (const [child, parents] of inBatchDeps.entries()) {
      if (cyclicOpIds.has(child)) continue;
      for (const parent of parents) {
        if (!cyclicOpIds.has(parent) && dependents.has(parent)) {
          dependents.get(parent)!.push(child);
          inDegree.set(child, (inDegree.get(child) || 0) + 1);
        }
      }
    }

    // Kahn's algorithm with stable index queue
    const queue: string[] = [];
    for (const [opId, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(opId);
      }
    }
    // Sort queue by original index for deterministic stability
    queue.sort((a, b) => seenOpIds.get(a)! - seenOpIds.get(b)!);

    const orderedOps: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      orderedOps.push(current);

      for (const child of dependents.get(current) || []) {
        const newDeg = (inDegree.get(child) || 1) - 1;
        inDegree.set(child, newDeg);
        if (newDeg === 0) {
          queue.push(child);
          queue.sort((a, b) => seenOpIds.get(a)! - seenOpIds.get(b)!);
        }
      }
    }

    // Results lookup by operationId to resolve dependencies
    const resultMap = new Map<string, MutationResult>();
    for (let i = 0; i < total; i++) {
      if (finalResults[i]) {
        resultMap.set(commands[i]!.operationId, finalResults[i]!);
      }
    }

    // 5. Execute commands in topological dependency order
    for (const opId of orderedOps) {
      const idx = seenOpIds.get(opId)!;
      const cmd = commands[idx]!;

      // 5.1 Check if this command was already processed and has a durable receipt
      const existingReceipt = await withTenantContext(
        this.pool,
        { userId: actorUserId, workspaceId: cmd.workspaceId },
        async (client) => {
          return getMutationReceipt(client, actorUserId, cmd.deviceId, cmd.operationId);
        }
      );

      if (existingReceipt) {
        // Verify canonical payload hash
        const currentHash = computeCanonicalPayloadHash({
          workspaceId: cmd.workspaceId,
          command: cmd.command,
          commandVersion: cmd.commandVersion,
          schemaVersion: cmd.schemaVersion,
          entityType: cmd.entityType,
          entityId: cmd.entityId,
          baseRevision: cmd.baseRevision,
          dependencyOperationIds: cmd.dependencyOperationIds,
          payload: cmd.payload,
        });

        if (
          existingReceipt.workspaceId !== cmd.workspaceId ||
          existingReceipt.canonicalPayloadHash !== currentHash
        ) {
          const reusedResult: MutationResult = {
            operationId: cmd.operationId,
            status: 'rejected',
            entityId: cmd.entityId,
            revision: 0,
            seq: null,
            error: {
              code: 'IDEMPOTENCY_KEY_REUSED',
              message: `OperationId ${cmd.operationId} was previously used with different command or payload parameters.`,
            },
          };
          finalResults[idx] = reusedResult;
          resultMap.set(opId, reusedResult);
          continue;
        }

        const durableResult: MutationResult = {
          operationId: existingReceipt.operationId,
          status: existingReceipt.status as 'accepted' | 'conflict' | 'rejected',
          entityId: existingReceipt.entityId,
          revision: existingReceipt.acceptedRevision ?? 0,
          seq: existingReceipt.appliedChangeSeq,
          error: existingReceipt.resultPayload?.error as MutationResult['error'],
        };
        finalResults[idx] = durableResult;
        resultMap.set(opId, durableResult);
        continue;
      }

      // 5.2 Verify dependencies before executing command
      let dependencyFailure: { code: string; message: string } | null = null;
      const deps = cmd.dependencyOperationIds || [];

      for (const depId of deps) {
        const inBatchParent = batchCmdMap.get(depId);
        if (
          inBatchParent &&
          inBatchParent.workspaceId === cmd.workspaceId &&
          inBatchParent.deviceId === cmd.deviceId
        ) {
          const priorRes = resultMap.get(depId);
          if (!priorRes || priorRes.status !== 'accepted') {
            dependencyFailure = {
              code: 'DEPENDENCY_FAILED',
              message: `Dependency operation ${depId} failed or was not accepted (${priorRes?.status || 'missing'}).`,
            };
            break;
          }
        } else {
          // Dependency is in a previous batch: verify durable receipt in database
          const depReceipt = await withTenantContext(
            this.pool,
            { userId: actorUserId, workspaceId: cmd.workspaceId },
            async (client) => {
              return getMutationReceipt(client, actorUserId, cmd.deviceId, depId);
            }
          );

          if (!depReceipt) {
            dependencyFailure = {
              code: 'DEPENDENCY_MISSING',
              message: `Dependency operation ${depId} was not found in receipt history.`,
            };
            break;
          }
          if (depReceipt.status !== 'accepted') {
            dependencyFailure = {
              code: 'DEPENDENCY_FAILED',
              message: `Dependency operation ${depId} failed with status '${depReceipt.status}'.`,
            };
            break;
          }
        }
      }

      if (dependencyFailure) {
        const payloadHash = computeCanonicalPayloadHash({
          workspaceId: cmd.workspaceId,
          command: cmd.command,
          commandVersion: cmd.commandVersion,
          schemaVersion: cmd.schemaVersion,
          entityType: cmd.entityType,
          entityId: cmd.entityId,
          baseRevision: cmd.baseRevision,
          dependencyOperationIds: cmd.dependencyOperationIds,
          payload: cmd.payload,
        });

        // Persist authorized terminal rejection receipt (or handle duplicate race safely)
        await withTenantContext(
          this.pool,
          { userId: actorUserId, workspaceId: cmd.workspaceId },
          async (client) => {
            const authCheck = await client.query<{ has_access: boolean }>(
              `SELECT app.user_has_workspace_role($1, 'editor') as has_access;`,
              [cmd.workspaceId]
            );
            if (authCheck.rows[0]?.has_access) {
              try {
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
                  status: 'rejected',
                  acceptedRevision: null,
                  appliedChangeSeq: null,
                  resultPayload: { error: dependencyFailure },
                });
              } catch (insertErr) {
                if (
                  insertErr &&
                  typeof insertErr === 'object' &&
                  (insertErr as { code?: string }).code === '23505' &&
                  (insertErr as { constraint?: string }).constraint ===
                    'uq_mutation_receipts_actor_device_op'
                ) {
                  // Concurrent insertion: durable receipt already exists
                } else {
                  throw insertErr;
                }
              }
            }
          }
        );

        const failResult: MutationResult = {
          operationId: cmd.operationId,
          status: 'rejected',
          entityId: cmd.entityId,
          revision: 0,
          seq: null,
          error: dependencyFailure,
        };
        finalResults[idx] = failResult;
        resultMap.set(opId, failResult);
        continue;
      }

      // Execute command independently
      const res = await this.applySingleCommand(actorUserId, cmd, claims);
      finalResults[idx] = res;
      resultMap.set(opId, res);
    }

    return finalResults;
  }

  private async applySingleCommand(
    actorUserId: string,
    cmd: SyncCommand,
    claims?: Record<string, unknown>
  ): Promise<MutationResult> {
    const payloadHash = computeCanonicalPayloadHash({
      workspaceId: cmd.workspaceId,
      command: cmd.command,
      commandVersion: cmd.commandVersion,
      schemaVersion: cmd.schemaVersion,
      entityType: cmd.entityType,
      entityId: cmd.entityId,
      baseRevision: cmd.baseRevision,
      dependencyOperationIds: cmd.dependencyOperationIds,
      payload: cmd.payload,
    });

    // Device identity verification against authenticated session if bound
    if (claims && typeof claims['device_id'] === 'string' && claims['device_id'] !== cmd.deviceId) {
      return {
        operationId: cmd.operationId,
        status: 'rejected',
        entityId: cmd.entityId,
        revision: 0,
        seq: null,
        error: {
          code: 'DEVICE_MISMATCH',
          message: 'Operation deviceId does not match authenticated session device claim.',
        },
      };
    }

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
                message: 'Caller lacks editor authorization in target workspace.',
              },
            };
          }

          // 2. Initial Durable Idempotency Check
          const existingReceipt = await getMutationReceipt(
            client,
            actorUserId,
            cmd.deviceId,
            cmd.operationId
          );

          if (existingReceipt) {
            // Reauthorize viewer access in receipt workspace
            const viewerCheck = await client.query<{ has_access: boolean }>(
              `SELECT app.user_has_workspace_role($1, 'viewer') as has_access;`,
              [existingReceipt.workspaceId]
            );
            if (!viewerCheck.rows[0]?.has_access) {
              return {
                operationId: cmd.operationId,
                status: 'rejected',
                entityId: cmd.entityId,
                revision: 0,
                seq: null,
                error: {
                  code: 'FORBIDDEN',
                  message: 'Access to target workspace has been revoked.',
                },
              };
            }

            // Verify scope and canonical payload hash match
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

          // 3. Command-specific validation before acquiring row lock
          const validationError = this.validateCommandPayload(cmd);
          if (validationError) {
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
              status: 'rejected',
              acceptedRevision: null,
              appliedChangeSeq: null,
              resultPayload: { error: validationError },
            });

            return {
              operationId: cmd.operationId,
              status: 'rejected',
              entityId: cmd.entityId,
              revision: 0,
              seq: null,
              error: validationError,
            };
          }

          // 4. Acquire workspace row lock before domain writes
          const syncState = await lockWorkspaceSyncState(client, cmd.workspaceId);

          // 5. CRITICAL: Recheck receipts under the acquired row lock to resolve concurrent create races
          const lockedReceipt = await getMutationReceipt(
            client,
            actorUserId,
            cmd.deviceId,
            cmd.operationId
          );

          if (lockedReceipt) {
            if (
              lockedReceipt.workspaceId !== cmd.workspaceId ||
              lockedReceipt.canonicalPayloadHash !== payloadHash
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
              status: lockedReceipt.status,
              entityId: lockedReceipt.entityId,
              revision: lockedReceipt.acceptedRevision ?? 0,
              seq: lockedReceipt.appliedChangeSeq,
              error:
                (lockedReceipt.resultPayload?.error as { code: string; message: string }) ||
                undefined,
            };
          }

          // 6. Dispatch explicit command
          return this.dispatchCommand(client, actorUserId, cmd, payloadHash, syncState);
        }
      );
    } catch (err: unknown) {
      // Limit duplicate-key recovery STRICTLY to receipt uniqueness constraint
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === '23505' &&
        (err as { constraint?: string }).constraint === 'uq_mutation_receipts_actor_device_op'
      ) {
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
              const viewerCheck = await client.query<{ has_access: boolean }>(
                `SELECT app.user_has_workspace_role($1, 'viewer') as has_access;`,
                [existingReceipt.workspaceId]
              );
              if (!viewerCheck.rows[0]?.has_access) {
                return {
                  operationId: cmd.operationId,
                  status: 'rejected',
                  entityId: cmd.entityId,
                  revision: 0,
                  seq: null,
                  error: {
                    code: 'FORBIDDEN',
                    message: 'Access to target workspace has been revoked.',
                  },
                };
              }

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

  private validateCommandPayload(cmd: SyncCommand): { code: string; message: string } | null {
    if (cmd.command === 'createItem') {
      const kind = cmd.payload['kind'];
      if (typeof kind !== 'string' || !VALID_ITEM_KINDS.has(kind)) {
        return {
          code: 'VALIDATION_FAILED',
          message: `Invalid item kind: ${String(kind)}.`,
        };
      }
      const secScope = cmd.payload['securityScope'];
      if (secScope !== undefined && secScope !== 'standard' && secScope !== 'vault') {
        return {
          code: 'VALIDATION_FAILED',
          message: 'Invalid securityScope: must be "standard" or "vault".',
        };
      }
    }
    return null;
  }

  private async dispatchCommand(
    client: PoolClient,
    actorUserId: string,
    cmd: SyncCommand,
    payloadHash: string,
    syncState: { nextChangeSeq: number; accessEpoch: string }
  ): Promise<MutationResult> {
    const existingItem = await getItemForSync(client, cmd.workspaceId, cmd.entityId);

    // --- Command: createItem or createFolder ---
    if (cmd.command === 'createItem' || cmd.command === 'createFolder') {
      if (existingItem) {
        const error = {
          code: 'VALIDATION_FAILED',
          message: `Entity with ID ${cmd.entityId} already exists in this workspace.`,
        };
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
          status: 'rejected',
          acceptedRevision: null,
          appliedChangeSeq: null,
          resultPayload: { error },
        });

        return {
          operationId: cmd.operationId,
          status: 'rejected',
          entityId: cmd.entityId,
          revision: existingItem.revision,
          seq: null,
          error,
        };
      }

      const newRevision = 1;
      const seq = syncState.nextChangeSeq;
      const kind =
        cmd.command === 'createFolder'
          ? 'folder'
          : typeof cmd.payload['kind'] === 'string'
            ? cmd.payload['kind']
            : 'note';
      const folderId =
        typeof cmd.payload['parentId'] === 'string'
          ? cmd.payload['parentId']
          : typeof cmd.payload['folderId'] === 'string'
            ? cmd.payload['folderId']
            : null;
      const rank = typeof cmd.payload['rank'] === 'string' ? cmd.payload['rank'] : '0';
      const secScope = cmd.payload['securityScope'] === 'vault' ? 'vault' : 'standard';

      // Validate folder reference invariants
      if (folderId !== null) {
        const parentCheck = await client.query<{
          security_scope: string;
          deleted_at: Date | null;
          kind: string;
        }>(
          `SELECT security_scope, deleted_at, kind FROM app.items WHERE workspace_id = $1 AND id = $2;`,
          [cmd.workspaceId, folderId]
        );
        const parentRow = parentCheck.rows[0];
        if (!parentRow || parentRow.deleted_at !== null || parentRow.kind !== 'folder') {
          const error = {
            code: 'INVALID_PARENT',
            message: `Parent folder ${folderId} does not exist or is deleted in workspace.`,
          };
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
            status: 'rejected',
            acceptedRevision: null,
            appliedChangeSeq: null,
            resultPayload: { error },
          });
          return {
            operationId: cmd.operationId,
            status: 'rejected',
            entityId: cmd.entityId,
            revision: 0,
            seq: null,
            error,
          };
        }

        if (parentRow.security_scope !== secScope) {
          const error = {
            code: 'INCOMPATIBLE_SECURITY_SCOPE',
            message: `Item scope (${secScope}) does not match parent folder scope (${parentRow.security_scope}).`,
          };
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
            status: 'rejected',
            acceptedRevision: null,
            appliedChangeSeq: null,
            resultPayload: { error },
          });
          return {
            operationId: cmd.operationId,
            status: 'rejected',
            entityId: cmd.entityId,
            revision: 0,
            seq: null,
            error,
          };
        }
      }

      // If kind === 'folder', validate depth bounds and cycle prevention
      if (kind === 'folder') {
        try {
          await client.query(`SELECT app.validate_folder_parent($1, $2, $3);`, [
            cmd.workspaceId,
            cmd.entityId,
            folderId,
          ]);
        } catch (err: unknown) {
          const error = {
            code: 'VALIDATION_FAILED',
            message: (err as Error).message,
          };
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
            status: 'rejected',
            acceptedRevision: null,
            appliedChangeSeq: null,
            resultPayload: { error },
          });
          return {
            operationId: cmd.operationId,
            status: 'rejected',
            entityId: cmd.entityId,
            revision: 0,
            seq: null,
            error,
          };
        }
      }

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

      if (kind === 'folder') {
        const folderName =
          typeof cmd.payload['name'] === 'string' ? cmd.payload['name'] : 'Untitled Folder';
        const color = typeof cmd.payload['color'] === 'string' ? cmd.payload['color'] : null;
        const icon = typeof cmd.payload['icon'] === 'string' ? cmd.payload['icon'] : null;
        await client.query(
          `INSERT INTO app.folders (id, workspace_id, parent_id, name, color, icon)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (workspace_id, id) DO UPDATE SET
             parent_id = EXCLUDED.parent_id,
             name = EXCLUDED.name,
             color = EXCLUDED.color,
             icon = EXCLUDED.icon,
             updated_at = now();`,
          [cmd.entityId, cmd.workspaceId, folderId, folderName, color, icon]
        );
      }

      const changeData = {
        kind,
        folderId,
        rank,
        securityScope: secScope,
        isArchived: false,
        isPinned: false,
        ...(kind === 'folder'
          ? {
              name: cmd.payload['name'] || 'Untitled Folder',
              color: cmd.payload['color'] || null,
              icon: cmd.payload['icon'] || null,
            }
          : {}),
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

    // Existing item required for update/trash/pin/archive/restore
    if (!existingItem) {
      const notFoundError = {
        code: 'NOT_FOUND',
        message: `Entity ${cmd.entityId} was not found in workspace.`,
      };
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
        status: 'rejected',
        acceptedRevision: null,
        appliedChangeSeq: null,
        resultPayload: { error: notFoundError },
      });

      return {
        operationId: cmd.operationId,
        status: 'rejected',
        entityId: cmd.entityId,
        revision: 0,
        seq: null,
        error: notFoundError,
      };
    }

    // Preserve tombstone semantics: modifying a deleted item is forbidden unless restoring
    if (existingItem.deletedAt !== null && cmd.command !== 'restoreItem') {
      const tombstoneError = {
        code: 'ENTITY_TOMBSTONED',
        message: `Cannot modify tombstoned entity ${cmd.entityId}. Use restoreItem first.`,
      };
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
        status: 'rejected',
        acceptedRevision: null,
        appliedChangeSeq: null,
        resultPayload: { error: tombstoneError },
      });

      return {
        operationId: cmd.operationId,
        status: 'rejected',
        entityId: cmd.entityId,
        revision: existingItem.revision,
        seq: null,
        error: tombstoneError,
      };
    }

    // Restore on non-deleted item is rejected
    if (existingItem.deletedAt === null && cmd.command === 'restoreItem') {
      const notDeletedError = {
        code: 'NOT_TOMBSTONED',
        message: `Entity ${cmd.entityId} is not deleted.`,
      };
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
        status: 'rejected',
        acceptedRevision: null,
        appliedChangeSeq: null,
        resultPayload: { error: notDeletedError },
      });

      return {
        operationId: cmd.operationId,
        status: 'rejected',
        entityId: cmd.entityId,
        revision: existingItem.revision,
        seq: null,
        error: notDeletedError,
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
          rank: existingItem.rank,
          isArchived: existingItem.isArchived,
          isPinned: existingItem.isPinned,
          securityScope: existingItem.securityScope,
          deletedAt: existingItem.deletedAt ? existingItem.deletedAt.toISOString() : null,
        },
      };

      // Persist durable conflict receipt with full conflict representation
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
        const hasFolderId = 'folderId' in cmd.payload;
        const folderIdVal = cmd.payload['folderId'];
        const folderId = typeof folderIdVal === 'string' ? folderIdVal : null;
        const clearFolderId = hasFolderId && folderIdVal === null;
        const rank = typeof cmd.payload['rank'] === 'string' ? cmd.payload['rank'] : undefined;

        if (hasFolderId && folderId !== null) {
          const parentCheck = await client.query<{
            security_scope: string;
            deleted_at: Date | null;
            kind: string;
          }>(
            `SELECT security_scope, deleted_at, kind FROM app.items WHERE workspace_id = $1 AND id = $2;`,
            [cmd.workspaceId, folderId]
          );
          const parentRow = parentCheck.rows[0];
          if (!parentRow || parentRow.deleted_at !== null || parentRow.kind !== 'folder') {
            const error = {
              code: 'INVALID_PARENT',
              message: `Target parent folder ${folderId} does not exist or is deleted.`,
            };
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
              status: 'rejected',
              acceptedRevision: null,
              appliedChangeSeq: null,
              resultPayload: { error },
            });
            return {
              operationId: cmd.operationId,
              status: 'rejected',
              entityId: cmd.entityId,
              revision: existingItem.revision,
              seq: null,
              error,
            };
          }

          if (parentRow.security_scope !== existingItem.securityScope) {
            const error = {
              code: 'INCOMPATIBLE_SECURITY_SCOPE',
              message: `Item scope (${existingItem.securityScope}) does not match parent folder scope (${parentRow.security_scope}).`,
            };
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
              status: 'rejected',
              acceptedRevision: null,
              appliedChangeSeq: null,
              resultPayload: { error },
            });
            return {
              operationId: cmd.operationId,
              status: 'rejected',
              entityId: cmd.entityId,
              revision: existingItem.revision,
              seq: null,
              error,
            };
          }
        }

        if (existingItem.kind === 'folder' && (hasFolderId || 'name' in cmd.payload)) {
          if (hasFolderId) {
            try {
              await client.query(`SELECT app.validate_folder_parent($1, $2, $3);`, [
                cmd.workspaceId,
                cmd.entityId,
                folderId,
              ]);
            } catch (err: unknown) {
              const error = {
                code: 'VALIDATION_FAILED',
                message: (err as Error).message,
              };
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
                status: 'rejected',
                acceptedRevision: null,
                appliedChangeSeq: null,
                resultPayload: { error },
              });
              return {
                operationId: cmd.operationId,
                status: 'rejected',
                entityId: cmd.entityId,
                revision: existingItem.revision,
                seq: null,
                error,
              };
            }
            await client.query(
              `UPDATE app.folders SET parent_id = $1, updated_at = now() WHERE workspace_id = $2 AND id = $3;`,
              [folderId, cmd.workspaceId, cmd.entityId]
            );
          }
          if ('name' in cmd.payload && typeof cmd.payload['name'] === 'string') {
            await client.query(
              `UPDATE app.folders SET name = $1, updated_at = now() WHERE workspace_id = $2 AND id = $3;`,
              [cmd.payload['name'], cmd.workspaceId, cmd.entityId]
            );
          }
        }

        await updateItemForSync(client, {
          id: cmd.entityId,
          workspaceId: cmd.workspaceId,
          folderId: hasFolderId ? folderId : undefined,
          clearFolderId,
          rank,
          updatedBy: actorUserId,
          revision: newRevision,
        });
        changeData = {
          ...(hasFolderId ? { folderId } : {}),
          ...(rank !== undefined ? { rank } : {}),
        };
        break;
      }
      case 'updateFolder': {
        const name = typeof cmd.payload['name'] === 'string' ? cmd.payload['name'] : undefined;
        const color =
          typeof cmd.payload['color'] === 'string'
            ? cmd.payload['color']
            : cmd.payload['color'] === null
              ? null
              : undefined;
        const icon =
          typeof cmd.payload['icon'] === 'string'
            ? cmd.payload['icon']
            : cmd.payload['icon'] === null
              ? null
              : undefined;

        await client.query(
          `UPDATE app.folders SET
            name = COALESCE($1, name),
            color = CASE WHEN $2::boolean THEN $3 ELSE color END,
            icon = CASE WHEN $4::boolean THEN $5 ELSE icon END,
            updated_at = now()
           WHERE workspace_id = $6 AND id = $7;`,
          [
            name ?? null,
            color !== undefined,
            color ?? null,
            icon !== undefined,
            icon ?? null,
            cmd.workspaceId,
            cmd.entityId,
          ]
        );
        await client.query(
          `UPDATE app.items SET revision = $1, updated_by = $2, updated_at = now()
           WHERE workspace_id = $3 AND id = $4;`,
          [newRevision, actorUserId, cmd.workspaceId, cmd.entityId]
        );
        changeData = {
          ...(name !== undefined ? { name } : {}),
          ...(color !== undefined ? { color } : {}),
          ...(icon !== undefined ? { icon } : {}),
        };
        break;
      }
      case 'moveFolder': {
        const targetParentId =
          typeof cmd.payload['targetParentId'] === 'string' ? cmd.payload['targetParentId'] : null;
        const rank = typeof cmd.payload['rank'] === 'string' ? cmd.payload['rank'] : undefined;

        try {
          await client.query(`SELECT app.validate_folder_parent($1, $2, $3);`, [
            cmd.workspaceId,
            cmd.entityId,
            targetParentId,
          ]);
        } catch (err: unknown) {
          const error = { code: 'VALIDATION_FAILED', message: (err as Error).message };
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
            status: 'rejected',
            acceptedRevision: null,
            appliedChangeSeq: null,
            resultPayload: { error },
          });
          return {
            operationId: cmd.operationId,
            status: 'rejected',
            entityId: cmd.entityId,
            revision: existingItem.revision,
            seq: null,
            error,
          };
        }

        await client.query(
          `UPDATE app.folders SET parent_id = $1, updated_at = now() WHERE workspace_id = $2 AND id = $3;`,
          [targetParentId, cmd.workspaceId, cmd.entityId]
        );
        await client.query(
          `UPDATE app.items SET folder_id = $1, rank = COALESCE($2, rank), revision = $3, updated_by = $4, updated_at = now()
           WHERE workspace_id = $5 AND id = $6;`,
          [targetParentId, rank ?? null, newRevision, actorUserId, cmd.workspaceId, cmd.entityId]
        );
        changeData = { parentId: targetParentId, ...(rank !== undefined ? { rank } : {}) };
        break;
      }
      case 'reorderFolder': {
        const rank = typeof cmd.payload['rank'] === 'string' ? cmd.payload['rank'] : '0';
        await client.query(
          `UPDATE app.items SET rank = $1, revision = $2, updated_by = $3, updated_at = now()
           WHERE workspace_id = $4 AND id = $5;`,
          [rank, newRevision, actorUserId, cmd.workspaceId, cmd.entityId]
        );
        changeData = { rank };
        break;
      }
      case 'archiveFolder':
      case 'archiveItem':
      case 'unarchiveFolder':
      case 'unarchiveItem': {
        const isArchived = cmd.command === 'archiveItem' || cmd.command === 'archiveFolder';
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
      case 'pinFolder':
      case 'pinItem':
      case 'unpinFolder':
      case 'unpinItem': {
        const isPinned = cmd.command === 'pinItem' || cmd.command === 'pinFolder';
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
      case 'trashFolder': {
        const policy =
          cmd.payload['policy'] === 'preserve_to_parent' ? 'preserve_to_parent' : 'trash_subtree';
        if (policy === 'preserve_to_parent') {
          const parentRes = await client.query<{ parent_id: string | null }>(
            `SELECT parent_id FROM app.folders WHERE workspace_id = $1 AND id = $2;`,
            [cmd.workspaceId, cmd.entityId]
          );
          const targetParentId = parentRes.rows[0]?.parent_id || null;

          await client.query(
            `UPDATE app.folders SET parent_id = $1, updated_at = now() WHERE workspace_id = $2 AND parent_id = $3;`,
            [targetParentId, cmd.workspaceId, cmd.entityId]
          );
          await client.query(
            `UPDATE app.items SET folder_id = $1, revision = revision + 1, updated_by = $2, updated_at = now()
             WHERE workspace_id = $3 AND folder_id = $4;`,
            [targetParentId, actorUserId, cmd.workspaceId, cmd.entityId]
          );
        } else {
          // Trash subtree
          const subRes = await client.query<{ id: string }>(
            `WITH RECURSIVE sub AS (
              SELECT id FROM app.folders WHERE workspace_id = $1 AND id = $2
              UNION ALL
              SELECT f.id FROM app.folders f JOIN sub ON f.parent_id = sub.id WHERE f.workspace_id = $1
            ) SELECT id FROM sub WHERE id <> $2;`,
            [cmd.workspaceId, cmd.entityId]
          );
          const subIds = subRes.rows.map((r) => r.id);
          const allIds = [cmd.entityId, ...subIds];

          await client.query(
            `UPDATE app.items SET deleted_at = now(), revision = revision + 1, updated_by = $1, updated_at = now()
             WHERE workspace_id = $2 AND folder_id = ANY($3::uuid[]);`,
            [actorUserId, cmd.workspaceId, allIds]
          );
          await client.query(
            `UPDATE app.items SET deleted_at = now(), revision = revision + 1, updated_by = $1, updated_at = now()
             WHERE workspace_id = $2 AND id = ANY($3::uuid[]);`,
            [actorUserId, cmd.workspaceId, subIds]
          );
        }

        isTombstone = true;
        await tombstoneItemForSync(client, cmd.workspaceId, cmd.entityId, actorUserId, newRevision);
        changeData = { deleted: true, policy };
        break;
      }
      case 'trashItem': {
        isTombstone = true;
        await tombstoneItemForSync(client, cmd.workspaceId, cmd.entityId, actorUserId, newRevision);
        changeData = { deleted: true };
        break;
      }
      case 'restoreFolder':
      case 'restoreItem': {
        if (existingItem.kind === 'folder') {
          const fRes = await client.query<{ parent_id: string | null }>(
            `SELECT parent_id FROM app.folders WHERE workspace_id = $1 AND id = $2;`,
            [cmd.workspaceId, cmd.entityId]
          );
          let parentId = fRes.rows[0]?.parent_id || null;
          if (parentId) {
            const pCheck = await client.query<{ deleted_at: Date | null }>(
              `SELECT deleted_at FROM app.items WHERE workspace_id = $1 AND id = $2;`,
              [cmd.workspaceId, parentId]
            );
            if (!pCheck.rows[0] || pCheck.rows[0].deleted_at !== null) {
              parentId = null;
              await client.query(
                `UPDATE app.folders SET parent_id = NULL WHERE workspace_id = $1 AND id = $2;`,
                [cmd.workspaceId, cmd.entityId]
              );
            }
          }
          await client.query(
            `UPDATE app.items SET folder_id = $1 WHERE workspace_id = $2 AND id = $3;`,
            [parentId, cmd.workspaceId, cmd.entityId]
          );
        }
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
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('SYNC_RESET_REQUIRED')) {
              throw new ConflictError(msg);
            }
            throw new ValidationError('Invalid or malformed sync cursor');
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
          seq: safeBigIntToNumber(c.seq, 'change.seq'),
          entityType: c.entityType,
          entityId: c.entityId,
          revision: safeBigIntToNumber(c.revision, 'change.revision'),
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
   * Employs REPEATABLE READ isolation to guarantee items snapshot and watermark sequence are paired
   * without drift or races.
   */
  async bootstrap(
    actorUserId: string,
    workspaceId: string
  ): Promise<{ items: Item[]; watermarkCursor: string; accessEpoch: string }> {
    return withTenantContext(
      this.pool,
      { userId: actorUserId, workspaceId },
      async (client) => {
        // 1. Authorize: Caller must have viewer role
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
        const watermarkSeq = Math.max(0, syncState.nextChangeSeq - 1);

        const watermarkCursor = encodeSyncCursor({
          v: 1,
          ws: workspaceId,
          seq: watermarkSeq,
          epoch: syncState.accessEpoch,
          ts: new Date().toISOString(),
        });

        // 3. Return full validated projection representation sufficient to reconstruct local repository
        const formattedItems: Item[] = activeItems.map((item: SyncItemRecord) => ({
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
          revision: safeBigIntToNumber(item.revision, 'item.revision'),
          rank: item.rank,
          isArchived: item.isArchived,
          isPinned: item.isPinned,
          securityScope: item.securityScope,
        }));

        return {
          items: formattedItems,
          watermarkCursor,
          accessEpoch: syncState.accessEpoch,
        };
      },
      { isolationLevel: 'REPEATABLE READ' }
    );
  }
}
