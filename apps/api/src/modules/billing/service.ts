/**
 * Phase 57 repair — Server-authoritative entitlements with protected billing authority,
 * explicit subscription state mapping, durable event processing, and quota sync.
 */

import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  SYNTHETIC_BILLING_CATALOG,
  isBillingLocallyEnabled,
  isBillingProductionActivationEnabled,
  mapVerifiedSubscriptionToAccess,
  planQuotas,
  resolveBillingServiceToken,
  type BillingPlanId,
  type EntitlementAccessStatus,
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

function billingServiceToken(): string {
  try {
    return resolveBillingServiceToken();
  } catch {
    throw new BillingServiceError('Billing service token unavailable', 503, 'BILLING_DISABLED');
  }
}

/** Activate protected billing helpers inside an open transaction. */
export async function activateBillingAuthority(client: PoolClient): Promise<void> {
  await client.query(`SELECT app.billing_activate_service_session($1)`, [billingServiceToken()]);
}

export async function withBillingAuthority<T>(
  pool: Pool,
  userId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    await activateBillingAuthority(client);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
    }
    throw err;
  } finally {
    client.release(discard);
  }
}

function entitlementResponse(input: {
  planId: BillingPlanId;
  status: EntitlementAccessStatus;
  validFrom: string;
  validUntil: string;
  storageBytes: number;
  aiMonthlyTokens: number;
  sourcePurchaseId: string | null;
}) {
  return {
    ...input,
    label: 'server-authoritative' as const,
  };
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

/**
 * Effective entitlement for enforcement. May persist expiry/recompute under authority
 * when the caller has already activated a billing session; otherwise read-only + soft expiry.
 */
export async function getEntitlement(
  client: PoolClient,
  userId: string,
  options?: { persistExpiry?: boolean }
) {
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
    return entitlementResponse({
      planId: 'free',
      status: 'active',
      validFrom: new Date(0).toISOString(),
      validUntil: new Date('9999-12-31T00:00:00.000Z').toISOString(),
      storageBytes: free.storageBytes,
      aiMonthlyTokens: free.aiMonthlyTokens,
      sourcePurchaseId: null,
    });
  }

  const untilMs = row.valid_until.getTime();
  const past = untilMs <= Date.now();
  let status = row.status as EntitlementAccessStatus;
  if (
    past &&
    (status === 'active' ||
      status === 'grace' ||
      status === 'canceled' ||
      status === 'hold' ||
      status === 'pending')
  ) {
    status = 'expired';
    if (options?.persistExpiry) {
      await client.query(`SELECT app.billing_recompute_entitlement($1::uuid)`, [userId]);
      return getEntitlement(client, userId, { persistExpiry: false });
    }
  }

  const grantsPaid =
    !past &&
    (status === 'active' || status === 'grace' || status === 'canceled');
  const free = planQuotas('free');
  return entitlementResponse({
    planId: grantsPaid ? (row.plan_id as BillingPlanId) : 'free',
    status,
    validFrom: row.valid_from.toISOString(),
    validUntil: row.valid_until.toISOString(),
    storageBytes: grantsPaid ? Number(row.storage_bytes) : free.storageBytes,
    aiMonthlyTokens: grantsPaid ? Number(row.ai_monthly_tokens) : free.aiMonthlyTokens,
    sourcePurchaseId: row.source_purchase_id,
  });
}

/** Effective AI monthly ceiling for the authenticated user (free default when unpaid). */
export async function getEffectiveAiMonthlyTokenBudget(
  client: PoolClient,
  userId: string
): Promise<number> {
  if (!isBillingLocallyEnabled()) {
    return planQuotas('free').aiMonthlyTokens;
  }
  try {
    const ent = await getEntitlement(client, userId, { persistExpiry: false });
    return ent.aiMonthlyTokens;
  } catch {
    return planQuotas('free').aiMonthlyTokens;
  }
}

export async function getBillingUsage(client: PoolClient, userId: string, workspaceId: string) {
  const entitlement = await getEntitlement(client, userId, { persistExpiry: true });
  const storage = await getStorageUsage(client, workspaceId);
  return {
    planId: entitlement.planId,
    entitlementStatus: entitlement.status,
    storage: {
      usedBytes: storage.storedBytes,
      reservedBytes: storage.reservedBytes,
      maxBytes: Math.min(storage.maxStorageBytes, entitlement.storageBytes),
      availableBytes: Math.max(
        0,
        Math.min(storage.maxStorageBytes, entitlement.storageBytes) -
          storage.storedBytes -
          storage.reservedBytes
      ),
    },
    ai: {
      monthlyTokenLimit: entitlement.aiMonthlyTokens,
      note: 'AI token budgets are server-controlled; billing raises the plan ceiling only.',
    },
    downgradePolicy:
      'On expiry/refund/downgrade, existing personal content is preserved. New allocations may be refused when over quota. Read/export/delete remain available. Offline drafts are not discarded.',
  };
}

async function applyVerifiedPurchase(
  client: PoolClient,
  userId: string,
  verified: VerifiedSubscription,
  options?: { allowFirstClaimWithoutProviderAccount?: boolean }
) {
  const product = await client.query<{
    plan_id: string;
    storage_bytes: string;
    ai_monthly_tokens: number;
    active: boolean;
  }>(
    `SELECT plan_id, storage_bytes, ai_monthly_tokens, active FROM app.billing_products WHERE product_id = $1`,
    [verified.productId]
  );
  if (!product.rows[0]?.active) {
    throw new BillingServiceError('Unknown or inactive product', 400, 'BILLING_PRODUCT_UNKNOWN');
  }

  const existing = await client.query<{ user_id: string; obfuscated_account_id: string | null }>(
    `SELECT user_id, obfuscated_account_id FROM app.billing_purchases
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

  // Provider-reported account id is authoritative when present.
  if (verified.obfuscatedAccountId && verified.obfuscatedAccountId !== userId) {
    throw new BillingServiceError(
      'Purchase account identifier mismatch',
      409,
      'BILLING_ACCOUNT_MISMATCH'
    );
  }

  // First-claim without provider account id: allowed only when explicitly opted in (restore/verify).
  // Client-supplied hints are never treated as verified ownership.
  if (!verified.obfuscatedAccountId && !existing.rows[0]) {
    if (!options?.allowFirstClaimWithoutProviderAccount) {
      throw new BillingServiceError(
        'Provider account identifier required for first claim',
        409,
        'BILLING_ACCOUNT_UNBOUND'
      );
    }
  }

  const access = mapVerifiedSubscriptionToAccess({
    subscriptionState: verified.subscriptionState,
    validUntilIso: verified.validUntil,
  });

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
    if (msg.includes('BILLING_AUTHORITY_REQUIRED')) {
      throw new BillingServiceError('Billing authority required', 403, 'BILLING_AUTHORITY_REQUIRED');
    }
    throw err;
  }

  // Recompute from all purchases so one expired token cannot overwrite another valid grant.
  await client.query(`SELECT app.billing_recompute_entitlement($1::uuid)`, [userId]);

  // If current verified purchase is hold/pending/revoked and is the only one, recompute already set free.
  // When grantsPaidAccess for this purchase, recompute prefers it via valid_until ordering.
  if (!access.grantsPaidAccess && access.status === 'revoked') {
    await client.query(`SELECT app.billing_recompute_entitlement($1::uuid)`, [userId]);
  }

  void purchaseId;
  return { purchaseId, entitlement: await getEntitlement(client, userId) };
}

async function maybeAcknowledge(
  verified: VerifiedSubscription,
  provider: ReturnType<typeof resolveBillingProvider>
): Promise<string> {
  if (verified.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_PENDING') {
    return verified.acknowledgementState;
  }
  if (typeof provider.acknowledge !== 'function') {
    return verified.acknowledgementState;
  }
  await provider.acknowledge(verified.purchaseToken);
  return 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
}

export async function verifyAndGrantPurchase(
  client: PoolClient,
  input: {
    userId: string;
    provider: 'fake_play' | 'google_play';
    productId: string;
    purchaseToken: string;
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
  const provider = resolveBillingProvider(input.provider);
  try {
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
  if (verified.productId !== input.productId) {
    throw new BillingServiceError('Product mismatch', 400, 'BILLING_PRODUCT_MISMATCH');
  }
  if (verified.providerMode === 'fake' && input.provider !== 'fake_play') {
    throw new BillingServiceError('Fake receipt rejected for live provider', 400, 'BILLING_TOKEN_INVALID');
  }

  const ack = await maybeAcknowledge(verified, provider);
  verified = { ...verified, acknowledgementState: ack };

  const result = await applyVerifiedPurchase(client, input.userId, verified, {
    allowFirstClaimWithoutProviderAccount: true,
  });
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
      const existing = await client.query<{ product_id: string }>(
        `SELECT product_id FROM app.billing_purchases
         WHERE provider = $1 AND purchase_token_hash = $2`,
        [input.provider, hashToken(token)]
      );
      const provider = resolveBillingProvider(input.provider);
      // Prefer product from prior purchase; otherwise let provider derive from token/payload.
      const productHint =
        existing.rows[0]?.product_id ?? SYNTHETIC_BILLING_CATALOG.products[0]!.productId;
      const verified = await provider.verifySubscription({
        productId: productHint,
        purchaseToken: token,
      });
      await applyVerifiedPurchase(client, input.userId, verified, {
        allowFirstClaimWithoutProviderAccount: !verified.obfuscatedAccountId,
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
      if (
        (err instanceof BillingServiceError && err.code === 'BILLING_TOKEN_INVALID') ||
        (err instanceof BillingProviderError && err.code === 'BILLING_TOKEN_INVALID')
      ) {
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

/** End-user synthetic harness only — not a provider notification authenticity proof. */
export async function ingestSyntheticBillingEvent(
  client: PoolClient,
  input: {
    provider: 'fake_play';
    messageId: string;
    eventType: string;
    purchaseToken?: string;
  }
) {
  assertBillingLocal();
  if (input.provider !== 'fake_play') {
    throw new BillingServiceError('Synthetic harness is fake_play only', 400, 'BILLING_EVENT_AUTH_INVALID');
  }
  return ingestBillingEventInternal(client, {
    provider: 'fake_play',
    messageId: input.messageId,
    eventType: input.eventType,
    purchaseToken: input.purchaseToken,
    source: 'synthetic_harness',
  });
}

/**
 * Authenticated provider notification path (gated). Production would verify Pub/Sub OIDC
 * before calling; this entry rejects unless production activation is on.
 */
export async function ingestProviderBillingNotification(
  client: PoolClient,
  input: {
    provider: 'google_play';
    messageId: string;
    eventType: string;
    purchaseToken?: string;
    oidcVerified: boolean;
  }
) {
  assertBillingLocal();
  if (!isBillingProductionActivationEnabled() || !input.oidcVerified) {
    throw new BillingServiceError(
      'Provider notification authenticity unavailable',
      503,
      'BILLING_PROVIDER_UNAVAILABLE'
    );
  }
  return ingestBillingEventInternal(client, {
    provider: 'google_play',
    messageId: input.messageId,
    eventType: input.eventType,
    purchaseToken: input.purchaseToken,
    source: 'provider_oidc',
  });
}

async function ingestBillingEventInternal(
  client: PoolClient,
  input: {
    provider: 'fake_play' | 'google_play';
    messageId: string;
    eventType: string;
    purchaseToken?: string;
    source: 'synthetic_harness' | 'provider_oidc';
  }
) {
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
        source: input.source,
        purchaseToken: input.purchaseToken ?? null,
      }),
    ]
  );
  const eventId = eventIdRes.rows[0]!.billing_ingest_event;

  // Leave pending for durable worker; do not process under the ingest lock.
  if (!input.purchaseToken) {
    await client.query(`SELECT app.billing_complete_event($1, 'succeeded', NULL, NULL)`, [eventId]);
  }

  const status = await client.query<{ processing_status: string }>(
    `SELECT processing_status FROM app.billing_load_event($1)`,
    [eventId]
  );
  return {
    eventId,
    processingStatus: (status.rows[0]?.processing_status ?? 'pending') as
      | 'pending'
      | 'processing'
      | 'succeeded'
      | 'failed'
      | 'dead_letter',
    duplicate,
  };
}

type ClaimedEvent = {
  eventId: string;
  provider: 'fake_play' | 'google_play';
  eventType: string;
  purchaseToken: string;
  productIdHint: string | null;
  leaseOwner: string;
};

/** Short claim transaction — no provider I/O. */
export async function claimBillingEvent(
  client: PoolClient,
  eventId: string,
  leaseOwner: string
): Promise<ClaimedEvent | null> {
  await client.query(`SELECT set_config('app.billing_lease_owner', $1, true)`, [leaseOwner]);
  const claimed = await client.query<{ billing_claim_event: boolean }>(
    `SELECT app.billing_claim_event($1, 60, $2) AS billing_claim_event`,
    [eventId, leaseOwner]
  );
  if (!claimed.rows[0]?.billing_claim_event) return null;

  const row = await client.query<{
    provider: string;
    event_type: string;
    payload: { purchaseToken?: string | null };
  }>(`SELECT provider, event_type, payload FROM app.billing_load_event($1)`, [eventId]);
  const event = row.rows[0];
  if (!event) {
    await client.query(`SELECT app.billing_complete_event($1, 'dead_letter', $2, $3)`, [
      eventId,
      'event missing after claim',
      leaseOwner,
    ]);
    return null;
  }
  const purchaseToken =
    typeof event.payload?.purchaseToken === 'string' ? event.payload.purchaseToken : null;
  if (!purchaseToken) {
    await client.query(`SELECT app.billing_complete_event($1, 'dead_letter', $2, $3)`, [
      eventId,
      'missing purchase token for reconciliation',
      leaseOwner,
    ]);
    return null;
  }
  const hint = await client.query<{ product_id: string }>(
    `SELECT product_id FROM app.billing_purchases
     WHERE provider = $1 AND purchase_token_hash = $2`,
    [event.provider, hashToken(purchaseToken)]
  );
  return {
    eventId,
    provider: event.provider as 'fake_play' | 'google_play',
    eventType: event.event_type,
    purchaseToken,
    productIdHint: hint.rows[0]?.product_id ?? null,
    leaseOwner,
  };
}

export async function finalizeBillingEventSuccess(
  client: PoolClient,
  claimed: ClaimedEvent,
  verified: VerifiedSubscription,
  userId: string
): Promise<void> {
  await client.query(`SELECT set_config('app.billing_lease_owner', $1, true)`, [claimed.leaseOwner]);
  await applyVerifiedPurchase(client, userId, verified, {
    allowFirstClaimWithoutProviderAccount: !verified.obfuscatedAccountId,
  });
  await client.query(`SELECT app.billing_complete_event($1, 'succeeded', NULL, $2)`, [
    claimed.eventId,
    claimed.leaseOwner,
  ]);
}

export async function finalizeBillingEventFailure(
  client: PoolClient,
  eventId: string,
  leaseOwner: string,
  errorMessage: string,
  deadLetter = false
): Promise<void> {
  await client.query(`SELECT set_config('app.billing_lease_owner', $1, true)`, [leaseOwner]);
  await client.query(`SELECT app.billing_complete_event($1, $2, $3, $4)`, [
    eventId,
    deadLetter ? 'dead_letter' : 'failed',
    errorMessage.slice(0, 500),
    leaseOwner,
  ]);
}

/**
 * Process one event: claim (caller TX) → provider I/O outside → finalize in new authority TX.
 * Notification labels do not override verified provider state.
 */
export async function processBillingEvent(
  pool: Pool,
  input: { eventId: string; leaseOwner?: string }
): Promise<'skipped' | 'succeeded' | 'failed' | 'dead_letter'> {
  assertBillingLocal();
  const leaseOwner = input.leaseOwner ?? `worker-${crypto.randomUUID()}`;

  const claimed = await withBillingAuthority(pool, '00000000-0000-4000-8000-000000000057', async (client) =>
    claimBillingEvent(client, input.eventId, leaseOwner)
  );
  if (!claimed) return 'skipped';

  try {
    const provider = resolveBillingProvider(claimed.provider);
    const productId =
      claimed.productIdHint ?? SYNTHETIC_BILLING_CATALOG.products[0]!.productId;
    const verified = await provider.verifySubscription({
      productId,
      purchaseToken: claimed.purchaseToken,
    });
    // Do not remap subscriptionState from RTDN event labels — verified provider state wins.

    const ownerUserId = await withBillingAuthority(
      pool,
      '00000000-0000-4000-8000-000000000057',
      async (client) => {
        const owner = await client.query<{ user_id: string }>(
          `SELECT user_id FROM app.billing_purchases
           WHERE provider = $1 AND purchase_token_hash = $2`,
          [claimed.provider, hashToken(claimed.purchaseToken)]
        );
        return owner.rows[0]?.user_id ?? verified.obfuscatedAccountId;
      }
    );

    if (!ownerUserId) {
      await withBillingAuthority(pool, '00000000-0000-4000-8000-000000000057', (client) =>
        finalizeBillingEventFailure(client, claimed.eventId, leaseOwner, 'no bound account', true)
      );
      return 'dead_letter';
    }

    const ack = await maybeAcknowledge(verified, provider);
    await withBillingAuthority(pool, ownerUserId, (client) =>
      finalizeBillingEventSuccess(client, claimed, { ...verified, acknowledgementState: ack }, ownerUserId)
    );
    return 'succeeded';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await withBillingAuthority(pool, '00000000-0000-4000-8000-000000000057', (client) =>
        finalizeBillingEventFailure(client, claimed.eventId, leaseOwner, msg, false)
      );
    } catch {
      // Failure-record TX itself failed; leave lease for reclaim.
    }
    return 'failed';
  }
}

/** Ensure recurring billing jobs exist (idempotent; caller supplies TX or single-statement scope). */
export async function ensureBillingMaintenanceJobs(client: PoolClient): Promise<void> {
  await activateBillingAuthority(client);
  await client.query(
    `
    INSERT INTO app.background_jobs (task_type, payload, run_at, status)
    SELECT 'billing_reconcile_events',
           jsonb_build_object('source', 'billing_scheduler', 'runAt', now()::text),
           now() + interval '30 seconds',
           'pending'
    WHERE NOT EXISTS (
      SELECT 1 FROM app.background_jobs
      WHERE task_type = 'billing_reconcile_events'
        AND status IN ('pending', 'processing')
        AND payload->>'source' = 'billing_scheduler'
        AND run_at > now() - interval '5 minutes'
    )`
  );
  await client.query(
    `
    INSERT INTO app.background_jobs (task_type, payload, run_at, status)
    SELECT 'billing_expire_entitlements',
           jsonb_build_object('source', 'billing_scheduler', 'runAt', now()::text),
           now() + interval '60 seconds',
           'pending'
    WHERE NOT EXISTS (
      SELECT 1 FROM app.background_jobs
      WHERE task_type = 'billing_expire_entitlements'
        AND status IN ('pending', 'processing')
        AND payload->>'source' = 'billing_scheduler'
        AND run_at > now() - interval '5 minutes'
    )`
  );
}

export async function expireStaleEntitlements(client: PoolClient, limit = 50): Promise<number> {
  await activateBillingAuthority(client);
  const res = await client.query<{ billing_expire_stale_entitlements: number }>(
    `SELECT app.billing_expire_stale_entitlements($1) AS billing_expire_stale_entitlements`,
    [limit]
  );
  return Number(res.rows[0]?.billing_expire_stale_entitlements ?? 0);
}

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

export async function assertOrdinaryHelperBypassDenied(
  client: PoolClient,
  userId: string
): Promise<boolean> {
  try {
    await client.query(
      `SELECT app.billing_upsert_entitlement_from_purchase(
         $1, NULL, 'plus_synthetic', 'active', now(), now() + interval '30 days', 999999999, 999999
       )`,
      [userId]
    );
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes('BILLING_AUTHORITY_REQUIRED');
  }
}
