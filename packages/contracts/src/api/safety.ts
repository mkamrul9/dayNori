import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const UgcReportCategorySchema = z.enum([
  'harassment',
  'hate',
  'sexual_content',
  'spam',
  'scam',
  'violence',
  'illegal',
  'other',
]);

export const UgcReportTargetTypeSchema = z.enum(['message', 'user']);

export const UgcReportStatusSchema = z.enum([
  'received',
  'triaged',
  'actioned',
  'dismissed',
  'duplicate',
]);

export const CreateUgcReportRequestSchema = z
  .object({
    clientReportId: z.string().uuid(),
    targetType: UgcReportTargetTypeSchema,
    roomId: z.string().uuid().optional(),
    messageId: z.string().uuid().optional(),
    reportedUserId: z.string().uuid().optional(),
    category: UgcReportCategorySchema,
    explanation: z.string().max(1000).optional(),
  })
  .strict();

export type CreateUgcReportRequest = z.infer<typeof CreateUgcReportRequestSchema>;

export const UgcReportReceiptSchema = z
  .object({
    id: z.string().uuid(),
    clientReportId: z.string().uuid(),
    targetType: UgcReportTargetTypeSchema,
    roomId: z.string().uuid().nullable(),
    messageId: z.string().uuid().nullable(),
    reportedUserId: z.string().uuid().nullable(),
    category: UgcReportCategorySchema,
    status: UgcReportStatusSchema,
    disposition: z.string().nullable().optional(),
    createdAt: z.string().datetime(),
  })
  .strict();

export type UgcReportReceipt = z.infer<typeof UgcReportReceiptSchema>;

export const UgcReportResponseSchema = z.object({
  data: UgcReportReceiptSchema,
  meta: ResponseMetaSchema,
});
export type UgcReportResponse = z.infer<typeof UgcReportResponseSchema>;

export const BlockUserRequestSchema = z
  .object({
    blockedUserId: z.string().uuid(),
  })
  .strict();
export type BlockUserRequest = z.infer<typeof BlockUserRequestSchema>;

export const UserBlockSchema = z
  .object({
    blockerId: z.string().uuid(),
    blockedUserId: z.string().uuid(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const UserBlockResponseSchema = z.object({
  data: UserBlockSchema,
  meta: ResponseMetaSchema,
});
export type UserBlockResponse = z.infer<typeof UserBlockResponseSchema>;

export const UserBlockListResponseSchema = z.object({
  data: z.object({
    blocks: z.array(UserBlockSchema),
  }),
  meta: ResponseMetaSchema,
});
export type UserBlockListResponse = z.infer<typeof UserBlockListResponseSchema>;

export const AcceptUgcTermsRequestSchema = z
  .object({
    policyVersion: z.string().min(1).max(64),
  })
  .strict();
export type AcceptUgcTermsRequest = z.infer<typeof AcceptUgcTermsRequestSchema>;

export const UgcTermsStatusSchema = z
  .object({
    currentVersion: z.string(),
    acceptedVersion: z.string().nullable(),
    acceptedAt: z.string().datetime().nullable(),
    requiresAcceptance: z.boolean(),
  })
  .strict();

export const UgcTermsStatusResponseSchema = z.object({
  data: UgcTermsStatusSchema,
  meta: ResponseMetaSchema,
});
export type UgcTermsStatusResponse = z.infer<typeof UgcTermsStatusResponseSchema>;

export const ReportDispositionSchema = z.enum([
  'content_removed',
  'user_warned',
  'user_restricted',
  'no_violation',
  'escalated',
  'other',
]);

export const ModerationReportSchema = z
  .object({
    id: z.string().uuid(),
    reporterId: z.string().uuid(),
    targetType: UgcReportTargetTypeSchema,
    roomId: z.string().uuid().nullable(),
    messageId: z.string().uuid().nullable(),
    reportedUserId: z.string().uuid().nullable(),
    category: UgcReportCategorySchema,
    explanation: z.string().nullable(),
    status: UgcReportStatusSchema,
    disposition: z.string().nullable().optional(),
    evidenceSnapshot: z.record(z.string(), z.unknown()),
    createdAt: z.string().datetime(),
  })
  .strict();

export const ModerationReportListResponseSchema = z.object({
  data: z.object({
    reports: z.array(ModerationReportSchema),
  }),
  meta: ResponseMetaSchema,
});
export type ModerationReportListResponse = z.infer<typeof ModerationReportListResponseSchema>;

export const UpdateModerationReportRequestSchema = z
  .object({
    status: UgcReportStatusSchema,
    reason: z.string().max(500).optional(),
    disposition: ReportDispositionSchema.optional(),
  })
  .strict();
export type UpdateModerationReportRequest = z.infer<typeof UpdateModerationReportRequestSchema>;
