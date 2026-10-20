import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const AiContentScopeSchema = z
  .object({
    notes: z.boolean(),
    tasks: z.boolean(),
    journal: z.boolean(),
  })
  .strict();

export const AiConsentStatusSchema = z
  .object({
    enabled: z.boolean(),
    consentVersion: z.string().nullable(),
    providerDisclosureVersion: z.string().nullable(),
    currentConsentVersion: z.string(),
    currentProviderDisclosureVersion: z.string(),
    contentScope: AiContentScopeSchema,
    consentGeneration: z.number().int().positive(),
    requiresAcceptance: z.boolean(),
    liveProviderAvailable: z.boolean(),
    providerMode: z.enum(['disabled', 'fake', 'unavailable', 'live']),
  })
  .strict();

export const AiConsentStatusResponseSchema = z.object({
  data: AiConsentStatusSchema,
  meta: ResponseMetaSchema,
});
export type AiConsentStatusResponse = z.infer<typeof AiConsentStatusResponseSchema>;

export const AcceptAiConsentRequestSchema = z
  .object({
    consentVersion: z.string().min(1).max(64),
    providerDisclosureVersion: z.string().min(1).max(64),
    contentScope: AiContentScopeSchema.optional(),
  })
  .strict();
export type AcceptAiConsentRequest = z.infer<typeof AcceptAiConsentRequestSchema>;

export const DisableAiRequestSchema = z
  .object({
    purgeDerived: z.boolean().default(true),
  })
  .strict();
export type DisableAiRequest = z.infer<typeof DisableAiRequestSchema>;

export const AiIndexSourceRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    itemId: z.string().uuid(),
  })
  .strict();
export type AiIndexSourceRequest = z.infer<typeof AiIndexSourceRequestSchema>;

export const AiIndexResultSchema = z
  .object({
    indexed: z.boolean(),
    chunkCount: z.number().int().nonnegative(),
    reason: z.string().nullable(),
  })
  .strict();

export const AiIndexResultResponseSchema = z.object({
  data: AiIndexResultSchema,
  meta: ResponseMetaSchema,
});
export type AiIndexResultResponse = z.infer<typeof AiIndexResultResponseSchema>;

export const AiRetrieveRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    query: z.string().min(1).max(2000),
    limit: z.number().int().positive().max(20).optional(),
  })
  .strict();
export type AiRetrieveRequest = z.infer<typeof AiRetrieveRequestSchema>;

export const AiCitationSchema = z
  .object({
    itemId: z.string().uuid(),
    revision: z.number().int().positive(),
    kind: z.string(),
    excerpt: z.string().max(500),
  })
  .strict();

export const AiRetrieveResponseSchema = z.object({
  data: z.object({
    answer: z.string(),
    abstained: z.boolean(),
    citations: z.array(AiCitationSchema),
    providerMode: z.enum(['fake', 'unavailable', 'live']),
    tokensReserved: z.number().int().nonnegative(),
    tokensSettled: z.number().int().nonnegative(),
  }),
  meta: ResponseMetaSchema,
});
export type AiRetrieveResponse = z.infer<typeof AiRetrieveResponseSchema>;

export const AiPurgeResponseSchema = z.object({
  data: z.object({
    deletedChunks: z.number().int().nonnegative(),
  }),
  meta: ResponseMetaSchema,
});
export type AiPurgeResponse = z.infer<typeof AiPurgeResponseSchema>;
