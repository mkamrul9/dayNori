import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  AcceptAiConsentRequestSchema,
  AiConsentStatusResponseSchema,
  AiIndexResultResponseSchema,
  AiIndexSourceRequestSchema,
  AiPurgeResponseSchema,
  AiRetrieveRequestSchema,
  AiRetrieveResponseSchema,
  DisableAiRequestSchema,
} from '@daynori/contracts';
import { withUserContext } from '../../db/index.js';
import { NotFoundError, ValidationError, validateResponse } from '../../plugins/errorHandler.js';
import {
  AiServiceError,
  acceptAiConsent,
  disableAi,
  getAiConsentStatus,
  indexPersonalSource,
  purgeAiDerived,
  retrieveAuthorizedAnswer,
} from '../../modules/ai/service.js';

function meta(requestId: string) {
  return { requestId, serverTime: new Date().toISOString() };
}

function sendAiError(
  err: unknown,
  reply: { status: (n: number) => { send: (b: unknown) => unknown } }
) {
  if (err instanceof AiServiceError) {
    return reply.status(err.statusCode).send({
      error: { message: err.message, code: err.code },
    });
  }
  if (err instanceof NotFoundError || err instanceof ValidationError) {
    throw err;
  }
  throw err;
}

export function registerAiRoutes(app: FastifyInstance, pool: Pool): void {
  app.get('/v1/ai/consent', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        getAiConsentStatus(client, actor.userId)
      );
      return reply.send(
        validateResponse(AiConsentStatusResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendAiError(err, reply);
    }
  });

  app.post('/v1/ai/consent/accept', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = AcceptAiConsentRequestSchema.parse(request.body);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        acceptAiConsent(client, {
          userId: actor.userId,
          consentVersion: body.consentVersion,
          providerDisclosureVersion: body.providerDisclosureVersion,
          contentScope: body.contentScope,
        })
      );
      return reply.send(
        validateResponse(AiConsentStatusResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendAiError(err, reply);
    }
  });

  app.post('/v1/ai/consent/disable', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = DisableAiRequestSchema.parse(request.body ?? {});
    try {
      const result = await withUserContext(pool, actor.userId, (client) =>
        disableAi(client, { userId: actor.userId, purgeDerived: body.purgeDerived })
      );
      return reply.send(
        validateResponse(AiConsentStatusResponseSchema, {
          data: result.status,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendAiError(err, reply);
    }
  });

  app.post('/v1/ai/index', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = AiIndexSourceRequestSchema.parse(request.body);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        indexPersonalSource(client, {
          userId: actor.userId,
          workspaceId: body.workspaceId,
          itemId: body.itemId,
        })
      );
      return reply.send(
        validateResponse(AiIndexResultResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendAiError(err, reply);
    }
  });

  app.post('/v1/ai/retrieve', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = AiRetrieveRequestSchema.parse(request.body);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        retrieveAuthorizedAnswer(client, {
          userId: actor.userId,
          workspaceId: body.workspaceId,
          query: body.query,
          limit: body.limit,
        })
      );
      return reply.send(
        validateResponse(AiRetrieveResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendAiError(err, reply);
    }
  });

  app.post('/v1/ai/purge', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        purgeAiDerived(client, actor.userId)
      );
      return reply.send(
        validateResponse(AiPurgeResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendAiError(err, reply);
    }
  });
}
