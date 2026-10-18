import type { Pool, PoolClient } from 'pg';
import type {
  SyncCommand,
  MutationResult,
  SyncPullQuery,
  ChangeRecord,
  Item,
  Folder,
  Tag,
  ItemTag,
  ItemLink,
  TaskDeadline,
  Routine,
  Weekday,
  RoutineOccurrence,
  RoutineOccurrenceTransition,
  JournalEntry,
  FileItem,
  CalendarEvent,
  NotePurpose,
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
  listActiveFilesForBootstrap,
  type SyncItemRecord,
} from './repository.js';
import {
  encodeSyncCursor,
  decodeSyncCursor,
  computeCanonicalPayloadHash,
  safeBigIntToNumber,
} from './types.js';
import {
  createFolder,
  updateFolder,
  moveFolder,
  reorderFolder,
  archiveFolder,
  pinFolder,
  trashFolder,
  restoreFolder,
} from '../organization/service.js';
import { createNote, getNote, updateNote, trashNote, restoreNote } from '../notes/service.js';
import {
  createTask,
  getTask,
  updateTask,
  trashTask,
  restoreTask,
  completeTaskService,
  reopenTaskService,
} from '../tasks/service.js';
import {
  createRoutine,
  getRoutine,
  updateRoutine,
  trashRoutine,
  restoreRoutine,
  pauseRoutine,
  resumeRoutine,
  archiveRoutine,
  unarchiveRoutine,
  getOccurrence,
  completeOccurrenceService,
  skipOccurrenceService,
  reopenOccurrenceService,
} from '../routines/service.js';
import {
  createJournalEntry,
  getJournalEntry,
  updateJournalEntry,
  trashJournalEntry,
  restoreJournalEntry,
} from '../journal/service.js';
import {
  createCalendarEvent,
  updateCalendarEvent,
  trashCalendarEvent,
  restoreCalendarEvent,
} from '../calendar/service.js';
import {
  type NoteDocument,
  validateNoteDocument,
  extractPlainText,
  createNoteDocumentFromPlainText,
  createEmptyNoteDocument,
  resolveNoteTitle,
  calculateWordCount,
  calculateCharCount,
} from '@daynori/domain';
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
    if (cmd.command === 'createNote') {
      if (cmd.payload['document'] !== undefined) {
        try {
          validateNoteDocument(cmd.payload['document']);
        } catch (err: unknown) {
          return {
            code: 'VALIDATION_FAILED',
            message: `Invalid note document: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }
      if (cmd.payload['title'] !== undefined && typeof cmd.payload['title'] !== 'string') {
        return {
          code: 'VALIDATION_FAILED',
          message: 'Invalid title: must be a string.',
        };
      }
    }
    if (cmd.command === 'updateNote') {
      if (typeof cmd.baseRevision !== 'number' || cmd.baseRevision < 0) {
        return {
          code: 'VALIDATION_FAILED',
          message: 'Invalid baseRevision: must be a non-negative integer.',
        };
      }
      if (cmd.payload['document'] !== undefined) {
        try {
          validateNoteDocument(cmd.payload['document']);
        } catch (err: unknown) {
          return {
            code: 'VALIDATION_FAILED',
            message: `Invalid note document: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }
      if (cmd.payload['title'] !== undefined && typeof cmd.payload['title'] !== 'string') {
        return {
          code: 'VALIDATION_FAILED',
          message: 'Invalid title: must be a string.',
        };
      }
    }
    if (cmd.command === 'createCalendarEvent') {
      const title = cmd.payload['title'];
      if (typeof title !== 'string' || title.trim().length === 0) {
        return {
          code: 'VALIDATION_FAILED',
          message: 'Calendar event title must be a non-empty string.',
        };
      }
    }
    if (cmd.command === 'updateCalendarEvent') {
      if (typeof cmd.baseRevision !== 'number' || cmd.baseRevision < 0) {
        return {
          code: 'VALIDATION_FAILED',
          message: 'Invalid baseRevision: must be a non-negative integer.',
        };
      }
      if (
        cmd.payload['title'] !== undefined &&
        (typeof cmd.payload['title'] !== 'string' || cmd.payload['title'].trim().length === 0)
      ) {
        return {
          code: 'VALIDATION_FAILED',
          message: 'Calendar event title must be a non-empty string.',
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

    // --- Unified Folder Commands ---
    if (
      cmd.command === 'createFolder' ||
      cmd.command === 'updateFolder' ||
      cmd.command === 'moveFolder' ||
      cmd.command === 'reorderFolder' ||
      cmd.command === 'archiveFolder' ||
      cmd.command === 'unarchiveFolder' ||
      cmd.command === 'pinFolder' ||
      cmd.command === 'unpinFolder' ||
      cmd.command === 'trashFolder' ||
      cmd.command === 'restoreFolder'
    ) {
      try {
        let resultRevision = 1;
        let appliedSeq: number | null = null;
        let resultPayload: Record<string, unknown> = {};

        switch (cmd.command) {
          case 'createFolder': {
            if (existingItem) {
              throw new ValidationError(
                `Entity with ID ${cmd.entityId} already exists in this workspace.`
              );
            }
            const folder = await createFolder(
              client,
              cmd.workspaceId,
              actorUserId,
              {
                id: cmd.entityId,
                parentId:
                  typeof cmd.payload['parentId'] === 'string'
                    ? cmd.payload['parentId']
                    : typeof cmd.payload['folderId'] === 'string'
                      ? cmd.payload['folderId']
                      : null,
                name:
                  typeof cmd.payload['name'] === 'string' ? cmd.payload['name'] : 'Untitled Folder',
                color: typeof cmd.payload['color'] === 'string' ? cmd.payload['color'] : undefined,
                icon: typeof cmd.payload['icon'] === 'string' ? cmd.payload['icon'] : undefined,
                rank: typeof cmd.payload['rank'] === 'string' ? cmd.payload['rank'] : '00001000',
                securityScope: cmd.payload['securityScope'] === 'vault' ? 'vault' : 'standard',
              },
              cmd.operationId
            );
            resultRevision = folder.revision;
            resultPayload = { folder };
            break;
          }
          case 'updateFolder': {
            const folder = await updateFolder(
              client,
              cmd.workspaceId,
              actorUserId,
              cmd.entityId,
              {
                baseRevision: cmd.baseRevision,
                name: typeof cmd.payload['name'] === 'string' ? cmd.payload['name'] : undefined,
                color:
                  typeof cmd.payload['color'] === 'string'
                    ? cmd.payload['color']
                    : cmd.payload['color'] === null
                      ? null
                      : undefined,
                icon:
                  typeof cmd.payload['icon'] === 'string'
                    ? cmd.payload['icon']
                    : cmd.payload['icon'] === null
                      ? null
                      : undefined,
              },
              cmd.operationId
            );
            resultRevision = folder.revision;
            resultPayload = { folder };
            break;
          }
          case 'moveFolder': {
            const folder = await moveFolder(
              client,
              cmd.workspaceId,
              actorUserId,
              cmd.entityId,
              {
                baseRevision: cmd.baseRevision,
                targetParentId:
                  typeof cmd.payload['targetParentId'] === 'string'
                    ? cmd.payload['targetParentId']
                    : null,
                rank: typeof cmd.payload['rank'] === 'string' ? cmd.payload['rank'] : undefined,
                expectedCollectionRevision:
                  typeof cmd.payload['expectedCollectionRevision'] === 'number'
                    ? cmd.payload['expectedCollectionRevision']
                    : undefined,
              },
              cmd.operationId
            );
            resultRevision = folder.revision;
            resultPayload = { folder };
            break;
          }
          case 'reorderFolder': {
            const folder = await reorderFolder(
              client,
              cmd.workspaceId,
              actorUserId,
              cmd.entityId,
              {
                baseRevision: cmd.baseRevision,
                rank: typeof cmd.payload['rank'] === 'string' ? cmd.payload['rank'] : '00001000',
                expectedCollectionRevision:
                  typeof cmd.payload['expectedCollectionRevision'] === 'number'
                    ? cmd.payload['expectedCollectionRevision']
                    : undefined,
              },
              cmd.operationId
            );
            resultRevision = folder.revision;
            resultPayload = { folder };
            break;
          }
          case 'archiveFolder':
          case 'unarchiveFolder': {
            const isArchived = cmd.command === 'archiveFolder';
            const folder = await archiveFolder(
              client,
              cmd.workspaceId,
              actorUserId,
              cmd.entityId,
              {
                baseRevision: cmd.baseRevision,
                isArchived,
              },
              cmd.operationId
            );
            resultRevision = folder.revision;
            resultPayload = { folder };
            break;
          }
          case 'pinFolder':
          case 'unpinFolder': {
            const isPinned = cmd.command === 'pinFolder';
            const folder = await pinFolder(
              client,
              cmd.workspaceId,
              actorUserId,
              cmd.entityId,
              {
                baseRevision: cmd.baseRevision,
                isPinned,
              },
              cmd.operationId
            );
            resultRevision = folder.revision;
            resultPayload = { folder };
            break;
          }
          case 'trashFolder': {
            const policy =
              cmd.payload['policy'] === 'preserve_to_parent'
                ? 'preserve_to_parent'
                : 'trash_subtree';
            const res = await trashFolder(
              client,
              cmd.workspaceId,
              actorUserId,
              cmd.entityId,
              policy,
              cmd.baseRevision,
              cmd.operationId
            );
            resultRevision = res.revision;
            appliedSeq = res.seq;
            resultPayload = { ...res };
            break;
          }
          case 'restoreFolder': {
            const folder = await restoreFolder(
              client,
              cmd.workspaceId,
              actorUserId,
              cmd.entityId,
              cmd.baseRevision,
              { restoreSubtree: true },
              cmd.operationId
            );
            resultRevision = folder.revision;
            resultPayload = { folder };
            break;
          }
        }

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
          acceptedRevision: resultRevision,
          appliedChangeSeq: appliedSeq,
          resultPayload,
        });

        return {
          operationId: cmd.operationId,
          status: 'accepted',
          entityId: cmd.entityId,
          revision: resultRevision,
          seq: appliedSeq,
        };
      } catch (err: unknown) {
        if (err instanceof ConflictError) {
          const conflictError = {
            code: 'REVISION_CONFLICT',
            message: err.message,
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
            status: 'conflict',
            acceptedRevision: null,
            appliedChangeSeq: null,
            resultPayload: { error: conflictError },
          });
          return {
            operationId: cmd.operationId,
            status: 'conflict',
            entityId: cmd.entityId,
            revision: cmd.baseRevision,
            seq: null,
            error: conflictError,
          };
        }

        const message = err instanceof Error ? err.message : String(err);
        const code = err instanceof NotFoundError ? 'NOT_FOUND' : 'VALIDATION_FAILED';
        const errorPayload = { code, message };

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
          resultPayload: { error: errorPayload },
        });

        return {
          operationId: cmd.operationId,
          status: 'rejected',
          entityId: cmd.entityId,
          revision: 0,
          seq: null,
          error: errorPayload,
        };
      }
    }

    // --- Unified Note Commands ---
    if (
      cmd.command === 'createNote' ||
      cmd.command === 'updateNote' ||
      cmd.command === 'trashNote' ||
      cmd.command === 'restoreNote'
    ) {
      try {
        let resultRevision = 1;
        let appliedSeq: number | null = null;
        let resultPayload: Record<string, unknown> = {};

        switch (cmd.command) {
          case 'createNote': {
            if (existingItem) {
              throw new ValidationError(
                `Entity with ID ${cmd.entityId} already exists in this workspace.`
              );
            }
            const rawPurpose = cmd.payload['purpose'];
            const notePurpose: NotePurpose =
              typeof rawPurpose === 'string' &&
              ['standard', 'guide', 'cheatsheet', 'reference'].includes(rawPurpose)
                ? (rawPurpose as NotePurpose)
                : cmd.payload['kind'] === 'knowledge'
                  ? 'guide'
                  : 'standard';
            const note = await createNote(
              client,
              cmd.workspaceId,
              actorUserId,
              {
                id: cmd.entityId,
                title: typeof cmd.payload['title'] === 'string' ? cmd.payload['title'] : undefined,
                folderId:
                  typeof cmd.payload['folderId'] === 'string'
                    ? cmd.payload['folderId']
                    : typeof cmd.payload['parentId'] === 'string'
                      ? cmd.payload['parentId']
                      : null,
                purpose: notePurpose,
                document: cmd.payload['document']
                  ? validateNoteDocument(cmd.payload['document'])
                  : undefined,
                plainText:
                  typeof cmd.payload['plainText'] === 'string'
                    ? cmd.payload['plainText']
                    : undefined,
                rank: typeof cmd.payload['rank'] === 'string' ? cmd.payload['rank'] : '00001000',
                isPinned: Boolean(cmd.payload['isPinned']),
                securityScope: cmd.payload['securityScope'] === 'vault' ? 'vault' : 'standard',
              },
              cmd.operationId
            );
            resultRevision = note.revision;
            appliedSeq = note.seq;
            resultPayload = { note };
            break;
          }
          case 'updateNote': {
            const rawPurpose = cmd.payload['purpose'];
            const updatePurpose: NotePurpose | undefined =
              typeof rawPurpose === 'string' &&
              ['standard', 'guide', 'cheatsheet', 'reference'].includes(rawPurpose)
                ? (rawPurpose as NotePurpose)
                : undefined;
            const note = await updateNote(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              {
                baseRevision: cmd.baseRevision,
                title: typeof cmd.payload['title'] === 'string' ? cmd.payload['title'] : undefined,
                folderId:
                  typeof cmd.payload['folderId'] === 'string'
                    ? cmd.payload['folderId']
                    : cmd.payload['folderId'] === null
                      ? null
                      : undefined,
                purpose: updatePurpose,
                document: cmd.payload['document']
                  ? validateNoteDocument(cmd.payload['document'])
                  : undefined,
                plainText:
                  typeof cmd.payload['plainText'] === 'string'
                    ? cmd.payload['plainText']
                    : undefined,
                rank: typeof cmd.payload['rank'] === 'string' ? cmd.payload['rank'] : undefined,
                isPinned:
                  typeof cmd.payload['isPinned'] === 'boolean'
                    ? cmd.payload['isPinned']
                    : undefined,
                isArchived:
                  typeof cmd.payload['isArchived'] === 'boolean'
                    ? cmd.payload['isArchived']
                    : undefined,
              },
              cmd.operationId
            );
            resultRevision = note.revision;
            appliedSeq = note.seq;
            resultPayload = { note };
            break;
          }
          case 'trashNote': {
            const expectedRev =
              typeof cmd.payload['expectedRevision'] === 'number'
                ? cmd.payload['expectedRevision']
                : cmd.baseRevision > 0
                  ? cmd.baseRevision
                  : undefined;
            const res = await trashNote(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              cmd.operationId,
              expectedRev
            );
            resultRevision = res.revision;
            appliedSeq = res.seq;
            resultPayload = { ...res };
            break;
          }
          case 'restoreNote': {
            const expectedRev =
              typeof cmd.payload['expectedRevision'] === 'number'
                ? cmd.payload['expectedRevision']
                : cmd.baseRevision > 0
                  ? cmd.baseRevision
                  : undefined;
            const note = await restoreNote(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              cmd.operationId,
              expectedRev
            );
            resultRevision = note.revision;
            appliedSeq = note.seq;
            resultPayload = { note };
            break;
          }
        }

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
          acceptedRevision: resultRevision,
          appliedChangeSeq: appliedSeq,
          resultPayload,
        });

        return {
          operationId: cmd.operationId,
          status: 'accepted',
          entityId: cmd.entityId,
          revision: resultRevision,
          seq: appliedSeq,
        };
      } catch (err: unknown) {
        if (err instanceof ConflictError) {
          let currentServerRevision: number | undefined;
          let currentServerState: Record<string, unknown> | undefined;
          try {
            const currentNote = await getNote(client, cmd.workspaceId, cmd.entityId);
            currentServerRevision = currentNote.revision;
            currentServerState = {
              title: currentNote.title,
              document: currentNote.document,
              plainText: currentNote.plainText,
              folderId: currentNote.folderId,
              isPinned: currentNote.isPinned,
              isArchived: currentNote.isArchived,
              revision: currentNote.revision,
              updatedAt: currentNote.updatedAt,
            };
          } catch {
            // Note may not exist or cannot be fetched
          }

          const conflictError: {
            code: string;
            message: string;
            currentServerRevision?: number;
            currentServerState?: Record<string, unknown>;
          } = {
            code: 'REVISION_CONFLICT',
            message: err.message,
            ...(currentServerRevision !== undefined ? { currentServerRevision } : {}),
            ...(currentServerState ? { currentServerState } : {}),
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
            status: 'conflict',
            acceptedRevision: null,
            appliedChangeSeq: null,
            resultPayload: { error: conflictError },
          });
          return {
            operationId: cmd.operationId,
            status: 'conflict',
            entityId: cmd.entityId,
            revision: cmd.baseRevision,
            seq: null,
            error: conflictError,
          };
        }

        const message = err instanceof Error ? err.message : String(err);
        const code = err instanceof NotFoundError ? 'NOT_FOUND' : 'VALIDATION_FAILED';
        const errorPayload = { code, message };

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
          resultPayload: { error: errorPayload },
        });

        return {
          operationId: cmd.operationId,
          status: 'rejected',
          entityId: cmd.entityId,
          revision: 0,
          seq: null,
          error: errorPayload,
        };
      }
    }

    // --- Unified Task Commands ---
    if (
      cmd.command === 'createTask' ||
      cmd.command === 'updateTask' ||
      cmd.command === 'trashTask' ||
      cmd.command === 'restoreTask' ||
      cmd.command === 'completeTask' ||
      cmd.command === 'reopenTask'
    ) {
      try {
        let resultRevision = 1;
        let appliedSeq: number | null = null;
        let resultPayload: Record<string, unknown> = {};

        switch (cmd.command) {
          case 'createTask': {
            if (existingItem) {
              throw new ValidationError(
                `Entity with ID ${cmd.entityId} already exists in this workspace.`
              );
            }
            const task = await createTask(
              client,
              cmd.workspaceId,
              actorUserId,
              {
                id: cmd.entityId,
                title:
                  typeof cmd.payload['title'] === 'string'
                    ? cmd.payload['title']
                    : typeof cmd.payload['name'] === 'string'
                      ? cmd.payload['name']
                      : 'Untitled Task',
                details: typeof cmd.payload['details'] === 'string' ? cmd.payload['details'] : null,
                folderId:
                  typeof cmd.payload['folderId'] === 'string' ? cmd.payload['folderId'] : null,
                priority:
                  typeof cmd.payload['priority'] === 'string'
                    ? (cmd.payload['priority'] as 'low' | 'normal' | 'high' | 'urgent')
                    : 'normal',
                status:
                  typeof cmd.payload['status'] === 'string'
                    ? (cmd.payload['status'] as 'todo' | 'in_progress' | 'completed' | 'cancelled')
                    : 'todo',
                deadline: (cmd.payload['deadline'] as TaskDeadline | undefined) ?? { type: 'none' },
                parentId:
                  typeof cmd.payload['parentId'] === 'string' ? cmd.payload['parentId'] : null,
                subtaskOrder:
                  typeof cmd.payload['subtaskOrder'] === 'number' ? cmd.payload['subtaskOrder'] : 0,
                tags: Array.isArray(cmd.payload['tags']) ? (cmd.payload['tags'] as string[]) : [],
                rank: typeof cmd.payload['rank'] === 'string' ? cmd.payload['rank'] : '00001000',
                isPinned: Boolean(cmd.payload['isPinned']),
                securityScope: cmd.payload['securityScope'] === 'vault' ? 'vault' : 'standard',
              },
              cmd.operationId
            );
            resultRevision = task.revision;
            appliedSeq = task.seq;
            resultPayload = { task };
            break;
          }
          case 'updateTask': {
            const task = await updateTask(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              {
                baseRevision: cmd.baseRevision,
                title: typeof cmd.payload['title'] === 'string' ? cmd.payload['title'] : undefined,
                details:
                  typeof cmd.payload['details'] === 'string'
                    ? cmd.payload['details']
                    : cmd.payload['details'] === null
                      ? null
                      : undefined,
                folderId:
                  typeof cmd.payload['folderId'] === 'string'
                    ? cmd.payload['folderId']
                    : cmd.payload['folderId'] === null
                      ? null
                      : undefined,
                priority:
                  typeof cmd.payload['priority'] === 'string'
                    ? (cmd.payload['priority'] as 'low' | 'normal' | 'high' | 'urgent')
                    : undefined,
                status:
                  typeof cmd.payload['status'] === 'string'
                    ? (cmd.payload['status'] as 'todo' | 'in_progress' | 'completed' | 'cancelled')
                    : undefined,
                deadline: cmd.payload['deadline'] as TaskDeadline | undefined,
                parentId:
                  typeof cmd.payload['parentId'] === 'string'
                    ? cmd.payload['parentId']
                    : cmd.payload['parentId'] === null
                      ? null
                      : undefined,
                subtaskOrder:
                  typeof cmd.payload['subtaskOrder'] === 'number'
                    ? cmd.payload['subtaskOrder']
                    : undefined,
                tags: Array.isArray(cmd.payload['tags'])
                  ? (cmd.payload['tags'] as string[])
                  : undefined,
                rank: typeof cmd.payload['rank'] === 'string' ? cmd.payload['rank'] : undefined,
                isPinned:
                  typeof cmd.payload['isPinned'] === 'boolean'
                    ? cmd.payload['isPinned']
                    : undefined,
                isArchived:
                  typeof cmd.payload['isArchived'] === 'boolean'
                    ? cmd.payload['isArchived']
                    : undefined,
              },
              cmd.operationId
            );
            resultRevision = task.revision;
            appliedSeq = task.seq;
            resultPayload = { task };
            break;
          }
          case 'completeTask': {
            const task = await completeTaskService(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              {
                baseRevision: cmd.baseRevision > 0 ? cmd.baseRevision : undefined,
                completedAt:
                  typeof cmd.payload['completedAt'] === 'string'
                    ? cmd.payload['completedAt']
                    : undefined,
              },
              cmd.operationId
            );
            resultRevision = task.revision;
            appliedSeq = task.seq;
            resultPayload = { task };
            break;
          }
          case 'reopenTask': {
            const task = await reopenTaskService(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              {
                baseRevision: cmd.baseRevision > 0 ? cmd.baseRevision : undefined,
                reopenedAt:
                  typeof cmd.payload['reopenedAt'] === 'string'
                    ? cmd.payload['reopenedAt']
                    : undefined,
              },
              cmd.operationId
            );
            resultRevision = task.revision;
            appliedSeq = task.seq;
            resultPayload = { task };
            break;
          }
          case 'trashTask': {
            const expectedRev =
              typeof cmd.payload['expectedRevision'] === 'number'
                ? cmd.payload['expectedRevision']
                : cmd.baseRevision > 0
                  ? cmd.baseRevision
                  : undefined;
            const res = await trashTask(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              expectedRev,
              cmd.operationId
            );
            resultRevision = res.revision;
            appliedSeq = res.seq;
            resultPayload = { ...res };
            break;
          }
          case 'restoreTask': {
            const expectedRev =
              typeof cmd.payload['expectedRevision'] === 'number'
                ? cmd.payload['expectedRevision']
                : cmd.baseRevision > 0
                  ? cmd.baseRevision
                  : undefined;
            const task = await restoreTask(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              expectedRev,
              cmd.operationId
            );
            resultRevision = task.revision;
            appliedSeq = task.seq;
            resultPayload = { task };
            break;
          }
        }

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
          acceptedRevision: resultRevision,
          appliedChangeSeq: appliedSeq,
          resultPayload,
        });

        return {
          operationId: cmd.operationId,
          status: 'accepted',
          entityId: cmd.entityId,
          revision: resultRevision,
          seq: appliedSeq,
        };
      } catch (err: unknown) {
        if (err instanceof ConflictError) {
          let currentServerRevision: number | undefined;
          let currentServerState: Record<string, unknown> | undefined;
          try {
            const currentTask = await getTask(client, cmd.workspaceId, cmd.entityId, true);
            currentServerRevision = currentTask.revision;
            currentServerState = { ...currentTask };
          } catch {
            // Task may not exist
          }

          const conflictError = {
            code: 'REVISION_CONFLICT',
            message: err.message,
            ...(currentServerRevision !== undefined ? { currentServerRevision } : {}),
            ...(currentServerState ? { currentServerState } : {}),
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
            status: 'conflict',
            acceptedRevision: null,
            appliedChangeSeq: null,
            resultPayload: { error: conflictError },
          });

          return {
            operationId: cmd.operationId,
            status: 'conflict',
            entityId: cmd.entityId,
            revision: cmd.baseRevision,
            seq: null,
            error: conflictError,
          };
        }

        const message = err instanceof Error ? err.message : String(err);
        const code = err instanceof NotFoundError ? 'NOT_FOUND' : 'VALIDATION_FAILED';
        const errorPayload = { code, message };

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
          resultPayload: { error: errorPayload },
        });

        return {
          operationId: cmd.operationId,
          status: 'rejected',
          entityId: cmd.entityId,
          revision: 0,
          seq: null,
          error: errorPayload,
        };
      }
    }

    // --- Unified Routine Commands ---
    if (
      cmd.command === 'createRoutine' ||
      cmd.command === 'updateRoutine' ||
      cmd.command === 'pauseRoutine' ||
      cmd.command === 'resumeRoutine' ||
      cmd.command === 'archiveRoutine' ||
      cmd.command === 'unarchiveRoutine' ||
      cmd.command === 'trashRoutine' ||
      cmd.command === 'restoreRoutine'
    ) {
      try {
        let resultRevision = 1;
        let appliedSeq: number | null = null;
        let resultPayload: Record<string, unknown> = {};

        switch (cmd.command) {
          case 'createRoutine': {
            if (existingItem) {
              throw new ValidationError(
                `Entity with ID ${cmd.entityId} already exists in this workspace.`
              );
            }
            const routine = await createRoutine(
              client,
              cmd.workspaceId,
              actorUserId,
              {
                id: cmd.entityId,
                title:
                  typeof cmd.payload['title'] === 'string'
                    ? cmd.payload['title']
                    : 'Untitled Routine',
                details: typeof cmd.payload['details'] === 'string' ? cmd.payload['details'] : null,
                folderId:
                  typeof cmd.payload['folderId'] === 'string' ? cmd.payload['folderId'] : null,
                frequency: cmd.payload['frequency'] === 'weekdays' ? 'weekdays' : 'daily',
                weekdays: Array.isArray(cmd.payload['weekdays'])
                  ? (cmd.payload['weekdays'] as Weekday[])
                  : [],
                timezone:
                  typeof cmd.payload['timezone'] === 'string' ? cmd.payload['timezone'] : 'UTC',
                scheduledTime:
                  typeof cmd.payload['scheduledTime'] === 'string'
                    ? cmd.payload['scheduledTime']
                    : null,
                activeFrom:
                  typeof cmd.payload['activeFrom'] === 'string'
                    ? cmd.payload['activeFrom']
                    : undefined,
                activeTo:
                  typeof cmd.payload['activeTo'] === 'string' ? cmd.payload['activeTo'] : null,
                isPinned: Boolean(cmd.payload['isPinned']),
              },
              cmd.operationId
            );
            resultRevision = routine.revision;
            appliedSeq = routine.seq;
            resultPayload = { routine };
            break;
          }
          case 'updateRoutine': {
            const routine = await updateRoutine(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              {
                baseRevision: cmd.baseRevision,
                title: typeof cmd.payload['title'] === 'string' ? cmd.payload['title'] : undefined,
                details:
                  typeof cmd.payload['details'] === 'string'
                    ? cmd.payload['details']
                    : cmd.payload['details'] === null
                      ? null
                      : undefined,
                folderId:
                  typeof cmd.payload['folderId'] === 'string'
                    ? cmd.payload['folderId']
                    : cmd.payload['folderId'] === null
                      ? null
                      : undefined,
                frequency:
                  cmd.payload['frequency'] === 'weekdays' || cmd.payload['frequency'] === 'daily'
                    ? cmd.payload['frequency']
                    : undefined,
                weekdays: Array.isArray(cmd.payload['weekdays'])
                  ? (cmd.payload['weekdays'] as Weekday[])
                  : undefined,
                timezone:
                  typeof cmd.payload['timezone'] === 'string' ? cmd.payload['timezone'] : undefined,
                scheduledTime:
                  typeof cmd.payload['scheduledTime'] === 'string'
                    ? cmd.payload['scheduledTime']
                    : cmd.payload['scheduledTime'] === null
                      ? null
                      : undefined,
                activeFrom:
                  typeof cmd.payload['activeFrom'] === 'string'
                    ? cmd.payload['activeFrom']
                    : undefined,
                activeTo:
                  typeof cmd.payload['activeTo'] === 'string'
                    ? cmd.payload['activeTo']
                    : cmd.payload['activeTo'] === null
                      ? null
                      : undefined,
                isPaused:
                  typeof cmd.payload['isPaused'] === 'boolean'
                    ? cmd.payload['isPaused']
                    : undefined,
                isArchived:
                  typeof cmd.payload['isArchived'] === 'boolean'
                    ? cmd.payload['isArchived']
                    : undefined,
                isPinned:
                  typeof cmd.payload['isPinned'] === 'boolean'
                    ? cmd.payload['isPinned']
                    : undefined,
                effectiveDate:
                  typeof cmd.payload['effectiveDate'] === 'string'
                    ? cmd.payload['effectiveDate']
                    : undefined,
              },
              cmd.operationId
            );
            resultRevision = routine.revision;
            appliedSeq = routine.seq;
            resultPayload = { routine };
            break;
          }
          case 'pauseRoutine': {
            const routine = await pauseRoutine(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              cmd.baseRevision,
              cmd.operationId
            );
            resultRevision = routine.revision;
            appliedSeq = routine.seq;
            resultPayload = { routine };
            break;
          }
          case 'resumeRoutine': {
            const routine = await resumeRoutine(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              cmd.baseRevision,
              cmd.operationId
            );
            resultRevision = routine.revision;
            appliedSeq = routine.seq;
            resultPayload = { routine };
            break;
          }
          case 'archiveRoutine': {
            const routine = await archiveRoutine(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              cmd.baseRevision,
              cmd.operationId
            );
            resultRevision = routine.revision;
            appliedSeq = routine.seq;
            resultPayload = { routine };
            break;
          }
          case 'unarchiveRoutine': {
            const routine = await unarchiveRoutine(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              cmd.baseRevision,
              cmd.operationId
            );
            resultRevision = routine.revision;
            appliedSeq = routine.seq;
            resultPayload = { routine };
            break;
          }
          case 'trashRoutine': {
            const res = await trashRoutine(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              cmd.baseRevision,
              cmd.operationId
            );
            resultRevision = res.revision;
            appliedSeq = res.seq;
            resultPayload = { ...res };
            break;
          }
          case 'restoreRoutine': {
            const routine = await restoreRoutine(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              cmd.baseRevision,
              cmd.operationId
            );
            resultRevision = routine.revision;
            appliedSeq = routine.seq;
            resultPayload = { routine };
            break;
          }
        }

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
          acceptedRevision: resultRevision,
          appliedChangeSeq: appliedSeq,
          resultPayload,
        });

        return {
          operationId: cmd.operationId,
          status: 'accepted',
          entityId: cmd.entityId,
          revision: resultRevision,
          seq: appliedSeq,
        };
      } catch (err: unknown) {
        if (err instanceof ConflictError) {
          let currentServerRevision: number | undefined;
          let currentServerState: Record<string, unknown> | undefined;
          try {
            const currentRoutine = await getRoutine(client, cmd.workspaceId, cmd.entityId);
            currentServerRevision = currentRoutine.revision;
            currentServerState = { ...currentRoutine };
          } catch {
            // Routine may not exist
          }

          const conflictError = {
            code: 'REVISION_CONFLICT',
            message: err.message,
            ...(currentServerRevision !== undefined ? { currentServerRevision } : {}),
            ...(currentServerState ? { currentServerState } : {}),
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
            status: 'conflict',
            acceptedRevision: null,
            appliedChangeSeq: null,
            resultPayload: { error: conflictError },
          });

          return {
            operationId: cmd.operationId,
            status: 'conflict',
            entityId: cmd.entityId,
            revision: cmd.baseRevision,
            seq: null,
            error: conflictError,
          };
        }

        const message = err instanceof Error ? err.message : String(err);
        const code = err instanceof NotFoundError ? 'NOT_FOUND' : 'VALIDATION_FAILED';
        const errorPayload = { code, message };

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
          resultPayload: { error: errorPayload },
        });

        return {
          operationId: cmd.operationId,
          status: 'rejected',
          entityId: cmd.entityId,
          revision: 0,
          seq: null,
          error: errorPayload,
        };
      }
    }

    // --- Unified Routine Occurrence Commands ---
    if (
      cmd.command === 'completeOccurrence' ||
      cmd.command === 'completeRoutineOccurrence' ||
      cmd.command === 'skipOccurrence' ||
      cmd.command === 'skipRoutineOccurrence' ||
      cmd.command === 'reopenOccurrence' ||
      cmd.command === 'reopenRoutineOccurrence'
    ) {
      try {
        let resultRevision = 1;
        let appliedSeq: number | null = null;
        let resultPayload: Record<string, unknown> = {};

        switch (cmd.command) {
          case 'completeOccurrence':
          case 'completeRoutineOccurrence': {
            const occPayload = cmd.payload as Record<string, unknown> | undefined;
            const occ = await completeOccurrenceService(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              cmd.baseRevision,
              cmd.operationId,
              {
                routineId:
                  typeof occPayload?.routineId === 'string' ? occPayload.routineId : undefined,
                scheduledDate:
                  typeof occPayload?.scheduledDate === 'string'
                    ? occPayload.scheduledDate
                    : undefined,
                completedAt:
                  typeof occPayload?.completedAt === 'string' ? occPayload.completedAt : undefined,
                completedBy:
                  typeof occPayload?.completedBy === 'string' ? occPayload.completedBy : undefined,
                history: Array.isArray(occPayload?.history)
                  ? (occPayload.history as RoutineOccurrenceTransition[])
                  : undefined,
              }
            );
            resultRevision = occ.serverRevision;
            appliedSeq = occ.seq;
            resultPayload = { occurrence: occ };
            break;
          }
          case 'skipOccurrence':
          case 'skipRoutineOccurrence': {
            const occPayload = cmd.payload as Record<string, unknown> | undefined;
            const occ = await skipOccurrenceService(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              cmd.baseRevision,
              cmd.operationId,
              {
                routineId:
                  typeof occPayload?.routineId === 'string' ? occPayload.routineId : undefined,
                scheduledDate:
                  typeof occPayload?.scheduledDate === 'string'
                    ? occPayload.scheduledDate
                    : undefined,
                history: Array.isArray(occPayload?.history)
                  ? (occPayload.history as RoutineOccurrenceTransition[])
                  : undefined,
              }
            );
            resultRevision = occ.serverRevision;
            appliedSeq = occ.seq;
            resultPayload = { occurrence: occ };
            break;
          }
          case 'reopenOccurrence':
          case 'reopenRoutineOccurrence': {
            const occPayload = cmd.payload as Record<string, unknown> | undefined;
            const occ = await reopenOccurrenceService(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              cmd.baseRevision,
              cmd.operationId,
              {
                routineId:
                  typeof occPayload?.routineId === 'string' ? occPayload.routineId : undefined,
                scheduledDate:
                  typeof occPayload?.scheduledDate === 'string'
                    ? occPayload.scheduledDate
                    : undefined,
                history: Array.isArray(occPayload?.history)
                  ? (occPayload.history as RoutineOccurrenceTransition[])
                  : undefined,
              }
            );
            resultRevision = occ.serverRevision;
            appliedSeq = occ.seq;
            resultPayload = { occurrence: occ };
            break;
          }
        }

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
          acceptedRevision: resultRevision,
          appliedChangeSeq: appliedSeq,
          resultPayload,
        });

        return {
          operationId: cmd.operationId,
          status: 'accepted',
          entityId: cmd.entityId,
          revision: resultRevision,
          seq: appliedSeq,
        };
      } catch (err: unknown) {
        if (err instanceof ConflictError) {
          let currentServerRevision: number | undefined;
          let currentServerState: Record<string, unknown> | undefined;
          try {
            const currentOcc = await getOccurrence(client, cmd.workspaceId, cmd.entityId);
            currentServerRevision = currentOcc.serverRevision;
            currentServerState = { ...currentOcc };
          } catch {
            // Occurrence may not exist
          }

          const conflictError = {
            code: 'REVISION_CONFLICT',
            message: err.message,
            ...(currentServerRevision !== undefined ? { currentServerRevision } : {}),
            ...(currentServerState ? { currentServerState } : {}),
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
            status: 'conflict',
            acceptedRevision: null,
            appliedChangeSeq: null,
            resultPayload: { error: conflictError },
          });

          return {
            operationId: cmd.operationId,
            status: 'conflict',
            entityId: cmd.entityId,
            revision: cmd.baseRevision,
            seq: null,
            error: conflictError,
          };
        }

        const message = err instanceof Error ? err.message : String(err);
        const code = err instanceof NotFoundError ? 'NOT_FOUND' : 'VALIDATION_FAILED';
        const errorPayload = { code, message };

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
          resultPayload: { error: errorPayload },
        });

        return {
          operationId: cmd.operationId,
          status: 'rejected',
          entityId: cmd.entityId,
          revision: 0,
          seq: null,
          error: errorPayload,
        };
      }
    }

    // --- Phase 22: Journal Entry Commands ---
    if (
      cmd.command === 'createJournalEntry' ||
      cmd.command === 'updateJournalEntry' ||
      cmd.command === 'trashJournalEntry' ||
      cmd.command === 'restoreJournalEntry'
    ) {
      try {
        let resultRevision = 1;
        let appliedSeq: number | null = null;
        let resultPayload: Record<string, unknown> = {};

        switch (cmd.command) {
          case 'createJournalEntry': {
            if (existingItem) {
              throw new ValidationError(
                `Entity with ID ${cmd.entityId} already exists in this workspace.`
              );
            }
            const payload = (cmd.payload as Record<string, unknown>) || {};
            const entry = await createJournalEntry(
              client,
              cmd.workspaceId,
              actorUserId,
              {
                id: cmd.entityId,
                folderId: typeof payload['folderId'] === 'string' ? payload['folderId'] : null,
                title: typeof payload['title'] === 'string' ? payload['title'] : null,
                entryDate:
                  typeof payload['entryDate'] === 'string'
                    ? payload['entryDate']
                    : new Date().toISOString().slice(0, 10),
                timezone: typeof payload['timezone'] === 'string' ? payload['timezone'] : 'UTC',
                document: payload['document'] ? (payload['document'] as NoteDocument) : undefined,
                plainText:
                  typeof payload['plainText'] === 'string' ? payload['plainText'] : undefined,
                mood: typeof payload['mood'] === 'string' ? payload['mood'] : null,
                prompts: Array.isArray(payload['prompts'])
                  ? (payload['prompts'] as Array<{
                      id?: string;
                      prompt: string;
                      response?: string;
                    }>)
                  : undefined,
                tags: Array.isArray(payload['tags']) ? (payload['tags'] as string[]) : undefined,
                isDraft: Boolean(payload['isDraft']),
                isPinned: Boolean(payload['isPinned']),
                securityScope: payload['securityScope'] === 'vault' ? 'vault' : 'standard',
              },
              cmd.operationId
            );
            resultRevision = entry.serverRevision;
            appliedSeq = entry.seq;
            resultPayload = { entry };
            break;
          }
          case 'updateJournalEntry': {
            const payload = (cmd.payload as Record<string, unknown>) || {};
            const entry = await updateJournalEntry(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              {
                baseRevision: cmd.baseRevision,
                folderId:
                  typeof payload['folderId'] === 'string'
                    ? payload['folderId']
                    : payload['folderId'] === null
                      ? null
                      : undefined,
                title:
                  typeof payload['title'] === 'string'
                    ? payload['title']
                    : payload['title'] === null
                      ? null
                      : undefined,
                entryDate:
                  typeof payload['entryDate'] === 'string' ? payload['entryDate'] : undefined,
                timezone: typeof payload['timezone'] === 'string' ? payload['timezone'] : undefined,
                document: payload['document'] ? (payload['document'] as NoteDocument) : undefined,
                plainText:
                  typeof payload['plainText'] === 'string' ? payload['plainText'] : undefined,
                mood:
                  typeof payload['mood'] === 'string'
                    ? payload['mood']
                    : payload['mood'] === null
                      ? null
                      : undefined,
                prompts: Array.isArray(payload['prompts'])
                  ? (payload['prompts'] as Array<{
                      id?: string;
                      prompt: string;
                      response?: string;
                    }>)
                  : undefined,
                tags: Array.isArray(payload['tags']) ? (payload['tags'] as string[]) : undefined,
                isDraft: typeof payload['isDraft'] === 'boolean' ? payload['isDraft'] : undefined,
                isArchived:
                  typeof payload['isArchived'] === 'boolean' ? payload['isArchived'] : undefined,
                isPinned:
                  typeof payload['isPinned'] === 'boolean' ? payload['isPinned'] : undefined,
              },
              cmd.operationId
            );
            resultRevision = entry.serverRevision;
            appliedSeq = entry.seq;
            resultPayload = { entry };
            break;
          }
          case 'trashJournalEntry': {
            const res = await trashJournalEntry(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              cmd.baseRevision,
              cmd.operationId
            );
            resultRevision = res.revision;
            appliedSeq = res.seq;
            break;
          }
          case 'restoreJournalEntry': {
            const res = await restoreJournalEntry(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              cmd.baseRevision,
              cmd.operationId
            );
            resultRevision = res.revision;
            appliedSeq = res.seq;
            break;
          }
        }

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
          acceptedRevision: resultRevision,
          appliedChangeSeq: appliedSeq,
          resultPayload,
        });

        return {
          operationId: cmd.operationId,
          status: 'accepted',
          entityId: cmd.entityId,
          revision: resultRevision,
          seq: appliedSeq,
        };
      } catch (err: unknown) {
        if (err instanceof ConflictError) {
          let currentServerRevision: number | undefined;
          let currentServerState: Record<string, unknown> | undefined;
          try {
            const currentEntry = await getJournalEntry(client, cmd.workspaceId, cmd.entityId);
            currentServerRevision = currentEntry.serverRevision;
            currentServerState = { ...currentEntry };
          } catch {
            // Entry may not exist
          }

          const conflictError = {
            code: 'REVISION_CONFLICT',
            message: err.message,
            ...(currentServerRevision !== undefined ? { currentServerRevision } : {}),
            ...(currentServerState ? { currentServerState } : {}),
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
            status: 'conflict',
            acceptedRevision: null,
            appliedChangeSeq: null,
            resultPayload: { error: conflictError },
          });
          return {
            operationId: cmd.operationId,
            status: 'conflict',
            entityId: cmd.entityId,
            revision: cmd.baseRevision,
            seq: null,
            error: conflictError,
          };
        }

        const message = err instanceof Error ? err.message : String(err);
        const code = err instanceof NotFoundError ? 'NOT_FOUND' : 'VALIDATION_FAILED';
        const errorPayload = { code, message };

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
          resultPayload: { error: errorPayload },
        });

        return {
          operationId: cmd.operationId,
          status: 'rejected',
          entityId: cmd.entityId,
          revision: 0,
          seq: null,
          error: errorPayload,
        };
      }
    }

    // --- Phase 26: Calendar Event Commands ---
    if (
      cmd.command === 'createCalendarEvent' ||
      cmd.command === 'updateCalendarEvent' ||
      cmd.command === 'trashCalendarEvent' ||
      cmd.command === 'restoreCalendarEvent' ||
      cmd.command === 'deleteCalendarEvent'
    ) {
      try {
        let resultRevision = 1;
        let appliedSeq: number | null = null;
        let resultPayload: Record<string, unknown> = {};

        switch (cmd.command) {
          case 'createCalendarEvent': {
            if (existingItem) {
              throw new ValidationError(
                `Entity with ID ${cmd.entityId} already exists in this workspace.`
              );
            }
            const payload = (cmd.payload as Record<string, unknown>) || {};
            const event = await createCalendarEvent(
              client,
              cmd.workspaceId,
              actorUserId,
              {
                id: cmd.entityId,
                folderId: typeof payload['folderId'] === 'string' ? payload['folderId'] : null,
                title: typeof payload['title'] === 'string' ? payload['title'] : 'Untitled Event',
                details: typeof payload['details'] === 'string' ? payload['details'] : null,
                allDay: Boolean(payload['allDay']),
                startDate: typeof payload['startDate'] === 'string' ? payload['startDate'] : undefined,
                endDate: typeof payload['endDate'] === 'string' ? payload['endDate'] : undefined,
                startAt: typeof payload['startAt'] === 'string' ? payload['startAt'] : undefined,
                endAt: typeof payload['endAt'] === 'string' ? payload['endAt'] : undefined,
                timezone: typeof payload['timezone'] === 'string' ? payload['timezone'] : 'UTC',
              },
              cmd.operationId
            );
            resultRevision = event.revision;
            const changeRes = await client.query<{ seq: number }>(
              `SELECT seq FROM app.changes WHERE workspace_id = $1 AND entity_id = $2 AND revision = $3;`,
              [cmd.workspaceId, cmd.entityId, resultRevision]
            );
            appliedSeq = changeRes.rows[0]?.seq ?? null;
            resultPayload = { event };
            break;
          }
          case 'updateCalendarEvent': {
            const payload = (cmd.payload as Record<string, unknown>) || {};
            const event = await updateCalendarEvent(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              {
                expectedRevision: cmd.baseRevision,
                folderId:
                  typeof payload['folderId'] === 'string'
                    ? payload['folderId']
                    : payload['folderId'] === null
                      ? null
                      : undefined,
                title: typeof payload['title'] === 'string' ? payload['title'] : undefined,
                details:
                  typeof payload['details'] === 'string'
                    ? payload['details']
                    : payload['details'] === null
                      ? null
                      : undefined,
                allDay: typeof payload['allDay'] === 'boolean' ? payload['allDay'] : undefined,
                startDate:
                  typeof payload['startDate'] === 'string'
                    ? payload['startDate']
                    : payload['startDate'] === null
                      ? null
                      : undefined,
                endDate:
                  typeof payload['endDate'] === 'string'
                    ? payload['endDate']
                    : payload['endDate'] === null
                      ? null
                      : undefined,
                startAt:
                  typeof payload['startAt'] === 'string'
                    ? payload['startAt']
                    : payload['startAt'] === null
                      ? null
                      : undefined,
                endAt:
                  typeof payload['endAt'] === 'string'
                    ? payload['endAt']
                    : payload['endAt'] === null
                      ? null
                      : undefined,
                timezone: typeof payload['timezone'] === 'string' ? payload['timezone'] : undefined,
                isArchived:
                  typeof payload['isArchived'] === 'boolean' ? payload['isArchived'] : undefined,
              },
              cmd.operationId
            );
            resultRevision = event.revision;
            const changeRes = await client.query<{ seq: number }>(
              `SELECT seq FROM app.changes WHERE workspace_id = $1 AND entity_id = $2 AND revision = $3;`,
              [cmd.workspaceId, cmd.entityId, resultRevision]
            );
            appliedSeq = changeRes.rows[0]?.seq ?? null;
            resultPayload = { event };
            break;
          }
          case 'trashCalendarEvent':
          case 'deleteCalendarEvent': {
            const res = await trashCalendarEvent(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              cmd.baseRevision,
              cmd.operationId
            );
            resultRevision = res.revision;
            appliedSeq = res.seq;
            break;
          }
          case 'restoreCalendarEvent': {
            const res = await restoreCalendarEvent(
              client,
              cmd.workspaceId,
              cmd.entityId,
              actorUserId,
              cmd.baseRevision,
              cmd.operationId
            );
            resultRevision = res.revision;
            appliedSeq = res.seq;
            break;
          }
        }

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
          acceptedRevision: resultRevision,
          appliedChangeSeq: appliedSeq,
          resultPayload,
        });

        return {
          operationId: cmd.operationId,
          status: 'accepted',
          entityId: cmd.entityId,
          revision: resultRevision,
          seq: appliedSeq,
        };
      } catch (err: unknown) {
        if (err instanceof ConflictError) {
          const conflictErrorPayload = {
            code: 'CONFLICT',
            message: err.message,
            currentServerState: existingItem
              ? {
                  revision: existingItem.revision,
                  deletedAt: existingItem.deletedAt,
                  isArchived: existingItem.isArchived,
                }
              : undefined,
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
            status: 'conflict',
            acceptedRevision: null,
            appliedChangeSeq: null,
            resultPayload: { error: conflictErrorPayload },
          });

          return {
            operationId: cmd.operationId,
            status: 'conflict',
            entityId: cmd.entityId,
            revision: existingItem ? existingItem.revision : 0,
            seq: null,
            error: conflictErrorPayload,
          };
        }

        const errorPayload = {
          code: err instanceof ValidationError ? 'VALIDATION_FAILED' : 'DOMAIN_ERROR',
          message: err instanceof Error ? err.message : String(err),
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
          resultPayload: { error: errorPayload },
        });

        return {
          operationId: cmd.operationId,
          status: 'rejected',
          entityId: cmd.entityId,
          revision: existingItem ? existingItem.revision : 0,
          seq: null,
          error: errorPayload,
        };
      }
    }

    // --- Command: createItem ---
    if (cmd.command === 'createItem') {
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
      const rawKind = typeof cmd.payload['kind'] === 'string' ? cmd.payload['kind'] : 'note';
      const kind = rawKind === 'knowledge' ? 'note' : rawKind;

      if (kind === 'journal_entry') {
        const error = {
          code: 'VALIDATION_FAILED',
          message: 'Journal entries must be created via createJournalEntry command.',
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

      if (kind === 'calendar_event') {
        const error = {
          code: 'VALIDATION_FAILED',
          message: 'Calendar events must be created via createCalendarEvent command.',
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
          await client.query(`SAVEPOINT folder_parent_val;`);
          await client.query(`SELECT app.validate_folder_parent($1, $2, $3, $4);`, [
            cmd.workspaceId,
            cmd.entityId,
            folderId,
            secScope,
          ]);
          await client.query(`RELEASE SAVEPOINT folder_parent_val;`);
        } catch (err: unknown) {
          await client.query(`ROLLBACK TO SAVEPOINT folder_parent_val;`);
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

      if (kind === 'note') {
        let doc: NoteDocument;
        let pt: string;
        if (cmd.payload['document']) {
          doc = validateNoteDocument(cmd.payload['document']);
          pt = extractPlainText(doc);
        } else if (typeof cmd.payload['plainText'] === 'string') {
          doc = createNoteDocumentFromPlainText(cmd.payload['plainText']);
          pt = cmd.payload['plainText'].trim();
        } else {
          doc = createEmptyNoteDocument();
          pt = '';
        }
        const noteTitle = resolveNoteTitle(
          typeof cmd.payload['title'] === 'string'
            ? cmd.payload['title']
            : typeof cmd.payload['name'] === 'string'
              ? cmd.payload['name']
              : undefined,
          'Untitled'
        );
        const rawPurpose = cmd.payload['purpose'];
        const notePurpose = ['standard', 'guide', 'cheatsheet', 'reference'].includes(rawPurpose as string)
          ? (rawPurpose as string)
          : (rawKind === 'knowledge' ? 'guide' : 'standard');
        const wc = calculateWordCount(pt);
        const cc = calculateCharCount(pt);
        await client.query(
          `INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count, purpose)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (workspace_id, id) DO UPDATE SET
             title = EXCLUDED.title,
             document = EXCLUDED.document,
             plain_text = EXCLUDED.plain_text,
             word_count = EXCLUDED.word_count,
             char_count = EXCLUDED.char_count,
             purpose = EXCLUDED.purpose,
             updated_at = now();`,
          [cmd.entityId, cmd.workspaceId, noteTitle, JSON.stringify(doc), pt, wc, cc, notePurpose]
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
        ...(kind === 'note'
          ? {
              purpose:
                ['standard', 'guide', 'cheatsheet', 'reference'].includes(cmd.payload['purpose'] as string)
                  ? (cmd.payload['purpose'] as string)
                  : (rawKind === 'knowledge' ? 'guide' : 'standard'),
              title:
                typeof cmd.payload['title'] === 'string'
                  ? cmd.payload['title']
                  : typeof cmd.payload['name'] === 'string'
                    ? cmd.payload['name']
                    : 'Untitled',
              document: cmd.payload['document'] || createEmptyNoteDocument(),
              plainText:
                typeof cmd.payload['plainText'] === 'string' ? cmd.payload['plainText'] : '',
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

        if (
          (existingItem.kind === 'note' || existingItem.kind === 'knowledge') &&
          ('title' in cmd.payload ||
            'document' in cmd.payload ||
            'plainText' in cmd.payload ||
            'name' in cmd.payload ||
            'purpose' in cmd.payload)
        ) {
          const curNoteRes = await client.query<{
            title: string;
            document: NoteDocument;
            plain_text: string;
            purpose: string;
          }>(
            `SELECT title, document, plain_text, purpose FROM app.notes WHERE workspace_id = $1 AND id = $2;`,
            [cmd.workspaceId, cmd.entityId]
          );
          const curNote = curNoteRes.rows[0];
          let doc = curNote?.document ?? createEmptyNoteDocument();
          let pt = curNote?.plain_text ?? '';
          if (cmd.payload['document'] !== undefined) {
            doc = validateNoteDocument(cmd.payload['document']);
            pt = extractPlainText(doc);
          } else if (cmd.payload['plainText'] !== undefined) {
            doc = createNoteDocumentFromPlainText(String(cmd.payload['plainText']));
            pt = String(cmd.payload['plainText']).trim();
          }
          const rawTitle =
            cmd.payload['title'] !== undefined
              ? cmd.payload['title']
              : cmd.payload['name'] !== undefined
                ? cmd.payload['name']
                : undefined;
          const title =
            rawTitle !== undefined
              ? resolveNoteTitle(String(rawTitle), 'Untitled')
              : (curNote?.title ?? 'Untitled');
          const rawPurpose = cmd.payload['purpose'];
          const notePurpose =
            typeof rawPurpose === 'string' && ['standard', 'guide', 'cheatsheet', 'reference'].includes(rawPurpose)
              ? rawPurpose
              : (curNote?.purpose || 'standard');
          const wc = calculateWordCount(pt);
          const cc = calculateCharCount(pt);
          await client.query(
            `INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count, purpose)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (workspace_id, id) DO UPDATE SET
               title = EXCLUDED.title,
               document = EXCLUDED.document,
               plain_text = EXCLUDED.plain_text,
               word_count = EXCLUDED.word_count,
               char_count = EXCLUDED.char_count,
               purpose = EXCLUDED.purpose,
               updated_at = now();`,
            [cmd.entityId, cmd.workspaceId, title, JSON.stringify(doc), pt, wc, cc, notePurpose]
          );
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
          ...(existingItem.kind === 'note' || existingItem.kind === 'knowledge'
            ? {
                ...('title' in cmd.payload ? { title: cmd.payload['title'] } : {}),
                ...('document' in cmd.payload ? { document: cmd.payload['document'] } : {}),
                ...('plainText' in cmd.payload ? { plainText: cmd.payload['plainText'] } : {}),
                ...('purpose' in cmd.payload ? { purpose: cmd.payload['purpose'] } : {}),
              }
            : {}),
        };
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
  ): Promise<{
    items: Item[];
    folders: Folder[];
    tags: Tag[];
    itemTags: ItemTag[];
    itemLinks: ItemLink[];
    routines: Routine[];
    routineOccurrences: RoutineOccurrence[];
    journalEntries: JournalEntry[];
    calendarEvents: CalendarEvent[];
    files: FileItem[];
    watermarkCursor: string;
    accessEpoch: string;
  }> {
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

        // Fetch folders
        const foldersRes = await client.query<{
          id: string;
          workspace_id: string;
          parent_id: string | null;
          name: string;
          color: string | null;
          icon: string | null;
          rank: string;
          is_archived: boolean;
          is_pinned: boolean;
          security_scope: 'standard' | 'vault';
          revision: string;
          created_at: Date;
          updated_at: Date;
          deleted_at: Date | null;
        }>(
          `SELECT
            f.id, f.workspace_id, f.parent_id, f.name, f.color, f.icon,
            i.rank, i.is_archived, i.is_pinned, i.security_scope, i.revision,
            i.created_at, i.updated_at, i.deleted_at
          FROM app.folders f
          JOIN app.items i ON i.workspace_id = f.workspace_id AND i.id = f.id
          WHERE f.workspace_id = $1 AND i.deleted_at IS NULL
          ORDER BY i.rank ASC, f.id ASC;`,
          [workspaceId]
        );

        const parentMap = new Map<string, string | null>();
        for (const r of foldersRes.rows) {
          parentMap.set(r.id, r.parent_id);
        }
        const getDepth = (id: string): number => {
          let d = 1;
          let curr = parentMap.get(id);
          const seen = new Set<string>();
          while (curr && !seen.has(curr)) {
            seen.add(curr);
            d++;
            curr = parentMap.get(curr);
          }
          return d;
        };

        const formattedFolders: Folder[] = foldersRes.rows.map((r) => ({
          id: r.id,
          workspaceId: r.workspace_id,
          parentId: r.parent_id,
          name: r.name,
          color: r.color,
          icon: r.icon,
          rank: r.rank,
          isArchived: r.is_archived,
          isPinned: r.is_pinned,
          securityScope: r.security_scope,
          revision: Number(r.revision),
          depth: getDepth(r.id),
          createdAt: r.created_at.toISOString(),
          updatedAt: r.updated_at.toISOString(),
          deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
        }));

        // Fetch tags
        const tagsRes = await client.query<{
          id: string;
          workspace_id: string;
          name: string;
          color: string | null;
          revision: string;
          created_at: Date;
          updated_at: Date;
          deleted_at: Date | null;
        }>(
          `SELECT id, workspace_id, name, color, revision, created_at, updated_at, deleted_at
           FROM app.tags
           WHERE workspace_id = $1 AND deleted_at IS NULL
           ORDER BY lower(name) ASC;`,
          [workspaceId]
        );

        const formattedTags: Tag[] = tagsRes.rows.map((r) => ({
          id: r.id,
          workspaceId: r.workspace_id,
          name: r.name,
          color: r.color,
          revision: Number(r.revision),
          createdAt: r.created_at.toISOString(),
          updatedAt: r.updated_at.toISOString(),
          deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
        }));

        // Fetch item tags
        const itemTagsRes = await client.query<{
          workspace_id: string;
          item_id: string;
          tag_id: string;
          created_at: Date;
          tag_name?: string;
          tag_color?: string | null;
        }>(
          `SELECT it.workspace_id, it.item_id, it.tag_id, it.created_at, t.name as tag_name, t.color as tag_color
           FROM app.item_tags it
           JOIN app.tags t ON t.workspace_id = it.workspace_id AND t.id = it.tag_id
           JOIN app.items i ON i.workspace_id = it.workspace_id AND i.id = it.item_id
           WHERE it.workspace_id = $1 AND i.deleted_at IS NULL AND t.deleted_at IS NULL;`,
          [workspaceId]
        );

        const formattedItemTags: ItemTag[] = itemTagsRes.rows.map((r) => ({
          workspaceId: r.workspace_id,
          itemId: r.item_id,
          tagId: r.tag_id,
          tagName: r.tag_name,
          tagColor: r.tag_color,
          createdAt: r.created_at.toISOString(),
        }));

        // Fetch item links
        const itemLinksRes = await client.query<{
          id: string;
          workspace_id: string;
          source_item_id: string;
          target_item_id: string;
          link_type: string;
          created_at: Date;
        }>(
          `SELECT id, workspace_id, source_item_id, target_item_id, link_type, created_at
           FROM app.item_links
           WHERE workspace_id = $1;`,
          [workspaceId]
        );

        const formattedItemLinks: ItemLink[] = itemLinksRes.rows.map((r) => ({
          id: r.id,
          workspaceId: r.workspace_id,
          sourceItemId: r.source_item_id,
          targetItemId: r.target_item_id,
          linkType: r.link_type,
          createdAt: r.created_at.toISOString(),
        }));

        const watermarkSeq = Math.max(0, syncState.nextChangeSeq - 1);

        const watermarkCursor = encodeSyncCursor({
          v: 1,
          ws: workspaceId,
          seq: watermarkSeq,
          epoch: syncState.accessEpoch,
          ts: new Date().toISOString(),
        });

        // Return full validated projection representation sufficient to reconstruct local repository
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
          name: item.name,
          color: item.color,
          icon: item.icon,
          parentId: item.folderId,
        }));

        const formatDateOnly = (d: string | Date | null | undefined): string | null => {
          if (!d) return null;
          if (typeof d === 'string') return d.slice(0, 10);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        // Fetch active routines
        const routinesRes = await client.query<{
          id: string;
          workspace_id: string;
          folder_id: string | null;
          kind: string;
          created_by: string;
          updated_by: string;
          created_at: Date;
          updated_at: Date;
          deleted_at: Date | null;
          revision: string | number;
          rank: string;
          is_archived: boolean;
          is_pinned: boolean;
          security_scope: 'standard' | 'vault';
          title: string;
          details: string | null;
          frequency: Routine['frequency'];
          weekdays: number[];
          timezone: string;
          scheduled_time: string | null;
          active_from: string | Date;
          active_to: string | Date | null;
          is_paused: boolean;
          schedule_revision: number;
          effective_date: string | Date;
        }>(
          `SELECT
             r.id, r.workspace_id, r.folder_id, r.title, r.details, r.frequency,
             r.weekdays, r.timezone, r.scheduled_time, r.active_from, r.active_to,
             r.is_paused, r.is_archived, r.is_pinned, r.schedule_revision, r.effective_date,
             r.created_at, r.updated_at,
             i.kind, i.created_by, i.updated_by, i.deleted_at, i.revision, i.rank, i.security_scope
           FROM app.routines r
           JOIN app.items i ON i.workspace_id = r.workspace_id AND i.id = r.id
           WHERE r.workspace_id = $1 AND i.deleted_at IS NULL;`,
          [workspaceId]
        );

        const formattedRoutines: Routine[] = routinesRes.rows.map((r) => ({
          id: r.id,
          workspaceId: r.workspace_id,
          folderId: r.folder_id,
          title: r.title,
          details: r.details,
          frequency: r.frequency,
          weekdays: (r.weekdays || []) as Routine['weekdays'],
          timezone: r.timezone,
          scheduledTime: r.scheduled_time,
          activeFrom: formatDateOnly(r.active_from)!,
          activeTo: formatDateOnly(r.active_to),
          isPaused: r.is_paused,
          isArchived: r.is_archived,
          isPinned: r.is_pinned,
          scheduleRevision: Number(r.schedule_revision) || 1,
          effectiveDate: formatDateOnly(r.effective_date)!,
          revision: Number(r.revision) || 1,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
          deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
        }));

        // Fetch active occurrences
        const occRes = await client.query<{
          id: string;
          workspace_id: string;
          routine_id: string;
          scheduled_date: string | Date;
          schedule_revision: number;
          planned_instant: Date | null;
          timezone: string;
          status: 'pending' | 'done' | 'skipped' | 'cancelled';
          completed_at: Date | null;
          completed_by: string | null;
          history: unknown;
          server_revision: string | number;
          created_at: Date;
          updated_at: Date;
        }>(
          `SELECT * FROM app.routine_occurrences
           WHERE workspace_id = $1 AND status != 'cancelled';`,
          [workspaceId]
        );

        const formattedOccurrences: RoutineOccurrence[] = occRes.rows.map((r) => {
          let history = [];
          if (Array.isArray(r.history)) {
            history = r.history;
          } else if (typeof r.history === 'string') {
            try {
              history = JSON.parse(r.history);
            } catch {
              history = [];
            }
          }
          return {
            id: r.id,
            workspaceId: r.workspace_id,
            routineId: r.routine_id,
            scheduledDate: formatDateOnly(r.scheduled_date)!,
            scheduleRevision: Number(r.schedule_revision) || 1,
            plannedInstant: r.planned_instant ? new Date(r.planned_instant).toISOString() : null,
            timezone: r.timezone,
            status: r.status as 'pending' | 'done' | 'skipped',
            completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
            completedBy: r.completed_by,
            history,
            serverRevision: Number(r.server_revision) || 1,
            revision: Number(r.server_revision) || 1,
            createdAt: new Date(r.created_at).toISOString(),
            updatedAt: new Date(r.updated_at).toISOString(),
          };
        });

        // Fetch active journal entries
        const journalsRes = await client.query<{
          id: string;
          workspace_id: string;
          folder_id: string | null;
          title: string | null;
          entry_date: string | Date;
          timezone: string;
          document: unknown;
          plain_text: string;
          word_count: number | string;
          char_count: number | string;
          mood: string | null;
          prompts: unknown;
          tags: string[];
          is_draft: boolean;
          is_archived: boolean;
          is_pinned: boolean;
          security_scope: 'standard' | 'vault';
          revision: string | number;
          created_at: Date;
          updated_at: Date;
          deleted_at: Date | null;
        }>(
          `SELECT
            j.id, j.workspace_id, i.folder_id, j.title, j.entry_date::text as entry_date, j.timezone,
            j.document, j.plain_text, j.word_count, j.char_count, j.mood, j.prompts, j.tags,
            j.is_draft, i.is_archived, i.is_pinned, i.security_scope,
            i.revision, i.created_at, i.updated_at, i.deleted_at
          FROM app.journal_entries j
          JOIN app.items i ON i.workspace_id = j.workspace_id AND i.id = j.id
          WHERE j.workspace_id = $1 AND i.deleted_at IS NULL
          ORDER BY j.entry_date DESC, i.created_at DESC;`,
          [workspaceId]
        );

        const formattedJournalEntries: JournalEntry[] = journalsRes.rows.map((r) => {
          let prompts = [];
          if (Array.isArray(r.prompts)) {
            prompts = r.prompts;
          } else if (typeof r.prompts === 'string') {
            try {
              prompts = JSON.parse(r.prompts);
            } catch {
              prompts = [];
            }
          }
          let doc: NoteDocument = { version: 1, type: 'doc', content: [] };
          if (r.document && typeof r.document === 'object') {
            doc = r.document as NoteDocument;
          } else if (typeof r.document === 'string') {
            try {
              doc = JSON.parse(r.document);
            } catch {
              // fallback
            }
          }

          return {
            id: r.id,
            workspaceId: r.workspace_id,
            folderId: r.folder_id,
            title: r.title,
            entryDate: formatDateOnly(r.entry_date)!,
            timezone: r.timezone,
            document: doc,
            plainText: r.plain_text,
            wordCount: Number(r.word_count),
            charCount: Number(r.char_count),
            mood: r.mood,
            prompts,
            tags: Array.isArray(r.tags) ? r.tags : [],
            isDraft: Boolean(r.is_draft),
            isArchived: Boolean(r.is_archived),
            isPinned: Boolean(r.is_pinned),
            securityScope: r.security_scope,
            serverRevision: Number(r.revision) || 1,
            createdAt: new Date(r.created_at).toISOString(),
            updatedAt: new Date(r.updated_at).toISOString(),
            deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
          };
        });

        // Fetch active verified files
        const activeFiles = await listActiveFilesForBootstrap(client, workspaceId);

        // Fetch active calendar events
        const calendarRes = await client.query<{
          id: string;
          workspace_id: string;
          folder_id: string | null;
          title: string;
          details: string | null;
          all_day: boolean;
          start_date: string | null;
          end_date: string | null;
          start_at: Date | null;
          end_at: Date | null;
          timezone: string;
          is_archived: boolean;
          security_scope: 'standard' | 'vault';
          revision: number;
          created_at: Date;
          updated_at: Date;
          deleted_at: Date | null;
        }>(
          `SELECT
            c.id, c.workspace_id, c.folder_id, c.title, c.details, c.all_day,
            c.start_date::text as start_date, c.end_date::text as end_date,
            c.start_at, c.end_at, c.timezone,
            i.is_archived, i.security_scope, i.revision,
            i.created_at, i.updated_at, i.deleted_at
          FROM app.calendar_events c
          JOIN app.items i ON i.workspace_id = c.workspace_id AND i.id = c.id
          WHERE c.workspace_id = $1 AND i.deleted_at IS NULL
          ORDER BY c.start_at ASC NULLS LAST, c.start_date ASC NULLS LAST, c.id ASC;`,
          [workspaceId]
        );

        const formattedCalendarEvents: CalendarEvent[] = calendarRes.rows.map((r) => {
          return {
            id: r.id,
            workspaceId: r.workspace_id,
            folderId: r.folder_id,
            title: r.title,
            details: r.details,
            allDay: Boolean(r.all_day),
            startDate: r.start_date ? formatDateOnly(r.start_date) : null,
            endDate: r.end_date ? formatDateOnly(r.end_date) : null,
            startAt: r.start_at ? new Date(r.start_at).toISOString() : null,
            endAt: r.end_at ? new Date(r.end_at).toISOString() : null,
            timezone: r.timezone || 'UTC',
            isArchived: Boolean(r.is_archived),
            securityScope: r.security_scope || 'standard',
            revision: Number(r.revision) || 1,
            createdAt: new Date(r.created_at).toISOString(),
            updatedAt: new Date(r.updated_at).toISOString(),
            deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
          };
        });

        return {
          items: formattedItems,
          folders: formattedFolders,
          tags: formattedTags,
          itemTags: formattedItemTags,
          itemLinks: formattedItemLinks,
          routines: formattedRoutines,
          routineOccurrences: formattedOccurrences,
          journalEntries: formattedJournalEntries,
          calendarEvents: formattedCalendarEvents,
          files: activeFiles,
          watermarkCursor,
          accessEpoch: syncState.accessEpoch,
        };
      },
      { isolationLevel: 'REPEATABLE READ' }
    );
  }
}
