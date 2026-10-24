import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  AcceptUgcTermsRequestSchema,
  BlockUserRequestSchema,
  CreateUgcReportRequestSchema,
  ModerationReportListResponseSchema,
  UgcReportResponseSchema,
  UgcTermsStatusResponseSchema,
  UpdateModerationReportRequestSchema,
  UserBlockListResponseSchema,
  UserBlockResponseSchema,
} from '@daynori/contracts';
import { withUserContext } from '../../db/index.js';
import { NotFoundError, ValidationError, validateResponse } from '../../plugins/errorHandler.js';
import {
  SafetyServiceError,
  acceptUgcTerms,
  blockUser,
  createUgcReport,
  getUgcTermsStatus,
  listBlocks,
  listReportsForModeration,
  unblockUser,
  updateReportStatus,
} from '../../modules/safety/service.js';

function meta(requestId: string) {
  return { requestId, serverTime: new Date().toISOString() };
}

function sendSafetyError(
  err: unknown,
  reply: { status: (n: number) => { send: (b: unknown) => unknown } }
) {
  if (err instanceof SafetyServiceError) {
    return reply.status(err.statusCode).send({
      error: { message: err.message, code: err.code },
    });
  }
  if (err instanceof NotFoundError || err instanceof ValidationError) {
    throw err;
  }
  throw err;
}

export function registerSafetyRoutes(app: FastifyInstance, pool: Pool): void {
  app.get('/v1/safety/terms', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        getUgcTermsStatus(client, actor.userId)
      );
      return reply.send(
        validateResponse(UgcTermsStatusResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendSafetyError(err, reply);
    }
  });

  app.post('/v1/safety/terms/accept', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = AcceptUgcTermsRequestSchema.parse(request.body);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        acceptUgcTerms(client, { userId: actor.userId, policyVersion: body.policyVersion })
      );
      return reply.send(
        validateResponse(UgcTermsStatusResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendSafetyError(err, reply);
    }
  });

  app.post('/v1/safety/reports', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = CreateUgcReportRequestSchema.parse(request.body);
    try {
      const result = await withUserContext(pool, actor.userId, (client) =>
        createUgcReport(client, {
          reporterId: actor.userId,
          clientReportId: body.clientReportId,
          targetType: body.targetType,
          roomId: body.roomId,
          messageId: body.messageId,
          reportedUserId: body.reportedUserId,
          category: body.category,
          explanation: body.explanation,
        })
      );
      return reply.status(result.isReplay ? 200 : 201).send(
        validateResponse(UgcReportResponseSchema, {
          data: result.receipt,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendSafetyError(err, reply);
    }
  });

  app.get('/v1/safety/blocks', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    try {
      const blocks = await withUserContext(pool, actor.userId, (client) =>
        listBlocks(client, actor.userId)
      );
      return reply.send(
        validateResponse(UserBlockListResponseSchema, {
          data: { blocks },
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendSafetyError(err, reply);
    }
  });

  app.post('/v1/safety/blocks', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = BlockUserRequestSchema.parse(request.body);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        blockUser(client, { blockerId: actor.userId, blockedUserId: body.blockedUserId })
      );
      return reply.status(201).send(
        validateResponse(UserBlockResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendSafetyError(err, reply);
    }
  });

  app.delete('/v1/safety/blocks/:blockedUserId', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { blockedUserId } = z
      .object({ blockedUserId: z.string().uuid() })
      .parse(request.params);
    try {
      await withUserContext(pool, actor.userId, (client) =>
        unblockUser(client, { blockerId: actor.userId, blockedUserId })
      );
      return reply.status(204).send();
    } catch (err) {
      return sendSafetyError(err, reply);
    }
  });

  app.get('/v1/safety/moderation/reports', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    try {
      const reports = await withUserContext(pool, actor.userId, (client) =>
        listReportsForModeration(client, actor.userId)
      );
      return reply.send(
        validateResponse(ModerationReportListResponseSchema, {
          data: { reports },
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendSafetyError(err, reply);
    }
  });

  app.patch('/v1/safety/moderation/reports/:reportId', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { reportId } = z.object({ reportId: z.string().uuid() }).parse(request.params);
    const body = UpdateModerationReportRequestSchema.parse(request.body);
    try {
      const report = await withUserContext(pool, actor.userId, (client) =>
        updateReportStatus(client, {
          actorId: actor.userId,
          reportId,
          status: body.status,
          reason: body.reason,
          disposition: body.disposition,
        })
      );
      return reply.send(
        validateResponse(ModerationReportListResponseSchema, {
          data: { reports: [report] },
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendSafetyError(err, reply);
    }
  });
}
