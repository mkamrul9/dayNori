import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  BillingCatalogResponseSchema,
  BillingEntitlementResponseSchema,
  BillingEventIngestRequestSchema,
  BillingEventIngestResponseSchema,
  BillingUsageResponseSchema,
  RestorePurchasesRequestSchema,
  RestorePurchasesResponseSchema,
  VerifyPurchaseRequestSchema,
  VerifyPurchaseResponseSchema,
  WorkspaceParamsSchema,
} from '@daynori/contracts';
import { withUserContext, withTenantContext } from '../../db/index.js';
import { validateResponse } from '../../plugins/errorHandler.js';
import {
  BillingServiceError,
  getBillingCatalog,
  getBillingUsage,
  getEntitlement,
  ingestBillingEvent,
  restorePurchases,
  verifyAndGrantPurchase,
} from '../../modules/billing/service.js';

function meta(requestId: string) {
  return { requestId, serverTime: new Date().toISOString() };
}

function sendBillingError(
  err: unknown,
  reply: { status: (n: number) => { send: (b: unknown) => unknown } }
) {
  if (err instanceof BillingServiceError) {
    return reply.status(err.statusCode).send({
      error: { message: err.message, code: err.code },
    });
  }
  throw err;
}

export function registerBillingRoutes(app: FastifyInstance, pool: Pool): void {
  app.get('/v1/billing/catalog', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    try {
      const data = await getBillingCatalog();
      return reply.send(
        validateResponse(BillingCatalogResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendBillingError(err, reply);
    }
  });

  app.get('/v1/billing/entitlement', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        getEntitlement(client, actor.userId)
      );
      return reply.send(
        validateResponse(BillingEntitlementResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendBillingError(err, reply);
    }
  });

  app.get('/v1/workspaces/:workspaceId/billing/usage', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    try {
      const data = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId },
        (client) => getBillingUsage(client, actor.userId, workspaceId)
      );
      return reply.send(
        validateResponse(BillingUsageResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendBillingError(err, reply);
    }
  });

  app.post('/v1/billing/purchases/verify', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = VerifyPurchaseRequestSchema.parse(request.body);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        verifyAndGrantPurchase(client, {
          userId: actor.userId,
          provider: body.provider,
          productId: body.productId,
          purchaseToken: body.purchaseToken,
          obfuscatedAccountId: body.obfuscatedAccountId ?? actor.userId,
        })
      );
      return reply.send(
        validateResponse(VerifyPurchaseResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendBillingError(err, reply);
    }
  });

  app.post('/v1/billing/purchases/restore', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = RestorePurchasesRequestSchema.parse(request.body);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        restorePurchases(client, {
          userId: actor.userId,
          provider: body.provider,
          purchaseTokens: body.purchaseTokens,
        })
      );
      return reply.send(
        validateResponse(RestorePurchasesResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendBillingError(err, reply);
    }
  });

  app.post('/v1/billing/events', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = BillingEventIngestRequestSchema.parse(request.body);
    try {
      // Local harness: authenticated user may submit labeled fake RTDN.
      // Production Pub/Sub path would authenticate via OIDC push, not end-user JWT.
      const data = await withUserContext(pool, actor.userId, (client) =>
        ingestBillingEvent(client, {
          provider: body.provider,
          messageId: body.messageId,
          eventType: body.eventType,
          purchaseToken: body.purchaseToken,
          authenticity: body.authenticity,
        })
      );
      return reply.status(202).send(
        validateResponse(BillingEventIngestResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendBillingError(err, reply);
    }
  });
}
