import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import {
  CreateTaskRequestSchema,
  UpdateTaskRequestSchema,
  CompleteTaskRequestSchema,
  ReopenTaskRequestSchema,
  TrashTaskRequestSchema,
  RestoreTaskRequestSchema,
  TaskParamsSchema,
  TaskListQuerySchema,
  TaskResponseSchema,
  TaskListResponseSchema,
  WorkspaceParamsSchema,
  type Task,
} from '@daynori/contracts';
import { withTenantContext } from '../../db/index.js';
import {
  createTask,
  getTask,
  listTasks,
  updateTask,
  completeTaskService,
  reopenTaskService,
  trashTask,
  restoreTask,
} from '../../modules/tasks/service.js';
import {
  getMutationReceipt,
  insertMutationReceipt,
  lockWorkspaceSyncState,
} from '../../modules/sync/repository.js';
import { computeCanonicalPayloadHash } from '../../modules/sync/types.js';
import { validateResponse, NotFoundError, ConflictError } from '../../plugins/errorHandler.js';

export function registerTaskRoutes(app: FastifyInstance, pool: Pool): void {
  // 1. Create Task
  app.post('/v1/workspaces/:workspaceId/tasks', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    }
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const parsedBody = CreateTaskRequestSchema.parse(request.body);
    const actorUserId = actor.userId;
    const operationId = (request.headers['x-operation-id'] ||
      request.headers['idempotency-key']) as string | undefined;

    return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      if (operationId) {
        const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';
        const payloadHash = computeCanonicalPayloadHash({
          workspaceId,
          command: 'createTask',
          commandVersion: 1,
          schemaVersion: 1,
          entityType: 'item',
          entityId: parsedBody.id || operationId,
          baseRevision: 0,
          payload: parsedBody as Record<string, unknown>,
        });

        const receipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
        if (receipt) {
          if (receipt.canonicalPayloadHash !== payloadHash) {
            throw new ConflictError(
              'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
            );
          }
          const task =
            (receipt.resultPayload?.task as Task) ||
            (await getTask(client, workspaceId, receipt.entityId));
          return reply.status(200).send(
            validateResponse(TaskResponseSchema, {
              data: task,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        }

        await lockWorkspaceSyncState(client, workspaceId);
        const lockedReceipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
        if (lockedReceipt) {
          const task =
            (lockedReceipt.resultPayload?.task as Task) ||
            (await getTask(client, workspaceId, lockedReceipt.entityId));
          return reply.status(200).send(
            validateResponse(TaskResponseSchema, {
              data: task,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        }

        const taskWithSeq = await createTask(
          client,
          workspaceId,
          actorUserId,
          parsedBody,
          operationId
        );

        await insertMutationReceipt(client, {
          workspaceId,
          actorUserId,
          deviceId,
          operationId,
          command: 'createTask',
          entityType: 'item',
          entityId: taskWithSeq.id,
          schemaVersion: 1,
          baseRevision: 0,
          canonicalPayloadHash: payloadHash,
          status: 'accepted',
          acceptedRevision: taskWithSeq.revision,
          appliedChangeSeq: taskWithSeq.seq,
          resultPayload: { task: taskWithSeq },
        });

        return reply.status(201).send(
          validateResponse(TaskResponseSchema, {
            data: taskWithSeq,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      }

      const taskWithSeq = await createTask(client, workspaceId, actorUserId, parsedBody);
      return reply.status(201).send(
        validateResponse(TaskResponseSchema, {
          data: taskWithSeq,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 2. List Tasks
  app.get('/v1/workspaces/:workspaceId/tasks', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    }
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const query = TaskListQuerySchema.parse(request.query);
    const actorUserId = actor.userId;

    return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      const { tasks, nextCursor } = await listTasks(client, workspaceId, query);
      return reply.status(200).send(
        validateResponse(TaskListResponseSchema, {
          data: tasks,
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
            cursor: nextCursor,
          },
        })
      );
    });
  });

  // 3. Get Task by ID
  app.get('/v1/workspaces/:workspaceId/tasks/:taskId', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    }
    const { workspaceId, taskId } = TaskParamsSchema.parse(request.params);
    const actorUserId = actor.userId;

    return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      const task = await getTask(client, workspaceId, taskId);
      return reply.status(200).send(
        validateResponse(TaskResponseSchema, {
          data: task,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 4. Update Task
  app.patch('/v1/workspaces/:workspaceId/tasks/:taskId', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    }
    const { workspaceId, taskId } = TaskParamsSchema.parse(request.params);
    const parsedBody = UpdateTaskRequestSchema.parse(request.body);
    const actorUserId = actor.userId;
    const operationId = (request.headers['x-operation-id'] ||
      request.headers['idempotency-key']) as string | undefined;

    return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      if (operationId) {
        const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';
        const payloadHash = computeCanonicalPayloadHash({
          workspaceId,
          command: 'updateTask',
          commandVersion: 1,
          schemaVersion: 1,
          entityType: 'item',
          entityId: taskId,
          baseRevision: parsedBody.baseRevision,
          payload: parsedBody as Record<string, unknown>,
        });

        const receipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
        if (receipt) {
          if (receipt.canonicalPayloadHash !== payloadHash) {
            throw new ConflictError(
              'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
            );
          }
          const task =
            (receipt.resultPayload?.task as Task) || (await getTask(client, workspaceId, taskId));
          return reply.status(200).send(
            validateResponse(TaskResponseSchema, {
              data: task,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        }

        await lockWorkspaceSyncState(client, workspaceId);
        const lockedReceipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
        if (lockedReceipt) {
          const task =
            (lockedReceipt.resultPayload?.task as Task) ||
            (await getTask(client, workspaceId, taskId));
          return reply.status(200).send(
            validateResponse(TaskResponseSchema, {
              data: task,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        }

        const taskWithSeq = await updateTask(
          client,
          workspaceId,
          taskId,
          actorUserId,
          parsedBody,
          operationId
        );

        await insertMutationReceipt(client, {
          workspaceId,
          actorUserId,
          deviceId,
          operationId,
          command: 'updateTask',
          entityType: 'item',
          entityId: taskId,
          schemaVersion: 1,
          baseRevision: parsedBody.baseRevision,
          canonicalPayloadHash: payloadHash,
          status: 'accepted',
          acceptedRevision: taskWithSeq.revision,
          appliedChangeSeq: taskWithSeq.seq,
          resultPayload: { task: taskWithSeq },
        });

        return reply.status(200).send(
          validateResponse(TaskResponseSchema, {
            data: taskWithSeq,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      }

      const taskWithSeq = await updateTask(client, workspaceId, taskId, actorUserId, parsedBody);
      return reply.status(200).send(
        validateResponse(TaskResponseSchema, {
          data: taskWithSeq,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 5. Complete Task
  app.post(
    '/v1/workspaces/:workspaceId/tasks/:taskId/complete',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, taskId } = TaskParamsSchema.parse(request.params);
      const parsedBody = CompleteTaskRequestSchema.parse(request.body || {});
      const actorUserId = actor.userId;
      const operationId = (request.headers['x-operation-id'] ||
        request.headers['idempotency-key']) as string | undefined;

      return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        if (operationId) {
          const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';
          const payloadHash = computeCanonicalPayloadHash({
            workspaceId,
            command: 'completeTask',
            commandVersion: 1,
            schemaVersion: 1,
            entityType: 'item',
            entityId: taskId,
            baseRevision: parsedBody.baseRevision ?? 0,
            payload: parsedBody as Record<string, unknown>,
          });

          const receipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
          if (receipt) {
            if (receipt.canonicalPayloadHash !== payloadHash) {
              throw new ConflictError(
                'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
              );
            }
            const task =
              (receipt.resultPayload?.task as Task) || (await getTask(client, workspaceId, taskId));
            return reply.status(200).send(
              validateResponse(TaskResponseSchema, {
                data: task,
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }

          await lockWorkspaceSyncState(client, workspaceId);
          const lockedReceipt = await getMutationReceipt(
            client,
            actorUserId,
            deviceId,
            operationId
          );
          if (lockedReceipt) {
            const task =
              (lockedReceipt.resultPayload?.task as Task) ||
              (await getTask(client, workspaceId, taskId));
            return reply.status(200).send(
              validateResponse(TaskResponseSchema, {
                data: task,
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }

          const taskWithSeq = await completeTaskService(
            client,
            workspaceId,
            taskId,
            actorUserId,
            parsedBody,
            operationId
          );

          await insertMutationReceipt(client, {
            workspaceId,
            actorUserId,
            deviceId,
            operationId,
            command: 'completeTask',
            entityType: 'item',
            entityId: taskId,
            schemaVersion: 1,
            baseRevision: parsedBody.baseRevision ?? 0,
            canonicalPayloadHash: payloadHash,
            status: 'accepted',
            acceptedRevision: taskWithSeq.revision,
            appliedChangeSeq: taskWithSeq.seq,
            resultPayload: { task: taskWithSeq },
          });

          return reply.status(200).send(
            validateResponse(TaskResponseSchema, {
              data: taskWithSeq,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        }

        const taskWithSeq = await completeTaskService(
          client,
          workspaceId,
          taskId,
          actorUserId,
          parsedBody
        );

        return reply.status(200).send(
          validateResponse(TaskResponseSchema, {
            data: taskWithSeq,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 6. Reopen Task
  app.post(
    '/v1/workspaces/:workspaceId/tasks/:taskId/reopen',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, taskId } = TaskParamsSchema.parse(request.params);
      const parsedBody = ReopenTaskRequestSchema.parse(request.body || {});
      const actorUserId = actor.userId;
      const operationId = (request.headers['x-operation-id'] ||
        request.headers['idempotency-key']) as string | undefined;

      return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        if (operationId) {
          const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';
          const payloadHash = computeCanonicalPayloadHash({
            workspaceId,
            command: 'reopenTask',
            commandVersion: 1,
            schemaVersion: 1,
            entityType: 'item',
            entityId: taskId,
            baseRevision: parsedBody.baseRevision ?? 0,
            payload: parsedBody as Record<string, unknown>,
          });

          const receipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
          if (receipt) {
            if (receipt.canonicalPayloadHash !== payloadHash) {
              throw new ConflictError(
                'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
              );
            }
            const task =
              (receipt.resultPayload?.task as Task) || (await getTask(client, workspaceId, taskId));
            return reply.status(200).send(
              validateResponse(TaskResponseSchema, {
                data: task,
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }

          await lockWorkspaceSyncState(client, workspaceId);
          const lockedReceipt = await getMutationReceipt(
            client,
            actorUserId,
            deviceId,
            operationId
          );
          if (lockedReceipt) {
            const task =
              (lockedReceipt.resultPayload?.task as Task) ||
              (await getTask(client, workspaceId, taskId));
            return reply.status(200).send(
              validateResponse(TaskResponseSchema, {
                data: task,
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }

          const taskWithSeq = await reopenTaskService(
            client,
            workspaceId,
            taskId,
            actorUserId,
            parsedBody,
            operationId
          );

          await insertMutationReceipt(client, {
            workspaceId,
            actorUserId,
            deviceId,
            operationId,
            command: 'reopenTask',
            entityType: 'item',
            entityId: taskId,
            schemaVersion: 1,
            baseRevision: parsedBody.baseRevision ?? 0,
            canonicalPayloadHash: payloadHash,
            status: 'accepted',
            acceptedRevision: taskWithSeq.revision,
            appliedChangeSeq: taskWithSeq.seq,
            resultPayload: { task: taskWithSeq },
          });

          return reply.status(200).send(
            validateResponse(TaskResponseSchema, {
              data: taskWithSeq,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        }

        const taskWithSeq = await reopenTaskService(
          client,
          workspaceId,
          taskId,
          actorUserId,
          parsedBody
        );

        return reply.status(200).send(
          validateResponse(TaskResponseSchema, {
            data: taskWithSeq,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 7. Trash Task
  app.delete(
    '/v1/workspaces/:workspaceId/tasks/:taskId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, taskId } = TaskParamsSchema.parse(request.params);
      const parsedBody = TrashTaskRequestSchema.parse(request.body || {});
      const actorUserId = actor.userId;
      const operationId = (request.headers['x-operation-id'] ||
        request.headers['idempotency-key']) as string | undefined;

      return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        if (operationId) {
          const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';
          const payloadHash = computeCanonicalPayloadHash({
            workspaceId,
            command: 'trashTask',
            commandVersion: 1,
            schemaVersion: 1,
            entityType: 'item',
            entityId: taskId,
            baseRevision: parsedBody.expectedRevision ?? 0,
            payload: parsedBody as Record<string, unknown>,
          });

          const receipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
          if (receipt) {
            if (receipt.canonicalPayloadHash !== payloadHash) {
              throw new ConflictError(
                'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
              );
            }
            const resPayload = receipt.resultPayload as {
              id: string;
              trashed: boolean;
              revision: number;
            };
            return reply.status(200).send({
              data: resPayload || {
                id: taskId,
                trashed: true,
                revision: Number(receipt.acceptedRevision || 1),
              },
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            });
          }

          await lockWorkspaceSyncState(client, workspaceId);
          const lockedReceipt = await getMutationReceipt(
            client,
            actorUserId,
            deviceId,
            operationId
          );
          if (lockedReceipt) {
            const resPayload = lockedReceipt.resultPayload as {
              id: string;
              trashed: boolean;
              revision: number;
            };
            return reply.status(200).send({
              data: resPayload || {
                id: taskId,
                trashed: true,
                revision: Number(lockedReceipt.acceptedRevision || 1),
              },
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            });
          }

          const result = await trashTask(
            client,
            workspaceId,
            taskId,
            actorUserId,
            parsedBody.expectedRevision,
            operationId
          );

          await insertMutationReceipt(client, {
            workspaceId,
            actorUserId,
            deviceId,
            operationId,
            command: 'trashTask',
            entityType: 'item',
            entityId: taskId,
            schemaVersion: 1,
            baseRevision: parsedBody.expectedRevision ?? 0,
            canonicalPayloadHash: payloadHash,
            status: 'accepted',
            acceptedRevision: result.revision,
            appliedChangeSeq: result.seq,
            resultPayload: { id: result.id, trashed: true, revision: result.revision },
          });

          return reply.status(200).send({
            data: { id: result.id, trashed: true, revision: result.revision },
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          });
        }

        const result = await trashTask(
          client,
          workspaceId,
          taskId,
          actorUserId,
          parsedBody.expectedRevision
        );

        return reply.status(200).send({
          data: { id: result.id, trashed: true, revision: result.revision },
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        });
      });
    }
  );

  // 8. Restore Task
  app.post(
    '/v1/workspaces/:workspaceId/tasks/:taskId/restore',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, taskId } = TaskParamsSchema.parse(request.params);
      const parsedBody = RestoreTaskRequestSchema.parse(request.body || {});
      const actorUserId = actor.userId;
      const operationId = (request.headers['x-operation-id'] ||
        request.headers['idempotency-key']) as string | undefined;

      return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        if (operationId) {
          const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';
          const payloadHash = computeCanonicalPayloadHash({
            workspaceId,
            command: 'restoreTask',
            commandVersion: 1,
            schemaVersion: 1,
            entityType: 'item',
            entityId: taskId,
            baseRevision: parsedBody.expectedRevision ?? 0,
            payload: parsedBody as Record<string, unknown>,
          });

          const receipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
          if (receipt) {
            if (receipt.canonicalPayloadHash !== payloadHash) {
              throw new ConflictError(
                'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
              );
            }
            const task =
              (receipt.resultPayload?.task as Task) || (await getTask(client, workspaceId, taskId));
            return reply.status(200).send(
              validateResponse(TaskResponseSchema, {
                data: task,
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }

          await lockWorkspaceSyncState(client, workspaceId);
          const lockedReceipt = await getMutationReceipt(
            client,
            actorUserId,
            deviceId,
            operationId
          );
          if (lockedReceipt) {
            const task =
              (lockedReceipt.resultPayload?.task as Task) ||
              (await getTask(client, workspaceId, taskId));
            return reply.status(200).send(
              validateResponse(TaskResponseSchema, {
                data: task,
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }

          const taskWithSeq = await restoreTask(
            client,
            workspaceId,
            taskId,
            actorUserId,
            parsedBody.expectedRevision,
            operationId
          );

          await insertMutationReceipt(client, {
            workspaceId,
            actorUserId,
            deviceId,
            operationId,
            command: 'restoreTask',
            entityType: 'item',
            entityId: taskId,
            schemaVersion: 1,
            baseRevision: parsedBody.expectedRevision ?? 0,
            canonicalPayloadHash: payloadHash,
            status: 'accepted',
            acceptedRevision: taskWithSeq.revision,
            appliedChangeSeq: taskWithSeq.seq,
            resultPayload: { task: taskWithSeq },
          });

          return reply.status(200).send(
            validateResponse(TaskResponseSchema, {
              data: taskWithSeq,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        }

        const taskWithSeq = await restoreTask(
          client,
          workspaceId,
          taskId,
          actorUserId,
          parsedBody.expectedRevision
        );

        return reply.status(200).send(
          validateResponse(TaskResponseSchema, {
            data: taskWithSeq,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );
}
