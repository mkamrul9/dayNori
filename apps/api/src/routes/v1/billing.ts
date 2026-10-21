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
import { withTenantContext } from '../../db/index.js';
import { validateResponse } from '../../plugins/errorHandler.js';
import {
  BillingServiceError,
  getBillingCatalog,
  getBillingUsage,
  getEntitlement,
  ingestProviderBillingNotification,
  ingestSyntheticBillingEvent,
  restorePurchases,
  verifyAndGrantPurchase,
  withBillingAuthority,
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
      const data = await withBillingAuthority(pool, actor.userId, (client) =>
        getEntitlement(client, actor.userId, { persistExpiry: true })
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
        async (client) => {
          const { activateBillingAuthority } = await import('../../modules/billing/service.js');
          await activateBillingAuthority(client);
          return getBillingUsage(client, actor.userId, workspaceId);
        }
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
      const data = await withBillingAuthority(pool, actor.userId, (client) =>
        verifyAndGrantPurchase(client, {
          userId: actor.userId,
          provider: body.provider,
          productId: body.productId,
          purchaseToken: body.purchaseToken,
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
      const data = await withBillingAuthority(pool, actor.userId, (client) =>
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

  app.post('/v1/billing/events/synthetic', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = BillingEventIngestRequestSchema.parse(request.body);
    try {
      if (body.provider !== 'fake_play' || body.authenticity !== 'fake_signed_local') {
        throw new BillingServiceError(
          'Synthetic harness requires fake_play + fake_signed_local',
          400,
          'BILLING_EVENT_AUTH_INVALID'
        );
      }
      const data = await withBillingAuthority(pool, actor.userId, (client) =>
        ingestSyntheticBillingEvent(client, {
          provider: 'fake_play',
          messageId: body.messageId,
          eventType: body.eventType,
          purchaseToken: body.purchaseToken,
        })
      );
      return reply.status(202).send(
        validateResponse(BillingEventIngestResponseSchema, { data, meta: meta(request.id) })
      );
    } catch (err) {
      return sendBillingError(err, reply);
    }
  });

  // Legacy path: keep /v1/billing/events as synthetic-only alias (explicitly not provider OIDC).
  app.post('/v1/billing/events', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = BillingEventIngestRequestSchema.parse(request.body);
    try {
      if (body.authenticity === 'google_pubsub_oidc') {
        const data = await withBillingAuthority(pool, actor.userId, (client) =>
          ingestProviderBillingNotification(client, {
            provider: 'google_play',
            messageId: body.messageId,
            eventType: body.eventType,
            purchaseToken: body.purchaseToken,
            oidcVerified: false,
          })
        );
        return reply.status(202).send(
          validateResponse(BillingEventIngestResponseSchema, { data, meta: meta(request.id) })
        );
      }
      if (body.provider !== 'fake_play') {
        throw new BillingServiceError(
          'End-user event ingest is synthetic fake_play only',
          400,
          'BILLING_EVENT_AUTH_INVALID'
        );
      }
      const data = await withBillingAuthority(pool, actor.userId, (client) =>
        ingestSyntheticBillingEvent(client, {
          provider: 'fake_play',
          messageId: body.messageId,
          eventType: body.eventType,
          purchaseToken: body.purchaseToken,
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
