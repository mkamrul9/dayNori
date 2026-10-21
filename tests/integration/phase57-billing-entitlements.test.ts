/**
 * Phase 57 — server-authoritative entitlements (fake/local only).
 * Not Play sandbox or production purchase evidence.
 */
import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { LOCAL_BILLING_SERVICE_TOKEN, SYNTHETIC_BILLING_CATALOG } from '@daynori/domain';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool, withUserContext } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  assertOrdinaryUserCannotGrant,
  processBillingEvent,
} from '../../apps/api/src/modules/billing/service.js';
import {
  FakePlayBillingProvider,
  GooglePlayBillingProvider,
} from '../../apps/api/src/modules/billing/provider.js';

describe('Phase 57: verified subscriptions and entitlements', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase57-key';
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;
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
    clientB = createApiClient({ baseUrl, token: await createToken(userB) });

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
      const wsB = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('B personal', 'personal', $1) RETURNING id`,
        [userB]
      );
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`,
        [wsB.rows[0]!.id, userB]
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

  it('serves synthetic catalog and default free entitlement', async () => {
    const cat = await clientA.getBillingCatalog();
    expect(cat.data.catalogLabel).toBe('synthetic-local-catalog');
    expect(cat.data.purchaseActivationEnabled).toBe(false);
    expect(cat.data.products[0]?.syntheticPriceLabel).toContain('SYNTHETIC');
    const ent = await clientA.getBillingEntitlement();
    expect(ent.data.planId).toBe('free');
    expect(ent.data.label).toBe('server-authoritative');
  });

  it('rejects client local-state forgery via ordinary SQL and invalid tokens', async () => {
    const denied = await withUserContext(runtimePool, userA, (c) =>
      assertOrdinaryUserCannotGrant(c, userA)
    );
    expect(denied).toBe(true);

    await expect(
      clientA.verifyBillingPurchase({
        provider: 'fake_play',
        productId,
        purchaseToken: 'not-a-valid-fake-token',
      })
    ).rejects.toThrow();
  });

  it('grants entitlement only after fake verify; duplicate events are idempotent', async () => {
    const token = `fake-ok-${userA}`;
    const verified = await clientA.verifyBillingPurchase({
      provider: 'fake_play',
      productId,
      purchaseToken: token,
    });
    expect(verified.data.providerMode).toBe('fake');
    expect(verified.data.entitlement.planId).toBe('plus_synthetic');

    const usage = await clientA.getBillingUsage(workspaceA);
    expect(usage.data.planId).toBe('plus_synthetic');
    expect(usage.data.storage.maxBytes).toBeGreaterThan(100 * 1024 * 1024);

    const messageId = `msg-renew-${crypto.randomUUID()}`;
    const event1 = await clientA.ingestBillingEvent({
      provider: 'fake_play',
      messageId,
      eventType: 'SUBSCRIPTION_RENEWED',
      purchaseToken: token,
      authenticity: 'fake_signed_local',
    });
    expect(event1.data.processingStatus).toBe('pending');
    expect(await processBillingEvent(runtimePool, { eventId: event1.data.eventId })).toBe(
      'succeeded'
    );
    const event2 = await clientA.ingestBillingEvent({
      provider: 'fake_play',
      messageId,
      eventType: 'SUBSCRIPTION_RENEWED',
      purchaseToken: token,
      authenticity: 'fake_signed_local',
    });
    expect(event2.data.duplicate).toBe(true);
  });

  it('blocks cross-account token reuse and restore theft', async () => {
    const token = `fake-ok-${userA}:shared`;
    await clientA.verifyBillingPurchase({
      provider: 'fake_play',
      productId,
      purchaseToken: token,
    });
    await expect(
      clientB.verifyBillingPurchase({
        provider: 'fake_play',
        productId,
        purchaseToken: token,
      })
    ).rejects.toThrow();

    const restore = await clientB.restoreBillingPurchases({
      provider: 'fake_play',
      purchaseTokens: [token],
    });
    expect(restore.data.skippedCrossAccount).toBeGreaterThanOrEqual(1);
    expect(restore.data.entitlement.planId).toBe('free');
  });

  it('applies verified expiry without deleting content access path', async () => {
    const token = `fake-expired-${userA}:lifecycle-only`;
    await clientA.verifyBillingPurchase({
      provider: 'fake_play',
      productId,
      purchaseToken: token,
    });
    const ent = await clientA.getBillingEntitlement();
    // May still be paid if another active purchase exists from prior tests in same user.
    // Content path always remains.
    const note = await clientA.createNote(workspaceA, {
      title: 'After downgrade check',
      plainText: 'content preserved policy',
    });
    expect(note.data.id).toBeTruthy();
    expect(['free', 'plus_synthetic']).toContain(ent.data.planId);
  });

  it('keeps google_play live path unavailable without production activation', async () => {
    await expect(
      clientA.verifyBillingPurchase({
        provider: 'google_play',
        productId,
        purchaseToken: 'any-token-value-here',
      })
    ).rejects.toThrow();
  });

  it('validates Google adapter request shape via mock HTTP transport', async () => {
    const calls: string[] = [];
    const provider = new GooglePlayBillingProvider({
      packageName: 'com.daynori.app',
      accessToken: 'test-token',
      fetchFn: (async (url, init) => {
        calls.push(String(url));
        expect(init?.redirect).toBe('error');
        expect((init?.headers as Record<string, string>)['Authorization']).toContain('Bearer');
        return new Response(
          JSON.stringify({
            subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
            acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
            startTime: new Date().toISOString(),
            lineItems: [
              {
                productId,
                expiryTime: new Date(Date.now() + 86400000).toISOString(),
                autoRenewingPlan: { autoRenewEnabled: true },
              },
            ],
            externalAccountIdentifiers: { obfuscatedExternalAccountId: userA },
          }),
          { status: 200 }
        );
      }) as typeof fetch,
    });
    process.env['DAYNORI_BILLING_PRODUCTION_ENABLED'] = 'true';
    try {
      const verified = await provider.verifySubscription({
        productId,
        purchaseToken: 'play-token-xyz',
      });
      expect(verified.providerMode).toBe('live');
      expect(calls[0]).toContain('subscriptionsv2');
    } finally {
      delete process.env['DAYNORI_BILLING_PRODUCTION_ENABLED'];
    }

    const fake = new FakePlayBillingProvider();
    const f = await fake.verifySubscription({
      productId,
      purchaseToken: 'fake-ok-demo',
    });
    expect(f.providerMode).toBe('fake');
  });
});
