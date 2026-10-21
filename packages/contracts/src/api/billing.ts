import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const BillingPlanIdSchema = z.enum(['free', 'plus_synthetic']);
export type BillingPlanId = z.infer<typeof BillingPlanIdSchema>;

export const BillingCatalogProductSchema = z
  .object({
    productId: z.string(),
    planId: BillingPlanIdSchema,
    title: z.string(),
    description: z.string(),
    period: z.string(),
    syntheticPriceLabel: z.string(),
    storageBytes: z.number().int().positive(),
    aiMonthlyTokens: z.number().int().nonnegative(),
    catalogLabel: z.literal('synthetic-local-catalog'),
  })
  .strict();

export const BillingCatalogResponseSchema = z.object({
  data: z.object({
    catalogLabel: z.literal('synthetic-local-catalog'),
    purchaseActivationEnabled: z.boolean(),
    products: z.array(BillingCatalogProductSchema),
    freeDefaults: z.object({
      planId: z.literal('free'),
      storageBytes: z.number().int().positive(),
      aiMonthlyTokens: z.number().int().nonnegative(),
    }),
  }),
  meta: ResponseMetaSchema,
});
export type BillingCatalogResponse = z.infer<typeof BillingCatalogResponseSchema>;

export const BillingEntitlementSchema = z
  .object({
    planId: BillingPlanIdSchema,
    status: z.enum(['active', 'grace', 'hold', 'expired', 'revoked']),
    validFrom: z.string(),
    validUntil: z.string(),
    storageBytes: z.number().int().positive(),
    aiMonthlyTokens: z.number().int().nonnegative(),
    sourcePurchaseId: z.string().uuid().nullable(),
    label: z.literal('server-authoritative'),
  })
  .strict();

export const BillingEntitlementResponseSchema = z.object({
  data: BillingEntitlementSchema,
  meta: ResponseMetaSchema,
});
export type BillingEntitlementResponse = z.infer<typeof BillingEntitlementResponseSchema>;

export const BillingUsageResponseSchema = z.object({
  data: z.object({
    planId: BillingPlanIdSchema,
    entitlementStatus: z.string(),
    storage: z.object({
      usedBytes: z.number().int().nonnegative(),
      reservedBytes: z.number().int().nonnegative(),
      maxBytes: z.number().int().positive(),
      availableBytes: z.number().int().nonnegative(),
    }),
    ai: z.object({
      monthlyTokenLimit: z.number().int().nonnegative(),
      note: z.string(),
    }),
    downgradePolicy: z.string(),
  }),
  meta: ResponseMetaSchema,
});
export type BillingUsageResponse = z.infer<typeof BillingUsageResponseSchema>;

export const VerifyPurchaseRequestSchema = z
  .object({
    provider: z.enum(['fake_play', 'google_play']),
    productId: z.string().min(1).max(200),
    purchaseToken: z.string().min(8).max(4096),
    obfuscatedAccountId: z.string().uuid().optional(),
  })
  .strict();
export type VerifyPurchaseRequest = z.infer<typeof VerifyPurchaseRequestSchema>;

export const VerifyPurchaseResponseSchema = z.object({
  data: z.object({
    purchaseId: z.string().uuid(),
    entitlement: BillingEntitlementSchema,
    acknowledgementState: z.string(),
    providerMode: z.enum(['fake', 'unavailable', 'live']),
  }),
  meta: ResponseMetaSchema,
});
export type VerifyPurchaseResponse = z.infer<typeof VerifyPurchaseResponseSchema>;

export const BillingEventIngestRequestSchema = z
  .object({
    provider: z.enum(['fake_play', 'google_play']),
    messageId: z.string().min(1).max(200),
    eventType: z.string().min(1).max(100),
    purchaseToken: z.string().min(8).max(4096).optional(),
    /** Authenticity marker for local fake RTDN; live requires signed Pub/Sub. */
    authenticity: z.enum(['fake_signed_local', 'google_pubsub_oidc']),
  })
  .strict();
export type BillingEventIngestRequest = z.infer<typeof BillingEventIngestRequestSchema>;

export const BillingEventIngestResponseSchema = z.object({
  data: z.object({
    eventId: z.string().uuid(),
    processingStatus: z.enum(['pending', 'processing', 'succeeded', 'failed', 'dead_letter']),
    duplicate: z.boolean(),
  }),
  meta: ResponseMetaSchema,
});
export type BillingEventIngestResponse = z.infer<typeof BillingEventIngestResponseSchema>;

export const RestorePurchasesRequestSchema = z
  .object({
    provider: z.enum(['fake_play', 'google_play']),
    purchaseTokens: z.array(z.string().min(8).max(4096)).max(20),
  })
  .strict();
export type RestorePurchasesRequest = z.infer<typeof RestorePurchasesRequestSchema>;

export const RestorePurchasesResponseSchema = z.object({
  data: z.object({
    restored: z.number().int().nonnegative(),
    skippedCrossAccount: z.number().int().nonnegative(),
    entitlement: BillingEntitlementSchema,
  }),
  meta: ResponseMetaSchema,
});
export type RestorePurchasesResponse = z.infer<typeof RestorePurchasesResponseSchema>;
