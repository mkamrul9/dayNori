import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  CreateCalendarEventRequestSchema,
  UpdateCalendarEventRequestSchema,
  CalendarFeedQuerySchema,
  CalendarEventResponseSchema,
  CalendarReadModelResponseSchema,
  WorkspaceParamsSchema,
  type CalendarEvent,
} from '@daynori/contracts';
import { withTenantContext } from '../../db/index.js';
import {
  createCalendarEvent,
  getCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarFeed,
} from '../../modules/calendar/service.js';
import {
  getMutationReceipt,
  insertMutationReceipt,
  lockWorkspaceSyncState,
} from '../../modules/sync/repository.js';
import { computeCanonicalPayloadHash } from '../../modules/sync/types.js';
import { validateResponse, ConflictError, NotFoundError } from '../../plugins/errorHandler.js';

const CalendarEventParamsSchema = WorkspaceParamsSchema.extend({
  eventId: z.string().uuid(),
});

export function registerCalendarRoutes(app: FastifyInstance, pool: Pool): void {
  // 1. Get Calendar Feed (unified read model)
  app.get('/v1/workspaces/:workspaceId/calendar/feed', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const query = CalendarFeedQuerySchema.parse(request.query);

    return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      const result = await getCalendarFeed(client, workspaceId, query);

      return reply.status(200).send(
        validateResponse(CalendarReadModelResponseSchema, {
          data: result,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 2. Create Standalone Calendar Event
  app.post(
    '/v1/workspaces/:workspaceId/calendar/events',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const body = CreateCalendarEventRequestSchema.parse(request.body);
      const operationId = (request.headers['idempotency-key'] ||
        request.headers['x-operation-id']) as string | undefined;
      const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';

      return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        if (operationId) {
          const payloadHash = computeCanonicalPayloadHash({
            workspaceId,
            command: 'createCalendarEvent',
            commandVersion: 1,
            schemaVersion: 1,
            entityType: 'item',
            entityId: body.id || operationId,
            baseRevision: 0,
            payload: body as Record<string, unknown>,
          });

          const receipt = await getMutationReceipt(client, actor.userId, deviceId, operationId);
          if (receipt) {
            if (receipt.canonicalPayloadHash !== payloadHash) {
              throw new ConflictError(
                'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
              );
            }
            const event =
              (receipt.resultPayload?.event as CalendarEvent) ||
              (await getCalendarEvent(client, workspaceId, receipt.entityId));
            return reply.status(200).send(
              validateResponse(CalendarEventResponseSchema, {
                data: event,
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }

          await lockWorkspaceSyncState(client, workspaceId);
          const lockedReceipt = await getMutationReceipt(
            client,
            actor.userId,
            deviceId,
            operationId
          );
          if (lockedReceipt) {
            const event =
              (lockedReceipt.resultPayload?.event as CalendarEvent) ||
              (await getCalendarEvent(client, workspaceId, lockedReceipt.entityId));
            return reply.status(200).send(
              validateResponse(CalendarEventResponseSchema, {
                data: event,
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }

          const event = await createCalendarEvent(
            client,
            workspaceId,
            actor.userId,
            body,
            operationId
          );

          await insertMutationReceipt(client, {
            workspaceId,
            actorUserId: actor.userId,
            deviceId,
            operationId,
            command: 'createCalendarEvent',
            entityType: 'item',
            entityId: event.id,
            schemaVersion: 1,
            baseRevision: 0,
            canonicalPayloadHash: payloadHash,
            status: 'accepted',
            acceptedRevision: event.revision,
            appliedChangeSeq: null,
            resultPayload: { event },
          });

          return reply.status(201).send(
            validateResponse(CalendarEventResponseSchema, {
              data: event,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        }

        const event = await createCalendarEvent(client, workspaceId, actor.userId, body);
        return reply.status(201).send(
          validateResponse(CalendarEventResponseSchema, {
            data: event,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 3. Get Calendar Event by ID
  app.get(
    '/v1/workspaces/:workspaceId/calendar/events/:eventId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      const { workspaceId, eventId } = CalendarEventParamsSchema.parse(request.params);

      return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        const event = await getCalendarEvent(client, workspaceId, eventId);

        return reply.status(200).send(
          validateResponse(CalendarEventResponseSchema, {
            data: event,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 4. Update Calendar Event
  app.patch(
    '/v1/workspaces/:workspaceId/calendar/events/:eventId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      const { workspaceId, eventId } = CalendarEventParamsSchema.parse(request.params);
      const body = UpdateCalendarEventRequestSchema.parse(request.body);
      const operationId = (request.headers['idempotency-key'] ||
        request.headers['x-operation-id']) as string | undefined;

      return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        const event = await updateCalendarEvent(
          client,
          workspaceId,
          eventId,
          actor.userId,
          body,
          operationId
        );

        return reply.status(200).send(
          validateResponse(CalendarEventResponseSchema, {
            data: event,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 5. Delete Calendar Event
  app.delete(
    '/v1/workspaces/:workspaceId/calendar/events/:eventId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      const { workspaceId, eventId } = CalendarEventParamsSchema.parse(request.params);
      const operationId = (request.headers['idempotency-key'] ||
        request.headers['x-operation-id']) as string | undefined;

      return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        const result = await deleteCalendarEvent(
          client,
          workspaceId,
          eventId,
          actor.userId,
          operationId
        );

        return reply.status(200).send({
          data: result,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        });
      });
    }
  );
}
