import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import {
  WorkspaceParamsSchema,
  CreateRoutineRequestSchema,
  UpdateRoutineRequestSchema,
  RoutineResponseSchema,
  RoutineListResponseSchema,
  RoutineOccurrenceResponseSchema,
  RoutineOccurrenceListResponseSchema,
  GenerateOccurrencesQuerySchema,
  CompleteOccurrenceRequestSchema,
  SkipOccurrenceRequestSchema,
  ReopenOccurrenceRequestSchema,
  RoutineListQuerySchema,
  type Routine,
  type RoutineOccurrence,
} from '@daynori/contracts';
import { withTenantContext } from '../../db/index.js';
import {
  createRoutine,
  getRoutine,
  listRoutines,
  updateRoutine,
  trashRoutine,
  restoreRoutine,
  pauseRoutine,
  resumeRoutine,
  archiveRoutine,
  unarchiveRoutine,
  generateOccurrences,
  listOccurrences,
  getOccurrence,
  completeOccurrenceService,
  skipOccurrenceService,
  reopenOccurrenceService,
} from '../../modules/routines/service.js';
import {
  getMutationReceipt,
  insertMutationReceipt,
  lockWorkspaceSyncState,
} from '../../modules/sync/repository.js';
import { computeCanonicalPayloadHash } from '../../modules/sync/types.js';
import { validateResponse, NotFoundError, ConflictError } from '../../plugins/errorHandler.js';

const RoutineParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  routineId: z.string().uuid(),
});

const OccurrenceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  occurrenceId: z.string().uuid(),
});

export function registerRoutineRoutes(app: FastifyInstance, pool: Pool): void {
  // 1. Create Routine Template
  app.post('/v1/workspaces/:workspaceId/routines', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    }
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const parsedBody = CreateRoutineRequestSchema.parse(request.body);
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
          command: 'createRoutine',
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
          const routine =
            (receipt.resultPayload?.routine as Routine) ||
            (await getRoutine(client, workspaceId, receipt.entityId));
          return reply.status(200).send(
            validateResponse(RoutineResponseSchema, {
              data: routine,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        }

        await lockWorkspaceSyncState(client, workspaceId);
        const lockedReceipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
        if (lockedReceipt) {
          const routine =
            (lockedReceipt.resultPayload?.routine as Routine) ||
            (await getRoutine(client, workspaceId, lockedReceipt.entityId));
          return reply.status(200).send(
            validateResponse(RoutineResponseSchema, {
              data: routine,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        }

        const routine = await createRoutine(
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
          command: 'createRoutine',
          entityType: 'item',
          entityId: routine.id,
          schemaVersion: 1,
          baseRevision: 0,
          canonicalPayloadHash: payloadHash,
          status: 'accepted',
          acceptedRevision: routine.revision,
          appliedChangeSeq: routine.seq,
          resultPayload: { routine },
        });

        return reply.status(201).send(
          validateResponse(RoutineResponseSchema, {
            data: routine,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      }

      const routine = await createRoutine(client, workspaceId, actorUserId, parsedBody);
      return reply.status(201).send(
        validateResponse(RoutineResponseSchema, {
          data: routine,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 2. List Routines
  app.get('/v1/workspaces/:workspaceId/routines', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    }
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const query = RoutineListQuerySchema.parse(request.query);

    return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      const { routines, nextCursor } = await listRoutines(client, workspaceId, query);
      return reply.status(200).send(
        validateResponse(RoutineListResponseSchema, {
          data: routines,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
          nextCursor,
        })
      );
    });
  });

  // 3. Get Routine
  app.get(
    '/v1/workspaces/:workspaceId/routines/:routineId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, routineId } = RoutineParamsSchema.parse(request.params);

      return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        const routine = await getRoutine(client, workspaceId, routineId);
        return reply.status(200).send(
          validateResponse(RoutineResponseSchema, {
            data: routine,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 4. Update Routine
  app.patch(
    '/v1/workspaces/:workspaceId/routines/:routineId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, routineId } = RoutineParamsSchema.parse(request.params);
      const parsedBody = UpdateRoutineRequestSchema.parse(request.body);
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
            command: 'updateRoutine',
            commandVersion: 1,
            schemaVersion: 1,
            entityType: 'item',
            entityId: routineId,
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
            const routine =
              (receipt.resultPayload?.routine as Routine) ||
              (await getRoutine(client, workspaceId, routineId));
            return reply.status(200).send(
              validateResponse(RoutineResponseSchema, {
                data: routine,
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
            const routine =
              (lockedReceipt.resultPayload?.routine as Routine) ||
              (await getRoutine(client, workspaceId, routineId));
            return reply.status(200).send(
              validateResponse(RoutineResponseSchema, {
                data: routine,
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }

          const routine = await updateRoutine(
            client,
            workspaceId,
            routineId,
            actorUserId,
            parsedBody,
            operationId
          );

          await insertMutationReceipt(client, {
            workspaceId,
            actorUserId,
            deviceId,
            operationId,
            command: 'updateRoutine',
            entityType: 'item',
            entityId: routineId,
            schemaVersion: 1,
            baseRevision: parsedBody.baseRevision,
            canonicalPayloadHash: payloadHash,
            status: 'accepted',
            acceptedRevision: routine.revision,
            appliedChangeSeq: routine.seq,
            resultPayload: { routine },
          });

          return reply.status(200).send(
            validateResponse(RoutineResponseSchema, {
              data: routine,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        }

        const routine = await updateRoutine(
          client,
          workspaceId,
          routineId,
          actorUserId,
          parsedBody
        );
        return reply.status(200).send(
          validateResponse(RoutineResponseSchema, {
            data: routine,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // Helper helper for simple routine actions (pause, resume, archive, unarchive)
  const registerRoutineAction = (
    subpath: string,
    command: 'pauseRoutine' | 'resumeRoutine' | 'archiveRoutine' | 'unarchiveRoutine',
    serviceFn: (
      client: PoolClient,
      workspaceId: string,
      routineId: string,
      actorUserId: string,
      baseRevision: number,
      opId?: string
    ) => Promise<Routine & { seq: number }>
  ) => {
    app.post(
      `/v1/workspaces/:workspaceId/routines/:routineId/${subpath}`,
      async (request: FastifyRequest, reply) => {
        const actor = request.actor;
        if (!actor) {
          return reply
            .status(401)
            .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        }
        const { workspaceId, routineId } = RoutineParamsSchema.parse(request.params);
        const body = z.object({ baseRevision: z.number().int().nonnegative() }).parse(request.body);
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
              command,
              commandVersion: 1,
              schemaVersion: 1,
              entityType: 'item',
              entityId: routineId,
              baseRevision: body.baseRevision,
              payload: body as Record<string, unknown>,
            });

            const receipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
            if (receipt) {
              if (receipt.canonicalPayloadHash !== payloadHash) {
                throw new ConflictError(
                  'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
                );
              }
              const routine =
                (receipt.resultPayload?.routine as Routine) ||
                (await getRoutine(client, workspaceId, routineId));
              return reply.status(200).send(
                validateResponse(RoutineResponseSchema, {
                  data: routine,
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
              const routine =
                (lockedReceipt.resultPayload?.routine as Routine) ||
                (await getRoutine(client, workspaceId, routineId));
              return reply.status(200).send(
                validateResponse(RoutineResponseSchema, {
                  data: routine,
                  meta: { requestId: request.id, serverTime: new Date().toISOString() },
                })
              );
            }

            const routine = await serviceFn(
              client,
              workspaceId,
              routineId,
              actorUserId,
              body.baseRevision,
              operationId
            );

            await insertMutationReceipt(client, {
              workspaceId,
              actorUserId,
              deviceId,
              operationId,
              command,
              entityType: 'item',
              entityId: routineId,
              schemaVersion: 1,
              baseRevision: body.baseRevision,
              canonicalPayloadHash: payloadHash,
              status: 'accepted',
              acceptedRevision: routine.revision,
              appliedChangeSeq: routine.seq,
              resultPayload: { routine },
            });

            return reply.status(200).send(
              validateResponse(RoutineResponseSchema, {
                data: routine,
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }

          const routine = await serviceFn(
            client,
            workspaceId,
            routineId,
            actorUserId,
            body.baseRevision
          );
          return reply.status(200).send(
            validateResponse(RoutineResponseSchema, {
              data: routine,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        });
      }
    );
  };

  registerRoutineAction('pause', 'pauseRoutine', pauseRoutine);
  registerRoutineAction('resume', 'resumeRoutine', resumeRoutine);
  registerRoutineAction('archive', 'archiveRoutine', archiveRoutine);
  registerRoutineAction('unarchive', 'unarchiveRoutine', unarchiveRoutine);

  // 5. Trash Routine
  app.delete(
    '/v1/workspaces/:workspaceId/routines/:routineId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, routineId } = RoutineParamsSchema.parse(request.params);
      const body = z.object({ baseRevision: z.number().int().nonnegative() }).parse(request.body);

      return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        const res = await trashRoutine(
          client,
          workspaceId,
          routineId,
          actor.userId,
          body.baseRevision
        );
        return reply.status(200).send({
          data: res,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        });
      });
    }
  );

  // 6. Restore Routine
  app.post(
    '/v1/workspaces/:workspaceId/routines/:routineId/restore',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, routineId } = RoutineParamsSchema.parse(request.params);
      const body = z.object({ baseRevision: z.number().int().nonnegative() }).parse(request.body);

      return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        const routine = await restoreRoutine(
          client,
          workspaceId,
          routineId,
          actor.userId,
          body.baseRevision
        );
        return reply.status(200).send(
          validateResponse(RoutineResponseSchema, {
            data: routine,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 7. Generate Occurrences (Idempotent Bounded Generation)
  app.post(
    '/v1/workspaces/:workspaceId/routines/generate-occurrences',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const query = GenerateOccurrencesQuerySchema.parse(request.body);

      return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        const occurrences = await generateOccurrences(client, workspaceId, actor.userId, query);
        return reply.status(200).send(
          validateResponse(RoutineOccurrenceListResponseSchema, {
            data: occurrences,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 8. List Occurrences by Date Range
  app.get(
    '/v1/workspaces/:workspaceId/routines/occurrences',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const query = GenerateOccurrencesQuerySchema.parse(request.query);

      return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        const occurrences = await listOccurrences(
          client,
          workspaceId,
          query.startDate,
          query.endDate,
          query.routineId
        );
        return reply.status(200).send(
          validateResponse(RoutineOccurrenceListResponseSchema, {
            data: occurrences,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 9. Complete Occurrence
  app.post(
    '/v1/workspaces/:workspaceId/routines/occurrences/:occurrenceId/complete',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, occurrenceId } = OccurrenceParamsSchema.parse(request.params);
      const body = CompleteOccurrenceRequestSchema.parse(request.body);
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
            command: 'completeOccurrence',
            commandVersion: 1,
            schemaVersion: 1,
            entityType: 'routine_occurrence',
            entityId: occurrenceId,
            baseRevision: body.baseRevision,
            payload: body as Record<string, unknown>,
          });

          const receipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
          if (receipt) {
            if (receipt.canonicalPayloadHash !== payloadHash) {
              throw new ConflictError(
                'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
              );
            }
            const occurrence =
              (receipt.resultPayload?.occurrence as RoutineOccurrence) ||
              (await getOccurrence(client, workspaceId, occurrenceId));
            return reply.status(200).send(
              validateResponse(RoutineOccurrenceResponseSchema, {
                data: occurrence,
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
            const occurrence =
              (lockedReceipt.resultPayload?.occurrence as RoutineOccurrence) ||
              (await getOccurrence(client, workspaceId, occurrenceId));
            return reply.status(200).send(
              validateResponse(RoutineOccurrenceResponseSchema, {
                data: occurrence,
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }

          const occurrence = await completeOccurrenceService(
            client,
            workspaceId,
            occurrenceId,
            actorUserId,
            body.baseRevision,
            operationId,
            { routineId: body.routineId, scheduledDate: body.scheduledDate }
          );

          await insertMutationReceipt(client, {
            workspaceId,
            actorUserId,
            deviceId,
            operationId,
            command: 'completeOccurrence',
            entityType: 'routine_occurrence',
            entityId: occurrenceId,
            schemaVersion: 1,
            baseRevision: body.baseRevision,
            canonicalPayloadHash: payloadHash,
            status: 'accepted',
            acceptedRevision: occurrence.serverRevision,
            appliedChangeSeq: occurrence.seq,
            resultPayload: { occurrence },
          });

          return reply.status(200).send(
            validateResponse(RoutineOccurrenceResponseSchema, {
              data: occurrence,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        }

        const occurrence = await completeOccurrenceService(
          client,
          workspaceId,
          occurrenceId,
          actorUserId,
          body.baseRevision,
          undefined,
          { routineId: body.routineId, scheduledDate: body.scheduledDate }
        );

        return reply.status(200).send(
          validateResponse(RoutineOccurrenceResponseSchema, {
            data: occurrence,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 10. Skip Occurrence
  app.post(
    '/v1/workspaces/:workspaceId/routines/occurrences/:occurrenceId/skip',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, occurrenceId } = OccurrenceParamsSchema.parse(request.params);
      const body = SkipOccurrenceRequestSchema.parse(request.body);
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
            command: 'skipOccurrence',
            commandVersion: 1,
            schemaVersion: 1,
            entityType: 'routine_occurrence',
            entityId: occurrenceId,
            baseRevision: body.baseRevision,
            payload: body as Record<string, unknown>,
          });

          const receipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
          if (receipt) {
            if (receipt.canonicalPayloadHash !== payloadHash) {
              throw new ConflictError(
                'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
              );
            }
            const occurrence =
              (receipt.resultPayload?.occurrence as RoutineOccurrence) ||
              (await getOccurrence(client, workspaceId, occurrenceId));
            return reply.status(200).send(
              validateResponse(RoutineOccurrenceResponseSchema, {
                data: occurrence,
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
            const occurrence =
              (lockedReceipt.resultPayload?.occurrence as RoutineOccurrence) ||
              (await getOccurrence(client, workspaceId, occurrenceId));
            return reply.status(200).send(
              validateResponse(RoutineOccurrenceResponseSchema, {
                data: occurrence,
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }

          const occurrence = await skipOccurrenceService(
            client,
            workspaceId,
            occurrenceId,
            actorUserId,
            body.baseRevision,
            operationId,
            { routineId: body.routineId, scheduledDate: body.scheduledDate }
          );

          await insertMutationReceipt(client, {
            workspaceId,
            actorUserId,
            deviceId,
            operationId,
            command: 'skipOccurrence',
            entityType: 'routine_occurrence',
            entityId: occurrenceId,
            schemaVersion: 1,
            baseRevision: body.baseRevision,
            canonicalPayloadHash: payloadHash,
            status: 'accepted',
            acceptedRevision: occurrence.serverRevision,
            appliedChangeSeq: occurrence.seq,
            resultPayload: { occurrence },
          });

          return reply.status(200).send(
            validateResponse(RoutineOccurrenceResponseSchema, {
              data: occurrence,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        }

        const occurrence = await skipOccurrenceService(
          client,
          workspaceId,
          occurrenceId,
          actorUserId,
          body.baseRevision,
          undefined,
          { routineId: body.routineId, scheduledDate: body.scheduledDate }
        );

        return reply.status(200).send(
          validateResponse(RoutineOccurrenceResponseSchema, {
            data: occurrence,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 11. Reopen Occurrence
  app.post(
    '/v1/workspaces/:workspaceId/routines/occurrences/:occurrenceId/reopen',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, occurrenceId } = OccurrenceParamsSchema.parse(request.params);
      const body = ReopenOccurrenceRequestSchema.parse(request.body);
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
            command: 'reopenOccurrence',
            commandVersion: 1,
            schemaVersion: 1,
            entityType: 'routine_occurrence',
            entityId: occurrenceId,
            baseRevision: body.baseRevision,
            payload: body as Record<string, unknown>,
          });

          const receipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
          if (receipt) {
            if (receipt.canonicalPayloadHash !== payloadHash) {
              throw new ConflictError(
                'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
              );
            }
            const occurrence =
              (receipt.resultPayload?.occurrence as RoutineOccurrence) ||
              (await getOccurrence(client, workspaceId, occurrenceId));
            return reply.status(200).send(
              validateResponse(RoutineOccurrenceResponseSchema, {
                data: occurrence,
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
            const occurrence =
              (lockedReceipt.resultPayload?.occurrence as RoutineOccurrence) ||
              (await getOccurrence(client, workspaceId, occurrenceId));
            return reply.status(200).send(
              validateResponse(RoutineOccurrenceResponseSchema, {
                data: occurrence,
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }

          const occurrence = await reopenOccurrenceService(
            client,
            workspaceId,
            occurrenceId,
            actorUserId,
            body.baseRevision,
            operationId
          );

          await insertMutationReceipt(client, {
            workspaceId,
            actorUserId,
            deviceId,
            operationId,
            command: 'reopenOccurrence',
            entityType: 'routine_occurrence',
            entityId: occurrenceId,
            schemaVersion: 1,
            baseRevision: body.baseRevision,
            canonicalPayloadHash: payloadHash,
            status: 'accepted',
            acceptedRevision: occurrence.serverRevision,
            appliedChangeSeq: occurrence.seq,
            resultPayload: { occurrence },
          });

          return reply.status(200).send(
            validateResponse(RoutineOccurrenceResponseSchema, {
              data: occurrence,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        }

        const occurrence = await reopenOccurrenceService(
          client,
          workspaceId,
          occurrenceId,
          actorUserId,
          body.baseRevision
        );

        return reply.status(200).send(
          validateResponse(RoutineOccurrenceResponseSchema, {
            data: occurrence,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );
}
