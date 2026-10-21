/**
 * Phase 57 — Server-authoritative entitlements and purchase lifecycle (provisional local).
 * Clients cannot grant premium. Billing never unlocks vault/rooms/AI live features.
 */

import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  SYNTHETIC_BILLING_CATALOG,
  isBillingLocallyEnabled,
  isBillingProductionActivationEnabled,
  planQuotas,
  type BillingPlanId,
} from '@daynori/domain';
import { getStorageUsage } from '../files/quotaService.js';
import {
  BillingProviderError,
  resolveBillingProvider,
  type VerifiedSubscription,
} from './provider.js';

export class BillingServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'BillingServiceError';
  }
}

function assertBillingLocal(): void {
  if (!isBillingLocallyEnabled()) {
    throw new BillingServiceError('Billing unavailable', 403, 'BILLING_DISABLED');
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function tokenPrefix(token: string): string {
  return token.slice(0, 12);
}

function mapStateToEntitlementStatus(state: string): 'active' | 'grace' | 'hold' | 'expired' | 'revoked' {
  if (state.includes('ACTIVE') || state.includes('PENDING')) return 'active';
  if (state.includes('IN_GRACE')) return 'grace';
  if (state.includes('ON_HOLD') || state.includes('PAUSED')) return 'hold';
  if (state.includes('EXPIRED')) return 'expired';
  if (state.includes('REVOKED') || state.includes('CANCELED')) return 'revoked';
  return 'expired';
}

export async function getBillingCatalog() {
  assertBillingLocal();
  return {
    catalogLabel: 'synthetic-local-catalog' as const,
    purchaseActivationEnabled: isBillingProductionActivationEnabled(),
    products: SYNTHETIC_BILLING_CATALOG.products.map((p) => ({
      productId: p.productId,
      planId: p.planId,
      title: p.title,
      description: p.description,
      period: p.period,
      syntheticPriceLabel: p.syntheticPriceLabel,
      storageBytes: p.storageBytes,
      aiMonthlyTokens: p.aiMonthlyTokens,
      catalogLabel: 'synthetic-local-catalog' as const,
    })),
    freeDefaults: { ...SYNTHETIC_BILLING_CATALOG.freeDefaults },
  };
}

export async function getEntitlement(client: PoolClient, userId: string) {
  assertBillingLocal();
  const res = await client.query<{
    plan_id: string;
    status: string;
    valid_from: Date;
    valid_until: Date;
    storage_bytes: string;
    ai_monthly_tokens: number;
    source_purchase_id: string | null;
  }>(`SELECT * FROM app.billing_entitlements WHERE user_id = $1`, [userId]);
  const row = res.rows[0];
  if (!row) {
    const free = planQuotas('free');
    return {
      planId: 'free' as const,
      status: 'active' as const,
      validFrom: new Date(0).toISOString(),
      validUntil: new Date('9999-12-31T00:00:00.000Z').toISOString(),
      storageBytes: free.storageBytes,
      aiMonthlyTokens: free.aiMonthlyTokens,
      sourcePurchaseId: null,
      label: 'server-authoritative' as const,
    };
  }
  const until = row.valid_until.getTime();
  let status = row.status as 'active' | 'grace' | 'hold' | 'expired' | 'revoked';
  if (until <= Date.now() && status === 'active') {
    status = 'expired';
  }
  const planId = (status === 'expired' || status === 'revoked' ? 'free' : row.plan_id) as BillingPlanId;
  const quotas = planQuotas(planId === 'plus_synthetic' && status !== 'expired' ? 'plus_synthetic' : 'free');
  return {
    planId: status === 'active' || status === 'grace' ? (row.plan_id as BillingPlanId) : 'free',
    status,
    validFrom: row.valid_from.toISOString(),
    validUntil: row.valid_until.toISOString(),
    storageBytes:
      status === 'active' || status === 'grace' ? Number(row.storage_bytes) : quotas.storageBytes,
    aiMonthlyTokens:
      status === 'active' || status === 'grace'
        ? Number(row.ai_monthly_tokens)
        : quotas.aiMonthlyTokens,
    sourcePurchaseId: row.source_purchase_id,
    label: 'server-authoritative' as const,
  };
}

export async function getBillingUsage(client: PoolClient, userId: string, workspaceId: string) {
  const entitlement = await getEntitlement(client, userId);
  const storage = await getStorageUsage(client, workspaceId);
  return {
    planId: entitlement.planId,
    entitlementStatus: entitlement.status,
    storage: {
      usedBytes: storage.storedBytes,
      reservedBytes: storage.reservedBytes,
      maxBytes: storage.maxStorageBytes,
      availableBytes: storage.availableBytes,
    },
    ai: {
      monthlyTokenLimit: entitlement.aiMonthlyTokens,
      note: 'AI token budgets remain server-controlled (Phase 55); billing raises the plan ceiling only.',
    },
    downgradePolicy:
      'On expiry/refund/downgrade, existing personal content is preserved. New allocations may be refused when over quota. Read/export/delete remain available. Offline drafts are not discarded.',
  };
}

async function applyVerifiedPurchase(
  client: PoolClient,
  userId: string,
  verified: VerifiedSubscription
) {
  const product = await client.query<{
    plan_id: string;
    storage_bytes: string;
    ai_monthly_tokens: number;
  }>(`SELECT plan_id, storage_bytes, ai_monthly_tokens FROM app.billing_products WHERE product_id = $1`, [
    verified.productId,
  ]);
  if (!product.rows[0]) {
    throw new BillingServiceError('Unknown product', 400, 'BILLING_PRODUCT_UNKNOWN');
  }

  // Cross-account binding: token already owned by another user → reject.
  const existing = await client.query<{ user_id: string }>(
    `SELECT user_id FROM app.billing_purchases
     WHERE provider = $1 AND purchase_token_hash = $2`,
    [verified.provider, hashToken(verified.purchaseToken)]
  );
  if (existing.rows[0] && existing.rows[0].user_id !== userId) {
    throw new BillingServiceError(
      'Purchase token bound to another account',
      409,
      'BILLING_TOKEN_ACCOUNT_MISMATCH'
    );
  }

  if (
    verified.obfuscatedAccountId &&
    verified.obfuscatedAccountId !== userId
  ) {
    throw new BillingServiceError(
      'Purchase account identifier mismatch',
      409,
      'BILLING_ACCOUNT_MISMATCH'
    );
  }

  const entStatus = mapStateToEntitlementStatus(verified.subscriptionState);
  if (entStatus === 'expired' || entStatus === 'revoked') {
    // Still record purchase; grant free entitlements.
  } else if (entStatus !== 'active' && entStatus !== 'grace') {
    // hold: keep prior paid until policy says otherwise — record without expanding free→paid incorrectly
  }

  let purchaseId: string;
  try {
    const purchaseIdRes = await client.query<{ billing_insert_purchase: string }>(
      `SELECT app.billing_insert_purchase(
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz,$12,$13,$14::jsonb
       ) AS billing_insert_purchase`,
      [
        userId,
        verified.provider,
        verified.productId,
        hashToken(verified.purchaseToken),
        tokenPrefix(verified.purchaseToken),
        verified.obfuscatedAccountId,
        verified.orderId,
        verified.subscriptionState,
        verified.acknowledgementState,
        verified.validFrom,
        verified.validUntil,
        verified.autoRenewing,
        verified.linkedPurchaseToken ? hashToken(verified.linkedPurchaseToken) : null,
        JSON.stringify(verified.snapshot),
      ]
    );
    purchaseId = purchaseIdRes.rows[0]!.billing_insert_purchase;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('bound to another account')) {
      throw new BillingServiceError(
        'Purchase token bound to another account',
        409,
        'BILLING_TOKEN_ACCOUNT_MISMATCH'
      );
    }
    throw err;
  }
  const planId = product.rows[0]!.plan_id as BillingPlanId;
  const storageBytes = Number(product.rows[0]!.storage_bytes);
  const aiTokens = Number(product.rows[0]!.ai_monthly_tokens);

  if (entStatus === 'active' || entStatus === 'grace') {
    await client.query(
      `SELECT app.billing_upsert_entitlement_from_purchase(
         $1,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7,$8
       )`,
      [
        userId,
        purchaseId,
        planId,
        entStatus,
        verified.validFrom,
        verified.validUntil,
        storageBytes,
        aiTokens,
      ]
    );
  } else {
    const free = planQuotas('free');
    await client.query(
      `SELECT app.billing_upsert_entitlement_from_purchase(
         $1,$2,'free',$3,$4::timestamptz,$5::timestamptz,$6,$7
       )`,
      [
        userId,
        purchaseId,
        entStatus,
        verified.validFrom,
        verified.validUntil,
        free.storageBytes,
        free.aiMonthlyTokens,
      ]
    );
  }

  return { purchaseId, entitlement: await getEntitlement(client, userId) };
}

export async function verifyAndGrantPurchase(
  client: PoolClient,
  input: {
    userId: string;
    provider: 'fake_play' | 'google_play';
    productId: string;
    purchaseToken: string;
    obfuscatedAccountId?: string;
  }
) {
  assertBillingLocal();
  if (input.provider === 'google_play' && !isBillingProductionActivationEnabled()) {
    throw new BillingServiceError(
      'Google Play purchase activation disabled',
      503,
      'BILLING_PROVIDER_UNAVAILABLE'
    );
  }
  let verified: VerifiedSubscription;
  try {
    const provider = resolveBillingProvider(input.provider);
    verified = await provider.verifySubscription({
      productId: input.productId,
      purchaseToken: input.purchaseToken,
    });
  } catch (err) {
    if (err instanceof BillingProviderError) {
      throw new BillingServiceError(err.message, 400, err.code);
    }
    throw err;
  }
  // Prefer provider-reported account binding; client hint fills only when provider omits it.
  if (
    verified.obfuscatedAccountId &&
    input.obfuscatedAccountId &&
    verified.obfuscatedAccountId !== input.obfuscatedAccountId
  ) {
    throw new BillingServiceError(
      'Purchase account identifier mismatch',
      409,
      'BILLING_ACCOUNT_MISMATCH'
    );
  }
  if (!verified.obfuscatedAccountId && input.obfuscatedAccountId) {
    verified = { ...verified, obfuscatedAccountId: input.obfuscatedAccountId };
  }
  if (verified.obfuscatedAccountId && verified.obfuscatedAccountId !== input.userId) {
    throw new BillingServiceError(
      'Purchase account identifier mismatch',
      409,
      'BILLING_ACCOUNT_MISMATCH'
    );
  }
  const result = await applyVerifiedPurchase(client, input.userId, verified);
  return {
    purchaseId: result.purchaseId,
    entitlement: result.entitlement,
    acknowledgementState: verified.acknowledgementState,
    providerMode: verified.providerMode,
  };
}

export async function restorePurchases(
  client: PoolClient,
  input: {
    userId: string;
    provider: 'fake_play' | 'google_play';
    purchaseTokens: string[];
  }
) {
  assertBillingLocal();
  let restored = 0;
  let skippedCrossAccount = 0;
  for (const token of input.purchaseTokens) {
    try {
      await verifyAndGrantPurchase(client, {
        userId: input.userId,
        provider: input.provider,
        productId: SYNTHETIC_BILLING_CATALOG.products[0]!.productId,
        purchaseToken: token,
        obfuscatedAccountId: input.userId,
      });
      restored += 1;
    } catch (err) {
      if (
        err instanceof BillingServiceError &&
        (err.code === 'BILLING_TOKEN_ACCOUNT_MISMATCH' ||
          err.code === 'BILLING_ACCOUNT_MISMATCH')
      ) {
        skippedCrossAccount += 1;
        continue;
      }
      if (err instanceof BillingServiceError && err.code === 'BILLING_TOKEN_INVALID') {
        continue;
      }
      throw err;
    }
  }
  return {
    restored,
    skippedCrossAccount,
    entitlement: await getEntitlement(client, input.userId),
  };
}

export async function ingestBillingEvent(
  client: PoolClient,
  input: {
    provider: 'fake_play' | 'google_play';
    messageId: string;
    eventType: string;
    purchaseToken?: string;
    authenticity: 'fake_signed_local' | 'google_pubsub_oidc';
  }
) {
  assertBillingLocal();
  if (input.authenticity === 'google_pubsub_oidc' && !isBillingProductionActivationEnabled()) {
    throw new BillingServiceError(
      'Live RTDN authenticity unavailable',
      503,
      'BILLING_PROVIDER_UNAVAILABLE'
    );
  }
  if (input.authenticity === 'fake_signed_local' && input.provider !== 'fake_play') {
    throw new BillingServiceError('Authenticity mismatch', 400, 'BILLING_EVENT_AUTH_INVALID');
  }

  // Token kept only on restricted billing_events (no runtime table SELECT); never written to app logs.
  const prior = await client.query<{ id: string; processing_status: string }>(
    `SELECT id, processing_status FROM app.billing_find_event($1, $2)`,
    [input.provider, input.messageId]
  );
  const duplicate = prior.rows.length > 0;

  const eventIdRes = await client.query<{ billing_ingest_event: string }>(
    `SELECT app.billing_ingest_event($1,$2,$3,$4,$5::jsonb) AS billing_ingest_event`,
    [
      input.provider,
      input.messageId,
      input.eventType,
      input.purchaseToken ? hashToken(input.purchaseToken) : null,
      JSON.stringify({
        eventType: input.eventType,
        hasToken: Boolean(input.purchaseToken),
        authenticity: input.authenticity,
        purchaseToken: input.purchaseToken ?? null,
      }),
    ]
  );
  const eventId = eventIdRes.rows[0]!.billing_ingest_event;

  // Process immediately for local harness; worker reclaims failed/stale leases.
  if (input.purchaseToken) {
    await processBillingEvent(client, { eventId });
  } else {
    await client.query(`SELECT app.billing_complete_event($1, 'succeeded', NULL)`, [eventId]);
  }

  const status = await client.query<{ processing_status: string }>(
    `SELECT processing_status FROM app.billing_load_event($1)`,
    [eventId]
  );
  return {
    eventId,
    processingStatus: (status.rows[0]?.processing_status ?? 'failed') as
      | 'pending'
      | 'processing'
      | 'succeeded'
      | 'failed'
      | 'dead_letter',
    duplicate,
  };
}

export async function processBillingEvent(
  client: PoolClient,
  input: { eventId: string }
): Promise<void> {
  const claimed = await client.query<{ billing_claim_event: boolean }>(
    `SELECT app.billing_claim_event($1, 60) AS billing_claim_event`,
    [input.eventId]
  );
  if (!claimed.rows[0]?.billing_claim_event) {
    return;
  }

  const row = await client.query<{
    provider: string;
    event_type: string;
    payload: { purchaseToken?: string | null };
  }>(`SELECT provider, event_type, payload FROM app.billing_load_event($1)`, [input.eventId]);
  const event = row.rows[0];
  if (!event) {
    await client.query(`SELECT app.billing_complete_event($1, 'dead_letter', $2)`, [
      input.eventId,
      'event missing after claim',
    ]);
    return;
  }
  const purchaseToken =
    typeof event.payload?.purchaseToken === 'string' ? event.payload.purchaseToken : null;
  if (!purchaseToken) {
    await client.query(`SELECT app.billing_complete_event($1, 'dead_letter', $2)`, [
      input.eventId,
      'missing purchase token for reconciliation',
    ]);
    return;
  }

  const providerKind = event.provider as 'fake_play' | 'google_play';
  try {
    const provider = resolveBillingProvider(providerKind);
    let verified = await provider.verifySubscription({
      productId: SYNTHETIC_BILLING_CATALOG.products[0]!.productId,
      purchaseToken,
    });

    // Map lifecycle event types onto subscription state when fake provider returns active.
    if (event.event_type.includes('EXPIRED') || event.event_type === 'SUBSCRIPTION_EXPIRED') {
      verified = { ...verified, subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' };
    }
    if (event.event_type.includes('REVOKED') || event.event_type === 'SUBSCRIPTION_REVOKED') {
      verified = { ...verified, subscriptionState: 'SUBSCRIPTION_STATE_REVOKED' };
    }
    if (event.event_type.includes('IN_GRACE')) {
      verified = { ...verified, subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' };
    }
    if (event.event_type.includes('ON_HOLD')) {
      verified = { ...verified, subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD' };
    }

    const owner = await client.query<{ user_id: string }>(
      `SELECT user_id FROM app.billing_purchases
       WHERE provider = $1 AND purchase_token_hash = $2`,
      [providerKind, hashToken(purchaseToken)]
    );
    const userId = owner.rows[0]?.user_id ?? verified.obfuscatedAccountId;
    if (!userId) {
      await client.query(
        `SELECT app.billing_complete_event($1, 'dead_letter', $2)`,
        [input.eventId, 'no bound account']
      );
      return;
    }
    await applyVerifiedPurchase(client, userId, {
      ...verified,
      obfuscatedAccountId: verified.obfuscatedAccountId ?? userId,
    });
    await client.query(`SELECT app.billing_complete_event($1, 'succeeded', NULL)`, [
      input.eventId,
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await client.query(`SELECT app.billing_complete_event($1, 'failed', $2)`, [
      input.eventId,
      msg.slice(0, 500),
    ]);
  }
}

/** Ordinary runtime users cannot write entitlements via SQL — tested separately. */
export async function assertOrdinaryUserCannotGrant(
  client: PoolClient,
  userId: string
): Promise<boolean> {
  try {
    await client.query(
      `INSERT INTO app.billing_entitlements (
         user_id, plan_id, status, valid_from, valid_until, storage_bytes, ai_monthly_tokens
       ) VALUES ($1, 'plus_synthetic', 'active', now(), now() + interval '30 days', 999999999, 999999)`,
      [userId]
    );
    return false;
  } catch {
    return true;
  }
}
