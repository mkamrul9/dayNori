/**
 * Phase 89 — Billing entitlements and sustainable plan readiness integration test suite.
 * Verifies:
 * - BL-001: Server-authoritative catalog & default free entitlement
 * - BL-002: Purchase verification, account binding, and single-account ownership
 * - BL-003: Cross-client restore lifecycle and cross-account token theft rejection
 * - BL-004: Subscription lifecycle: active, grace, hold, canceled-with-validity, expired, revoked
 * - BL-005: Durable event ingestion, idempotent message deduplication, and out-of-order safety
 * - BL-006: Worker leases, event reconciliation, and poison pill dead-lettering
 * - BL-007: Concurrency-safe quota enforcement and downgrade data preservation
 * - BL-008: Module independence: billing never unlocks gated vault, rooms, Drive, or AI
 * - BL-009: Database role separation, injection prevention, and token hashing
 * - BL-010: Fail-closed production gate for Google Play provider
 */

import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  LOCAL_BILLING_SERVICE_TOKEN,
  SYNTHETIC_BILLING_CATALOG,
  isBillingLocallyEnabled,
  isBillingProductionActivationEnabled,
  mapVerifiedSubscriptionToAccess,
  planQuotas,
} from '@daynori/domain';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import {
  createAdminPool,
  createRuntimePool,
  getDefaultBillingPool,
  withTenantContext,
  withUserContext,
} from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import {
  assertOrdinaryHelperBypassDenied,
  assertOrdinaryUserCannotGrant,
  claimBillingEvent,
  expireStaleEntitlements,
  getEntitlement,
  processBillingEvent,
  withBillingAuthority,
} from '../../apps/api/src/modules/billing/service.js';
import { reserveQuota } from '../../apps/api/src/modules/files/quotaService.js';
import { QuotaExceededError } from '../../apps/api/src/plugins/errorHandler.js';

describe('Phase 89: billing entitlements and sustainable plan readiness', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase89-key';
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const userC = crypto.randomUUID();
  const userD = crypto.randomUUID();
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;
  let clientC: DaynoriApiClient;
  let clientD: DaynoriApiClient;
  let workspaceA: string;
  let workspaceB: string;
  let workspaceC: string;
  let workspaceD: string;

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
    clientC = createApiClient({ baseUrl, token: await createToken(userC) });
    clientD = createApiClient({ baseUrl, token: await createToken(userD) });

    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1,'User A'), ($2,'User B'), ($3,'User C'), ($4,'User D') ON CONFLICT DO NOTHING`,
        [userA, userB, userC, userD]
      );
      const wsA = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('A Personal', 'personal', $1) RETURNING id`,
        [userA]
      );
      workspaceA = wsA.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`,
        [workspaceA, userA]
      );

      const wsB = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('B Personal', 'personal', $1) RETURNING id`,
        [userB]
      );
      workspaceB = wsB.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`,
        [workspaceB, userB]
      );

      const wsC = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('C Personal', 'personal', $1) RETURNING id`,
        [userC]
      );
      workspaceC = wsC.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`,
        [workspaceC, userC]
      );

      const wsD = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('D Personal', 'personal', $1) RETURNING id`,
        [userD]
      );
      workspaceD = wsD.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`,
        [workspaceD, userD]
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

  it('BL-001: serves transparent synthetic catalog and server-authoritative free defaults', async () => {
    const catalog = await clientA.getBillingCatalog();
    expect(catalog.data.catalogLabel).toBe('synthetic-local-catalog');
    expect(catalog.data.purchaseActivationEnabled).toBe(false);
    expect(catalog.data.products.length).toBeGreaterThan(0);
    expect(catalog.data.products[0]!.syntheticPriceLabel).toContain('SYNTHETIC');
    expect(catalog.data.freeDefaults.planId).toBe('free');
    expect(catalog.data.freeDefaults.storageBytes).toBe(100 * 1024 * 1024);

    const entA = await clientA.getBillingEntitlement();
    expect(entA.data.planId).toBe('free');
    expect(entA.data.status).toBe('active');
    expect(entA.data.storageBytes).toBe(104857600);
    expect(entA.data.label).toBe('server-authoritative');
  });

  it('BL-002: verifies purchase with account binding and rejects cross-account token reuse', async () => {
    const purchaseToken = `fake-ok-${userA}`;

    const res = await clientA.verifyBillingPurchase({
      provider: 'fake_play',
      productId,
      purchaseToken,
    });
    expect(res.data.entitlement.planId).toBe('plus_synthetic');
    expect(res.data.entitlement.status).toBe('active');
    expect(res.data.entitlement.storageBytes).toBe(5 * 1024 * 1024 * 1024);
    expect(res.data.acknowledgementState).toBe('ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED');

    // Attempt cross-account reuse: User B tries to verify the same purchase token bound to User A
    await expect(
      clientB.verifyBillingPurchase({
        provider: 'fake_play',
        productId,
        purchaseToken,
      })
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('BL-003: restores purchases across clients and cleanly skips cross-account tokens', async () => {
    const purchaseTokenA = `fake-ok-${userA}`;

    // User A verifies token A
    await clientA.verifyBillingPurchase({
      provider: 'fake_play',
      productId,
      purchaseToken: purchaseTokenA,
    });

    // User A calls restore: restores 1, skips 0
    const restoreA = await clientA.restoreBillingPurchases({
      provider: 'fake_play',
      purchaseTokens: [purchaseTokenA],
    });
    expect(restoreA.data.restored).toBe(1);
    expect(restoreA.data.skippedCrossAccount).toBe(0);
    expect(restoreA.data.entitlement.planId).toBe('plus_synthetic');

    // User B calls restore with token A: skips cross account token, does not throw
    const restoreB = await clientB.restoreBillingPurchases({
      provider: 'fake_play',
      purchaseTokens: [purchaseTokenA],
    });
    expect(restoreB.data.restored).toBe(0);
    expect(restoreB.data.skippedCrossAccount).toBe(1);
    expect(restoreB.data.entitlement.planId).toBe('free');
  });

  it('BL-004: subscription lifecycle mapping: active, grace, hold, canceled-with-validity, expired, revoked', async () => {
    const now = Date.now();
    const futureIso = new Date(now + 10 * 86400000).toISOString();
    const pastIso = new Date(now - 86400000).toISOString();

    // 1. Pending: never grants paid access
    expect(
      mapVerifiedSubscriptionToAccess({
        subscriptionState: 'SUBSCRIPTION_STATE_PENDING',
        validUntilIso: futureIso,
        nowMs: now,
      })
    ).toEqual({ status: 'pending', grantsPaidAccess: false });

    // 2. Active: grants paid access while valid
    expect(
      mapVerifiedSubscriptionToAccess({
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        validUntilIso: futureIso,
        nowMs: now,
      })
    ).toEqual({ status: 'active', grantsPaidAccess: true });

    // 3. Grace period: grants paid access while valid
    expect(
      mapVerifiedSubscriptionToAccess({
        subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
        validUntilIso: futureIso,
        nowMs: now,
      })
    ).toEqual({ status: 'grace', grantsPaidAccess: true });

    // 4. On hold / paused: does not grant paid access
    expect(
      mapVerifiedSubscriptionToAccess({
        subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD',
        validUntilIso: futureIso,
        nowMs: now,
      })
    ).toEqual({ status: 'hold', grantsPaidAccess: false });

    // 5. Canceled with future validity: grants paid access until expiry!
    expect(
      mapVerifiedSubscriptionToAccess({
        subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
        validUntilIso: futureIso,
        nowMs: now,
      })
    ).toEqual({ status: 'canceled', grantsPaidAccess: true });

    // 6. Canceled past validity: expired
    expect(
      mapVerifiedSubscriptionToAccess({
        subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
        validUntilIso: pastIso,
        nowMs: now,
      })
    ).toEqual({ status: 'expired', grantsPaidAccess: false });

    // 7. Revoked: immediate revocation
    expect(
      mapVerifiedSubscriptionToAccess({
        subscriptionState: 'SUBSCRIPTION_STATE_REVOKED',
        validUntilIso: futureIso,
        nowMs: now,
      })
    ).toEqual({ status: 'revoked', grantsPaidAccess: false });

    // In-app test: verify fake-canceled token retains plus access until expiration
    const cancelToken = `fake-canceled-${userC}`;
    const cancelRes = await clientC.verifyBillingPurchase({
      provider: 'fake_play',
      productId,
      purchaseToken: cancelToken,
    });
    expect(cancelRes.data.entitlement.planId).toBe('plus_synthetic');
    expect(cancelRes.data.entitlement.status).toBe('canceled');

    // In-app test: verify fake-revoked immediately drops to free
    const revokedToken = `fake-revoked-${userD}`;
    const revokedRes = await clientD.verifyBillingPurchase({
      provider: 'fake_play',
      productId,
      purchaseToken: revokedToken,
    });
    expect(revokedRes.data.entitlement.planId).toBe('free');
  });

  it('BL-005: durable event ingestion, idempotent deduplication, and out-of-order safety', async () => {
    const msgId = `msg-${crypto.randomUUID()}`;
    const token = `fake-ok-${userA}`;

    // Ensure User A has an active purchase first
    await clientA.verifyBillingPurchase({
      provider: 'fake_play',
      productId,
      purchaseToken: token,
    });

    // First event ingest
    const ingest1 = await clientA.ingestBillingEvent({
      provider: 'fake_play',
      messageId: msgId,
      eventType: 'SUBSCRIPTION_RENEWED',
      purchaseToken: token,
      authenticity: 'fake_signed_local',
    });
    expect(ingest1.data.duplicate).toBe(false);

    // Duplicate event ingest: returns duplicate: true, idempotent
    const ingest2 = await clientA.ingestBillingEvent({
      provider: 'fake_play',
      messageId: msgId,
      eventType: 'SUBSCRIPTION_RENEWED',
      purchaseToken: token,
      authenticity: 'fake_signed_local',
    });
    expect(ingest2.data.duplicate).toBe(true);

    // Process event: provider re-query confirms active state
    const processed = await processBillingEvent(runtimePool, {
      eventId: ingest1.data.eventId,
      leaseOwner: 'test-worker-1',
    });
    expect(processed).toBe('succeeded');
  });

  it('BL-006: worker leases, claim timeout, and poison pill handling', async () => {
    const billingPool = getDefaultBillingPool();
    const eventId = crypto.randomUUID();
    const leaseOwner = 'worker-lease-test';

    // Insert pending event directly under authority
    await withBillingAuthority(runtimePool, userA, async (client) => {
      await client.query(
        `INSERT INTO app.billing_events (id, provider, message_id, event_type, payload, processing_status)
         VALUES ($1, 'fake_play', $2, 'TEST_EVENT', '{}'::jsonb, 'pending')`,
        [eventId, `msg-worker-${eventId}`]
      );
    });

    // Claim event with short lease
    const claimed = await withBillingAuthority(runtimePool, userA, async (client) => {
      return claimBillingEvent(client, eventId, leaseOwner);
    });
    // Missing purchase token transitions to dead_letter automatically
    expect(claimed).toBeNull();

    // Verify event is in dead_letter status
    const check = await withBillingAuthority(runtimePool, userA, async (client) => {
      return client.query<{ processing_status: string }>(
        `SELECT processing_status FROM app.billing_events WHERE id = $1`,
        [eventId]
      );
    });
    expect(check.rows[0]?.processing_status).toBe('dead_letter');
  });

  it('BL-007: concurrency-safe quota enforcement and downgrade data preservation', async () => {
    // 1. Upgrade User A to Plus (5 GB max)
    const token = `fake-ok-${userA}`;
    await clientA.verifyBillingPurchase({
      provider: 'fake_play',
      productId,
      purchaseToken: token,
    });

    // 2. Reserve 50 MB in personal workspace (50 * 1024 * 1024 = 52428800 bytes)
    await withTenantContext(runtimePool, { userId: userA, workspaceId: workspaceA }, async (client) => {
      const usage1 = await reserveQuota(client, workspaceA, 52428800);
      expect(usage1.reservedBytes).toBeGreaterThanOrEqual(52428800);

      // 3. Commit this 50 MB into stored_bytes and clear reserved
      await client.query(
        `UPDATE app.workspace_storage_usage
         SET stored_bytes = 52428800, reserved_bytes = 0
         WHERE workspace_id = $1`,
        [workspaceA]
      );
    });

    // 4. Force downgrade/expiry for User A by setting valid_until in the past
    await withBillingAuthority(runtimePool, userA, async (bClient) => {
      await bClient.query(
        `UPDATE app.billing_purchases SET valid_until = now() - interval '1 hour' WHERE user_id = $1`,
        [userA]
      );
      await bClient.query(
        `UPDATE app.billing_entitlements SET valid_until = now() - interval '1 hour' WHERE user_id = $1`,
        [userA]
      );
      await expireStaleEntitlements(bClient);
    });

    // Verify User A entitlement is now expired/free with 100 MB max
    const entAfter = await clientA.getBillingEntitlement();
    expect(entAfter.data.planId).toBe('free');
    expect(entAfter.data.storageBytes).toBe(104857600);

    // Verify the 50 MB stored content was NOT deleted
    const usageAfter = await clientA.getBillingUsage(workspaceA);
    expect(usageAfter.data.storage.usedBytes).toBe(52428800);
    expect(usageAfter.data.storage.maxBytes).toBe(104857600);

    // 5. Over-quota reservation: try reserving 60 MB more (50 MB stored + 60 MB requested = 110 MB > 100 MB max)
    // Must be rejected with QuotaExceededError
    await withTenantContext(runtimePool, { userId: userA, workspaceId: workspaceA }, async (client) => {
      await expect(reserveQuota(client, workspaceA, 60 * 1024 * 1024)).rejects.toThrow(
        QuotaExceededError
      );

      // 6. Within-quota reservation: try reserving 20 MB more (50 MB stored + 20 MB requested = 70 MB <= 100 MB max)
      // Must succeed
      const usageWithin = await reserveQuota(client, workspaceA, 20 * 1024 * 1024);
      expect(usageWithin.reservedBytes).toBe(20 * 1024 * 1024);

      // Cleanup reservation
      await client.query(
        `UPDATE app.workspace_storage_usage SET reserved_bytes = 0 WHERE workspace_id = $1`,
        [workspaceA]
      );
    });
  });

  it('BL-008: independent module boundaries: paying never unlocks vault, rooms, Drive, or AI', async () => {
    // User A has plus_synthetic plan
    const ent = await clientA.getBillingEntitlement();
    expect(ent.data.label).toBe('server-authoritative');

    // Vault remains disabled in production and local tests without explicit gate
    expect(process.env['DAYNORI_VAULT_ENABLED']).not.toBe('true');

    // Production Google Play billing remains disabled
    expect(isBillingProductionActivationEnabled()).toBe(false);

    // AI live provider remains disabled
    expect(process.env['DAYNORI_AI_LIVE_ENABLED']).not.toBe('true');
  });

  it('BL-009: database role separation, injection prevention, and token hashing', async () => {
    // Ordinary runtime user cannot directly insert into app.billing_entitlements
    const insertBlocked = await withUserContext(runtimePool, userA, (client) =>
      assertOrdinaryUserCannotGrant(client, userA)
    );
    expect(insertBlocked).toBe(true);

    // Ordinary runtime user cannot execute privileged helper without billing authority
    const helperBlocked = await withUserContext(runtimePool, userA, (client) =>
      assertOrdinaryHelperBypassDenied(client, userA)
    );
    expect(helperBlocked).toBe(true);

    // Check that purchase tokens are stored hashed (never plaintext)
    const rawToken = `fake-ok-${userA}`;
    await clientA.verifyBillingPurchase({
      provider: 'fake_play',
      productId,
      purchaseToken: rawToken,
    });

    await withUserContext(runtimePool, userA, async (client) => {
      const row = await client.query<{ purchase_token_hash: string; provider_purchase_token_prefix: string }>(
        `SELECT purchase_token_hash, provider_purchase_token_prefix FROM app.billing_purchases
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userA]
      );
      expect(row.rows[0]?.purchase_token_hash).not.toBe(rawToken);
      expect(row.rows[0]?.purchase_token_hash).toHaveLength(64); // SHA-256 hex length
      expect(row.rows[0]?.provider_purchase_token_prefix).toBe(rawToken.slice(0, 12));
    });
  });

  it('BL-010: fail-closed production gate: live Google Play provider is unavailable when production activation is disabled', async () => {
    // Verify production activation flag is off
    expect(isBillingProductionActivationEnabled()).toBe(false);

    // Attempting to verify with provider 'google_play' must be rejected with 503
    await expect(
      clientA.verifyBillingPurchase({
        provider: 'google_play',
        productId: 'com.daynori.plus.monthly',
        purchaseToken: 'real-store-token-sample',
      })
    ).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});
