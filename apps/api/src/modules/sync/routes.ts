import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  SyncPushRequestSchema,
  SyncPushResponseSchema,
  SyncPullQuerySchema,
  SyncPullResponseSchema,
  SyncBootstrapQuerySchema,
  SyncBootstrapResponseSchema,
  type SyncPushResponse,
  type SyncPullResponse,
  type SyncBootstrapResponse,
} from '@daynori/contracts';
import { SyncService } from './service.js';
import { validateResponse } from '../../plugins/errorHandler.js';

export function registerSyncRoutes(app: FastifyInstance, runtimePool: Pool): void {
  const syncService = new SyncService(runtimePool);

  // POST /v1/sync/push — Push batch mutations with durable idempotency
  app.post('/v1/sync/push', async (request, reply): Promise<SyncPushResponse> => {
    const actor = request.actor!;
    const body = SyncPushRequestSchema.parse(request.body);

    const results = await syncService.pushBatch(actor.userId, body.commands);

    const payload: SyncPushResponse = {
      data: {
        results,
      },
      meta: {
        requestId: request.id,
        serverTime: new Date().toISOString(),
      },
    };

    return reply.status(200).send(validateResponse(SyncPushResponseSchema, payload));
  });

  // GET /v1/sync/pull — Pull ordered workspace changes using opaque checkpoint cursor
  app.get('/v1/sync/pull', async (request, reply): Promise<SyncPullResponse> => {
    const actor = request.actor!;
    const query = SyncPullQuerySchema.parse(request.query);

    const { changes, nextCursor, hasMore, accessEpoch } = await syncService.pull(
      actor.userId,
      query
    );

    const payload: SyncPullResponse = {
      data: {
        changes,
        nextCursor,
        hasMore,
        accessEpoch,
      },
      meta: {
        requestId: request.id,
        serverTime: new Date().toISOString(),
        cursor: nextCursor,
      },
    };

    return reply.status(200).send(validateResponse(SyncPullResponseSchema, payload));
  });

  // GET /v1/sync/bootstrap — Bootstrap workspace items and high-watermark sync cursor
  app.get('/v1/sync/bootstrap', async (request, reply): Promise<SyncBootstrapResponse> => {
    const actor = request.actor!;
    const query = SyncBootstrapQuerySchema.parse(request.query);

    const {
      items,
      folders,
      tags,
      itemTags,
      itemLinks,
      routines,
      routineOccurrences,
      journalEntries,
      watermarkCursor,
      accessEpoch,
    } = await syncService.bootstrap(actor.userId, query.workspaceId);

    const payload: SyncBootstrapResponse = {
      data: {
        items,
        folders,
        tags,
        itemTags,
        itemLinks,
        routines,
        routineOccurrences,
        journalEntries,
        watermarkCursor,
        accessEpoch,
      },
      meta: {
        requestId: request.id,
        serverTime: new Date().toISOString(),
        cursor: watermarkCursor,
      },
    };

    return reply.status(200).send(validateResponse(SyncBootstrapResponseSchema, payload));
  });
}
