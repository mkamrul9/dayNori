/**
 * Phase 57 — Billing local enablement (fail-closed in production).
 * Production purchase activation requires a separate explicit flag and credentials.
 * Paying never enables unfinished vault/rooms/Drive/AI features.
 */

export type BillingPlanId = 'free' | 'plus_synthetic';

export const SYNTHETIC_BILLING_CATALOG = {
  label: 'synthetic-local-catalog',
  products: [
    {
      productId: 'daynori.plus.monthly.synthetic',
      planId: 'plus_synthetic' as const,
      title: 'Daynori Plus (synthetic)',
      description: 'Labeled local fixture — not a store offer.',
      period: 'P1M',
      // Synthetic display only; not an approved commercial price.
      syntheticPriceLabel: 'SYNTHETIC $0.00 / month (local fixture)',
      storageBytes: 5 * 1024 * 1024 * 1024,
      aiMonthlyTokens: 500_000,
    },
  ],
  freeDefaults: {
    planId: 'free' as const,
    storageBytes: 100 * 1024 * 1024,
    aiMonthlyTokens: 50_000,
  },
} as const;

export function isBillingLocallyEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  const nodeEnv = env['NODE_ENV'] ?? 'development';
  if (nodeEnv === 'production') {
    return false;
  }
  if (nodeEnv === 'test') return true;
  return env['DAYNORI_BILLING_LOCAL_ENABLED'] === 'true';
}

/** Real Google Play / store verification calls — separate from local harness. */
export function isBillingProductionActivationEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  return (
    isBillingLocallyEnabled(env) && env['DAYNORI_BILLING_PRODUCTION_ENABLED'] === 'true'
  );
}

export function planQuotas(planId: BillingPlanId): {
  storageBytes: number;
  aiMonthlyTokens: number;
} {
  if (planId === 'plus_synthetic') {
    const p = SYNTHETIC_BILLING_CATALOG.products[0]!;
    return { storageBytes: p.storageBytes, aiMonthlyTokens: p.aiMonthlyTokens };
  }
  return {
    storageBytes: SYNTHETIC_BILLING_CATALOG.freeDefaults.storageBytes,
    aiMonthlyTokens: SYNTHETIC_BILLING_CATALOG.freeDefaults.aiMonthlyTokens,
  };
}
