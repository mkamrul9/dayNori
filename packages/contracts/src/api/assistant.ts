import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';
import { MAX_AUDIO_RECORDING_SECONDS, MAX_AUDIO_RECORDING_BYTES } from './audio.js';
import { AiCitationSchema } from './ai.js';

export const AiAssistantOperationSchema = z.enum([
  'create_personal_task',
  'update_personal_task',
  'create_personal_note',
  'create_personal_journal_entry',
  'create_personal_routine',
  'create_personal_calendar_event',
  'create_personal_folder',
  'create_personal_custom_section',
  'create_personal_expense',
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
    destination: z.string().optional(),
    date: z.string().optional(),
    timezone: z.string().optional(),
    source: z.string().optional(),
    planId: z.string().uuid().optional(),
    stepIndex: z.number().int().nonnegative().optional(),
    totalSteps: z.number().int().positive().optional(),
    dependsOnStepIndex: z.number().int().nonnegative().optional(),
    effects: z.string().optional(),
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
    status: z.enum(['pending', 'confirmed', 'cancelled', 'expired', 'failed', 'skipped']),
    expiresAt: z.string(),
    confirmationToken: z.string().min(16).max(128),
    executionReceipt: z.record(z.string(), z.unknown()).nullable(),
    reviewSummary: AiProposalReviewSummarySchema,
    planId: z.string().uuid().nullable().optional(),
    stepIndex: z.number().int().nonnegative().optional(),
    dependsOn: z.array(z.string()).optional(),
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
    planId: z.string().uuid().optional(),
    stepIndex: z.number().int().nonnegative().optional(),
    dependsOn: z.array(z.string()).optional(),
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

export const UpdateAiProposalRequestSchema = z
  .object({
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export type UpdateAiProposalRequest = z.infer<typeof UpdateAiProposalRequestSchema>;

export const BatchConfirmAiProposalItemSchema = z
  .object({
    proposalId: z.string().uuid(),
    confirmationToken: z.string().min(16).max(128),
  })
  .strict();
export type BatchConfirmAiProposalItem = z.infer<typeof BatchConfirmAiProposalItemSchema>;

export const BatchConfirmAiProposalsRequestSchema = z
  .object({
    items: z.array(BatchConfirmAiProposalItemSchema).min(1).max(50),
  })
  .strict();
export type BatchConfirmAiProposalsRequest = z.infer<typeof BatchConfirmAiProposalsRequestSchema>;

export const BatchConfirmProposalResultItemSchema = z
  .object({
    proposalId: z.string().uuid(),
    outcome: z.enum(['ok', 'error', 'skipped']),
    proposal: AiProposalSchema,
    error: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .nullable(),
  })
  .strict();
export type BatchConfirmProposalResultItem = z.infer<typeof BatchConfirmProposalResultItemSchema>;

export const BatchConfirmAiProposalsResponseSchema = z.object({
  data: z.object({
    results: z.array(BatchConfirmProposalResultItemSchema),
  }),
  meta: ResponseMetaSchema,
});
export type BatchConfirmAiProposalsResponse = z.infer<typeof BatchConfirmAiProposalsResponseSchema>;

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

export const TranscribeAudioRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    audioBase64: z.string().min(1),
    mimeType: z.string().min(1).max(100),
    durationSeconds: z.number().min(0.5).max(MAX_AUDIO_RECORDING_SECONDS),
    byteSize: z.number().int().positive().max(MAX_AUDIO_RECORDING_BYTES).optional(),
    languageHint: z.string().max(20).optional(),
    clientOperationId: z.string().uuid().optional(),
  })
  .strict();
export type TranscribeAudioRequest = z.infer<typeof TranscribeAudioRequestSchema>;

export const TranscribeAudioResponseDataSchema = z.object({
  transcriptionId: z.string().uuid(),
  transcript: z.string(),
  detectedLanguage: z.string(),
  confidence: z.number().min(0).max(1),
  durationSeconds: z.number(),
  byteSize: z.number(),
  wordsCount: z.number().int().nonnegative(),
  costMicroUsd: z.number().int().nonnegative(),
  retentionPolicy: z.enum(['transient_deleted', 'transient_purged']),
  uncertainSpeech: z.boolean().default(false),
  provisionalNotice: z.string().optional(),
});
export type TranscribeAudioResponseData = z.infer<typeof TranscribeAudioResponseDataSchema>;

export const TranscribeAudioResponseSchema = z.object({
  data: TranscribeAudioResponseDataSchema,
  meta: ResponseMetaSchema,
});
export type TranscribeAudioResponse = z.infer<typeof TranscribeAudioResponseSchema>;
