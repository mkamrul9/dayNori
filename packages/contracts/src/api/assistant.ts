import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';
import { AiCitationSchema } from './ai.js';

export const AiAssistantOperationSchema = z.enum([
  'create_personal_task',
  'update_personal_task',
  'create_personal_note',
]);
export type AiAssistantOperation = z.infer<typeof AiAssistantOperationSchema>;

export const AiSelectedSourcesSchema = z
  .object({
    help: z.boolean().optional(),
    notes: z.boolean().optional(),
    tasks: z.boolean().optional(),
    journal: z.boolean().optional(),
  })
  .strict();
export type AiSelectedSources = z.infer<typeof AiSelectedSourcesSchema>;

export const AiAskRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    question: z.string().min(1).max(2000),
    limit: z.number().int().positive().max(20).optional(),
    /** When true, server may create a pending proposal from a typed heuristic (never executes). */
    allowSuggestProposal: z.boolean().optional(),
    selectedSources: AiSelectedSourcesSchema.optional(),
  })
  .strict();
export type AiAskRequest = z.infer<typeof AiAskRequestSchema>;

export const AiProposalReviewSummarySchema = z
  .object({
    headline: z.string(),
    targetLabel: z.string(),
    before: z.string().nullable(),
    after: z.string(),
  })
  .strict();
export type AiProposalReviewSummary = z.infer<typeof AiProposalReviewSummarySchema>;

export const AiProposalSchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
    operation: AiAssistantOperationSchema,
    payload: z.record(z.string(), z.unknown()),
    targetItemId: z.string().uuid().nullable(),
    expectedRevision: z.number().int().nonnegative().nullable(),
    consentGeneration: z.number().int().positive(),
    status: z.enum(['pending', 'confirmed', 'cancelled', 'expired', 'failed']),
    expiresAt: z.string(),
    confirmationToken: z.string().min(16).max(128),
    executionReceipt: z.record(z.string(), z.unknown()).nullable(),
    reviewSummary: AiProposalReviewSummarySchema,
    createdAt: z.string(),
  })
  .strict();
export type AiProposal = z.infer<typeof AiProposalSchema>;

export const AiAskResponseSchema = z.object({
  data: z.object({
    turnId: z.string().uuid(),
    answer: z.string(),
    abstained: z.boolean(),
    citations: z.array(AiCitationSchema),
    retrievedSourceCount: z.number().int().nonnegative(),
    providerMode: z.enum(['fake', 'unavailable', 'live']),
    tokensReserved: z.number().int().nonnegative(),
    tokensSettled: z.number().int().nonnegative(),
    suggestedProposal: AiProposalSchema.nullable(),
    label: z.literal('provisional-local-fake-or-gated'),
    cancelled: z.boolean().optional(),
  }),
  meta: ResponseMetaSchema,
});
export type AiAskResponse = z.infer<typeof AiAskResponseSchema>;

export const CreateAiProposalRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    operation: AiAssistantOperationSchema,
    payload: z.record(z.string(), z.unknown()),
    targetItemId: z.string().uuid().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type CreateAiProposalRequest = z.infer<typeof CreateAiProposalRequestSchema>;

export const AiProposalResponseSchema = z.object({
  data: AiProposalSchema,
  meta: ResponseMetaSchema,
});
export type AiProposalResponse = z.infer<typeof AiProposalResponseSchema>;

export const ConfirmAiProposalRequestSchema = z
  .object({
    confirmationToken: z.string().min(16).max(128),
  })
  .strict();
export type ConfirmAiProposalRequest = z.infer<typeof ConfirmAiProposalRequestSchema>;

export const AiAssistantTurnSchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
    question: z.string(),
    answer: z.string(),
    abstained: z.boolean(),
    citations: z.array(AiCitationSchema),
    providerMode: z.string(),
    consentGeneration: z.number().int().positive(),
    createdAt: z.string(),
    expiresAt: z.string(),
  })
  .strict();

export const AiAssistantHistoryResponseSchema = z.object({
  data: z.array(AiAssistantTurnSchema),
  meta: ResponseMetaSchema,
});
export type AiAssistantHistoryResponse = z.infer<typeof AiAssistantHistoryResponseSchema>;

export const SaveAiDraftRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    draftQuestion: z.string().max(2000),
  })
  .strict();
export type SaveAiDraftRequest = z.infer<typeof SaveAiDraftRequestSchema>;

export const AiAssistantDraftSchema = z
  .object({
    workspaceId: z.string().uuid(),
    draftQuestion: z.string(),
    consentGeneration: z.number().int().positive(),
    updatedAt: z.string(),
  })
  .strict();

export const AiAssistantDraftResponseSchema = z.object({
  data: AiAssistantDraftSchema.nullable(),
  meta: ResponseMetaSchema,
});
export type AiAssistantDraftResponse = z.infer<typeof AiAssistantDraftResponseSchema>;

export const ClearAiDraftRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
  })
  .strict();
export type ClearAiDraftRequest = z.infer<typeof ClearAiDraftRequestSchema>;

export const AiSourceAccessRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    itemId: z.string().min(1).max(128),
  })
  .strict();
export type AiSourceAccessRequest = z.infer<typeof AiSourceAccessRequestSchema>;

export const AiSourceAccessResponseSchema = z.object({
  data: z.object({
    accessible: z.boolean(),
    itemId: z.string().min(1).max(128),
    kind: z.string().nullable(),
    title: z.string().nullable(),
    revision: z.number().int().positive().nullable(),
    reason: z.string().nullable(),
    deepLink: z.string().optional(),
  }),
  meta: ResponseMetaSchema,
});
export type AiSourceAccessResponse = z.infer<typeof AiSourceAccessResponseSchema>;

export const AiAskStreamRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    question: z.string().min(1).max(2000),
    limit: z.number().int().positive().max(20).optional(),
    selectedSources: AiSelectedSourcesSchema.optional(),
  })
  .strict();
export type AiAskStreamRequest = z.infer<typeof AiAskStreamRequestSchema>;

export const AiStreamStartEventSchema = z.object({
  type: z.literal('start'),
  turnId: z.string().uuid(),
  providerMode: z.string(),
  label: z.string(),
});

export const AiStreamContextEventSchema = z.object({
  type: z.literal('context'),
  retrievedSourceCount: z.number().int().nonnegative(),
  citations: z.array(AiCitationSchema),
});

export const AiStreamChunkEventSchema = z.object({
  type: z.literal('chunk'),
  text: z.string(),
});

export const AiStreamDoneEventSchema = z.object({
  type: z.literal('done'),
  turnId: z.string().uuid(),
  answer: z.string(),
  abstained: z.boolean(),
  citations: z.array(AiCitationSchema),
  tokensReserved: z.number().int().nonnegative(),
  tokensSettled: z.number().int().nonnegative(),
});

export const AiStreamErrorEventSchema = z.object({
  type: z.literal('error'),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const AiStreamEventSchema = z.discriminatedUnion('type', [
  AiStreamStartEventSchema,
  AiStreamContextEventSchema,
  AiStreamChunkEventSchema,
  AiStreamDoneEventSchema,
  AiStreamErrorEventSchema,
]);
export type AiStreamEvent = z.infer<typeof AiStreamEventSchema>;

export const DeleteAiHistoryRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    turnId: z.string().uuid().optional(),
  })
  .strict();
export type DeleteAiHistoryRequest = z.infer<typeof DeleteAiHistoryRequestSchema>;

export const DeleteAiHistoryResponseSchema = z.object({
  data: z.object({
    deletedTurns: z.number().int().nonnegative(),
  }),
  meta: ResponseMetaSchema,
});
export type DeleteAiHistoryResponse = z.infer<typeof DeleteAiHistoryResponseSchema>;
