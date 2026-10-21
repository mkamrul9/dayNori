/**
 * Phase 57 repair — authority, lifecycle, durable processing, quota binding.
 */
import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  LOCAL_BILLING_SERVICE_TOKEN,
  SYNTHETIC_BILLING_CATALOG,
  mapVerifiedSubscriptionToAccess,
} from '@daynori/domain';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import {
  createAdminPool,
  createRuntimePool,
  withUserContext,
} from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  assertOrdinaryHelperBypassDenied,
  assertOrdinaryUserCannotGrant,
  processBillingEvent,
} from '../../apps/api/src/modules/billing/service.js';

describe('Phase 57 repair: billing authority and lifecycle', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase57-repair-key';
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  let clientA: DaynoriApiClient;
  let workspaceA: string;
  const productId = SYNTHETIC_BILLING_CATALOG.products[0]!.productId;

  async function createToken(uid: string): Promise<string> {
    return new SignJWT({
      sub: uid,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(keyPair.privateKey);
  }

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DAYNORI_BILLING_LOCAL_ENABLED'] = 'true';
    process.env['DAYNORI_BILLING_SERVICE_TOKEN'] = LOCAL_BILLING_SERVICE_TOKEN;
    delete process.env['DAYNORI_BILLING_PRODUCTION_ENABLED'];

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();
    await new Migrator().migrate();

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    const jwks: JSONWebKeySet = { keys: [publicJwk] };

    server = buildServer({
      jwtVerifier: new JwtVerifier({ issuer, audience, localJwks: jwks }),
      runtimePool,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
      enableChatPublicationRecovery: false,
    });
    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('no address');
    baseUrl = `http://127.0.0.1:${addr.port}`;
    clientA = createApiClient({ baseUrl, token: await createToken(userA) });

    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1,'A'), ($2,'B') ON CONFLICT DO NOTHING`,
        [userA, userB]
      );
      const ws = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('A personal', 'personal', $1) RETURNING id`,
        [userA]
      );
      workspaceA = ws.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`,
        [workspaceA, userA]
      );
    } finally {
      setup.release();
    }
  }, 120_000);

  afterAll(async () => {
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  it('maps Play states explicitly (unit)', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(
      mapVerifiedSubscriptionToAccess({
        subscriptionState: 'SUBSCRIPTION_STATE_PENDING',
        validUntilIso: future,
      }).grantsPaidAccess
    ).toBe(false);
    expect(
      mapVerifiedSubscriptionToAccess({
        subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
        validUntilIso: future,
      })
    ).toEqual({ status: 'canceled', grantsPaidAccess: true });
    expect(
      mapVerifiedSubscriptionToAccess({
        subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
        validUntilIso: past,
      }).grantsPaidAccess
    ).toBe(false);
    expect(
      mapVerifiedSubscriptionToAccess({
        subscriptionState: 'ACTIVE',
        validUntilIso: future,
      }).grantsPaidAccess
    ).toBe(false);
  });

  it('denies ordinary helper privilege escalation', async () => {
    const deniedInsert = await withUserContext(runtimePool, userA, (c) =>
      assertOrdinaryUserCannotGrant(c, userA)
    );
    expect(deniedInsert).toBe(true);
    const deniedHelper = await withUserContext(runtimePool, userA, (c) =>
      assertOrdinaryHelperBypassDenied(c, userA)
    );
    expect(deniedHelper).toBe(true);
    const anon = await runtimePool.connect();
    try {
      await anon.query('BEGIN');
      await expect(
        anon.query(`SELECT app.billing_load_event($1)`, [crypto.randomUUID()])
      ).rejects.toThrow(/BILLING_AUTHORITY_REQUIRED/);
      await anon.query('ROLLBACK');
    } finally {
      anon.release();
    }
  });

  it('handles pending, canceled-with-validity, and expiry without paid forgery', async () => {
    await expect(
      clientA.verifyBillingPurchase({
        provider: 'fake_play',
        productId,
        purchaseToken: `fake-pending-${userA}`,
      })
    ).resolves.toMatchObject({ data: { entitlement: { planId: 'free' } } });

    const canceled = await clientA.verifyBillingPurchase({
      provider: 'fake_play',
      productId,
      purchaseToken: `fake-canceled-${userA}`,
    });
    expect(canceled.data.entitlement.planId).toBe('plus_synthetic');
    expect(['canceled', 'active']).toContain(canceled.data.entitlement.status);

    const expired = await clientA.verifyBillingPurchase({
      provider: 'fake_play',
      productId,
      purchaseToken: `fake-expired-${userA}:overlap`,
    });
    // Another valid canceled purchase still present — expired token must not wipe it.
    expect(expired.data.entitlement.planId).toBe('plus_synthetic');
  });

  it('processes synthetic events durably without RTDN overriding verified state', async () => {
    const token = `fake-ok-${userA}:event`;
    await clientA.verifyBillingPurchase({
      provider: 'fake_play',
      productId,
      purchaseToken: token,
    });
    const ingest = await clientA.ingestBillingEvent({
      provider: 'fake_play',
      messageId: `msg-${crypto.randomUUID()}`,
      eventType: 'SUBSCRIPTION_EXPIRED',
      purchaseToken: token,
      authenticity: 'fake_signed_local',
    });
    expect(ingest.data.processingStatus).toBe('pending');

    const result = await processBillingEvent(runtimePool, { eventId: ingest.data.eventId });
    // Fake verify still returns ACTIVE for fake-ok — event label must not force expiry.
    expect(result).toBe('succeeded');
    const ent = await clientA.getBillingEntitlement();
    expect(ent.data.planId).toBe('plus_synthetic');
  });

  it('acknowledges pending fake purchases', async () => {
    const token = `fake-ok-${userA}:ack`;
    const first = await clientA.verifyBillingPurchase({
      provider: 'fake_play',
      productId,
      purchaseToken: token,
    });
    expect(first.data.acknowledgementState).toBe('ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED');
  });

  it('syncs storage ceiling on paid grant via authority path', async () => {
    await clientA.verifyBillingPurchase({
      provider: 'fake_play',
      productId,
      purchaseToken: `fake-ok-${userA}:quota`,
    });
    const usage = await clientA.getBillingUsage(workspaceA);
    expect(usage.data.storage.maxBytes).toBeGreaterThan(100 * 1024 * 1024);
    expect(usage.data.ai.monthlyTokenLimit).toBe(500_000);
  });

  it('rejects wrong service token activation', async () => {
    await expect(
      withUserContext(runtimePool, userB, async (c) => {
        await c.query(`SELECT app.billing_activate_service_session($1)`, [
          'wrong-token-value-here!!',
        ]);
      })
    ).rejects.toThrow(/BILLING_AUTHORITY_REQUIRED/);
  });
});
